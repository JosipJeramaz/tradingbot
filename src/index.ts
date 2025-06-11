// src/index.ts or wherever your main entry point is
import { config } from './config/settings.js';
import { LevelAnalyzer } from './core/levelAnalysis.js';
import { MEXCConnector } from './exchange/mexc.js';
import { BinanceConnector } from './exchange/binance.js';
import { TradingBot } from './app.js';

async function runLevelAnalysis() {
    let exchange;
    if (config.exchange.type === 'binance') {
        exchange = new BinanceConnector(config.exchange);
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

const mode = process.argv[2] === 'analyze' ? 'analyze' : 'bot';

if (mode === 'analyze') {
    runLevelAnalysis().catch(err => {
        console.error('Error during level analysis:', err);
        process.exit(1);
    });
} else {
    runTradingBot();
}