# Pedro Wallet Tracker

## Overview

Pedro Wallet Tracker is a Telegram Mini App that integrates with TON blockchain wallets to track $PEDRO token holdings and trading activity. The application provides real-time balance tracking, price data from DexScreener, and a live leaderboard system that ranks traders by net trading volume (total buys minus total sells). The leaderboard tracks transactions forward from server start time and only includes wallets with ≥10,000 PEDRO holdings. Users can connect their TON wallets via TON Connect (with wallet exclusivity enforcement), view their token balance, see their ranking displayed with their Telegram display name, and quickly access the DeDust exchange for trading.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Single Page Application (SPA)**: Built with vanilla JavaScript, HTML, and CSS
- **Tab-based Navigation**: The UI uses a tab system to switch between different views (Game, Explore, Profile)
- **Telegram WebApp Integration**: Leverages Telegram's WebApp API for native app-like experience within Telegram
- **TON Connect UI**: Uses the official TON Connect SDK for wallet connection and authentication
- **Client-side Rendering**: All UI updates and data rendering happen in the browser

**Rationale**: Vanilla JavaScript keeps the application lightweight and fast-loading, which is crucial for Telegram Mini Apps where users expect instant access. The tab-based design provides easy navigation without page reloads.

### Backend Architecture
- **Flask Web Server**: Python-based lightweight web server
- **RESTful API Design**: JSON endpoints for wallet data and leaderboard
- **Incremental State Tracking**: Forward-tracking system with in-memory state persistence (trader_state, last_processed_lt, balance_cache)
- **Near Real-time Updates**: Leaderboard refreshes every 1 minute with paginated event fetching
- **Concurrent API Processing**: Uses ThreadPoolExecutor for parallel blockchain API requests
- **Static File Serving**: Flask serves frontend assets directly

**Rationale**: Flask was chosen for its simplicity and quick deployment capability on Replit. The incremental tracking system ensures all transactions from server start are captured without missing any events, even during high trading activity. Balance caching (3-minute TTL) reduces API calls while maintaining data freshness.

### Data Management
- **Incremental State Storage**: Persistent in-memory dictionaries for cumulative volumes and event tracking
  - `trader_state`: Tracks cumulative purchases, sales, and last transaction time per wallet
  - `last_processed_lt`: Tracks the last processed logical time to avoid reprocessing events
  - `balance_cache`: Caches wallet balances with 3-minute TTL
  - `wallet_bindings`: Persistent JSON file mapping TON wallet addresses to Telegram user info with exclusivity enforcement
- **Wallet Binding Persistence**: wallet_bindings.json stores wallet-to-user mappings (one wallet per Telegram account)
- **Forward-Only Tracking**: Only processes transactions from TRACKING_START_TIME (server start) onward
- **1-Minute Refresh Cycle**: Leaderboard updates every 60 seconds

**Rationale**: Since all source data exists on the blockchain, there's no need for a persistent database. The incremental tracking approach ensures 100% accuracy by processing all new events in each refresh cycle with pagination. Balance caching reduces API calls while the 1-minute refresh provides near real-time leaderboard updates. Wallet binding persistence ensures wallet exclusivity and allows Telegram display names to be shown on the leaderboard.

### Authentication & Authorization
- **TON Connect Protocol**: Industry-standard wallet connection for TON blockchain
- **Telegram WebApp Authentication**: Uses Telegram's built-in user identification
- **Wallet Exclusivity System**: Enforces one wallet per Telegram account via persistent bindings
- **Backend Validation**: Server-side endpoints (/api/wallet/connect, /api/wallet/disconnect) validate and persist wallet connections
- **Display Name Integration**: Connected wallets show user's Telegram display name on leaderboard

**Rationale**: TON Connect provides secure, standardized wallet authentication. The wallet exclusivity system prevents a single wallet from being connected to multiple Telegram accounts, ensuring fair leaderboard representation. Backend validation with JSON persistence maintains wallet-user mappings across server restarts.

### Blockchain Integration
- **Public API Consumption**: Uses TONApi.io for blockchain data queries
- **Rate Limiting Strategy**: Implements 0.7s delays between requests with exponential backoff for 429 errors
- **Paginated Event Fetching**: Loops through all new events until reaching last_processed_lt or TRACKING_START_TIME
- **Forward Tracking**: Only processes transactions from server start time onward (no historical data)
- **Real-time Balance Queries**: Direct contract queries for token balances with 3-minute caching
- **Trading Volume Calculation**: Net volume = total purchases minus total sales (leaderboard ranks by net volume)
- **Balance Threshold**: Only includes wallets with ≥10,000 PEDRO (auto-removes below threshold)
- **Leaderboard Display**: Shows only rank and identifier (Telegram display name if connected, otherwise wallet address)

**Rationale**: Public APIs eliminate the need for running blockchain nodes. Paginated fetching ensures no events are missed even during high activity (>100 swaps/minute). Forward-only tracking from server start provides a fair, clean slate for all participants. The 10,000 PEDRO threshold focuses the leaderboard on serious traders.

## External Dependencies

### Blockchain Services
- **TONApi.io**: Primary blockchain data provider for transaction history, wallet balances, and contract interactions
- **TON Connect**: Wallet connection protocol and UI library
- **TonWeb**: JavaScript library for TON blockchain interactions and address formatting

### Price Data
- **DexScreener**: Real-time price feeds for $PEDRO token

### Exchange Integration
- **DeDust**: Decentralized exchange for $PEDRO token trading (deep-linked for quick access)

### Telegram Platform
- **Telegram WebApp API**: Provides user data, app lifecycle management, and native UI integration
- **Telegram Bot API**: Required for Mini App deployment via @BotFather

### Python Libraries
- **Flask 3.1.2**: Web server framework
- **flask-cors 6.0.1**: Cross-origin resource sharing support
- **requests 2.32.5**: HTTP client for external API calls
- **gunicorn 23.0.0**: Production WSGI server for deployment

### Frontend Libraries
- **TON Connect UI**: Official wallet connection interface
- **TonWeb**: TON blockchain JavaScript SDK
- **Google Fonts**: Montserrat and Inter font families for typography

### Hosting
- **Replit**: Primary deployment platform with autoscale configuration
- **Static Asset Serving**: Images, audio files, and sprite animations served directly from Flask