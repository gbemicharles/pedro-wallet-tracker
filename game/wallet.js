// Initialize Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Pedro token contract address on TON
const PEDRO_CONTRACT = 'EQBGtsm26tdn6bRjZrmLZkZMqk-K8wd4R66k52ntPU4UzcV0';

// Load Telegram user data into Profile page
function loadProfileData() {
    const user = tg.initDataUnsafe?.user;
    
    if (user) {
        // Set profile name
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
        document.getElementById('profile-name').textContent = fullName || 'Pedro Fan';
        
        // Set username
        const username = user.username ? `@${user.username}` : 'No username';
        document.getElementById('profile-username').textContent = username;
        
        // Set profile picture
        const profilePic = document.getElementById('profile-picture');
        if (user.photo_url) {
            // Use actual profile picture from Telegram
            profilePic.style.backgroundImage = `url(${user.photo_url})`;
            profilePic.style.backgroundSize = 'cover';
            profilePic.style.backgroundPosition = 'center';
            profilePic.textContent = '';
        } else {
            // Fallback to initial
            const initial = user.first_name ? user.first_name[0].toUpperCase() : 'P';
            profilePic.style.backgroundImage = 'none';
            profilePic.textContent = initial;
        }
    } else {
        // Fallback if user data not available
        document.getElementById('profile-name').textContent = 'Pedro Fan';
        document.getElementById('profile-username').textContent = '@pedro_trader';
        document.getElementById('profile-picture').textContent = 'P';
    }
    
    // Set wallet address if connected
    const profileWalletEl = document.getElementById('profile-wallet');
    if (window.currentWalletAddress) {
        profileWalletEl.textContent = window.currentWalletAddress;
        profileWalletEl.style.cursor = 'pointer';
        profileWalletEl.title = 'Click to copy';
    } else {
        profileWalletEl.textContent = 'Not connected';
        profileWalletEl.style.cursor = 'default';
    }
    
    // Load X account status from localStorage
    const xAccount = localStorage.getItem('pedro_x_account');
    const xConnectSection = document.getElementById('x-connect-section');
    const xConnectedSection = document.getElementById('x-connected-section');
    const xUsernameEl = document.getElementById('x-username');
    
    // Only update if elements exist (prevents errors on non-profile pages)
    if (xConnectSection && xConnectedSection) {
        if (xAccount) {
            xConnectSection.classList.add('hidden');
            xConnectedSection.classList.remove('hidden');
            if (xUsernameEl) xUsernameEl.textContent = `@${xAccount}`;
        } else {
            xConnectSection.classList.remove('hidden');
            xConnectedSection.classList.add('hidden');
        }
    }
}

// Helper function to format TON address to user-friendly format
function formatTonAddress(address) {
    try {
        if (!address || !window.TonWeb) return address;
        
        // Convert to user-friendly non-bounceable format
        const addr = new window.TonWeb.utils.Address(address);
        return addr.toString(true, true, false);  // user-friendly, url-safe, non-bounceable
    } catch (e) {
        console.error('Address formatting error:', e);
        return address;
    }
}

// Helper function to shorten address for display
function shortenAddress(address) {
    if (!address || address.length < 12) return address;
    return address.slice(0, 6) + '...' + address.slice(-6);
}

