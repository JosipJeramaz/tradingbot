// src/index.ts or wherever your main entry point is
import { BinanceConnector } from './exchange/binance.js';
import { LevelAnalyzer } from './core/levelAnalysis.js';
import { config } from './config/settings.js';

async function main() {
    try {
        // Initialize just what we need for level analysis
        const exchange = new BinanceConnector(config.exchange);
        await exchange.initialize();
        
        const analyzer = new LevelAnalyzer(exchange);
        const symbol = 'BTC/USDT';  // or from config.trading.symbol
        
        // This will print the levels to console as per your original Python implementation
        const levels = await analyzer.analyzeLevels(symbol);
        
        // Optional: if you want to see the raw levels data
        console.log('Raw levels data:', JSON.stringify(levels, null, 2));
        
    } catch (error) {
        console.error('Error:', error);
    }
}

main();