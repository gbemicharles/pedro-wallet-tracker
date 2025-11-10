from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
import os
import json
import requests
import time
import threading
import traceback
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

app = Flask(__name__)
CORS(app)

# Disable caching for all static files (development)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

# Cached leaderboard data
leaderboard_cache = {
    'data': [],
    'updated_at': None,
    'error': None
}

# Incremental tracking state (persists across updates)
trader_state = {}  # {address: {'purchases': 0, 'sales': 0, 'last_tx': timestamp}}
last_processed_lt = None  # Track last processed logical time to avoid re-processing
balance_cache = {}  # {address: {'balance': float, 'cached_at': timestamp}}
BALANCE_CACHE_TTL = 180  # 3 minutes cache TTL

# Wallet-to-user bindings (persistent storage)
BINDINGS_FILE = 'wallet_bindings.json'
wallet_bindings = {}  # {wallet_address: {'telegram_id': int, 'display_name': str, 'username': str, 'connected_at': timestamp}}

def load_wallet_bindings():
    """Load wallet bindings from JSON file"""
    global wallet_bindings
    try:
        if os.path.exists(BINDINGS_FILE):
            with open(BINDINGS_FILE, 'r') as f:
                wallet_bindings = json.load(f)
            print(f"Loaded {len(wallet_bindings)} wallet bindings from {BINDINGS_FILE}")
        else:
            wallet_bindings = {}
            print(f"No existing bindings file found, starting fresh")
    except Exception as e:
        print(f"Error loading wallet bindings: {e}")
        wallet_bindings = {}

def save_wallet_bindings():
    """Save wallet bindings to JSON file"""
    try:
        with open(BINDINGS_FILE, 'w') as f:
            json.dump(wallet_bindings, f, indent=2)
        print(f"Saved {len(wallet_bindings)} wallet bindings to {BINDINGS_FILE}")
    except Exception as e:
        print(f"Error saving wallet bindings: {e}")

# Load existing bindings on startup
load_wallet_bindings()

# Address normalization helper
def normalize_address(address):
    """
    Normalize TON address to raw format (0:hex) for consistent comparison.
    Accepts both user-friendly (UQ/EQ) and raw (0:) formats.
    
    TON address format (user-friendly):
    - 1 byte: flags (testnet, bounceable)
    - 1 byte: workchain ID
    - 32 bytes: account ID (hash)
    - 2 bytes: CRC16 checksum
    Total: 36 bytes when decoded
    """
    if not address:
        return address
    
    # Already in raw format
    if ':' in address and address.split(':')[0].lstrip('-').isdigit():
        # Raw format like "0:abc..." or "-1:abc..."
        parts = address.split(':', 1)
        workchain = parts[0]
        hash_hex = parts[1].lower()
        return f"{workchain}:{hash_hex}"
    
    # User-friendly format - convert to raw
    try:
        import base64
        # Remove URL-safe characters (base64url to base64)
        clean_addr = address.replace('-', '+').replace('_', '/')
        
        # Decode base64
        decoded = base64.b64decode(clean_addr)
        
        # Validate length (should be 36 bytes)
        if len(decoded) != 36:
            print(f"Warning: Invalid address length {len(decoded)} bytes for {address}")
            return address.lower()
        
        # Extract components
        # Byte 0: flags (bounce, testnet)
        # Byte 1: workchain ID (signed byte)
        # Bytes 2-33: account ID (32 bytes hash)
        # Bytes 34-35: CRC16 checksum (not validated here)
        
        workchain = int.from_bytes(decoded[1:2], 'big', signed=True)
        hash_bytes = decoded[2:34]
        hash_hex = hash_bytes.hex()
        
        # Format as raw address
        raw_address = f"{workchain}:{hash_hex}"
        return raw_address
        
    except Exception as e:
        print(f"Error normalizing address {address}: {e}")
        traceback.print_exc()
        return address.lower()