// Fetch and display leaderboard data (ranked by trading volume)
async function loadLeaderboard() {
    const leaderboardList = document.getElementById('leaderboard-list');
    leaderboardList.innerHTML = '<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.5);">Loading leaderboard...</div>';
    
    try {
        console.log('Loading leaderboard from backend...');
        
        // Fetch cached leaderboard from backend
        const response = await fetch('/api/leaderboard');
        
        if (!response.ok) {
            throw new Error('Failed to fetch leaderboard');
        }
        
        const result = await response.json();
        
        // Handle loading/initialization state
        if (result.loading) {
            const errorMsg = result.error || result.message || 'Fetching trading data from blockchain...';
            leaderboardList.innerHTML = `
                <div style="text-align: center; padding: 60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px; animation: pulse 2s ease-in-out infinite;">⏳</div>
                    <div style="color: rgba(255,255,255,0.7); font-size: 16px; margin-bottom: 8px; font-weight: 600;">
                        Leaderboard Initializing
                    </div>
                    <div style="color: rgba(255,255,255,0.5); font-size: 13px; max-width: 320px; margin: 0 auto; line-height: 1.5;">
                        ${errorMsg}
                    </div>
                    <div style="color: rgba(255,255,255,0.4); font-size: 12px; margin-top: 16px;">
                        Scanning for new buyers since launch...
                    </div>
                </div>
            `;
            return;
        }
        
        // Handle empty leaderboard (no traders bought yet since deployment)
        if (!result.data || result.data.length === 0) {
            leaderboardList.innerHTML = `
                <div style="text-align: center; padding: 60px 20px;">
                    <div style="font-size: 64px; margin-bottom: 16px;">🦝</div>
                    <div style="color: rgba(255,255,255,0.7); font-size: 18px; margin-bottom: 8px; font-weight: 600;">
                        Leaderboard is Empty
                    </div>
                    <div style="color: rgba(255,255,255,0.5); font-size: 14px; max-width: 320px; margin: 0 auto; line-height: 1.6;">
                        Be the first to buy $PEDRO and claim the #1 spot! 🚀
                    </div>
                    <div style="color: rgba(255,255,255,0.4); font-size: 12px; margin-top: 20px;">
                        The leaderboard tracks all buys from the moment Pedro went live
                    </div>
                </div>
            `;
            return;
        }
        
        const traders = result.data;
        const newTradersCount = result.new_traders_count || 0;
        const deploymentTime = result.deployment_time;
        console.log(`Loaded ${traders.length} traders, ${newTradersCount} new since deployment`);
        
        // Find user's rank if wallet connected
        let userRankHTML = '';
        if (window.currentWalletAddress) {
            const userAddress = window.currentWalletAddress;
            const userRankIndex = traders.findIndex(t => formatTonAddress(t.address) === userAddress);
            
            if (userRankIndex !== -1) {
                const userRank = userRankIndex + 1;
                const userTrader = traders[userRankIndex];
                const displayName = userTrader.display_name || shortenAddress(userAddress);
                
                userRankHTML = `
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; padding: 16px 20px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
                        <div style="flex: 1; display: flex; align-items: center; gap: 16px;">
                            <div style="font-size: 24px; font-weight: 700; color: white; min-width: 50px;">#${userRank}</div>
                            <div style="flex: 1;">
                                <div style="font-size: 15px; font-weight: 600; color: white;">${displayName}</div>
                                <div style="font-size: 11px; color: rgba(255,255,255,0.7); margin-top: 2px;">Your Rank</div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        
        // Top 3 badge
        const top3Badge = `
            <div style="text-align: center; margin: 16px 0 20px;">
                <div style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 20px; padding: 8px 20px;">
                    <span style="color: white; font-size: 14px; font-weight: 600;">⭐ Top 3</span>
                </div>
            </div>
        `;
        
        // Build podium for top 3
        let podiumHTML = '<div style="display: flex; justify-content: center; align-items: flex-end; gap: 12px; margin: 20px 0 30px;">';
        
        // Helper to create simplified podium with medal and name
        const createPodiumCard = (trader, rank) => {
            const heights = ['', '140px', '120px', '100px'];
            const medals = ['', '🥇', '🥈', '🥉'];
            const boxBgs = ['', 
                'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)', 
                'linear-gradient(135deg, #E8E8E8 0%, #C0C0C0 100%)', 
                'linear-gradient(135deg, #CD7F32 0%, #A0522D 100%)'
            ];
            const shadows = ['',
                '0 8px 24px rgba(255, 215, 0, 0.5), 0 0 40px rgba(255, 215, 0, 0.3)',
                '0 8px 24px rgba(192, 192, 192, 0.4), 0 0 30px rgba(192, 192, 192, 0.2)',
                '0 8px 24px rgba(205, 127, 50, 0.4), 0 0 30px rgba(205, 127, 50, 0.2)'
            ];
            
            const address = formatTonAddress(trader.address);
            const displayName = trader.display_name || shortenAddress(address);
            
            return `
                <div style="flex: 1; max-width: 130px; display: flex; flex-direction: column; align-items: center;" onclick="copyAddress('${address}', this)">
                    <!-- Medal emoji -->
                    <div style="font-size: 48px; margin-bottom: 8px;">${medals[rank]}</div>
                    
                    <!-- Name Box -->
                    <div style="
                        background: ${boxBgs[rank]};
                        border-radius: 16px;
                        padding: 16px 12px;
                        width: 100%;
                        height: ${heights[rank]};
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        box-shadow: ${shadows[rank]};
                        border: 2px solid rgba(255,255,255,0.2);
                        transition: transform 0.3s ease;
                    " onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
                        <!-- Rank -->
                        <div style="font-size: 18px; font-weight: 800; color: white; margin-bottom: 8px; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                            #${rank}
                        </div>
                        
                        <!-- Name -->
                        <div style="font-size: 13px; color: rgba(255,255,255,0.95); text-align: center; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,0.2); word-break: break-word; line-height: 1.3;">
                            ${displayName}
                        </div>
                    </div>
                </div>
            `;
        };
        
        // Add podium (2nd, 1st, 3rd)
        if (traders[1]) podiumHTML += createPodiumCard(traders[1], 2);
        if (traders[0]) podiumHTML += createPodiumCard(traders[0], 1);
        if (traders[2]) podiumHTML += createPodiumCard(traders[2], 3);
        
        podiumHTML += '</div>';
        
        // "Other Participants" banner
        const otherParticipantsBanner = `
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; padding: 14px 20px; margin: 30px 0 20px; text-align: center;">
                <span style="color: white; font-size: 15px; font-weight: 600;">👥 Other Participants</span>
            </div>
        `;
        
        // Build simplified list for rest (4-50)
        let listHTML = '<div style="margin-top: 10px;">';
        
        // Table header
        listHTML += `
            <div style="display: flex; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 8px;">
                <div style="flex: 0 0 60px; font-size: 12px; color: rgba(255,255,255,0.5); font-weight: 600;">#</div>
                <div style="flex: 1; font-size: 12px; color: rgba(255,255,255,0.5); font-weight: 600;">Name</div>
            </div>
        `;
        
        for (let i = 3; i < traders.length; i++) {
            const trader = traders[i];
            const rank = i + 1;
            const address = formatTonAddress(trader.address);
            const displayName = trader.display_name || shortenAddress(address);
            
            listHTML += `
                <div onclick="copyAddress('${address}', this)" style="
                    display: flex;
                    align-items: center;
                    padding: 14px 16px;
                    background: rgba(255,255,255,0.03);
                    border-radius: 12px;
                    margin-bottom: 6px;
                    cursor: pointer;
                    transition: background 0.2s;
                " onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                    <div style="flex: 0 0 60px; font-size: 15px; color: rgba(255,255,255,0.6); font-weight: 600;">${rank}</div>
                    <div style="flex: 1; font-size: 14px; color: white; font-weight: 500;">${displayName}</div>
                </div>
            `;
        }
        
        listHTML += '</div>';
        
        // Combine all sections: user rank card + top 3 badge + podium + other participants banner + list
        leaderboardList.innerHTML = userRankHTML + top3Badge + podiumHTML + otherParticipantsBanner + listHTML;
        
        // Add update timestamp
        if (result.updated_at) {
            const updateTime = new Date(result.updated_at).toLocaleTimeString();
            leaderboardList.innerHTML += `
                <div style="text-align: center; margin-top: 20px; padding: 12px; color: rgba(255,255,255,0.4); font-size: 12px;">
                    Last updated: ${updateTime}
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        leaderboardList.innerHTML = '<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.5);">Failed to load leaderboard. Please try again later.</div>';
    }
}

// Global function to copy address
window.copyAddress = function(address, element) {
    navigator.clipboard.writeText(address).then(() => {
        const originalBg = element.style.background;
        element.style.background = 'rgba(34, 197, 94, 0.3)';
        
        // Show tooltip
        const tooltip = document.createElement('div');
        tooltip.textContent = '✓ Copied!';
        tooltip.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(34, 197, 94, 0.95); color: white; padding: 12px 24px; border-radius: 8px; font-weight: 600; z-index: 10000;';
        document.body.appendChild(tooltip);
        
        setTimeout(() => {
            element.style.background = originalBg;
            document.body.removeChild(tooltip);
        }, 1500);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

// Initialize profile data on page load
document.addEventListener('DOMContentLoaded', function() {
    loadProfileData();
});

// TON Connect UI with Telegram Mini App configuration
const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: window.location.origin + '/tonconnect-manifest.json',
    buttonRootId: 'tonconnect-button',
    actionsConfiguration: {
        twaReturnUrl: 'https://t.me/PEDROWalletTrackerBot'  // Return URL for Telegram Mini App
    }
});

// Pedro quotes
const pedroQuotes = [
    "Yo, nice bag! Keep stacking those $PEDRO! 💎🦝",
    "Look at you holding! The boss is proud! 🔥💎",
    "That's what I'm talking about, fam! 🚀🦝",
    "You're a real one! Keep those diamond hands strong! 💎",
    "Sheesh! You're loaded with $PEDRO! Let's gooo! 🎉🦝",
    "Respect! You know how to hold like a boss! 🔥💎",
    "Yo that's a solid bag right there! 😂🦝💎"
];

// Make tonConnectUI globally accessible
window.tonConnectUI = tonConnectUI;

// Shared function to handle wallet connection
async function handleWalletConnected(wallet) {
    // Get the address from wallet
    let rawAddress = wallet.account.address;
    let userFriendlyAddress = rawAddress;
    
    // Convert raw address format (0:abc...) to user-friendly NON-BOUNCEABLE format
    try {
        // Create Address object from raw or user-friendly format
        let address;
        if (rawAddress.includes(':')) {
            // Raw format: split workchain and hash
            const [workchain, hash] = rawAddress.split(':');
            address = new window.TonWeb.utils.Address(workchain + ':' + hash);
        } else {
            // Already user-friendly, parse it
            address = new window.TonWeb.utils.Address(rawAddress);
        }
        // Convert to user-friendly NON-BOUNCEABLE format (true, true, false)
        userFriendlyAddress = address.toString(true, true, false);
        console.log('Address converted to non-bounceable:', rawAddress, '->', userFriendlyAddress);
    } catch (e) {
        console.error('Address conversion error:', e);
        console.log('Raw address:', rawAddress);
        // Fallback: use the raw address if conversion fails
        userFriendlyAddress = rawAddress;
    }
    
    // Store wallet address for copying (full user-friendly NON-BOUNCEABLE address)
    window.currentWalletAddress = userFriendlyAddress;
    
    // Call backend to register wallet connection with exclusivity check
    const user = tg.initDataUnsafe?.user;
    if (user) {
        try {
            const connectResponse = await fetch('/api/wallet/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet_address: userFriendlyAddress,
                    telegram_id: user.id,
                    display_name: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Pedro Fan',
                    username: user.username || ''
                })
            });
            
            const connectData = await connectResponse.json();
            
            if (!connectData.success) {
                // Wallet already connected to another user
                if (connectData.error === 'WALLET_ALREADY_CONNECTED') {
                    alert(`⚠️ ${connectData.message}\n\nThis wallet is already connected to another Telegram account.`);
                    // Disconnect the wallet
                    await tonConnectUI.disconnect();
                    return;
                }
            }
            
            console.log('Wallet connected and registered:', userFriendlyAddress);
        } catch (e) {
            console.error('Error registering wallet connection:', e);
        }
    }
    
    // Show wallet header with address display
    const walletHeader = document.getElementById('wallet-header');
    const addressDisplay = document.getElementById('wallet-address-display');
    walletHeader.classList.remove('hidden');
    
    // Format address for display (show first 4 and last 4 characters)
    const shortAddress = userFriendlyAddress.slice(0, 4) + '...' + userFriendlyAddress.slice(-4);
    addressDisplay.textContent = shortAddress;
    
    // Show appropriate view based on active tab
    const portfolioTab = document.getElementById('portfolio-tab');
    const exploreTab = document.getElementById('explore-tab');
    
    if (portfolioTab.classList.contains('active')) {
        document.getElementById('portfolio-content').classList.add('hidden');
        document.getElementById('wallet-connected-view').classList.remove('hidden');
        // Show sticky buy button when wallet connected on portfolio tab
        document.getElementById('sticky-buy-btn').classList.remove('hidden');
        await fetchTokenBalance(wallet.account.address);
    } else if (exploreTab.classList.contains('active')) {
        document.getElementById('explore-content').classList.add('hidden');
        document.getElementById('explore-connected-view').classList.remove('hidden');
        await fetchTradingData(userFriendlyAddress);
    }
}

