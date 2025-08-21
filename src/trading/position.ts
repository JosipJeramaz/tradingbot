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
        this.logger.info(`Opening position: type=${entry.type}, price=${entry.price}, size=${entry.size}`);

        // Determine side for order params
        const orderSide = entry.type === 'LONG' ? 'BUY' : 'SELL';
        // Determine side for openLimitOrders ('buy'/'sell')
        const limitOrderSide = entry.type === 'LONG' ? 'buy' : 'sell';

        // Check for existing open LIMIT orders using type assertion
        if (typeof (this.exchange as any).getOpenLimitOrders === 'function') {
            const openLimitOrders = await (this.exchange as any).getOpenLimitOrders(this.symbol, limitOrderSide);
            if (openLimitOrders.length >= 4) {
                this.logger.warn(`Maximum open LIMIT orders (${openLimitOrders.length}) reached for ${this.symbol} ${limitOrderSide}. No new order placed.`);
                throw new Error('Too many open LIMIT orders. Wait for existing orders to fill or cancel.');
            }
        }

        const ticker = await this.exchange.fetchTicker(`${this.symbol}`);
        const lastPrice = fixedNumber(ticker.last);
        const contractAmount = fixedNumber(entry.size / lastPrice);
        
        // Check minimum amount for BTC/USDT futures (0.001 BTC)
        const minAmount = 0.001;
        if (contractAmount < minAmount) {
            this.logger.warn(`Calculated contract amount ${contractAmount} is below minimum ${minAmount}. Using minimum amount.`);
            // Use minimum amount instead of throwing error
            const adjustedContractAmount = minAmount;
            
            const orderParams: OrderParams = {
                type: 'LIMIT',
                side: orderSide,
                amount: adjustedContractAmount,
                price: entry.price,
                leverage: this.LEVERAGE,
                symbol: this.symbol
            };

            const order = await this.exchange.createOrder(orderParams);

            const position: Position = {
                type: entry.type,
                entryPrice: entry.price,
                size: fixedNumber(adjustedContractAmount * entry.price), // Recalculate size based on actual amount
                contractAmount: adjustedContractAmount, // Store the actual contract amount used
                leverage: this.LEVERAGE,
                stopLoss: this.calculateInitialStop(entry.type, entry.price),
                takeProfit: entry.nextLevel,
                entryTime: new Date(),
                orderId: order.id,
                updates: []
            };

            this.logger.info(`Position opened with adjusted amount: type=${position.type}, entryPrice=${position.entryPrice}, size=${position.size}, contractAmount=${position.contractAmount}`);
            return position;
        }
        
        const orderParams: OrderParams = {
            type: 'LIMIT',
            side: orderSide,
            amount: contractAmount,
            price: entry.price,
            leverage: this.LEVERAGE,
            symbol: this.symbol
        };

        const order = await this.exchange.createOrder(orderParams);

        const position: Position = {
            type: entry.type,
            entryPrice: entry.price,
            size: entry.size,
            contractAmount: contractAmount, // Store the contract amount
            leverage: this.LEVERAGE,
            stopLoss: this.calculateInitialStop(entry.type, entry.price),
            takeProfit: entry.nextLevel,
            entryTime: new Date(),
            orderId: order.id,
            updates: []
        };

        this.logger.info(`Position opened: type=${position.type}, entryPrice=${position.entryPrice}, size=${position.size}`);
        return position;
    }

    public async closePosition(position: Position, reason: 'stopLoss' | 'takeProfit' | 'manual'): Promise<TradeResult> {
        this.logger.info(`Closing position: type=${position.type}, entryPrice=${position.entryPrice}, size=${position.size}, reason=${reason}`);
        const maxRetries = 3;
        let attempt = 0;
        let closed = false;
        let exitPrice = 0;
        let pnl = 0;
        let closeOrder;
        
        // Use the exact contract amount that was used to open the position
        const closeAmount = position.contractAmount;

        // Try LIMIT order up to 3 times with current market price
        while (!closed && attempt < maxRetries) {
            attempt++;
            try {
                // Get current ticker for a better limit price
                const ticker = await this.exchange.fetchTicker(`${this.symbol}`);
                const currentPrice = fixedNumber(ticker.last);
                
                // Use a price slightly better than market to ensure quick fill
                let limitPrice: number;
                if (position.type === 'LONG') {
                    // For selling (closing long), use slightly below market price
                    limitPrice = fixedNumber(currentPrice * 0.9995);
                } else {
                    // For buying (closing short), use slightly above market price
                    limitPrice = fixedNumber(currentPrice * 1.0005);
                }
                
                const closeOrderParams: OrderParams = {
                    symbol: this.symbol,
                    type: 'LIMIT',
                    side: position.type === 'LONG' ? 'SELL' : 'BUY',
                    amount: closeAmount,
                    price: limitPrice,
                    reduceOnly: true 
                };
                
                this.logger.info(`LIMIT close attempt ${attempt}: amount=${closeAmount}, price=${limitPrice}, side=${closeOrderParams.side}`);
                closeOrder = await this.exchange.createOrder(closeOrderParams);
                exitPrice = fixedNumber(closeOrder.price);
                pnl = this.calculatePnL(position, exitPrice);
                closed = true;
                this.logger.info(`LIMIT close successful: exitPrice=${exitPrice}, PnL=${pnl}`);
            } catch (error) {
                this.logger.warn(`LIMIT close attempt ${attempt} failed: ${(error as Error).message}`);
                if (attempt < maxRetries) {
                    await new Promise(res => setTimeout(res, 2000));
                }
            }
        }

        // If not closed, try MARKET order until successful
        while (!closed) {
            try {
                this.logger.warn('Trying MARKET order to close position...');
                const marketOrderParams: OrderParams = {
                    symbol: this.symbol,
                    type: 'MARKET',
                    side: position.type === 'LONG' ? 'SELL' : 'BUY',
                    amount: closeAmount,
                    reduceOnly: true
                };
                closeOrder = await this.exchange.createOrder(marketOrderParams);
                exitPrice = fixedNumber(closeOrder.price);
                pnl = this.calculatePnL(position, exitPrice);
                closed = true;
            } catch (error) {
                this.logger.error(`MARKET close attempt failed: ${(error as Error).message}`);
                await new Promise(res => setTimeout(res, 2000));
            }
        }

        this.logger.info(`Position closed: exitPrice=${exitPrice}, PnL=${pnl}`);
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
        if (!levels) {
            this.logger.debug('No levels data available, cannot check entry conditions.');
            return null;
        }
        const { holdLevels, resistanceLevels } = levels;
        
        // Flatten all timeframe levels
        const allSupports = [...holdLevels['4h'], ...holdLevels['1h'], 
                           ...holdLevels['15m'], ...holdLevels['5m']];
        const allResistances = [...resistanceLevels['4h'], ...resistanceLevels['1h'], 
                               ...resistanceLevels['15m'], ...resistanceLevels['5m']];
        
        // Check support levels for long entry
        let foundLong = false;
        for (const level of allSupports) {
            if (this.isLevelHit(price, level.price, 'support')) {
                const nextResistance = this.findNextLevel(price, allResistances, 'up');
                if (nextResistance) {
                    this.logger.info(`Long entry condition met at price: ${price}, support: ${level.price}, next resistance: ${nextResistance.price}`);
                    foundLong = true;
                    return this.createEntrySignal('LONG', price, nextResistance);
                } else {
                    this.logger.debug(`Support hit at ${level.price} but no next resistance found.`);
                }
            }
        }
        if (!foundLong) {
            this.logger.debug('No long entry condition met.');
        }

        // Check resistance levels for short entry
        let foundShort = false;
        for (const level of allResistances) {
            if (this.isLevelHit(price, level.price, 'resistance')) {
                const nextSupport = this.findNextLevel(price, allSupports, 'down');
                if (nextSupport) {
                    this.logger.info(`Short entry condition met at price: ${price}, resistance: ${level.price}, next support: ${nextSupport.price}`);
                    foundShort = true;
                    return this.createEntrySignal('SHORT', price, nextSupport);
                } else {
                    this.logger.debug(`Resistance hit at ${level.price} but no next support found.`);
                }
            }
        }
        if (!foundShort) {
            this.logger.debug('No short entry condition met.');
        }

        // Additional debug for position size
        const accountBalance = this.state.getAccountBalance();
        const stake = this.state.getCurrentStakePercentage();
        const positionSize = accountBalance ? accountBalance * (stake / 100) : 0;
        this.logger.debug(`Account balance: ${accountBalance}, stake %: ${stake}, calculated position size: ${positionSize}`);
        if (!accountBalance || positionSize === 0) {
            this.logger.warn('Position size is zero or account balance is missing. No trade will be placed.');
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
        const stopDistance = 0.0016; // 0.16%

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

    private calculateInitialStop(type: 'LONG' | 'SHORT', entryPrice: number): number { //stop loss calculation
        return type === 'LONG' ? 
            fixedNumber(entryPrice * 0.9984) : 
            fixedNumber(entryPrice * 1.00167);
    }

    private calculatePnL(position: Position, exitPrice: number): number {
        const { type, entryPrice, contractAmount } = position;
        return type === 'LONG' ?
            fixedNumber((exitPrice - entryPrice) * contractAmount) :
            fixedNumber((entryPrice - exitPrice) * contractAmount);
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