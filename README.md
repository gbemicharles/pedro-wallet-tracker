# Pedro Wallet Tracker - Deployment

This is the standalone Pedro Wallet Tracker web app for TON wallet integration.

## Setup Instructions

### 1. Create a New Replit

1. Go to [Replit](https://replit.com)
2. Click "Create Repl"
3. Choose "Python" template
4. Name it "pedro-wallet-tracker"

### 2. Upload Files

Copy all files from the `wallet-tracker-deployment/` directory to your new Replit:
- `game_server.py` - Flask server
- `game/` folder - All frontend files (HTML, JS, CSS, images)
- `requirements.txt` - Python dependencies
- `.replit` - Replit configuration

### 3. No Secrets Needed

The wallet tracker doesn't need any API keys! It uses public blockchain APIs.

### 4. Deploy

1. Click the "Deploy" button in Replit
2. Select "Autoscale" deployment (already configured)
3. It will deploy automatically
4. Get your public URL

### 5. Use in Telegram

Take your deployment URL (e.g., `https://your-repl.replit.app`) and use it in your Telegram Mini App setup with @BotFather.

## Features

- **TON Wallet Connection**: Connect any TON wallet via TON Connect
- **$PEDRO Balance**: Live token balance display
- **Price Data**: Real-time price from DexScreener
- **Leaderboard**: Top 100 traders ranked by net trading volume (purchases - sales)
  - Updates every 10 minutes
  - Only counts trades AFTER deployment
  - Podium display for top 3
- **Explore Page**: Trading analytics and user ranking
- **Profile Page**: User info, wallet address, Twitter connection
- **Buy Button**: Quick link to DeDust exchange

## Technical Details

- **Server**: Gunicorn production WSGI server
- **Port**: 5000 (automatically exposed)
- **Deployment**: Autoscale (scales with traffic)
- **APIs Used**:
  - TON Center API (balance data)
  - DexScreener API (price data)
  - TonAPI (holder count, transaction history)

## Important Notes

- Deployment timestamp resets when you deploy (this is intentional)
- Leaderboard starts empty and fills as people trade
- First buyer after deployment gets automatic #1 spot
- Updates every 10 minutes automatically

## Troubleshooting

**Changes not visible:**
- Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
- Wait a few seconds for deployment

**Leaderboard empty:**
- Normal! It fills as people buy $PEDRO after deployment
- Check "Last updated" timestamp to confirm it's running

**Port errors:**
- Make sure you're using Autoscale deployment
- Port 5000 is automatically configured

## Deployment Flow

1. Upload files → 2. Click Deploy → 3. Get URL → 4. Use in Telegram → Done! 🎉
