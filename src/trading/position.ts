// src/trading/position.ts
import { fixedNumber } from '../core/utils.js';
import type { 
    Position, 
    EntrySignal, 
    PriceLevel, 
    TradeResult,
    LevelAnalysis 
} from '../types/index.js';
import type { Exchange, OrderParams } from '../types/exchange.js';
import { TradingStateManager } from './state.js';
import { setupLogger } from '../core/logger.js';

export class PositionManager {
    private readonly exchange: Exchange;
    private readonly state: TradingStateManager;
    private readonly LEVERAGE: number = 20;
    private readonly MIN_DISTANCE: number = 0.001;
    private readonly symbol: string; // Add this
    private readonly logger = setupLogger('info');

    constructor(exchange: Exchange, state: TradingStateManager, symbol: string) { // Add symbol parameter
        this.exchange = exchange;
        this.state = state;
        this.symbol = symbol;
        this.logger.info(`PositionManager initialized for symbol: ${symbol}`);
    }

    public async openPosition(entry: EntrySignal): Promise<Position> {
        this.logger.info(`Opening position: ${JSON.stringify(entry)}`);
        const orderParams: OrderParams = {
            type: 'MARKET',
            side: entry.type === 'LONG' ? 'BUY' : 'SELL',
            amount: entry.size,
            leverage: this.LEVERAGE,
            symbol: this.symbol
        };

        const order = await this.exchange.createOrder(orderParams);

        const position: Position = {
            type: entry.type,
            entryPrice: entry.price,
            size: entry.size,
            leverage: this.LEVERAGE,
            stopLoss: this.calculateInitialStop(entry.type, entry.price),
            takeProfit: entry.nextLevel,
            entryTime: new Date(),
            orderId: order.id,
            updates: []
        };

        this.logger.info(`Position opened: ${JSON.stringify(position)}`);
        return position;
    }

    public async closePosition(position: Position, reason: 'stopLoss' | 'takeProfit' | 'manual'): Promise<TradeResult> {
        this.logger.info(`Closing position: ${JSON.stringify(position)} Reason: ${reason}`);
        const closeOrderParams: OrderParams = {
            symbol: this.symbol,
            type: 'MARKET',
            side: position.type === 'LONG' ? 'SELL' : 'BUY',
            amount: position.size
        };
    
        const closeOrder = await this.exchange.createOrder(closeOrderParams);
        const exitPrice = fixedNumber(closeOrder.price);
        const pnl = this.calculatePnL(position, exitPrice);
    
        this.logger.info(`Position closed at price ${exitPrice}, PnL: ${pnl}`);
        return {
            position,
            exitPrice,
            pnl,
            reason,
            exitTime: new Date(),
            isLoss: pnl < 0
        };
    }

    public checkEntryConditions(price: number, levels: LevelAnalysis | null): EntrySignal | null {
        this.logger.debug(`Checking entry conditions for price: ${price}`);
        if (!levels) return null;
        const { holdLevels, resistanceLevels } = levels;
        
        // Flatten all timeframe levels
        const allSupports = [...holdLevels['4h'], ...holdLevels['1h'], 
                           ...holdLevels['15m'], ...holdLevels['5m']];
        const allResistances = [...resistanceLevels['4h'], ...resistanceLevels['1h'], 
                               ...resistanceLevels['15m'], ...resistanceLevels['5m']];
        
        // Check support levels for long entry
        for (const level of allSupports) {
            if (this.isLevelHit(price, level.price, 'support')) {
                const nextResistance = this.findNextLevel(price, allResistances, 'up');
                if (nextResistance) {
                    return this.createEntrySignal('LONG', price, nextResistance);
                }
            }
        }

        // Check resistance levels for short entry
        for (const level of allResistances) {
            if (this.isLevelHit(price, level.price, 'resistance')) {
                const nextSupport = this.findNextLevel(price, allSupports, 'down');
                if (nextSupport) {
                    return this.createEntrySignal('SHORT', price, nextSupport);
                }
            }
        }

        return null;
    }

    public checkExitConditions(position: Position, currentPrice: number): { 
        shouldClose: boolean; 
        reason?: 'stopLoss' | 'takeProfit' 
    } {
        this.logger.debug(`Checking exit conditions for position at price: ${currentPrice}`);
        const { type, stopLoss, takeProfit } = position;
        
        if (type === 'LONG') {
            if (currentPrice <= stopLoss) {
                return { shouldClose: true, reason: 'stopLoss' };
            }
            if (currentPrice >= takeProfit) {
                return { shouldClose: true, reason: 'takeProfit' };
            }
        } else {
            if (currentPrice >= stopLoss) {
                return { shouldClose: true, reason: 'stopLoss' };
            }
            if (currentPrice <= takeProfit) {
                return { shouldClose: true, reason: 'takeProfit' };
            }
        }

        return { shouldClose: false };
    }

    public calculateTrailingStop(position: Position, currentPrice: number): number {
        this.logger.debug(`Calculating trailing stop for position at price: ${currentPrice}`);
        const { type, entryPrice } = position;
        const stopDistance = 0.1; // 10%

        if (type === 'LONG') {
            const newStop = currentPrice * (1 - stopDistance);
            return Math.max(newStop, position.stopLoss);
        } else {
            const newStop = currentPrice * (1 + stopDistance);
            return Math.min(newStop, position.stopLoss);
        }
    }

    public async updateStopLoss(newStop: number): Promise<void> {
        const position = this.state.getCurrentPosition();
        if (!position) return;

        position.updates.push({
            timestamp: new Date(),
            type: 'stop_update',
            oldValue: position.stopLoss,
            newValue: newStop
        });

        position.stopLoss = newStop;
        await this.state.setCurrentPosition(position);
        this.logger.info(`Stop loss updated to: ${newStop}`);
    }

    private calculateInitialStop(type: 'LONG' | 'SHORT', entryPrice: number): number {
        return type === 'LONG' ? 
            fixedNumber(entryPrice * 0.9) : 
            fixedNumber(entryPrice * 1.1);
    }

    private calculatePnL(position: Position, exitPrice: number): number {
        const { type, entryPrice, size } = position;
        return type === 'LONG' ?
            fixedNumber((exitPrice - entryPrice) * size) :
            fixedNumber((entryPrice - exitPrice) * size);
    }

    private isLevelHit(price: number, level: number, type: 'support' | 'resistance'): boolean {
        const diff = Math.abs(price - level) / level;
        return diff <= this.MIN_DISTANCE;
    }

    private findNextLevel(price: number, levels: PriceLevel[], direction: 'up' | 'down'): PriceLevel | undefined {
        const sortedLevels = [...levels].sort((a, b) => a.price - b.price);
        
        return direction === 'up' ?
            sortedLevels.find(level => level.price > price) :
            sortedLevels.reverse().find(level => level.price < price);
    }

    private createEntrySignal(type: 'LONG' | 'SHORT', price: number, nextLevel: PriceLevel): EntrySignal {
        const accountBalance = this.state.getAccountBalance();
        const positionSize = this.calculatePositionSize(accountBalance);

        return {
            type,
            price: fixedNumber(price),
            size: fixedNumber(positionSize),
            nextLevel: fixedNumber(nextLevel.price)
        };
    }

    private calculatePositionSize(balance: number | null): number {
        if (!balance) return 0;
        const stake = this.state.getCurrentStakePercentage();
        return fixedNumber(balance * (stake / 100));
    }
}