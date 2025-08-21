// src/types/index.ts
import { DateTime } from 'luxon';
import { Logger } from 'winston';

export interface Candle {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    time: Date;
}

export interface PriceLevel {
    price: number;
    time: Date;
}

export interface Position {
    type: 'LONG' | 'SHORT';
    entryPrice: number;
    size: number;
    contractAmount: number; // Add this to store the exact contract amount used to open the position
    leverage: number;
    stopLoss: number;
    takeProfit: number;
    entryTime: Date;
    orderId?: string;
    updates: PositionUpdate[];
}

export interface PositionUpdate {
    timestamp: Date;
    type: 'stop_update' | 'tp_update';
    oldValue: number;
    newValue: number;
}

export interface TradeResult {
    position: Position;
    exitPrice: number;
    pnl: number;
    reason: 'stopLoss' | 'takeProfit' | 'manual';
    exitTime: Date;
    isLoss: boolean;
}

export interface LevelAnalysis {
    holdLevels: {
        '4h': PriceLevel[];
        '1h': PriceLevel[];
        '15m': PriceLevel[];
        '5m': PriceLevel[];
    };
    resistanceLevels: {
        '4h': PriceLevel[];
        '1h': PriceLevel[];
        '15m': PriceLevel[];
        '5m': PriceLevel[];
    };
}

export interface Config {
    exchange: {
        type: 'binance' | 'mexc';
        apiKey: string;
        apiSecret: string;
        testnet: boolean;
    };
    trading: {
        symbol: string;
        leverage: number;
        initialStake: number;
    };
    risk: {
        maxDailyLosses: number;
        maxDrawdown: number;
    };
    system: {
        logLevel: string;
        stateDir: string;
        logDir: string;
    };
}

export interface TradingState {
    currentPosition: Position | null;
    currentStakePercentage: number;
    accountBalance: number | null;
    lastLevels: LevelAnalysis | null;
    lastUpdate: DateTime | null;
}

export interface EntrySignal {
    type: 'LONG' | 'SHORT';
    price: number;
    size: number;
    nextLevel: number;
}

export interface WebSocketTradeMessage {
    e: 'trade';          // Event type
    E: number;           // Event time
    s: string;           // Symbol
    t: number;           // Trade ID
    p: string;           // Price
    q: string;           // Quantity
    b: number;           // Buyer order ID
    a: number;           // Seller order ID
    T: number;           // Trade time
    m: boolean;          // Is the buyer the market maker?
}

export interface LoggerConfig {
    level: string;
    format?: any;
    transports: any[];
}

export interface ExitConditions {
    shouldClose: boolean;
    reason?: 'stopLoss' | 'takeProfit' | 'manual';
}

import type { Exchange, Order, OrderParams } from './exchange.js';

export type WebSocketMessage = WebSocketTradeMessage;