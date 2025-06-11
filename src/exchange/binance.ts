// src/exchange/binance.ts
// @ts-ignore
import ccxtImport from 'ccxt';
const ccxt: any = ccxtImport;
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { fixedNumber } from '../core/utils.js';
import type { Config } from '../types/index.js';
import type { Exchange, OrderParams, Order } from '../types/exchange.js';

export class BinanceConnector implements Exchange {
    private readonly exchange: any;
    private readonly wsEmitter: EventEmitter;
    private readonly maxReconnectAttempts: number = 5;
    private ws: WebSocket | null;
    private pingInterval: NodeJS.Timeout | null;
    private reconnectAttempts: number;
    private markets: Record<string, any>;

    constructor(config: Config['exchange']) {
        this.exchange = new ccxt['binanceusdm']({
            apiKey: config.apiKey,
            secret: config.apiSecret,
            options: { 
                defaultType: 'future',
            }
        });

        this.wsEmitter = new EventEmitter();
        this.ws = null;
        this.pingInterval = null;
        this.reconnectAttempts = 0;
        this.markets = {};
    }

    public async initialize(): Promise<void> {
        this.markets = await this.loadMarkets();
    }

    public async loadMarkets(): Promise<any> {
        return await this.exchange.loadMarkets();
    }

    public async fetchTicker(symbol: string): Promise<{ last: number }> {
        // Use futures ticker
        const ticker = await this.exchange.fetchTicker(symbol);
        return {
            last: Number(ticker.last)
        };
    }

    public async fetchOHLCV(
        symbol: string,
        timeframe?: string,
        since?: number,
        limit?: number
    ): Promise<number[][]> {
        // This will now use futures endpoint due to defaultType
        return await this.exchange.fetchOHLCV(symbol, timeframe, since, limit);
    }

    public async createOrder(
        symbolOrParams: string | OrderParams,
        type?: string,
        side?: string,
        amount?: number,
        price?: number,
        params?: any
    ): Promise<Order> {
        try {
            const ccxtOrder = typeof symbolOrParams === 'string' 
                ? await this.exchange.createOrder(
                    symbolOrParams,
                    type!,
                    side!,
                    amount!,
                    price,
                    params
                )
                : await this.exchange.createOrder(
                    symbolOrParams.symbol!,
                    symbolOrParams.type,
                    symbolOrParams.side,
                    symbolOrParams.amount,
                    symbolOrParams.price,
                    { leverage: symbolOrParams.leverage }
                );
    
            // Transform CCXT order to our Order type
            return {
                id: ccxtOrder.id,
                price: Number(ccxtOrder.price),
                symbol: ccxtOrder.symbol,
                type: ccxtOrder.type,
                side: ccxtOrder.side,
                amount: Number(ccxtOrder.amount)
            };
        } catch (error) {
            throw new Error(`Order creation failed: ${(error as Error).message}`);
        }
    }

    public async fetchBalance(): Promise<{
        total: { [key: string]: number };
        used: { [key: string]: number };
        free: { [key: string]: number };
    }> {
        try {
            const balance = await this.exchange.fetchBalance();
            return {
                total: balance.total,
                used: balance.used,
                free: balance.free
            };
        } catch (error) {
            throw new Error(`Failed to fetch balance: ${(error as Error).message}`);
        }
    }

    public async startPriceStream(
        symbol: string, 
        callback: (price: number) => Promise<void>
    ): Promise<void> {
        const streamSymbol = symbol.replace('/', '').toLowerCase();
        const url = `wss://fstream.binance.com/ws/${streamSymbol}@trade`;

        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            this.reconnectAttempts = 0;
            this.startPingInterval();
            this.wsEmitter.emit('connected');
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            try {
                const message = JSON.parse(data.toString()) as { e: string; p: string; };
                if (message.e === 'trade') {
                    callback(fixedNumber(parseFloat(message.p)));
                }
            } catch (error) {
                this.wsEmitter.emit('error', error);
            }
        });

        this.ws.on('close', () => {
            this.clearPingInterval();
            this.handleDisconnect(symbol, callback);
        });

        this.ws.on('error', (error: Error) => {
            this.wsEmitter.emit('error', error);
            this.handleDisconnect(symbol, callback);
        });
    }

    public async stopPriceStream(): Promise<void> {
        if (this.ws) {
            this.clearPingInterval();
            this.ws.close();
            this.ws = null;
        }
    }

    private startPingInterval(): void {
        this.pingInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.ping();
            }
        }, 30000);
    }

    private clearPingInterval(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    private async handleDisconnect(
        symbol: string, 
        callback: (price: number) => Promise<void>
    ): Promise<void> {
        this.clearPingInterval();
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`WebSocket disconnected. Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            await this.startPriceStream(symbol, callback);
        } else {
            this.wsEmitter.emit('error', new Error('Maximum reconnection attempts reached'));
        }
    }
}