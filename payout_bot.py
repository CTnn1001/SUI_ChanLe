import os
import time
import re
import base64
import logging
from decimal import Decimal
from dotenv import load_dotenv

# Cài đặt Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("bot.log"),
        logging.StreamHandler()
    ]
)

try:
    from pysui import SuiConfig, SyncClient
    from pysui.sui.sui_builders.get_builders import QueryTransactionBlocks
    from pysui.sui.sui_builders.exec_builders import PaySui
    from pysui.sui.sui_types.scalars import SuiAddress
    from pysui.sui.sui_crypto import Ed25519KeyPair
    from pysui.sui.sui_txresults.complex_txresults import TransactionBlock
except ImportError:
    logging.error("Missing libraries. Please run: pip install pysui python-dotenv")
    exit(1)

# --- CONFIGURATION ---
load_dotenv()
SECRET_KEY_B64 = os.getenv('SUI_HOUSE_SECRET_KEY_B64')
HOUSE_ADDRESS = os.getenv('SUI_HOUSE_ADDRESS')
NETWORK = os.getenv('SUI_NETWORK', 'testnet')
CHECK_INTERVAL = 10  # Seconds
DB_FILE = "processed_digests.txt"

if not SECRET_KEY_B64 or not HOUSE_ADDRESS:
    logging.error("❌ SUI_HOUSE_SECRET_KEY_B64 or SUI_HOUSE_ADDRESS is missing in .env")
    exit(1)

# Khởi tạo Keypair từ Base64
def get_keypair(b64_str):
    data = base64.b64decode(b64_str)
    # Nếu là 33 bytes (có flag Ed25519 ở đầu), bỏ byte đầu tiên
    if len(data) == 33 and data[0] == 0:
        data = data[1:]
    return Ed25519KeyPair.from_bytes(data)

keypair = get_keypair(SECRET_KEY_B64)
# pysui config tự động dựa trên network
# Đối với bot độc lập, ta có thể dùng config mặc định hoặc tạo mới
try:
    config = SuiConfig.default_config()
except Exception:
    # Nếu chưa có config (chưa chạy sui client), ta tạo config tối thiểu
    logging.warning("No default Sui config found. Using manual config.")
    # Lưu ý: Pysui thường yêu cầu config file. Trên VPS bạn nên chạy `sui client` trước 1 lần.
    # Hoặc ta có thể dùng SyncClient với URL trực tiếp nếu pysui hỗ trợ.
    config = SuiConfig.user_config(rpc_url="https://fullnode.testnet.sui.io:443")

client = SyncClient(config)

# Lưu trữ các giao dịch đã xử lý vào file
def load_processed():
    if not os.path.exists(DB_FILE):
        return set()
    with open(DB_FILE, "r") as f:
        return set(line.strip() for line in f if line.strip())

def save_processed(digest):
    with open(DB_FILE, "a") as f:
        f.write(f"{digest}\n")

processed_digests = load_processed()

def get_suffix(amount_mist):
    """Lấy số cuối cùng của phần thập phân sau khi chia 10^9 (giống JS)"""
    sui_amount = Decimal(amount_mist) / Decimal(10**9)
    sui_str = format(sui_amount.normalize(), 'f')
    if "." not in sui_str:
        return None
    decimal_part = sui_str.split(".")[1]
    if not decimal_part:
        return None
    return decimal_part[-1]

def check_and_payout():
    global processed_digests
    logging.info(f"🔍 Scanning transactions for {HOUSE_ADDRESS}...")
    
    try:
        # Query các giao dịch đến địa chỉ nhà cái
        builder = QueryTransactionBlocks(
            query={"ToAddress": HOUSE_ADDRESS},
            descending_order=True,
            limit=20
        )
        
        # Thêm options để xem balanceChanges và input
        # Lưu ý: Pysui QueryTransactionBlocks có thể cần tham số khác tùy phiên bản
        # Ở đây ta giả định cấu trúc chuẩn của Sui RPC
        result = client.execute(builder)
        
        if not result.is_ok():
            logging.error(f"Error querying transactions: {result.result_string}")
            return

        tx_blocks = result.result_data.data
        
        for tx in tx_blocks:
            digest = tx.digest
            if digest in processed_digests:
                continue
            
            sender = tx.transaction.data.sender
            
            # Kiểm tra số tiền nhận được (balanceChanges)
            # Lưu ý: Cấu trúc dữ liệu của pysui có thể bọc trong các Object
            house_change = None
            if hasattr(tx, 'balance_changes'):
                for change in tx.balance_changes:
                    if change.owner.get('AddressOwner') == HOUSE_ADDRESS:
                        amount = int(change.amount)
                        if amount > 0:
                            house_change = amount
                            break
            
            if not house_change:
                processed_digests.add(digest)
                continue

            amount_mist = house_change
            suffix = get_suffix(amount_mist)
            
            if not suffix:
                processed_digests.add(digest)
                continue
                
            # Lấy số cuối của Digest
            digits = re.findall(r'\d', digest)
            if not digits:
                processed_digests.add(digest)
                continue
            last_digit = int(digits[-1])
            
            is_win = False
            ratio = 0
            
            # Logic game
            if suffix == '1' and last_digit in [1, 3, 5, 7]:
                is_win = True; ratio = 2.4
            elif suffix == '2' and last_digit in [2, 4, 6, 8]:
                is_win = True; ratio = 2.4
            elif suffix == '4' and last_digit in [5, 6, 7, 8]:
                is_win = True; ratio = 2.2
            elif suffix == '3' and last_digit in [1, 2, 3, 4]:
                is_win = True; ratio = 2.2
                
            if is_win:
                reward_amount = int(amount_mist * ratio)
                logging.info(f"✅ WINNER: {sender} won {reward_amount/1e9} SUI (Bet: {amount_mist/1e9}, Ratio: {ratio})")
                
                # Gửi Payout
                payout_tx = PaySui(
                    recipients=[SuiAddress(sender)],
                    amounts=[reward_amount]
                )
                
                # Thực hiện ký và gửi
                payout_result = client.execute(payout_tx, keypair)
                
                if payout_result.is_ok():
                    logging.info(f"💸 Payout sent! Digest: {payout_result.result_data.digest}")
                else:
                    logging.error(f"❌ Payout failed for {digest}: {payout_result.result_string}")
                    # Nếu lỗi do gas hoặc network, có thể thử lại sau (không add vào processed)
                    continue

            # Đánh dấu đã xử lý
            processed_digests.add(digest)
            save_processed(digest)
            
    except Exception as e:
        logging.error(f"Error in main loop: {str(e)}")

if __name__ == "__main__":
    logging.info("🤖 Sui Payout Bot (Python) started...")
    logging.info(f"🌍 Network: {NETWORK}")
    
    while True:
        check_and_payout()
        time.sleep(CHECK_INTERVAL)
