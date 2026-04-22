import 'dotenv/config';
import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { fromB64 } from '@mysten/sui.js/utils';

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

const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
const keypair = Ed25519Keypair.fromSecretKey(fromB64(SECRET_KEY_B64));

console.log('🤖 Payout Bot is starting...');
console.log('🏠 Monitoring House:', HOUSE_ADDRESS);

async function checkAndPayout() {
    try {
        const txs = await client.queryTransactionBlocks({
            filter: { ToAddress: HOUSE_ADDRESS },
            options: { showBalanceChanges: true, showInput: true, showEffects: true },
            limit: 10,
            descending: true
        });

        for (const tx of txs.data) {
            const sender = tx.transaction.data.sender;
            const digest = tx.digest;
            
            // Tìm sự thay đổi số dư của nhà cái (số dương là tiền nhận được)
            const houseChange = tx.balanceChanges.find(bc => bc.owner.AddressOwner === HOUSE_ADDRESS);
            if (!houseChange || parseInt(houseChange.amount) <= 0) continue;

            const amountMist = parseInt(houseChange.amount);
            const rawAmountStr = (amountMist / 1000000000).toString();
            
            // Kiểm tra xem giao dịch này đã được trả thưởng chưa (Dùng metadata hoặc DB nếu cần)
            // Trong bản demo này, chúng ta giả định bot check digest.
            
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
        }
    } catch (e) {
        console.error('Error in bot loop:', e.message);
    }
}

async function sendPayout(recipient, amount) {
    const txb = new TransactionBlock();
    const [coin] = txb.splitCoins(txb.gas, [txb.pure(amount)]);
    txb.transferObjects([coin], txb.pure(recipient));

    try {
        const result = await client.signAndExecuteTransactionBlock({
            signer: keypair,
            transactionBlock: txb,
        });
        console.log('💸 Payout sent! Digest:', result.digest);
    } catch (e) {
        console.error('Failed to send payout:', e.message);
    }
}

// Chạy mỗi 10 giây
setInterval(checkAndPayout, 10000);
checkAndPayout();
