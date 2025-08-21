// src/trading/engine.ts
import { EventEmitter } from 'events';
import { DateTime } from 'luxon';
import type { 
    Config, 
    Position, 
    TradeResult, 
    LevelAnalysis,
    EntrySignal
} from '../types/index.js';
import { TradingStateManager } from './state.js';
import { PositionManager } from './position.js';
import { RiskManager } from './risk.js';
import { BinanceConnector } from '../exchange/binance.js';
import { MEXCConnector } from '../exchange/mexc.js';
import type { Exchange } from '../types/exchange.js';
import { LevelAnalyzer } from '../core/levelAnalysis.js';
import { setupLogger } from '../core/logger.js'; // <-- Add this if you use a logger utility

interface TradingEngineEvents {
    started: () => void;
    stopped: () => void;
    error: (error: Error) => void;
    positionOpened: (position: Position) => void;
    positionClosed: (result: TradeResult) => void;
    levelUpdate: (levels: LevelAnalysis) => void;
    stopLossUpdated: (newStop: number) => void;
}

export class TradingEngine extends EventEmitter {
    private readonly state: TradingStateManager;
    private readonly exchange: Exchange;
    private readonly positionManager: PositionManager;
    private readonly riskManager: RiskManager;
    private readonly levelAnalyzer: LevelAnalyzer;
    private readonly symbol: string;
    private readonly levelUpdateInterval: number;
    private readonly logger: ReturnType<typeof setupLogger>;

    private isRunning: boolean;
    private isOpeningPosition: boolean;
    private lastLevelUpdate: DateTime | null;

    constructor(config: Config) {
        super();
        this.exchange = config.exchange.type === 'mexc' 
            ? new MEXCConnector(config.exchange)
            : new BinanceConnector();
        this.state = new TradingStateManager();
        this.symbol = config.trading.symbol;
        this.positionManager = new PositionManager(this.exchange, this.state, this.symbol);
        this.riskManager = new RiskManager(config.risk);
        this.levelAnalyzer = new LevelAnalyzer(this.exchange);

        this.isRunning = false;
        this.isOpeningPosition = false;
        this.lastLevelUpdate = null;
        this.levelUpdateInterval = 5 * 60 * 1000; // 5 minutes

        this.logger = setupLogger(config.system.logLevel); // <-- Initialize logger
    }

    public override on<K extends keyof TradingEngineEvents>(
        event: K, 
        listener: TradingEngineEvents[K]
    ): this {
        return super.on(event, listener);
    }

    public override emit<K extends keyof TradingEngineEvents>(
        event: K, 
        ...args: Parameters<TradingEngineEvents[K]>
    ): boolean {
        return super.emit(event, ...args);
    }

    public async start(): Promise<void> {
        if (this.isRunning) return;
        try {
            this.logger.info('Trading engine starting...');
            await this.exchange.initialize();

            // Fetch and update account balance from exchange
            if (typeof this.exchange.fetchBalance === 'function') {
                try {
                    const balance = await this.exchange.fetchBalance();
                    // Prefer USDT for futures
                    const usdtBalance = balance.total?.USDT || balance.free?.USDT || 0;
                    this.logger.info(`[TradingEngine] Fetched USDT balance: ${usdtBalance}`);
                    await this.state.updateAccountBalance(usdtBalance);
                } catch (err) {
                    this.logger.error(`[TradingEngine] Failed to fetch/update account balance: ${err}`);
                }
            }

            await this.loadInitialState();

            this.isRunning = true;
            await this.startPriceStream();
            this.scheduleLevelUpdates();

            this.logger.info('Trading engine started.');
            this.emit('started');
        } catch (error) {
            this.logger.error('Error starting trading engine:', error);
            this.emit('error', error as Error);
            throw error;
        }
    }

    public async stop(): Promise<void> {
        if (!this.isRunning) return;
        try {
            this.logger.info('Trading engine stopping...');
            this.isRunning = false;
            this.isOpeningPosition = false; // Clear the position opening flag
            await this.exchange.stopPriceStream();
            await this.state.save();

            this.logger.info('Trading engine stopped.');
            this.emit('stopped');
        } catch (error) {
            this.logger.error('Error stopping trading engine:', error);
            this.emit('error', error as Error);
            throw error;
        }
    }

    private async loadInitialState(): Promise<void> {
        this.logger.info('Loading initial trading state...');
        await this.state.load();
        await this.updateLevels();
    }

    private async startPriceStream(): Promise<void> {
        this.logger.info(`Starting price stream for ${this.symbol}...`);
        const handlePrice = async (price: number): Promise<void> => {
            if (!this.isRunning) return;
            await this.handlePriceUpdate(price);
        };

        await this.exchange.startPriceStream(this.symbol, handlePrice);
        this.logger.info('Price stream started.');
    }

