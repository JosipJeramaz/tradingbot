// src/core/logger.ts
import winston, { Logger, format } from 'winston';
import type { LoggerConfig } from '../types/index.js';

const customFormat = format.printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}] : ${message}`;
    if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
});

export const setupLogger = (level: string): Logger => {
    const loggerConfig: LoggerConfig = {
        level,
        transports: [
            new winston.transports.File({ 
                filename: './logs/error.log', 
                level: 'error',
                format: format.combine(
                    format.errors({ stack: true }),
                    format.timestamp(),
                    format.json()
                )
            }),
            new winston.transports.File({ 
                filename: './logs/combined.log',
                format: format.combine(
                    format.timestamp(),
                    format.json()
                )
            }),
            new winston.transports.Console({
                format: format.combine(
                    format.colorize(),
                    format.timestamp(),
                    customFormat
                )
            })
        ]
    };

    const logger = winston.createLogger(loggerConfig);

    // Add error handler
    logger.on('error', (error) => {
        console.error('Logger error:', error);
    });

    return logger;
};

export const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

// Create specific logging functions for different types of logs
export const createTradeLogger = (baseLogger: Logger): Logger => {
    return baseLogger.child({
        module: 'trade',
        format: format.combine(
            format.timestamp(),
            format.json()
        )
    });
};

export const createStateLogger = (baseLogger: Logger): Logger => {
    return baseLogger.child({
        module: 'state',
        format: format.combine(
            format.timestamp(),
            format.json()
        )
    });
};