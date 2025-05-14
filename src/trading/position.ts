// src/trading/position.ts
import { fixedNumber } from '../core/utils.js';
import type { 
    Position, 
    EntrySignal, 
    PriceLevel, 
    TradeResult,
    LevelAnalysis 
} from '../types/index.js';
import { BinanceConnector } from '../exchange/binance.js';
import { TradingStateManager } from './state.js';

export class PositionManager {
    private readonly exchange: BinanceConnector;
    private readonly state: TradingStateManager;
    private readonly LEVERAGE: number = 20;
    private readonly MIN_DISTANCE: number = 0.001;
    private readonly symbol: string; // Add this

    constructor(exchange: BinanceConnector, state: TradingStateManager, symbol: string) { // Add symbol parameter
        this.exchange = exchange;
        this.state = state;
        this.symbol = symbol;
    }

    public async openPosition(entry: EntrySignal): Promise<Position> {
        const order = await this.exchange.createOrder(
            this.symbol,
            'MARKET',
            entry.type === 'LONG' ? 'BUY' : 'SELL',
            entry.size,
            undefined,
            { leverage: this.LEVERAGE }
        );

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

        return position;
    }

    public async closePosition(position: Position, reason: 'stopLoss' | 'takeProfit' | 'manual'): Promise<TradeResult> {
        const closeOrder = await this.exchange.createOrder(
            this.symbol,
            'MARKET',
            position.type === 'LONG' ? 'SELL' : 'BUY',
            position.size
        );

        const exitPrice = fixedNumber(closeOrder.price);
        const pnl = this.calculatePnL(position, exitPrice);

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