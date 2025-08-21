// src/trading/risk.ts 
import type { Config } from '../types/index.js';
import { setupLogger } from '../core/logger.js';
import { DateTime } from 'luxon';

export class RiskManager {
    private readonly maxDailyLosses: number;
    private readonly maxDrawdown: number;
    private dailyLosses: number;
    private lastLossDate: DateTime | null;
    private initialBalance: number | null;
    private readonly logger = setupLogger('info');

    constructor(config: Config['risk']) {
        this.maxDailyLosses = config.maxDailyLosses;
        this.maxDrawdown = config.maxDrawdown;
        this.dailyLosses = 0;
        this.lastLossDate = null;
        this.initialBalance = null;
        this.logger.info('RiskManager initialized');
    }

    public initialize(balance: number): void {
        this.initialBalance = balance;
        this.logger.info(`RiskManager initialized with balance: ${balance}`);
    }

    public handleLoss(): void {
        const today = DateTime.now().startOf('day');
        
        if (!this.lastLossDate || !this.lastLossDate.hasSame(today, 'day')) {
            this.dailyLosses = 1;
        } else {
            this.dailyLosses++;
        }
        
        this.lastLossDate = today;
        this.logger.warn(`Loss handled. Daily losses: ${this.dailyLosses}`);
    }

    public canOpenPosition(): boolean {
        // Check daily loss limit
        if (this.dailyLosses >= this.maxDailyLosses) {
            this.logger.warn('Daily loss limit reached. Cannot open new position.');
            return false;
        }

        // Reset daily losses if it's a new day
        const today = DateTime.now().startOf('day');
        if (this.lastLossDate && !this.lastLossDate.hasSame(today, 'day')) {
            this.dailyLosses = 0;
            this.lastLossDate = null;
        }

        return true;
    }

    public checkDrawdown(currentBalance: number): boolean {
        if (!this.initialBalance) return true;
        
        const drawdown = (this.initialBalance - currentBalance) / this.initialBalance;
        this.logger.info(`Checking drawdown: ${drawdown}`);
        return drawdown <= this.maxDrawdown;
    }

    public getCurrentRiskMetrics(): {
        dailyLosses: number;
        lastLossDate: DateTime | null;
        initialBalance: number | null;
    } {
        return {
            dailyLosses: this.dailyLosses,
            lastLossDate: this.lastLossDate,
            initialBalance: this.initialBalance
        };
    }
}