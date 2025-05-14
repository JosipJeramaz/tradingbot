// src/types/exchange.ts
export interface Order {
    id: string;
    price: number;
    symbol: string;
    type: string;
    side: string;
    amount: number;
}

export interface OrderParams {
    symbol?: string;
    type: 'MARKET' | 'LIMIT';
    side: 'BUY' | 'SELL';
    amount: number;
    price?: number;
    leverage?: number;
}

export interface Exchange {
    initialize(): Promise<void>;
    loadMarkets(): Promise<any>;
    fetchTicker(symbol: string): Promise<{ last: number }>;
    fetchOHLCV(
        symbol: string,
        timeframe?: string,
        since?: number,
        limit?: number
    ): Promise<number[][]>;
    createOrder(orderParams: OrderParams): Promise<Order>;
    fetchBalance(): Promise<{
        total: { [key: string]: number };
        used: { [key: string]: number };
        free: { [key: string]: number };
    }>;
    startPriceStream(symbol: string, callback: (price: number) => Promise<void>): Promise<void>;
    stopPriceStream(): Promise<void>;
}