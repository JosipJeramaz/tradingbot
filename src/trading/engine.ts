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
import { LevelAnalyzer } from '../core/levelAnalysis.js';

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
    private readonly exchange: BinanceConnector;
    private readonly positionManager: PositionManager;
    private readonly riskManager: RiskManager;
    private readonly levelAnalyzer: LevelAnalyzer;
    private readonly symbol: string;
    private readonly levelUpdateInterval: number;
    
    private isRunning: boolean;
    private lastLevelUpdate: DateTime | null;

    constructor(config: Config) {
        super();
        this.exchange = new BinanceConnector(config.exchange);
        this.state = new TradingStateManager();
        this.symbol = config.trading.symbol;
        this.positionManager = new PositionManager(this.exchange, this.state, this.symbol); // Pass symbol
        this.riskManager = new RiskManager(config.risk);
        this.levelAnalyzer = new LevelAnalyzer(this.exchange);
        
        this.symbol = config.trading.symbol;
        this.isRunning = false;
        this.lastLevelUpdate = null;
        this.levelUpdateInterval = 5 * 60 * 1000; // 5 minutes
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
            await this.exchange.initialize();
            await this.loadInitialState();
            
            this.isRunning = true;
            await this.startPriceStream();
            this.scheduleLevelUpdates();
            
            this.emit('started');
        } catch (error) {
            this.emit('error', error as Error);
            throw error;
        }
    }

    public async stop(): Promise<void> {
        if (!this.isRunning) return;
        
        try {
            this.isRunning = false;
            await this.exchange.stopPriceStream();
            await this.state.save();
            
            this.emit('stopped');
        } catch (error) {
            this.emit('error', error as Error);
            throw error;
        }
    }

    private async loadInitialState(): Promise<void> {
        await this.state.load();
        await this.updateLevels();
    }

    private async startPriceStream(): Promise<void> {
        const handlePrice = async (price: number): Promise<void> => {
            if (!this.isRunning) return;
            await this.handlePriceUpdate(price);
        };

        await this.exchange.startPriceStream(this.symbol, handlePrice);
    }

    private scheduleLevelUpdates(): void {
        setInterval(async () => {
            if (!this.isRunning) return;
            await this.updateLevels();
        }, this.levelUpdateInterval);
    }

    private async updateLevels(): Promise<void> {
        try {
            const levels = await this.levelAnalyzer.analyzeLevels(this.symbol);
            this.lastLevelUpdate = DateTime.now();
            this.emit('levelUpdate', levels);
            await this.state.updateLevels(levels);
        } catch (error) {
            this.emit('error', error as Error);
        }
    }

    private async handlePriceUpdate(price: number): Promise<void> {
        if (!this.isRunning) return;

        try {
            const currentPosition = this.state.getCurrentPosition();
            
            if (currentPosition) {
                await this.handleExistingPosition(currentPosition, price);
            } else {
                await this.checkForNewPosition(price);
            }
        } catch (error) {
            this.emit('error', error as Error);
        }
    }

    private async handleExistingPosition(position: Position, price: number): Promise<void> {
        const { shouldClose, reason } = this.positionManager.checkExitConditions(position, price);
        
        if (shouldClose && reason) {
            await this.closePosition(reason);
        } else {
            await this.updateTrailingStop(position, price);
        }
    }

    private async checkForNewPosition(price: number): Promise<void> {
        if (!this.riskManager.canOpenPosition()) return;

        const entry = this.positionManager.checkEntryConditions(price, this.state.getLevels());
        
        if (entry) {
            await this.openPosition(entry);
        }
    }

    private async openPosition(entry: EntrySignal): Promise<void> {
        try {
            const position = await this.positionManager.openPosition(entry);
            await this.state.setCurrentPosition(position);
            this.emit('positionOpened', position);
        } catch (error) {
            this.emit('error', error as Error);
        }
    }

    private async closePosition(reason: 'stopLoss' | 'takeProfit' | 'manual'): Promise<void> {
        try {
            const currentPosition = this.state.getCurrentPosition();
            if (!currentPosition) return;
            
            const result = await this.positionManager.closePosition(currentPosition, reason);
            await this.state.clearCurrentPosition();
            this.emit('positionClosed', result);
            
            if (result.isLoss) {
                this.riskManager.handleLoss();
            }
        } catch (error) {
            this.emit('error', error as Error);
        }
    }

    private async updateTrailingStop(position: Position, price: number): Promise<void> {
        const newStop = this.positionManager.calculateTrailingStop(position, price);
        
        if (newStop !== position.stopLoss) {
            await this.positionManager.updateStopLoss(newStop);
            this.emit('stopLossUpdated', newStop);
        }
    }
}