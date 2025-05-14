// src/trading/risk.ts 
import type { Config } from '../types/index.js';

export class RiskManager {
    private readonly maxDailyLosses: number;
    private readonly maxDrawdown: number;
    private dailyLosses: number;
    private lastLossDate: DateTime | null;
    private initialBalance: number | null;

    constructor(config: Config['risk']) {
        this.maxDailyLosses = config.maxDailyLosses;
        this.maxDrawdown = config.maxDrawdown;
        this.dailyLosses = 0;
        this.lastLossDate = null;
        this.initialBalance = null;
    }

    public initialize(balance: number): void {
        this.initialBalance = balance;
    }

    public handleLoss(): void {
        const today = DateTime.now().startOf('day');
        
        if (!this.lastLossDate || !this.lastLossDate.hasSame(today, 'day')) {
            this.dailyLosses = 1;
        } else {
            this.dailyLosses++;
        }
        
        this.lastLossDate = today;
    }

    public canOpenPosition(): boolean {
        // Check daily loss limit
        if (this.dailyLosses >= this.maxDailyLosses) {
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

// src/trading/state.ts
import fs from 'fs/promises';
import { DateTime } from 'luxon';
import type { 
    Position, 
    LevelAnalysis, 
    TradingState as TradingStateType 
} from '../types/index.js';

export class TradingStateManager {
    private state: TradingStateType;
    private readonly stateFile: string;

    constructor() {
        this.state = {
            currentPosition: null,
            currentStakePercentage: 6.0,
            accountBalance: null,
            lastLevels: null,
            lastUpdate: null
        };
        this.stateFile = './state/trading_state.json';
    }

    public async load(): Promise<void> {
        try {
            const data = await fs.readFile(this.stateFile, 'utf8');
            const savedState = JSON.parse(data);
            
            this.state = {
                ...savedState,
                lastUpdate: savedState.lastUpdate ? DateTime.fromISO(savedState.lastUpdate) : null
            };
        } catch (error) {
            // If file doesn't exist, use default values
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
    }

    public async save(): Promise<void> {
        const stateToSave = {
            ...this.state,
            lastUpdate: this.state.lastUpdate?.toISO()
        };

        await fs.writeFile(
            this.stateFile, 
            JSON.stringify(stateToSave, null, 2)
        );
    }

    public getCurrentPosition(): Position | null {
        return this.state.currentPosition;
    }

    public async setCurrentPosition(position: Position): Promise<void> {
        this.state.currentPosition = position;
        await this.save();
    }

    public async clearCurrentPosition(): Promise<void> {
        this.state.currentPosition = null;
        await this.save();
    }

    public async updateAccountBalance(balance: number): Promise<void> {
        this.state.accountBalance = balance;
        await this.save();
    }

    public getAccountBalance(): number | null {
        return this.state.accountBalance;
    }

    public getCurrentStakePercentage(): number {
        return this.state.currentStakePercentage;
    }

    public async adjustStakePercentage(tradeResult: 'WIN' | 'LOSS'): Promise<void> {
        if (tradeResult === 'WIN') {
            this.state.currentStakePercentage = Math.min(6.0, this.state.currentStakePercentage * 2);
        } else {
            this.state.currentStakePercentage = Math.max(1.5, this.state.currentStakePercentage / 2);
        }
        await this.save();
    }

    public async updateLevels(levels: LevelAnalysis): Promise<void> {
        this.state.lastLevels = levels;
        this.state.lastUpdate = DateTime.now();
        await this.save();
    }

    public getLevels(): LevelAnalysis | null {
        return this.state.lastLevels;
    }
}