import os
import time
import re
import base64
import logging
import requests
from decimal import Decimal
from dotenv import load_dotenv
from nacl.signing import SigningKey

# Cài đặt Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.FileHandler("bot.log"), logging.StreamHandler()]
)

load_dotenv()
SECRET_KEY_B64 = os.getenv('SUI_HOUSE_SECRET_KEY_B64')
HOUSE_ADDRESS = os.getenv('SUI_HOUSE_ADDRESS')
NETWORK = os.getenv('SUI_NETWORK', 'testnet')
RPC_URL = "https://fullnode.testnet.sui.io:443" if NETWORK == 'testnet' else "https://fullnode.mainnet.sui.io:443"
CHECK_INTERVAL = 1
DB_FILE = "processed_digests.txt"

if not SECRET_KEY_B64 or not HOUSE_ADDRESS:
    logging.error("❌ Thiếu biến môi trường trong .env")
    exit(1)

# Giải mã Keypair
def get_key_info(b64_str):
    data = base64.b64decode(b64_str)
    if len(data) == 33 and data[0] == 0: data = data[1:]
    signing_key = SigningKey(data)
    verify_key = signing_key.verify_key
    return signing_key, verify_key.encode()

signing_key, pub_key_bytes = get_key_info(SECRET_KEY_B64)

def rpc_call(method, params):
    try:
        payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        res = requests.post(RPC_URL, json=payload, timeout=10)
        return res.json().get('result')
    except Exception as e:
        # logging.error(f"RPC Error ({method}): {e}")
        return None

def load_processed():
    if not os.path.exists(DB_FILE): return set()
    with open(DB_FILE, "r") as f: return set(line.strip() for line in f if line.strip())

def save_processed(digest):
    with open(DB_FILE, "a") as f: f.write(f"{digest}\n")

processed_digests = load_processed()

def get_suffix(amount_mist):
    sui_amount = Decimal(amount_mist) / Decimal(10**9)
    sui_str = format(sui_amount.normalize(), 'f')
    if "." not in sui_str: return None
    decimal_part = sui_str.split(".")[1]
    return decimal_part[-1] if decimal_part else None

def get_payout_data(sender, amount_mist):
    # 1. Lấy danh sách coin của nhà cái để trả phí và làm nguồn tiền
    coins = rpc_call("suix_getCoins", [HOUSE_ADDRESS, "0x2::sui::SUI", None, 1])
    if not coins or not coins.get('data'): return None
    coin_id = coins['data'][0]['coinObjectId']
    
    # 2. Tạo transaction bytes (Unsafe)
    # unsafe_paySui(signer, input_coins, recipients, amounts, gas_budget)
    tx_data = rpc_call("unsafe_paySui", [
        HOUSE_ADDRESS, 
        [coin_id], 
        [sender], 
        [str(amount_mist)], 
        "10000000" # gas budget 0.01 SUI
    ])
    return tx_data.get('txBytes') if tx_data else None

def sign_and_execute(tx_bytes_b64):
    tx_bytes = base64.b64decode(tx_bytes_b64)
    # Intent: [0, 0, 0] cho TransactionData
    intent = b'\x00\x00\x00'
    signature_bytes = signing_key.sign(intent + tx_bytes).signature
    
    # Serialized Signature: [flag(0)] + [sig] + [pubkey]
    serialized_sig = base64.b64encode(b'\x00' + signature_bytes + pub_key_bytes).decode()
    
    # Execute
    return rpc_call("sui_executeTransactionBlock", [
        tx_bytes_b64, 
        [serialized_sig], 
        {"showEffects": True}, 
        "WaitForLocalExecution"
    ])

def check_and_payout():
    global processed_digests
    res = rpc_call("suix_queryTransactionBlocks", [
        {"filter": {"ToAddress": HOUSE_ADDRESS}, "options": {"showBalanceChanges": True, "showInput": True}},
        None, 10, True
    ])
    if not res: return

    for tx in res.get('data', []):
        digest = tx['digest']
        if digest in processed_digests: continue
        
        sender = tx['transaction']['data']['sender']
        house_change = sum(int(c['amount']) for c in tx.get('balanceChanges', []) 
                          if c['owner'].get('AddressOwner') == HOUSE_ADDRESS and int(c['amount']) > 0)
        
        if house_change <= 0:
            processed_digests.add(digest)
            save_processed(digest)
            continue

        suffix = get_suffix(house_change)
        digits = re.findall(r'\d', digest)
        if not suffix or not digits:
            processed_digests.add(digest)
            save_processed(digest)
            continue
            
        last_digit = int(digits[-1])
        ratio = 0
        if suffix == '1' and last_digit in [1, 3, 5, 7]: ratio = 2.4
        elif suffix == '2' and last_digit in [2, 4, 6, 8]: ratio = 2.4
        elif suffix == '4' and last_digit in [5, 6, 7, 8]: ratio = 2.2
        elif suffix == '3' and last_digit in [1, 2, 3, 4]: ratio = 2.2
            
        if ratio > 0:
            reward = int(house_change * ratio)
            logging.info(f"🎯 WINNER: {sender} won {reward/1e9} SUI")
            
            # Kiểm tra số dư (Đơn giản hóa)
            balance = rpc_call("suix_getBalance", [HOUSE_ADDRESS])
            if balance and int(balance['totalBalance']) < reward + 15000000:
                processed_digests.add(digest); save_processed(digest); continue
            
            tx_bytes = get_payout_data(sender, reward)
            if tx_bytes:
                exec_res = sign_and_execute(tx_bytes)
                if exec_res and exec_res.get('effects', {}).get('status', {}).get('status') == 'success':
                    logging.info(f"💸 Payout sent! Digest: {exec_res['digest']}")
                else:
                    logging.error(f"❌ Payout failed for {digest}")

        processed_digests.add(digest)
        save_processed(digest)

if __name__ == "__main__":
    logging.info("🤖 Sui Ultra-Light Bot started (Requests + PyNaCl)...")
    while True:
        check_and_payout()
        time.sleep(CHECK_INTERVAL)
