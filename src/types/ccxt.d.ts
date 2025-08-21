// src/types/ccxt.d.ts
declare module 'ccxt' {
    export class Exchange {
        constructor(config: any);
        async loadMarkets(): Promise<any>;
        async fetchTicker(symbol: string): Promise<{
            last: number;
            [key: string]: any;
        }>;
        async fetchOHLCV(
            symbol: string,
            timeframe?: string,
            since?: number,
            limit?: number
        ): Promise<number[][]>;
        async createOrder(
            symbol: string,
            type: string,
            side: string,
            amount: number,
            price?: number,
            params?: any
        ): Promise<Order>;
        async fetchBalance(): Promise<{
            total: { [key: string]: number };
            used: { [key: string]: number };
            free: { [key: string]: number };
        }>;
    }

    export class binance extends Exchange {
        options: any;
        async fapiPrivate_post_leverage(params: any): Promise<any>;
    }

    export class mexc extends Exchange {}

    export interface Order {
        id: string;
        price: number;
        [key: string]: any;
    }
}