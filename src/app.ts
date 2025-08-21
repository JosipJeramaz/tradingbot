// src/app.ts
import { EventEmitter } from 'events';
import { getConfig } from './config/settings.js';
import { TradingEngine } from './trading/engine.js';
import { setupLogger } from './core/logger.js';
import { logError } from './core/utils.js';
import fs from 'fs/promises';
import type { Logger } from 'winston';

const config = getConfig();

export class TradingBot extends EventEmitter {
    private engine: TradingEngine | null;
    private logger: Logger | null;
    private status: 'idle' | 'initialized' | 'running' | 'stopped' = 'idle';

    constructor() {
        super();
        this.engine = null;
        this.logger = null;
    }

    public async initialize(): Promise<boolean> {
        try {
            await this.createDirectories();
            this.logger = setupLogger(config.system.logLevel);
            this.engine = new TradingEngine(config);
            this.setupEventHandlers();
            this.status = 'initialized';
            return true;
        } catch (error) {
            logError(error as Error, 'Initialization failed');
            this.status = 'idle';
            return false;
        }
    }

    public async start(): Promise<void> {
        try {
            if (!this.engine || !this.logger) {
                throw new Error('Trading bot not properly initialized');
            }
            this.logger.info('Starting trading bot...');
            this.status = 'running';
            await this.engine.start();
        } catch (error) {
            if (this.logger) {
                this.logger.error('Failed to start trading bot:', error);
            }
            await this.stop();
            this.status = 'stopped';
            throw error;
        }
    }

    public async stop(): Promise<void> {
        try {
            if (this.logger) {
                this.logger.info('Stopping trading bot...');
            }
            if (this.engine) {
                await this.engine.stop();
            }
            this.status = 'stopped';
        } catch (error) {
            if (this.logger) {
                this.logger.error('Error stopping trading bot:', error);
            }
        }
    }

    private async createDirectories(): Promise<void> {
        const dirs = [config.system.stateDir, config.system.logDir];
        for (const dir of dirs) {
            try {
                await fs.access(dir);
            } catch {
                await fs.mkdir(dir, { recursive: true });
            }
        }
    }

    private setupEventHandlers(): void {
        if (!this.engine || !this.logger) return;

        this.engine.on('started', () => {
            this.logger?.info('Trading engine started successfully');
            this.emit('started');
        });

        this.engine.on('stopped', () => {
            this.logger?.info('Trading engine stopped');
            this.emit('stopped');
        });

        this.engine.on('positionOpened', (position) => {
            this.logger?.info(`Position opened: ${JSON.stringify(position)}`);
            this.emit('positionOpened', position);
        });

        this.engine.on('positionClosed', (result) => {
            this.logger?.info(`Position closed: ${JSON.stringify(result)}`);
            this.emit('positionClosed', result);
        });

        this.engine.on('error', (error) => {
            this.logger?.error(`Trading engine error: ${error.message}`);
            this.emit('error', error);
        });
    }
}