    private scheduleLevelUpdates(): void {
        this.logger.info('Scheduling periodic level updates...');
        setInterval(async () => {
            if (!this.isRunning) return;
            await this.updateLevels();
        }, this.levelUpdateInterval);
    }

    private async updateLevels(): Promise<void> {
        try {
            this.logger.info('Analyzing levels...');
            const levels = await this.levelAnalyzer.analyzeLevels(this.symbol);
            this.lastLevelUpdate = DateTime.now();
            this.emit('levelUpdate', levels);
            await this.state.updateLevels(levels);
            this.logger.info('Levels updated.');
        } catch (error) {
            this.logger.error('Error updating levels:', error);
            this.emit('error', error as Error);
        }
    }

    private async handlePriceUpdate(price: number): Promise<void> {
        if (!this.isRunning) return;

        try {
            this.logger.debug(`Received price update: ${price}`);
            const currentPosition = this.state.getCurrentPosition();

            if (currentPosition) {
                await this.handleExistingPosition(currentPosition, price);
            } else {
                await this.checkForNewPosition(price);
            }
        } catch (error) {
            this.logger.error('Error handling price update:', error);
            this.emit('error', error as Error);
        }
    }

    private async handleExistingPosition(position: Position, price: number): Promise<void> {
        this.logger.debug(`Handling existing position at price ${price}: ${JSON.stringify(position)}`);
        const { shouldClose, reason } = this.positionManager.checkExitConditions(position, price);

        if (shouldClose && reason) {
            this.logger.info(`Exit condition met (${reason}), closing position.`);
            await this.closePosition(reason);
        } else {
            await this.updateTrailingStop(position, price);
        }
    }

    private async checkForNewPosition(price: number): Promise<void> {
        // First check if we already have a position
        const currentPosition = this.state.getCurrentPosition();
        if (currentPosition) {
            this.logger.debug('Position already exists, skipping new position check.');
            return;
        }

        // Check if we're already in the process of opening a position
        if (this.isOpeningPosition) {
            this.logger.debug('Position opening already in progress, skipping new position check.');
            return;
        }

        if (!this.riskManager.canOpenPosition()) {
            this.logger.debug('Risk manager: cannot open new position at this time.');
            return;
        }

        const entry = this.positionManager.checkEntryConditions(price, this.state.getLevels());

        if (entry) {
            this.logger.info(`Entry signal detected: ${JSON.stringify(entry)}`);
            await this.openPosition(entry);
        }
    }

    private async openPosition(entry: EntrySignal): Promise<void> {
        try {
            // Set the flag to prevent multiple simultaneous position openings
            this.isOpeningPosition = true;
            
            // Double-check that we don't already have a position
            const existingPosition = this.state.getCurrentPosition();
            if (existingPosition) {
                this.logger.warn('Position already exists, cancelling new position opening.');
                return;
            }

            this.logger.info(`Opening new position: ${JSON.stringify(entry)}`);
            const position = await this.positionManager.openPosition(entry);
            await this.state.setCurrentPosition(position);
            this.logger.info(`Position opened: ${JSON.stringify(position)}`);
            this.emit('positionOpened', position);
        } catch (error) {
            this.logger.error('Error opening position:', error);
            this.emit('error', error as Error);
        } finally {
            // Always clear the flag, even if there was an error
            this.isOpeningPosition = false;
        }
    }

    private async closePosition(reason: 'stopLoss' | 'takeProfit' | 'manual'): Promise<void> {
        try {
            const currentPosition = this.state.getCurrentPosition();
            if (!currentPosition) return;

            this.logger.info(`Closing position due to: ${reason}`);
            const result = await this.positionManager.closePosition(currentPosition, reason);
            await this.state.clearCurrentPosition();
            this.logger.info(`Position closed: ${JSON.stringify(result)}`);
            this.emit('positionClosed', result);

            if (result.isLoss) {
                this.logger.warn('Position closed with a loss. Updating risk manager.');
                this.riskManager.handleLoss();
            }
        } catch (error) {
            this.logger.error('Error closing position:', error);
            this.emit('error', error as Error);
        }
    }

    private async updateTrailingStop(position: Position, price: number): Promise<void> {
        const newStop = this.positionManager.calculateTrailingStop(position, price);

        if (newStop !== position.stopLoss) {
            this.logger.info(`Updating trailing stop from ${position.stopLoss} to ${newStop}`);
            await this.positionManager.updateStopLoss(newStop);
            this.emit('stopLossUpdated', newStop);
        }
    }
}