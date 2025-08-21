// src/core/utils.ts
import { DateTime } from 'luxon';

export const PRECISION = 8;

export const fixedNumber = (num: number): number => {
    return Number(Number(num).toFixed(PRECISION));
};

export const sleep = (ms: number): Promise<void> => 
    new Promise(resolve => setTimeout(resolve, ms));

export const formatTime = (timestamp: number): string => {
    return DateTime.fromMillis(timestamp)
        .setZone('UTC')
        .toFormat('yyyy-MM-dd HH:mm:ss');
};

export const logError = (error: Error, context: string = ''): void => {
    const timestamp = DateTime.now().toISO();
    console.error(`[${timestamp}] ${context}: ${error.message}`);
    if (error.stack) {
        console.error(error.stack);
    }
};