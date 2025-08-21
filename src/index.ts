import readline from 'readline';
import { getConfig } from './config/settings.js';
import type { Config } from './types/index.js';
import dotenv from 'dotenv';

async function chooseEnvAndLoad() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question('Use Binance TESTNET? (y/n): ', (envAnswer) => {
            process.env.EXCHANGE_TYPE = 'binance';
            let envFile = '.env.mainnet';
            if (envAnswer.trim().toLowerCase() === 'y') {
                envFile = '.env.testnet';
            }
            dotenv.config({ path: envFile });
            console.log(`Loaded ${envFile}`);
            console.log('Current working directory:', process.cwd());
            console.log('Loaded API_KEY after dotenv.config:', process.env.API_KEY);
            resolve(undefined);
            rl.close();
        });
    });
}

import { LevelAnalyzer } from './core/levelAnalysis.js';
import { MEXCConnector } from './exchange/mexc.js';
import { BinanceConnector } from './exchange/binance.js';
import { TradingBot } from './app.js';

async function runLevelAnalysis() {
    let exchange;
    if (config.exchange.type === 'binance') {
        exchange = new BinanceConnector();
    } else {
        exchange = new MEXCConnector(config.exchange);
    }
    await exchange.initialize();

    const analyzer = new LevelAnalyzer(exchange);
    const symbol = config.trading.symbol || 'BTC/USDT';

    const levels = await analyzer.analyzeLevels(symbol);
    console.log('Raw levels data:', JSON.stringify(levels, null, 2));
}

async function runTradingBot() {
    const bot = new TradingBot();
    const initialized = await bot.initialize();
    if (!initialized) {
        console.error('Failed to initialize trading bot.');
        process.exit(1);
    }
    try {
        await bot.start();
    } catch (error) {
        console.error('Fatal error:', error);
        await bot.stop();
        process.exit(1);
    }
    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('Received SIGINT, stopping bot...');
        await bot.stop();
        process.exit(0);
    });
    process.on('SIGTERM', async () => {
        console.log('Received SIGTERM, stopping bot...');
        await bot.stop();
        process.exit(0);
    });
}

let config: Config;

async function main() {
    await chooseEnvAndLoad();

    // Initialize config after environment is loaded
    config = getConfig();

    const mode = process.argv[2] === 'analyze' ? 'analyze' : 'bot';
    if (mode === 'analyze') {
        runLevelAnalysis().catch(err => {
            console.error('Error during level analysis:', err);
            process.exit(1);
        });
    } else {
        runTradingBot();
    }
}

main();