// Shared function to handle wallet disconnection
async function handleWalletDisconnected() {
    const previousAddress = window.currentWalletAddress;
    window.currentWalletAddress = null;
    
    // Call backend to unregister wallet connection
    const user = tg.initDataUnsafe?.user;
    if (previousAddress && user) {
        try {
            await fetch('/api/wallet/disconnect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet_address: previousAddress,
                    telegram_id: user.id
                })
            });
            console.log('Wallet disconnected and unregistered:', previousAddress);
        } catch (e) {
            console.error('Error unregistering wallet:', e);
        }
    }
    
    // Hide wallet header
    document.getElementById('wallet-header').classList.add('hidden');
    
    // Hide sticky buy button
    document.getElementById('sticky-buy-btn').classList.add('hidden');
    
    // Show connect view based on active tab
    const portfolioTab = document.getElementById('portfolio-tab');
    const exploreTab = document.getElementById('explore-tab');
    
    if (portfolioTab.classList.contains('active')) {
        document.getElementById('portfolio-content').classList.remove('hidden');
        document.getElementById('wallet-connected-view').classList.add('hidden');
    } else if (exploreTab.classList.contains('active')) {
        document.getElementById('explore-content').classList.remove('hidden');
        document.getElementById('explore-connected-view').classList.add('hidden');
    }
}

