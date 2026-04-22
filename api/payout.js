import { SuiJsonRpcClient as SuiClient, getJsonRpcFullnodeUrl as getFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64 } from '@mysten/sui/utils';

// --- CONFIGURATION (Load from Vercel Environment Variables) ---
const SECRET_KEY_B64 = process.env.SUI_HOUSE_SECRET_KEY_B64;
const HOUSE_ADDRESS = process.env.SUI_HOUSE_ADDRESS;
const NETWORK = process.env.SUI_NETWORK || 'testnet';
// ---------------------------------------------------------------

const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });

export default async function handler(req, res) {
    console.log('🤖 Vercel Payout Cron started...');

    try {
        if (!SECRET_KEY_B64 || !HOUSE_ADDRESS) {
            throw new Error('Missing environment variables SUI_HOUSE_SECRET_KEY_B64 or SUI_HOUSE_ADDRESS');
        }

        // Xử lý Secret Key nếu có flag (33 bytes)
        let secretKey = fromBase64(SECRET_KEY_B64);
        if (secretKey.length === 33 && secretKey[0] === 0) {
            secretKey = secretKey.slice(1);
        }
        const keypair = Ed25519Keypair.fromSecretKey(secretKey);

        // 1. Lấy danh sách giao dịch gần nhất của nhà cái
        const txs = await client.queryTransactionBlocks({
            filter: { ToAddress: HOUSE_ADDRESS },
            options: { showBalanceChanges: true, showInput: true, showEffects: true },
            limit: 20,
            descendingOrder: true
        });

        const processedBets = [];

        for (const tx of txs.data) {
            const sender = tx.transaction.data.sender;
            const digest = tx.digest;
            
            // Tìm số dư nhận được
            const houseChange = tx.balanceChanges.find(bc => bc.owner.AddressOwner === HOUSE_ADDRESS);
            if (!houseChange || parseInt(houseChange.amount) <= 0) continue;

            const amountMist = parseInt(houseChange.amount);
            const rawAmountStr = (amountMist / 1000000000).toString();
            
            // Logic cược
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
                // KIỂM TRA XEM ĐÃ TRẢ THƯỞNG CHƯA
                const alreadyPaid = await checkAlreadyPaid(sender, digest);
                if (alreadyPaid) {
                    console.log(`Skipping already paid bet: ${digest}`);
                    continue;
                }

                const rewardAmount = Math.floor(amountMist * ratio);
                console.log(`✅ WINNER: Sending ${rewardAmount / 1e9} SUI to ${sender}`);
                const payoutResult = await sendPayout(client, keypair, sender, rewardAmount);
                processedBets.push({ digest, recipient: sender, reward: rewardAmount / 1e9, payoutDigest: payoutResult.digest });
            }
        }

        return res.status(200).json({ success: true, processed: processedBets });
    } catch (e) {
        console.error('Error:', e.message);
        return res.status(500).json({ error: e.message });
    }
}

async function checkAlreadyPaid(recipient, betDigest) {
    // Lưu ý: Đây là cách check đơn giản, trong sản xuất nên dùng Database lưu betDigest đã xử lý
    // Hiện tại tạm thời trả về false để logic hoạt động
    return false;
}

async function sendPayout(client, keypair, recipient, amount) {
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
    tx.transferObjects([coin], tx.pure.address(recipient));

    return await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
    });
}
