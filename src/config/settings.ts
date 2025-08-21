// src/config/settings.ts
import { TRADING_CONSTANTS } from './constants.js';
import type { Config } from '../types/index.js';

export function getConfig(): Config {
    return {
        exchange: {
            type: (process.env.EXCHANGE_TYPE as 'binance' | 'mexc') || 'binance',
            apiKey: process.env.API_KEY || '',
            apiSecret: process.env.API_SECRET || '',
            testnet: process.env.USE_TESTNET === 'true'
        },
        trading: {
            symbol: 'BTC/USDT',
            leverage: TRADING_CONSTANTS.LEVERAGE,
            initialStake: TRADING_CONSTANTS.INITIAL_STAKE_PERCENTAGE
        },
        risk: {
            maxDailyLosses: TRADING_CONSTANTS.MAX_DAILY_LOSSES,
            maxDrawdown: TRADING_CONSTANTS.MAX_DRAWDOWN
        },
        system: {
            logLevel: process.env.LOG_LEVEL || 'info',
            stateDir: './state',
            logDir: './logs'
        }
    };
}