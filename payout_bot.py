import os
import time
import re
import base64
import logging
import requests
from decimal import Decimal
from dotenv import load_dotenv
from nacl.signing import SigningKey
import hashlib

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

# Giải mã Keypair và kiểm tra địa chỉ
def get_key_info(b64_str):
    data = base64.b64decode(b64_str)
    # Nếu là 33 bytes (flag + seed), lấy 32 bytes sau
    if len(data) == 33: data = data[1:]
    elif len(data) == 64: data = data[:32] # Nếu là 64 bytes, lấy seed 32 bytes đầu
    
    signing_key = SigningKey(data)
    pub_key_bytes = signing_key.verify_key.encode()
    
    # Tính toán địa chỉ Sui từ Public Key để kiểm tra
    # Address = Blake2b256(0x00 + pubkey)
    address_hash = hashlib.blake2b(b'\x00' + pub_key_bytes, digest_size=32).digest()
    derived_address = "0x" + address_hash.hex()
    
    return signing_key, pub_key_bytes, derived_address

signing_key, pub_key_bytes, derived_addr = get_key_info(SECRET_KEY_B64)

if derived_addr.lower() != HOUSE_ADDRESS.lower():
    logging.error(f"❌ SAI KHÓA BÍ MẬT: Khóa này thuộc về địa chỉ {derived_addr}, nhưng cấu hình nhà cái là {HOUSE_ADDRESS}")
    exit(1)
else:
    logging.info(f"✅ Khóa bí mật hợp lệ cho ví: {derived_addr}")

def rpc_call(method, params):
    try:
        payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        res = requests.post(RPC_URL, json=payload, timeout=10)
        json_res = res.json()
        if 'error' in json_res:
            logging.error(f"RPC Logic Error ({method}): {json_res['error']}")
            return None
        return json_res.get('result')
    except Exception as e:
        logging.error(f"RPC Network Error ({method}): {e}")
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
    # 1. Lấy danh sách coin của nhà cái
    coins = rpc_call("suix_getCoins", [HOUSE_ADDRESS, "0x2::sui::SUI", None, 5])
    if not coins or not coins.get('data'): 
        logging.error("❌ Không tìm thấy Coin nào trong ví nhà cái")
        return None
    
    # Chọn các coin có đủ số dư (reward + gas)
    input_coins = []
    total_input = 0
    for c in coins['data']:
        input_coins.append(c['coinObjectId'])
        total_input += int(c['balance'])
        if total_input >= amount_mist + 20000000: break # Cần khoảng 0.02 SUI gas
    
    if total_input < amount_mist + 20000000:
        logging.error(f"❌ Ví nhà cái không đủ số dư thực tế (Cần {amount_mist/1e9}, có {total_input/1e9})")
        return None
    
    # 2. Tạo transaction bytes
    tx_data = rpc_call("unsafe_paySui", [
        HOUSE_ADDRESS, 
        input_coins, 
        [sender], 
        [str(amount_mist)], 
        "15000000" # Tăng gas budget lên 0.015 SUI
    ])
    return tx_data.get('txBytes') if tx_data else None

def sign_and_execute(tx_bytes_b64):
    tx_bytes = base64.b64decode(tx_bytes_b64)
    # Sui Intent Message: [IntentScope(0), Version(0), AppId(0)] + TxBytes
    intent_msg = b'\x00\x00\x00' + tx_bytes
    
    # BẮT BUỘC: Hashing bằng Blake2b-256 trước khi ký
    digest = hashlib.blake2b(intent_msg, digest_size=32).digest()
    
    # Ký trên kết quả Hash
    signature_bytes = signing_key.sign(digest).signature
    
    # Serialized Signature: [Flag(0)] + [Sig(64)] + [PubKey(32)]
    serialized_sig = base64.b64encode(b'\x00' + signature_bytes + pub_key_bytes).decode()
    
    # Gửi thực thi
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
            processed_digests.add(digest); save_processed(digest); continue

        suffix = get_suffix(house_change)
        digits = re.findall(r'\d', digest)
        if not suffix or not digits:
            processed_digests.add(digest); save_processed(digest); continue
            
        last_digit = int(digits[-1])
        ratio = 0
        if suffix == '1' and last_digit in [1, 3, 5, 7]: ratio = 2.4
        elif suffix == '2' and last_digit in [2, 4, 6, 8]: ratio = 2.4
        elif suffix == '4' and last_digit in [5, 6, 7, 8]: ratio = 2.2
        elif suffix == '3' and last_digit in [1, 2, 3, 4]: ratio = 2.2
            
        if ratio > 0:
            reward = int(house_change * ratio)
            logging.info(f"🎯 WINNER: {sender} won {reward/1e9} SUI")
            
            tx_bytes = get_payout_data(sender, reward)
            if tx_bytes:
                exec_res = sign_and_execute(tx_bytes)
                if exec_res and exec_res.get('effects', {}).get('status', {}).get('status') == 'success':
                    logging.info(f"💸 Payout sent! Digest: {exec_res['digest']}")
                else:
                    error_msg = exec_res.get('effects', {}).get('status', {}).get('error') if exec_res else "No response from node"
                    logging.error(f"❌ Payout failed for {digest}: {error_msg}")
            else:
                logging.error(f"❌ Could not generate TxBytes for {digest}")

        processed_digests.add(digest)
        save_processed(digest)

if __name__ == "__main__":
    logging.info("🤖 Sui Ultra-Light Bot started (Requests + PyNaCl)...")
    while True:
        check_and_payout()
        time.sleep(CHECK_INTERVAL)