// Listen for wallet connection status changes
tonConnectUI.onStatusChange(async (wallet) => {
    if (wallet) {
        await handleWalletConnected(wallet);
    } else {
        await handleWalletDisconnected();
    }
});

// Check for existing wallet connection on page load
tonConnectUI.connectionRestored.then(async (restored) => {
    console.log('Connection restoration complete:', restored);
    console.log('Current wallet state:', tonConnectUI.wallet ? 'Connected' : 'Not connected');
    
    if (restored && tonConnectUI.wallet) {
        console.log('Wallet already connected, restoring UI state');
        await handleWalletConnected(tonConnectUI.wallet);
    } else if (tonConnectUI.wallet) {
        // Wallet is connected but restoration flag is false (shouldn't happen but handle it)
        console.log('Wallet found without restoration flag, still restoring state');
        await handleWalletConnected(tonConnectUI.wallet);
    } else {
        console.log('No wallet to restore');
    }
}).catch(err => {
    console.error('Error during connection restoration:', err);
});

// Fetch token balance from TON blockchain
async function fetchTokenBalance(walletAddress) {
    try {
        // Show loading
        document.getElementById('token-balance').innerHTML = '<span class="loading"></span>';
        
        // Fetch price data from DexScreener and holder count in parallel
        const [priceData, holderCount] = await Promise.all([
            fetchPriceData(),
            fetchHolderCount()
        ]);
        
        // Fetch balance from TON API
        const balance = await fetchBalanceFromTON(walletAddress);
        
        // Update UI
        updateBalanceDisplay(balance, priceData, holderCount);
        
        // Random Pedro quote
        const randomQuote = pedroQuotes[Math.floor(Math.random() * pedroQuotes.length)];
        document.getElementById('pedro-quote').textContent = randomQuote;
        
    } catch (error) {
        console.error('Error fetching balance:', error);
        document.getElementById('token-balance').textContent = 'Error loading';
    }
}

