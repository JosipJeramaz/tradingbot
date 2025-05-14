// src/config/constants.ts
export const TRADING_CONSTANTS = {
    LEVERAGE: 20,
    MIN_DISTANCE: 0.001, // 0.1%
    STOP_LOSS_PERCENTAGE: 0.10, // 10%
    MAX_DAILY_LOSSES: 3,
    MAX_DRAWDOWN: 0.15, // 15%
    INITIAL_STAKE_PERCENTAGE: 6.0,
    MIN_STAKE_PERCENTAGE: 1.5,
    MAX_STAKE_PERCENTAGE: 6.0,
    LEVEL_UPDATE_INTERVAL: 5 * 60 * 1000, // 5 minutes
    WS_RECONNECT_ATTEMPTS: 5,
    WS_PING_INTERVAL: 30000, // 30 seconds
} as const;

export const TIMEFRAMES = {
    FOUR_HOUR: '4h',
    ONE_HOUR: '1h',
    FIFTEEN_MIN: '15m',
    FIVE_MIN: '5m'
} as const;

export const CANDLE_LIMITS: Record<string, number> = {
    [TIMEFRAMES.FOUR_HOUR]: 80,
    [TIMEFRAMES.ONE_HOUR]: 320,
    [TIMEFRAMES.FIFTEEN_MIN]: 1280,
    [TIMEFRAMES.FIVE_MIN]: 3840
};