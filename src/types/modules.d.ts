// src/types/modules.d.ts
declare module '*.js' {
    const content: any;
    export default content;
    export * from content;
}

declare module '../core/utils.js' {
    export function fixedNumber(num: number): number;
    export const PRECISION: number;
    export function sleep(ms: number): Promise<void>;
    export function formatTime(timestamp: number): string;
    export function logError(error: Error, context?: string): void;
}

declare module './app.js' {
    import { EventEmitter } from 'events';
    export class TradingBot extends EventEmitter {
        constructor();
        initialize(): Promise<boolean>;
        start(): Promise<void>;
        stop(): Promise<void>;
    }
}