// Fetch balance from TON blockchain API
async function fetchBalanceFromTON(walletAddress) {
    try {
        // Using TON Center API to get jetton balance
        const response = await fetch(`https://toncenter.com/api/v3/jetton/wallets?owner_address=${walletAddress}&jetton_address=${PEDRO_CONTRACT}&limit=1`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch balance');
        }
        
        const data = await response.json();
        
        if (data.jetton_wallets && data.jetton_wallets.length > 0) {
            const balance = data.jetton_wallets[0].balance;
            // PEDRO has 9 decimals
            return parseFloat(balance) / 1000000000;
        }
        
        return 0;
    } catch (error) {
        console.error('TON API error:', error);
        // Fallback: return 0 if API fails
        return 0;
    }
}

// Fetch price data from DexScreener
async function fetchPriceData() {
    try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${PEDRO_CONTRACT}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch price data');
        }
        
        const data = await response.json();
        
        if (data.pairs && data.pairs.length > 0) {
            const pair = data.pairs[0];
            return {
                price: parseFloat(pair.priceUsd || 0),
                marketCap: parseFloat(pair.fdv || 0),
                volume24h: parseFloat(pair.volume?.h24 || 0)
            };
        }
        
        return { price: 0, marketCap: 0, volume24h: 0 };
    } catch (error) {
        console.error('DexScreener API error:', error);
        return { price: 0, marketCap: 0, volume24h: 0 };
    }
}

