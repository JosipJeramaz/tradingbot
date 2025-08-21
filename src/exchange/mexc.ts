import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { logError } from '../core/utils.js';
import type { Config } from '../types/index.js';
import type { Exchange, OrderParams, Order } from '../types/exchange.js';
import ccxt from 'ccxt';

interface MEXCTradeData {
    t: number;  // timestamp
    S: string;  // side (1 for buy, 2 for sell)
    v: number;  // volume/amount
    p: number;  // price
}

interface MEXCWebSocketTradeMessage {
    c: string; // channel
    d: {
        deals: MEXCTradeData[];
    };
}

export class MEXCConnector extends EventEmitter implements Exchange {
    private readonly wsUrl = 'wss://wbs.mexc.com/ws';
    private readonly pingInterval: number;
    private readonly maxReconnectAttempts: number;
    private readonly reconnectDelay: number;

    private ws: WebSocket | null = null;
    private pingTimer: NodeJS.Timeout | null = null;
    private reconnectAttempts = 0;
    private isConnected = false;
    private markets: Record<string, any> = {};
    private ccxtExchange: any;

    constructor(config: Config['exchange']) {
        super();
        this.pingInterval = 30000;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.ccxtExchange = new ccxt['mexc']({
            apiKey: config.apiKey,
            secret: config.apiSecret,
            enableRateLimit: true,
        });
    }

    public async initialize(): Promise<void> {
        this.markets = await this.loadMarkets();
    }

    public async loadMarkets(): Promise<any> {
        // TODO: Implement REST API call to fetch markets
        return {};
    }

    public async fetchTicker(symbol: string): Promise<{ last: number }> {
        // Convert symbol to MEXC format, e.g., BTC/USDT -> BTCUSDT
        const mexcSymbol = symbol.replace('/', '');
        const url = `https://api.mexc.com/api/v3/ticker/price?symbol=${mexcSymbol}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            const data = await res.json();
            return { last: parseFloat(data.price) };
        } catch (error) {
            logError(error as Error, 'Failed to fetch ticker from MEXC');
            throw error;
        }
    }

    public async fetchOHLCV(
        symbol: string,
        timeframe: string = '1h',
        since?: number,
        limit: number = 150
    ): Promise<number[][]> {
        try {
            // ccxt expects symbols like BTC/USDT
            const ohlcv = await this.ccxtExchange.fetchOHLCV(symbol, timeframe, since, limit);
            return ohlcv;
        } catch (error) {
            logError(error as Error, 'Failed to fetch OHLCV from MEXC (ccxt)');
            throw error;
        }
    }

    public async createOrder(
        symbolOrParams: string | OrderParams,
        type?: string,
        side?: string,
        amount?: number,
        price?: number,
        params?: any
    ): Promise<Order> {
        // Only support OrderParams object for now
        const orderParams: OrderParams = typeof symbolOrParams === 'string' ? {
            symbol: symbolOrParams,
            type: type || 'MARKET',
            side: side || 'BUY',
            amount: amount || 0,
            price: price,
            ...params
        } : symbolOrParams;
        const mexcSymbol = orderParams.symbol.replace('/', '');
        const url = `https://api.mexc.com/api/v3/order`;
        const body: any = {
            symbol: mexcSymbol,
            side: orderParams.side,
            type: orderParams.type,
            quantity: orderParams.amount,
        };
        if (orderParams.type === 'LIMIT' && orderParams.price) {
            body.price = orderParams.price;
            body.timeInForce = 'GTC';
        }
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-MEXC-APIKEY': process.env.API_KEY || ''
                },
                body: JSON.stringify(body)
            });
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            const data = await res.json();
            return {
                id: data.orderId || data.clientOrderId || '',
                symbol: orderParams.symbol,
                type: orderParams.type,
                side: orderParams.side,
                price: orderParams.price || 0,
                amount: orderParams.amount
            };
        } catch (error) {
            logError(error as Error, 'Failed to create order on MEXC');
            throw error;
        }
    }

    public async fetchBalance(): Promise<{
        total: { [key: string]: number };
        used: { [key: string]: number };
        free: { [key: string]: number };
    }> {
        // Spot account balance endpoint
        const url = `https://api.mexc.com/api/v3/account`;
        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-MEXC-APIKEY': process.env.API_KEY || ''
                }
            });
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            const data = await res.json();
            const total: { [key: string]: number } = {};
            const used: { [key: string]: number } = {};
            const free: { [key: string]: number } = {};
            for (const asset of data.balances) {
                total[asset.asset] = parseFloat(asset.free) + parseFloat(asset.locked);
                used[asset.asset] = parseFloat(asset.locked);
                free[asset.asset] = parseFloat(asset.free);
            }
            return { total, used, free };
        } catch (error) {
            logError(error as Error, 'Failed to fetch balance from MEXC');
            throw error;
        }
    }

    public async startPriceStream(
        symbol: string,
        callback: (price: number) => Promise<void>
    ): Promise<void> {
        this.connectWebSocket(symbol, callback);
    }

    public async stopPriceStream(): Promise<void> {
        this.cleanup();
    }

    private connectWebSocket(
        symbol: string,
        callback: (price: number) => Promise<void>
    ): void {
        try {
            this.ws = new WebSocket(this.wsUrl);

            this.ws.on('open', () => {
                this.handleOpen(symbol);
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data, callback);
            });

            this.ws.on('error', (error) => {
                this.handleError(error, symbol, callback);
            });

            this.ws.on('close', () => {
                this.handleClose(symbol, callback);
            });

        } catch (error) {
            logError(error as Error, 'MEXC WebSocket connection error');
            this.handleError(error as Error, symbol, callback);
        }
    }

    private handleOpen(symbol: string): void {
        this.isConnected = true;
        this.reconnectAttempts = 0;

        const subscription = {
            method: "SUBSCRIPTION",
            params: [`spot@public.deals.v3.api@${symbol}`]
        };

        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(subscription));
            this.startPingInterval();
            this.emit('connected');
        }
    }

    private async handleMessage(
        data: WebSocket.Data,
        callback: (price: number) => Promise<void>
    ): Promise<void> {
        try {
            const message: MEXCWebSocketTradeMessage = JSON.parse(data.toString());
            if (message.c?.startsWith('spot@public.deals.v3.api@')) {
                const trade = message.d.deals[0];
                if (trade && typeof trade.p === 'number') {
                    this.emit('price', trade.p);
                    await callback(trade.p);
                }
            }
        } catch (error) {
            logError(error as Error, 'MEXC message handling error');
            this.emit('error', error);
        }
    }

    private handleError(
        error: Error,
        symbol: string,
        callback: (price: number) => Promise<void>
    ): void {
        logError(error, 'MEXC WebSocket error');
        this.emit('error', error);
        this.handleClose(symbol, callback);
    }

    private handleClose(
        symbol: string,
        callback: (price: number) => Promise<void>
    ): void {
        this.cleanup();
        this.emit('disconnected');
        this.attemptReconnect(symbol, callback);
    }

    private startPingInterval(): void {
        this.pingTimer = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ method: "PING" }));
            }
        }, this.pingInterval);
    }

    private cleanup(): void {
        this.isConnected = false;

        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    private async attemptReconnect(
        symbol: string,
        callback: (price: number) => Promise<void>
    ): Promise<void> {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            const err = new Error('Max reconnection attempts reached');
            logError(err, 'MEXC reconnection');
            this.emit('error', err);
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(
            this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
            30000
        );

        setTimeout(() => {
            this.connectWebSocket(symbol, callback);
        }, delay);
    }
}