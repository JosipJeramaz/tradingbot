// src/trading/state.ts
import fs from 'fs/promises';
import { DateTime } from 'luxon';
import type { 
    Position, 
    LevelAnalysis, 
    TradingState as TradingStateInterface 
} from '../types/index.js';

export class TradingStateManager {
    private currentPosition: Position | null;
    private currentStakePercentage: number;
    private accountBalance: number | null;
    private lastLevels: LevelAnalysis | null;
    private lastUpdate: DateTime | null;
    private readonly stateFile: string;

    constructor() {
        this.currentPosition = null;
        this.currentStakePercentage = 6.0;
        this.accountBalance = null;
        this.lastLevels = null;
        this.lastUpdate = null;
        this.stateFile = './state/trading_state.json';
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
        } catch (error) {
            // If file doesn't exist, use default values
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
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
    }

    public getCurrentPosition(): Position | null {
        return this.currentPosition;
    }

    public async setCurrentPosition(position: Position): Promise<void> {
        this.currentPosition = position;
        await this.save();
    }

    public async clearCurrentPosition(): Promise<void> {
        this.currentPosition = null;
        await this.save();
    }

    public async updateAccountBalance(balance: number): Promise<void> {
        this.accountBalance = balance;
        await this.save();
    }

    public getAccountBalance(): number | null {
        return this.accountBalance;
    }

    public getCurrentStakePercentage(): number {
        return this.currentStakePercentage;
    }

    public async adjustStakePercentage(tradeResult: 'WIN' | 'LOSS'): Promise<void> {
        if (tradeResult === 'WIN') {
            this.currentStakePercentage = Math.min(6.0, this.currentStakePercentage * 2);
        } else {
            this.currentStakePercentage = Math.max(1.5, this.currentStakePercentage / 2);
        }
        await this.save();
    }

    public async updateLevels(levels: LevelAnalysis): Promise<void> {
        this.lastLevels = levels;
        this.lastUpdate = DateTime.now();
        await this.save();
    }

    public getLevels(): LevelAnalysis | null {
        return this.lastLevels;
    }
}