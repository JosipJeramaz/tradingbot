// src/config/constants.ts
export const TRADING_CONSTANTS = {
    LEVERAGE: 40, // 40x leverage
    MIN_DISTANCE: 0.001, // 0.1%
    STOP_LOSS_PERCENTAGE: 0.05, // 5%
    MAX_DAILY_LOSSES: 3,
    MAX_DRAWDOWN: 0.15, // 15%
    INITIAL_STAKE_PERCENTAGE: 16, // 16%
    MIN_STAKE_PERCENTAGE: 1.5,
    MAX_STAKE_PERCENTAGE: 16, // 16%
    LEVEL_UPDATE_INTERVAL: 1 * 60 * 1000, // 1 minute
    WS_RECONNECT_ATTEMPTS: 5,
    WS_PING_INTERVAL: 10000, // 10 seconds
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