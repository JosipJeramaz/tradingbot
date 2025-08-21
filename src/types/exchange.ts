import type { Exchange as CcxtExchange } from 'ccxt';

/**
 * Represents an order on the exchange.
 */
export interface Order {
    id: string;
    price: number;
    symbol: string;
    type: string;
    side: string;
    amount: number;
}

/**
 * Parameters for creating an order.
 */
export interface OrderParams {
    symbol: string; // Made required for clarity
    type: 'MARKET' | 'LIMIT';
    side: 'BUY' | 'SELL';
    amount: number;
    price?: number;
    leverage?: number;
    reduceOnly?: boolean; 
}

/**
 * Base interface for exchange operations.
 */
export interface ExchangeOperations {
    initialize(): Promise<void>;
    loadMarkets?(): Promise<any>; // Optional, but recommended for most connectors
    startPriceStream(symbol: string, callback: (price: number) => Promise<void>): Promise<void>;
    stopPriceStream(): Promise<void>;
    createOrder(orderParams: OrderParams): Promise<Order>;
    fetchBalance(): Promise<{
        total: { [key: string]: number };
        used: { [key: string]: number };
        free: { [key: string]: number };
    }>;
    fetchTicker(symbol: string): Promise<{ last: number }>;
    fetchOHLCV(
        symbol: string,
        timeframe?: string,
        since?: number,
        limit?: number
    ): Promise<number[][]>;
}

/**
 * Main Exchange type, combining ccxt and our operations.
 */
export type Exchange = CcxtExchange & ExchangeOperations;