// Fetch holder count from TonAPI
async function fetchHolderCount() {
    try {
        const response = await fetch(`https://tonapi.io/v2/jettons/${PEDRO_CONTRACT}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch holder data');
        }
        
        const data = await response.json();
        
        if (data.holders_count !== undefined) {
            return parseInt(data.holders_count);
        }
        
        return 0;
    } catch (error) {
        console.error('TonAPI error:', error);
        return 0;
    }
}

// Fetch user's trading data from TonAPI  
async function fetchTradingData(walletAddress) {
    try {
        // Show loading state
        document.getElementById('total-volume').textContent = 'Loading...';
        document.getElementById('buy-count').textContent = '...';
        document.getElementById('sell-count').textContent = '...';
        
        console.log('Fetching trading data for wallet:', walletAddress);
        
        // Convert to raw address format for comparison (TonAPI returns addresses in raw format)
        let normalizedWalletAddress = walletAddress;
        try {
            const addr = new window.TonWeb.utils.Address(walletAddress);
            // Get raw format: workchain:hash
            normalizedWalletAddress = addr.toString(false, false, false, false);
            console.log('Normalized wallet address:', normalizedWalletAddress);
        } catch (e) {
            console.error('Address normalization error:', e);
        }
        
        // Fetch jetton transfers for this wallet specifically for PEDRO
        const response = await fetch(`https://tonapi.io/v2/accounts/${walletAddress}/jettons/${PEDRO_CONTRACT}/history?limit=100&sort_order=desc`);
        
        if (!response.ok) {
            console.error('API response not OK:', response.status);
            throw new Error('Failed to fetch trading data');
        }
        
        const data = await response.json();
        console.log('TonAPI jetton history response:', data);
        console.log('Number of events:', data.events?.length || 0);
        
        // Track buys and sells
        let buyCount = 0;
        let sellCount = 0;
        let buyVolume = 0;
        let sellVolume = 0;
        
        // Get current price for volume calculation
        const priceData = await fetchPriceData();
        const pedroPrice = priceData.price;
        console.log('PEDRO price:', pedroPrice);
        
        if (data.events && data.events.length > 0) {
            for (const event of data.events) {
                if (event.actions) {
                    for (const action of event.actions) {
                        console.log('Action type:', action.type);
                        
                        if (action.type === 'JettonTransfer' && action.JettonTransfer) {
                            const transfer = action.JettonTransfer;
                            console.log('JettonTransfer found:', transfer);
                            
                            const amount = parseInt(transfer.amount || 0) / 1e9;
                            
                            // Get sender and recipient addresses in raw format
                            const senderRaw = transfer.sender?.address;
                            const recipientRaw = transfer.recipient?.address;
                            
                            console.log('Sender:', senderRaw);
                            console.log('Recipient:', recipientRaw);
                            console.log('Our wallet:', normalizedWalletAddress);
                            console.log('Amount:', amount, 'PEDRO');
                            
                            // If our wallet is the recipient, it's a BUY
                            // If our wallet is the sender, it's a SELL
                            if (senderRaw === normalizedWalletAddress) {
                                sellCount++;
                                sellVolume += amount * pedroPrice;
                                console.log('✅ SELL detected! Amount:', amount, 'PEDRO, Value: $', amount * pedroPrice);
                            } else if (recipientRaw === normalizedWalletAddress) {
                                buyCount++;
                                buyVolume += amount * pedroPrice;
                                console.log('✅ BUY detected! Amount:', amount, 'PEDRO, Value: $', amount * pedroPrice);
                            }
                        }
                    }
                }
            }
        } else {
            console.log('No trading history found for this wallet');
        }
        
        const totalVolume = buyVolume + sellVolume;
        console.log('=== Final stats ===');
        console.log('Buys:', buyCount, 'Volume: $', buyVolume);
        console.log('Sells:', sellCount, 'Volume: $', sellVolume);
        console.log('Total Volume: $', totalVolume);
        
        // Update UI
        updateTradingDisplay(totalVolume, buyCount, sellCount, buyVolume, sellVolume);
        
        // Calculate and display ranking
        await calculateRanking(totalVolume);
        
    } catch (error) {
        console.error('Error fetching trading data:', error);
        document.getElementById('total-volume').textContent = '$0';
        document.getElementById('buy-count').textContent = '0';
        document.getElementById('sell-count').textContent = '0';
        document.getElementById('buy-volume').textContent = '$0 USD';
        document.getElementById('sell-volume').textContent = '$0 USD';
    }
}

// Update trading display
function updateTradingDisplay(totalVolume, buyCount, sellCount, buyVolume, sellVolume) {
    // Format total volume
    const formattedTotal = totalVolume >= 1000000
        ? `$${(totalVolume / 1000000).toFixed(2)}M`
        : totalVolume >= 1000
        ? `$${(totalVolume / 1000).toFixed(1)}K`
        : `$${totalVolume.toFixed(2)}`;
    
    document.getElementById('total-volume').textContent = formattedTotal;
    
    // Update buy stats
    document.getElementById('buy-count').textContent = buyCount.toString();
    const formattedBuyVolume = buyVolume >= 1000
        ? `$${(buyVolume / 1000).toFixed(1)}K USD`
        : `$${buyVolume.toFixed(2)} USD`;
    document.getElementById('buy-volume').textContent = formattedBuyVolume;
    
    // Update sell stats
    document.getElementById('sell-count').textContent = sellCount.toString();
    const formattedSellVolume = sellVolume >= 1000
        ? `$${(sellVolume / 1000).toFixed(1)}K USD`
        : `$${sellVolume.toFixed(2)} USD`;
    document.getElementById('sell-volume').textContent = formattedSellVolume;
}

// Calculate user's ranking among traders
async function calculateRanking(userVolume) {
    try {
        // For now, use a simple percentile calculation based on volume
        // In production, you'd fetch all traders' volumes and calculate actual percentile
        
        // Estimate ranking based on volume tiers
        let ranking = 'Top 50%';
        
        if (userVolume === 0) {
            ranking = 'No Trades Yet';
        } else if (userVolume >= 10000) {
            ranking = 'Top 1% 🏆';
        } else if (userVolume >= 5000) {
            ranking = 'Top 5% 🥇';
        } else if (userVolume >= 2000) {
            ranking = 'Top 10% 🥈';
        } else if (userVolume >= 1000) {
            ranking = 'Top 20% 🥉';
        } else if (userVolume >= 500) {
            ranking = 'Top 30%';
        } else if (userVolume >= 100) {
            ranking = 'Top 40%';
        }
        
        document.getElementById('trader-ranking').textContent = ranking;
        
    } catch (error) {
        console.error('Error calculating ranking:', error);
        document.getElementById('trader-ranking').textContent = 'Top 50%';
    }
}

// Make fetchTradingData globally accessible
window.fetchTradingData = fetchTradingData;

// Update balance display
function updateBalanceDisplay(balance, priceData, holderCount) {
    // Format balance
    const formattedBalance = balance.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
    
    document.getElementById('token-balance').textContent = formattedBalance;
    
    // Calculate USD value
    const usdValue = balance * priceData.price;
    const formattedUSD = usdValue.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    document.getElementById('usd-value').textContent = `~ ${formattedUSD}`;
    
    // Update price
    const formattedPrice = priceData.price < 0.000001 
        ? priceData.price.toExponential(2)
        : priceData.price.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 6,
            maximumFractionDigits: 8
        });
    
    document.getElementById('token-price').textContent = formattedPrice;
    
    // Update market cap
    const formattedMC = priceData.marketCap >= 1000000
        ? `$${(priceData.marketCap / 1000000).toFixed(2)}M`
        : `$${(priceData.marketCap / 1000).toFixed(0)}K`;
    
    document.getElementById('market-cap').textContent = formattedMC;
    
    // Update holder count
    const formattedHolders = holderCount >= 1000
        ? `${(holderCount / 1000).toFixed(1)}K`
        : holderCount.toLocaleString('en-US');
    
    document.getElementById('holder-count').textContent = formattedHolders;
    
    // Update 24h volume
    const formattedVolume = priceData.volume24h >= 1000000
        ? `$${(priceData.volume24h / 1000000).toFixed(2)}M`
        : priceData.volume24h >= 1000
        ? `$${(priceData.volume24h / 1000).toFixed(1)}K`
        : `$${priceData.volume24h.toFixed(0)}`;
    
    document.getElementById('volume-24h').textContent = formattedVolume;
    
    // Check if eligible for Gold Club (1M+ PEDRO)
    const goldClubSection = document.getElementById('gold-club-section');
    if (balance >= 1000000) {
        goldClubSection.classList.remove('hidden');
        
        // Add click handler for Gold Club button (only once)
        const joinGoldClubBtn = document.getElementById('join-gold-club-btn');
        if (joinGoldClubBtn && !joinGoldClubBtn.hasAttribute('data-listener-added')) {
            joinGoldClubBtn.setAttribute('data-listener-added', 'true');
            joinGoldClubBtn.addEventListener('click', function() {
                // Open Pedro Gold Club private group
                const goldClubUrl = 'https://t.me/+OLIVyxlWuCY2Yjky';
                window.open(goldClubUrl, '_blank');
            });
        }
    } else {
        goldClubSection.classList.add('hidden');
    }
}

// Format number with K/M/B suffix
function formatNumber(num) {
    if (num >= 1000000000) {
        return (num / 1000000000).toFixed(2) + 'B';
    }
    if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(2) + 'K';
    }
    return num.toFixed(2);
}

// Copy contract address handler
document.getElementById('copy-contract-btn').addEventListener('click', function() {
    const contractAddress = 'EQBGtsm26tdn6bRjZrmLZkZMqk-K8wd4R66k52ntPU4UzcV0';
    
    // Copy to clipboard
    navigator.clipboard.writeText(contractAddress).then(() => {
        // Show feedback
        const btn = document.getElementById('copy-contract-btn');
        btn.textContent = '✓';
        
        // Reset after 1.5 seconds
        setTimeout(() => {
            btn.textContent = '⎘';
        }, 1500);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
});

// Sticky Buy Pedro button handler
document.getElementById('sticky-buy-btn').addEventListener('click', function() {
    // Open DeDust swap for PEDRO token
    const buyUrl = 'https://dedust.io/swap/TON/EQBGtsm26tdn6bRjZrmLZkZMqk-K8wd4R66k52ntPU4UzcV0';
    window.open(buyUrl, '_blank');
});

console.log('Pedro Wallet Tracker initialized! 🦝💎');
