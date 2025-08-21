# Trading Bot

A cryptocurrency trading bot that identifies support/resistance levels and executes trades on Binance Futures.

## Setup

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
API_KEY=your_binance_api_key
API_SECRET=your_binance_api_secret
USE_TESTNET=true
LOG_LEVEL=info
```

4. Build the TypeScript code:
```bash
npm run build
```

5. Run the bot:
```bash
npm start
```

## Directory Structure
```
trading-bot/
├── src/             # Source code
├── dist/            # Compiled JavaScript (created after build)
├── logs/            # Trading and error logs
├── state/           # Bot state persistence
└── tests/           # Test files
```

## Development
- Run in watch mode: `npm run dev`
- Run tests: `npm test`

## Features
- Multi-timeframe support/resistance detection
- Real-time price monitoring
- Automated trade execution
- Risk management
- State persistence
- Detailed logging

## Configuration
Default settings can be modified in `src/config/constants.ts`:
- Leverage: 20x
- Initial stake: 6%
- Maximum daily losses: 3
- Maximum drawdown: 15%

## Notes
- Always test with USE_TESTNET=true first
- Monitor logs in the logs/ directory
- State is persisted between restarts