# Configuration
PEDRO_CONTRACT = 'EQBGtsm26tdn6bRjZrmLZkZMqk-K8wd4R66k52ntPU4UzcV0'
PEDRO_CONTRACT_RAW = '0:46b6c9b6ead767e9b46366b98b66464caa4f8af3077847aea4e769ed3d4e14cd'  # Raw format
PEDRO_DEX_POOL = 'EQCcpx76m_J9douvLirGqvmwiHLDYQ-JdJULNc9mUw2Ppk3p'  # PEDRO/TON pool on DEX
CACHE_REFRESH_INTERVAL = 60  # 1 minute for near real-time updates
MIN_BALANCE_THRESHOLD = 10000  # Minimum 10,000 PEDRO to appear on leaderboard
MAX_CONCURRENT_API_CALLS = 2  # Optimized for fewer rate limits
DELAY_BETWEEN_REQUESTS = 0.7  # Balanced delay to minimize 429 errors
TONAPI_BASE = 'https://tonapi.io/v2'

# Tracking start timestamp - only count transactions AFTER this time
# Set to NOW (when server starts) - tracks forward-going transactions only
import time as time_module
TRACKING_START_TIME = int(time_module.time())  # Current timestamp - will be set once on first import

# Serve TON Connect manifest dynamically
@app.route('/tonconnect-manifest.json')
def tonconnect_manifest():
    # Get the base URL from the request
    base_url = request.url_root.rstrip('/')
    
    manifest = {
        "url": base_url,
        "name": "Pedro Wallet Tracker",
        "iconUrl": "https://em-content.zobj.net/source/apple/391/raccoon_1f99d.png",
        "termsOfUseUrl": base_url,
        "privacyPolicyUrl": base_url
    }
    
    return jsonify(manifest)

# Serve game files
@app.route('/')
def index():
    from flask import make_response
    response = make_response(send_from_directory('game', 'index.html'))
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    response.cache_control.no_cache = True
    response.cache_control.no_store = True
    response.cache_control.must_revalidate = True
    # Remove ETag to prevent 304 responses
    if 'ETag' in response.headers:
        del response.headers['ETag']
    return response

@app.route('/<path:path>')
def serve_file(path):
    from flask import make_response
    response = make_response(send_from_directory('game', path))
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    response.cache_control.no_cache = True
    response.cache_control.no_store = True
    response.cache_control.must_revalidate = True
    # Remove ETag to prevent 304 responses
    if 'ETag' in response.headers:
        del response.headers['ETag']
    return response

# Leaderboard API endpoint
@app.route('/api/leaderboard')
def get_leaderboard():
    """Serve cached leaderboard data"""
    # Check if leaderboard has been updated (updated_at is set)
    # Data can be empty list if no one has bought yet
    if leaderboard_cache['updated_at']:
        # Calculate active traders
        active_count = len(leaderboard_cache['data'])
        
        return jsonify({
            'success': True,
            'loading': False,
            'data': leaderboard_cache['data'],  # Can be empty list
            'updated_at': leaderboard_cache['updated_at'],
            'count': len(leaderboard_cache['data']),
            'active_traders': active_count,
            'tracking_start_time': TRACKING_START_TIME,
            'error': leaderboard_cache.get('error')  # Include error if present
        }), 200
    
    # No data available yet - still loading (return 200 with loading flag)
    return jsonify({
        'success': True,
        'loading': True,
        'data': [],
        'error': leaderboard_cache.get('error', 'Fetching trading data from blockchain...'),
        'updated_at': leaderboard_cache['updated_at'],
        'message': 'Leaderboard is being initialized. This takes about 1-2 minutes on first load.',
        'tracking_start_time': TRACKING_START_TIME
    }), 200  # Return 200 so frontend doesn't throw

