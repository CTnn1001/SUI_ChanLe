import 'dotenv/config';
import { SuiJsonRpcClient as SuiClient, getJsonRpcFullnodeUrl as getFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64 } from '@mysten/sui/utils';

/**
 * 💡 LƯU Ý QUAN TRỌNG VỀ BẢO MẬT:
 * 1. Bot này dùng biến môi trường trong file .env để bảo mật.
 * 2. Đảm bảo file .env của bạn đã có SUI_HOUSE_SECRET_KEY_B64 và SUI_HOUSE_ADDRESS.
 */

// --- CONFIGURATION ---
const SECRET_KEY_B64 = process.env.SUI_HOUSE_SECRET_KEY_B64; 
const HOUSE_ADDRESS = process.env.SUI_HOUSE_ADDRESS;
const NETWORK = process.env.SUI_NETWORK || 'testnet';
// ---------------------

if (!SECRET_KEY_B64 || !HOUSE_ADDRESS) {
    console.error('❌ Error: SUI_HOUSE_SECRET_KEY_B64 or SUI_HOUSE_ADDRESS is missing in .env');
    process.exit(1);
}

const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });

// Xử lý Secret Key nếu có flag (33 bytes)
let secretKey = fromBase64(SECRET_KEY_B64);
if (secretKey.length === 33 && secretKey[0] === 0) {
    secretKey = secretKey.slice(1);
}
const keypair = Ed25519Keypair.fromSecretKey(secretKey);

console.log('🤖 Payout Bot is starting...');
console.log('🏠 Monitoring House:', HOUSE_ADDRESS);

// Tập hợp các digest đã xử lý để tránh trả thưởng trùng
const processedDigests = new Set();

async function checkAndPayout() {
    try {
        const txs = await client.queryTransactionBlocks({
            filter: { ToAddress: HOUSE_ADDRESS },
            options: { showBalanceChanges: true, showInput: true, showEffects: true },
            limit: 20,
            descendingOrder: true
        });

        for (const tx of txs.data) {
            const digest = tx.digest;
            
            // Nếu đã xử lý rồi thì bỏ qua
            if (processedDigests.has(digest)) continue;

            const sender = tx.transaction.data.sender;
            
            // Tìm sự thay đổi số dư của nhà cái (số dương là tiền nhận được)
            const houseChange = tx.balanceChanges.find(bc => bc.owner.AddressOwner === HOUSE_ADDRESS);
            if (!houseChange || parseInt(houseChange.amount) <= 0) continue;

            const amountMist = parseInt(houseChange.amount);
            const rawAmountStr = (amountMist / 1000000000).toString();
            
            // Logic cược:
            const decimalPartMatch = rawAmountStr.split('.')[1];
            if (!decimalPartMatch) continue;
            
            const decimalPart = decimalPartMatch.replace(/0+$/, "");
            if (decimalPart.length === 0) continue;
            
            const suffix = decimalPart.charAt(decimalPart.length - 1);
            const digits = digest.match(/\d/g);
            if (!digits) continue;
            const lastDigit = parseInt(digits[digits.length - 1]);

            let isWin = false;
            let ratio = 0;

            if (suffix === '1' && [1, 3, 5, 7].includes(lastDigit)) { isWin = true; ratio = 2.4; }
            else if (suffix === '2' && [2, 4, 6, 8].includes(lastDigit)) { isWin = true; ratio = 2.4; }
            else if (suffix === '4' && [5, 6, 7, 8].includes(lastDigit)) { isWin = true; ratio = 2.2; }
            else if (suffix === '3' && [1, 2, 3, 4].includes(lastDigit)) { isWin = true; ratio = 2.2; }

            if (isWin) {
                const rewardAmount = Math.floor(amountMist * ratio);
                console.log(`✅ WINNER detected! Sending ${rewardAmount / 1e9} SUI to ${sender}`);
                await sendPayout(sender, rewardAmount);
            }
            
            // Đánh dấu là đã xử lý
            processedDigests.has(digest) || processedDigests.add(digest);
        }
    } catch (e) {
        console.error('Error in bot loop:', e.message);
    }
}

async function sendPayout(recipient, amount) {
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
    tx.transferObjects([coin], tx.pure.address(recipient));

    try {
        const result = await client.signAndExecuteTransaction({
            signer: keypair,
            transaction: tx,
        });
        console.log('💸 Payout sent! Digest:', result.digest);
    } catch (e) {
        console.error('Failed to send payout:', e.message);
    }
}

setInterval(checkAndPayout, 10000);
checkAndPayout();
