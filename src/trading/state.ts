// src/trading/state.ts
import fs from 'fs/promises';
import { DateTime } from 'luxon';
import type { 
    Position, 
    LevelAnalysis, 
    TradingState as TradingStateInterface 
} from '../types/index.js';
import { setupLogger } from '../core/logger.js';

export class TradingStateManager {
    private currentPosition: Position | null;
    private currentStakePercentage: number;
    private accountBalance: number | null;
    private lastLevels: LevelAnalysis | null;
    private lastUpdate: DateTime | null;
    private readonly stateFile: string;
    private readonly logger = setupLogger('info');

    constructor() {
        this.currentPosition = null;
        this.currentStakePercentage = 6.0;
        this.accountBalance = null;
        this.lastLevels = null;
        this.lastUpdate = null;
        this.stateFile = './state/trading_state.json';
        this.logger.info('TradingStateManager initialized');
    }

    public async load(): Promise<void> {
        try {
            const data = await fs.readFile(this.stateFile, 'utf8');
            const state = JSON.parse(data) as TradingStateInterface;
            
            this.currentPosition = state.currentPosition;
            this.currentStakePercentage = state.currentStakePercentage;
            this.accountBalance = state.accountBalance;
            this.lastLevels = state.lastLevels;
            this.lastUpdate = state.lastUpdate ? DateTime.fromISO(state.lastUpdate.toString()) : null;
            this.logger.info('Trading state loaded from file.');
        } catch (error) {
            // If file doesn't exist, use default values
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                this.logger.error('Error loading trading state:', error);
                throw error;
            } else {
                this.logger.warn('Trading state file not found, using defaults.');
            }
        }
    }

    public async save(): Promise<void> {
        const state: TradingStateInterface = {
            currentPosition: this.currentPosition,
            currentStakePercentage: this.currentStakePercentage,
            accountBalance: this.accountBalance,
            lastLevels: this.lastLevels,
            lastUpdate: this.lastUpdate
        };

        await fs.writeFile(
            this.stateFile, 
            JSON.stringify(
                {
                    ...state,
                    lastUpdate: this.lastUpdate?.toISO()
                },
                null, 
                2
            )
        );
        this.logger.info('Trading state saved to file.');
    }

    public getCurrentPosition(): Position | null {
        return this.currentPosition;
    }

    public async setCurrentPosition(position: Position): Promise<void> {
        this.currentPosition = position;
        await this.save();
        this.logger.info(`Current position set: type=${position.type}, entryPrice=${position.entryPrice}, size=${position.size}, leverage=${position.leverage}`);
    }

    public async clearCurrentPosition(): Promise<void> {
        this.currentPosition = null;
        await this.save();
        this.logger.info('Current position cleared.');
    }

    public async updateAccountBalance(balance: number): Promise<void> {
        this.accountBalance = balance;
        await this.save();
        this.logger.info(`Account balance updated: ${balance}`);
    }

    public getAccountBalance(): number | null {
        return this.accountBalance;
    }

    public getCurrentStakePercentage(): number {
        return this.currentStakePercentage;
    }

    public async adjustStakePercentage(tradeResult: 'WIN' | 'LOSS'): Promise<void> {
        if (tradeResult === 'WIN') {
            this.currentStakePercentage = Math.min(16.0, this.currentStakePercentage * 2);
        } else {
            this.currentStakePercentage = Math.max(2, this.currentStakePercentage / 2);
        }
        await this.save();
        this.logger.info(`Stake percentage adjusted after ${tradeResult}. Now: ${this.currentStakePercentage}`);
    }

    public async updateLevels(levels: LevelAnalysis): Promise<void> {
        this.lastLevels = levels;
        this.lastUpdate = DateTime.now();
        await this.save();
        this.logger.info('Levels updated in trading state.');
    }

    public getLevels(): LevelAnalysis | null {
        return this.lastLevels;
    }
}