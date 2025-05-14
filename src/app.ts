// src/app.ts
import { EventEmitter } from 'events';
import { config } from './config/settings.js';
import { TradingEngine } from './trading/engine.js';
import { setupLogger } from './core/logger.js';
import { logError } from './core/utils.js';
import fs from 'fs/promises';
import type { Logger } from 'winston';

export class TradingBot {
    private engine: TradingEngine | null;
    private logger: Logger | null;

    constructor() {
        this.engine = null;
        this.logger = null;
    }

    public async initialize(): Promise<boolean> {
        try {
            await this.createDirectories();
            this.logger = setupLogger(config.system.logLevel);
            this.engine = new TradingEngine(config);
            this.setupEventHandlers();
            return true;
        } catch (error) {
            logError(error as Error, 'Initialization failed');
            return false;
        }
    }

    public async start(): Promise<void> {
        try {
            if (!this.engine || !this.logger) {
                throw new Error('Trading bot not properly initialized');
            }

            this.logger.info('Starting trading bot...');
            await this.engine.start();
        } catch (error) {
            if (this.logger) {
                this.logger.error('Failed to start trading bot:', error);
            }
            await this.stop();
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
        });

        this.engine.on('stopped', () => {
            this.logger?.info('Trading engine stopped');
        });

        this.engine.on('positionOpened', (position) => {
            this.logger?.info(`Position opened: ${JSON.stringify(position)}`);
        });

        this.engine.on('positionClosed', (result) => {
            this.logger?.info(`Position closed: ${JSON.stringify(result)}`);
        });

        this.engine.on('error', (error) => {
            this.logger?.error(`Trading engine error: ${error.message}`);
        });
    }
}