# Wallet connection endpoint with exclusivity check
@app.route('/api/wallet/connect', methods=['POST'])
def connect_wallet():
    """Connect a wallet to a Telegram user with exclusivity validation"""
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        telegram_id = data.get('telegram_id')
        display_name = data.get('display_name', '')
        username = data.get('username', '')
        
        if not wallet_address or not telegram_id:
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        # Normalize address to raw format for consistent storage
        normalized_address = normalize_address(wallet_address)
        
        # Check if wallet is already connected to a different user
        if normalized_address in wallet_bindings:
            existing_telegram_id = wallet_bindings[normalized_address].get('telegram_id')
            if existing_telegram_id != telegram_id:
                existing_name = wallet_bindings[normalized_address].get('display_name', 'another user')
                return jsonify({
                    'success': False,
                    'error': 'WALLET_ALREADY_CONNECTED',
                    'message': f'This wallet is already connected to {existing_name}. Please disconnect it first.'
                }), 409
        
        # Save binding (using normalized address as key)
        wallet_bindings[normalized_address] = {
            'telegram_id': telegram_id,
            'display_name': display_name,
            'username': username,
            'connected_at': int(time_module.time())
        }
        save_wallet_bindings()
        
        print(f"Connected wallet {normalized_address[:12]}... to user {display_name} (ID: {telegram_id})")
        
        return jsonify({
            'success': True,
            'message': 'Wallet connected successfully'
        }), 200
        
    except Exception as e:
        print(f"Error connecting wallet: {e}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

# Wallet disconnection endpoint
@app.route('/api/wallet/disconnect', methods=['POST'])
def disconnect_wallet():
    """Disconnect a wallet from a Telegram user"""
    try:
        data = request.json
        wallet_address = data.get('wallet_address')
        telegram_id = data.get('telegram_id')
        
        if not wallet_address or not telegram_id:
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        # Normalize address to raw format for consistent lookup
        normalized_address = normalize_address(wallet_address)
        
        # Check if wallet is connected to this user
        if normalized_address in wallet_bindings:
            existing_telegram_id = wallet_bindings[normalized_address].get('telegram_id')
            if existing_telegram_id != telegram_id:
                return jsonify({
                    'success': False,
                    'error': 'UNAUTHORIZED',
                    'message': 'You cannot disconnect a wallet connected to another user'
                }), 403
            
            # Remove binding
            del wallet_bindings[normalized_address]
            save_wallet_bindings()
            
            print(f"Disconnected wallet {normalized_address[:12]}... from user ID: {telegram_id}")
            
            return jsonify({
                'success': True,
                'message': 'Wallet disconnected successfully'
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Wallet not connected'
            }), 404
            
    except Exception as e:
        print(f"Error disconnecting wallet: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

def fetch_holder_trading_since_deployment(address, pedro_price, retry_count=0):
    """Fetch trading activity for a holder ONLY since deployment timestamp"""
    max_retries = 3
    try:
        # Fetch ALL jetton transfers for this address
        url = f"{TONAPI_BASE}/accounts/{address}/events"
        params = {
            'limit': 100,
            'subject_only': 'false',
            'start_date': TRACKING_START_TIME  # Only get events after tracking started
        }
        
        response = requests.get(url, params=params, timeout=10)
        
        # Handle rate limiting with exponential backoff
        if response.status_code == 429 and retry_count < max_retries:
            wait_time = (2 ** retry_count) * 1.0
            print(f"Rate limited for {address[:8]}..., waiting {wait_time}s...")
            time.sleep(wait_time)
            return fetch_holder_trading_since_deployment(address, pedro_price, retry_count + 1)
        
        if not response.ok:
            print(f"Failed to fetch events for {address[:8]}...: {response.status_code}")
            return None
        
        data = response.json()
        events = data.get('events', [])
        
        # Calculate purchases and sales since deployment
        total_purchases = 0
        total_sales = 0
        
        for event in events:
            # Only process events after deployment timestamp
            event_time = event.get('timestamp', 0)
            if event_time < TRACKING_START_TIME:
                continue
            
            actions = event.get('actions', [])
            for action in actions:
                action_type = action.get('type', '')
                
                # Look for JettonTransfer actions
                if action_type == 'JettonTransfer':
                    transfer = action.get('JettonTransfer', {})
                    jetton = transfer.get('jetton', {})
                    jetton_address = jetton.get('address', '')
                    
                    # Only count PEDRO token transfers
                    if jetton_address != PEDRO_CONTRACT:
                        continue
                    
                    amount = int(transfer.get('amount', 0)) / 1e9
                    sender_addr = transfer.get('sender', {}).get('address', '')
                    recipient_addr = transfer.get('recipient', {}).get('address', '')
                    
                    # Normalize addresses for comparison (both raw and friendly formats)
                    if recipient_addr == address or (isinstance(recipient_addr, dict) and recipient_addr.get('address') == address):
                        # Incoming = Purchase
                        total_purchases += amount
                    elif sender_addr == address or (isinstance(sender_addr, dict) and sender_addr.get('address') == address):
                        # Outgoing = Sale
                        total_sales += amount
        
        net_volume = total_purchases - total_sales
        
        # Find the most recent transaction timestamp
        last_transaction_time = None
        if events:
            # Events are sorted by time (most recent first)
            for event in events:
                event_time = event.get('timestamp', 0)
                if event_time >= TRACKING_START_TIME:
                    actions = event.get('actions', [])
                    for action in actions:
                        if action.get('type') == 'JettonTransfer':
                            transfer = action.get('JettonTransfer', {})
                            jetton = transfer.get('jetton', {})
                            if jetton.get('address', '') == PEDRO_CONTRACT:
                                last_transaction_time = event_time
                                break
                    if last_transaction_time:
                        break
        
        return {
            'address': address,
            'purchases': total_purchases,
            'sales': total_sales,
            'net_volume': net_volume,
            'net_volume_usd': net_volume * pedro_price,
            'last_transaction': last_transaction_time
        }
        
    except Exception as e:
        print(f"Error fetching trading data for {address[:8]}...: {str(e)}")
        return None

def fetch_pedro_balance(address, retry_count=0):
    """Fetch current PEDRO balance for a wallet address"""
    max_retries = 3
    try:
        time.sleep(DELAY_BETWEEN_REQUESTS)
        
        url = f"{TONAPI_BASE}/accounts/{address}/jettons"
        response = requests.get(url, timeout=10)
        
        if response.status_code == 429:
            if retry_count < max_retries:
                print(f"Rate limited when fetching balance for {address[:8]}..., retrying...")
                time.sleep(2)
                return fetch_pedro_balance(address, retry_count + 1)
            return 0
        
        if not response.ok:
            return 0
        
        data = response.json()
        balances = data.get('balances', [])
        
        # Find PEDRO token in balances
        for balance_item in balances:
            jetton = balance_item.get('jetton', {})
            jetton_addr = jetton.get('address', '')
            
            # Check both user-friendly and raw formats
            if jetton_addr in [PEDRO_CONTRACT, PEDRO_CONTRACT_RAW]:
                balance_str = balance_item.get('balance', '0')
                balance = int(balance_str) / 1e9 if balance_str else 0
                return balance
        
        return 0
        
    except Exception as e:
        print(f"Error fetching balance for {address[:8]}...: {str(e)}")
        if retry_count < max_retries:
            time.sleep(1)
            return fetch_pedro_balance(address, retry_count + 1)
        return 0

def update_leaderboard_cache():
    """Incremental forward-tracking leaderboard: top 50 by total volume (≥10,000 PEDRO holders)"""
    global trader_state, last_processed_lt, balance_cache
    
    print(f"[{datetime.now()}] Leaderboard update (tracking since {datetime.fromtimestamp(TRACKING_START_TIME)})...")
    
    try:
        # Step 1: Fetch current PEDRO price
        price_response = requests.get(
            'https://api.dexscreener.com/latest/dex/tokens/EQBGtsm26tdn6bRjZrmLZkZMqk-K8wd4R66k52ntPU4UzcV0',
            timeout=10
        )
        pedro_price = 0
        if price_response.ok:
            price_data = price_response.json()
            pedro_price = float(price_data.get('pairs', [{}])[0].get('priceUsd', 0))
        print(f"PEDRO price: ${pedro_price}")
        
        # Step 2: Fetch NEW PEDRO swaps incrementally with pagination
        new_swaps = 0
        limit = 100
        before_lt = None
        stop_pagination = False
        newest_lt = last_processed_lt  # Track the newest lt we see
        
        # Paginate through all new events
        while not stop_pagination:
            time.sleep(DELAY_BETWEEN_REQUESTS)
            
            params = {'limit': limit}
            if before_lt:
                params['before_lt'] = before_lt
            
            response = requests.get(
                f"{TONAPI_BASE}/accounts/{PEDRO_DEX_POOL}/events",
                params=params,
                timeout=15
            )
            
            if response.status_code == 429:
                print(f"Rate limited, waiting 2s...")
                time.sleep(2)
                continue
            
            if not response.ok:
                print(f"Failed to fetch events: {response.status_code}")
                break
            
            data = response.json()
            events = data.get('events', [])
            
            if not events:
                break
            
            # Track the newest lt from first page
            if before_lt is None and events:
                newest_lt = events[0].get('lt', newest_lt)
            
            # Process events in reverse chronological order (newest first)
            for event in events:
                event_time = event.get('timestamp', 0)
                event_lt = event.get('lt', 0)
                
                # Stop if we reach events before tracking started
                if event_time < TRACKING_START_TIME:
                    stop_pagination = True
                    break
                
                # Stop if we reach already processed events
                if last_processed_lt and event_lt <= last_processed_lt:
                    stop_pagination = True
                    break
                
                # Process PEDRO swaps in this event
                for action in event.get('actions', []):
                    if action.get('type') == 'JettonSwap':
                        swap = action.get('JettonSwap', {})
                        
                        # Extract trader address
                        user_wallet = swap.get('user_wallet', {})
                        trader_addr = user_wallet.get('address', '') if isinstance(user_wallet, dict) else user_wallet
                        
                        # Skip system addresses
                        if not trader_addr or trader_addr in ['EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c', PEDRO_DEX_POOL]:
                            continue
                        
                        # Check if PEDRO is involved
                        jetton_in = swap.get('jetton_master_in')
                        jetton_out = swap.get('jetton_master_out')
                        
                        jetton_in_addr = jetton_in.get('address', '') if isinstance(jetton_in, dict) else jetton_in
                        jetton_out_addr = jetton_out.get('address', '') if isinstance(jetton_out, dict) else jetton_out
                        
                        pedro_in = jetton_in_addr in [PEDRO_CONTRACT, PEDRO_CONTRACT_RAW]
                        pedro_out = jetton_out_addr in [PEDRO_CONTRACT, PEDRO_CONTRACT_RAW]
                        
                        if not pedro_in and not pedro_out:
                            continue
                        
                        # Initialize trader if new
                        if trader_addr not in trader_state:
                            trader_state[trader_addr] = {'purchases': 0, 'sales': 0, 'last_tx': 0}
                        
                        # Parse amounts
                        amount_in = int(swap.get('amount_in', '0') or '0') / 1e9
                        amount_out = int(swap.get('amount_out', '0') or '0') / 1e9
                        
                        # Update cumulative volumes
                        if pedro_out and amount_out > 0:
                            trader_state[trader_addr]['purchases'] += amount_out
                            new_swaps += 1
                        if pedro_in and amount_in > 0:
                            trader_state[trader_addr]['sales'] += amount_in
                            new_swaps += 1
                        
                        # Update last transaction time
                        if event_time > trader_state[trader_addr]['last_tx']:
                            trader_state[trader_addr]['last_tx'] = event_time
            
            # Set before_lt for next page
            if not stop_pagination and events:
                before_lt = events[-1].get('lt', 0)
                # Also stop if we got less than limit (last page)
                if len(events) < limit:
                    stop_pagination = True
            else:
                stop_pagination = True
        
        # Update last processed lt to the newest event we saw
        if newest_lt:
            last_processed_lt = newest_lt
        
        print(f"Processed {new_swaps} new swaps, tracking {len(trader_state)} total wallets")
        
        # Step 3: Calculate net volume for all tracked wallets
        trader_rankings = []
        current_time = int(time_module.time())
        
        for address, data in trader_state.items():
            net_volume = data['purchases'] - data['sales']
            if net_volume > 0:  # Only include wallets with positive net volume
                trader_rankings.append({
                    'address': address,
                    'net_volume': net_volume,
                    'purchases': data['purchases'],
                    'sales': data['sales'],
                    'last_tx': data['last_tx']
                })
        
        # Sort by net volume descending
        trader_rankings.sort(key=lambda x: x['net_volume'], reverse=True)
        print(f"Ranked {len(trader_rankings)} wallets by net volume")
        
        # Step 4: Check balances for top 100 volume traders (with caching)
        top_candidates = trader_rankings[:100]  # Only check top 100 to save API calls
        addresses_to_check = []
        
        for trader in top_candidates:
            address = trader['address']
            cached = balance_cache.get(address)
            
            # Check if cache is still valid
            if not cached or (current_time - cached['cached_at']) > BALANCE_CACHE_TTL:
                addresses_to_check.append(address)
        
        print(f"Checking balances for {len(addresses_to_check)} wallets (cache hits: {len(top_candidates) - len(addresses_to_check)})")
        
        # Fetch fresh balances for uncached wallets
        if addresses_to_check:
            with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_API_CALLS) as executor:
                future_to_address = {executor.submit(fetch_pedro_balance, addr): addr for addr in addresses_to_check}
                
                for future in as_completed(future_to_address):
                    address = future_to_address[future]
                    try:
                        balance = future.result()
                        balance_cache[address] = {'balance': balance, 'cached_at': current_time}
                    except Exception as e:
                        print(f"Error fetching balance for {address[:8]}...: {str(e)}")
                        balance_cache[address] = {'balance': 0, 'cached_at': current_time}
        
        # Step 5: Filter for ≥10,000 PEDRO holders and build leaderboard
        qualified_traders = []
        
        for trader in top_candidates:
            address = trader['address']
            cached = balance_cache.get(address, {})
            balance = cached.get('balance', 0)
            
            # Only include wallets with ≥10,000 PEDRO (auto-removal)
            if balance >= MIN_BALANCE_THRESHOLD:
                # Check if wallet is connected to a user (normalize address for consistent lookup)
                normalized_address = normalize_address(address)
                binding = wallet_bindings.get(normalized_address)
                display_name = binding.get('display_name') if binding else None
                
                qualified_traders.append({
                    'address': address,
                    'display_name': display_name,  # Telegram name if connected, else None
                    'purchases': trader['purchases'],
                    'sales': trader['sales'],
                    'net_volume': trader['net_volume'],
                    'net_volume_usd': trader['net_volume'] * pedro_price,
                    'current_balance': balance,
                    'last_transaction': datetime.fromtimestamp(trader['last_tx']).isoformat() if trader['last_tx'] else None
                })
        
        # Step 6: Take top 50 and update cache
        active_traders = qualified_traders[:50]
        
        print(f"Leaderboard: Top {len(active_traders)} traders (from {len(qualified_traders)} with ≥{MIN_BALANCE_THRESHOLD} PEDRO)")
        
        # Update cache
        leaderboard_cache['data'] = active_traders
        leaderboard_cache['updated_at'] = datetime.now().isoformat()
        leaderboard_cache['error'] = None
        print(f"[{datetime.now()}] Leaderboard updated with {len(active_traders)} traders")
        
    except Exception as e:
        error_msg = f"Error updating leaderboard: {str(e)}"
        print(error_msg)
        traceback.print_exc()
        leaderboard_cache['error'] = error_msg
        leaderboard_cache['updated_at'] = datetime.now().isoformat()

def leaderboard_updater():
    """Background thread to periodically update leaderboard"""
    # Small delay before first update to let Flask start
    time.sleep(2)
    
    # Initial update
    update_leaderboard_cache()
    
    # Periodic updates
    while True:
        time.sleep(CACHE_REFRESH_INTERVAL)
        update_leaderboard_cache()

if __name__ == '__main__':
    # Start background leaderboard updater NON-BLOCKING
    updater_thread = threading.Thread(target=leaderboard_updater, daemon=True)
    updater_thread.start()
    print("Leaderboard updater started in background (non-blocking)")
    print("Flask server starting immediately - leaderboard will populate in background")
    
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
