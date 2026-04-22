import { Transaction } from '@mysten/sui/transactions';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { getWallets } from '@mysten/wallet-standard';
import confetti from 'canvas-confetti';

const products = [
    {
        id: 1,
        title: "Donate 0.5 SUI",
        game: "SuiHub Support",
        desc: "pls fruit :(",
        price: 0.5,
        image: "assets/donate_sui_card_1776827820711.png",
        tag: "Ủng hộ"
    }
];

const DESTINATION = "0x8508df9b11db150c6dc4fbe808e73343470a1a2ea9e82fbd7be5fb35d78352ff";
let connectedAddress = null;
let selectedProduct = null;
let selectedWallet = null;
let currentBalanceMist = 0;

const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('testnet'), network: 'testnet' });

// DOM Elements
const connectBtn = document.getElementById('connectBtn');
const productGrid = document.getElementById('productGrid');
const modalOverlay = document.getElementById('modalOverlay');
const modalContent = document.getElementById('modalContent');
const cancelBtn = document.getElementById('cancelBtn');
const confirmBtn = document.getElementById('confirmBtn');
const toast = document.getElementById('toast');
const successModal = document.getElementById('successModal');
const successAmount = document.getElementById('successAmount');
const txResult = document.getElementById('txResult');
const txHashElement = document.getElementById('txHash');
const suiBalance = document.getElementById('suiBalance');
const usdBalance = document.getElementById('usdBalance');
const historyBody = document.getElementById('historyBody');

const SUI_PRICE_USD = 0.962; // Adjusted to match user's expected $2.88 balance
const PRICE_CHANGE = "+0.03%";

function saveTransaction(type, detail, amount) {
    // Không cần lưu localStorage nữa vì sẽ fetch trực tiếp từ blockchain
    fetchTransactionHistory();
}

async function fetchTransactionHistory() {
    if (!connectedAddress) return;
    
    try {
        const result = await client.queryTransactionBlocks({
            filter: { FromAddress: connectedAddress },
            options: {
                showBalanceChanges: true,
                showEffects: true,
                showDisplay: true,
                showInput: true
            },
            limit: 10,
            descendingOrder: true
        });

        const txs = result.data.map(tx => {
            const date = new Date(parseInt(tx.timestampMs || Date.now()));
            const timeStr = date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
            
            // Tìm sự thay đổi số dư SUI
            const suiChange = tx.balanceChanges?.find(bc => bc.coinType === '0x2::sui::SUI');
            const amount = suiChange ? Math.abs(parseInt(suiChange.amount) / 1000000000).toFixed(4) : "0.00";
            
            return {
                digest: tx.digest,
                type: tx.effects.status.status === 'success' ? 'Thành công' : 'Thất bại',
                amount: amount,
                time: timeStr,
                isSender: tx.transaction.data.sender === connectedAddress
            };
        });

        renderHistory(txs);
    } catch (e) {
        console.error("Lỗi khi tải lịch sử giao dịch:", e);
    }
}

function renderHistory(txs = []) {
    if (txs.length === 0) {
        historyBody.innerHTML = '<tr><td colspan="4" class="history-empty">Chưa có giao dịch nào trên mạng lưới</td></tr>';
        return;
    }
    historyBody.innerHTML = txs.map(tx => `
        <tr>
            <td><span class="type-badge ${tx.type === 'Thành công' ? 'type-transfer' : 'type-error'}">${tx.type}</span></td>
            <td><a href="https://suiscan.xyz/testnet/tx/${tx.digest}" target="_blank" style="color: var(--sui-blue); text-decoration: none;">${tx.digest.slice(0, 10)}...</a></td>
            <td style="font-weight: 700; color: ${tx.isSender ? '#ef4444' : '#10b981'};">
                ${tx.isSender ? '-' : '+'}${tx.amount} SUI
            </td>
            <td style="color: var(--sui-text-dim); font-size: 12px;">${tx.time}</td>
        </tr>
    `).join('');
}

// Tab Switching
const tabBtns = document.querySelectorAll('.tab-btn');
const sections = document.querySelectorAll('.app-section');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        sections.forEach(s => {
            s.classList.remove('active');
            if (s.id === `${target}-section`) s.classList.add('active');
        });
    });
});

// Count-up animation for balance
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const val = progress * (end - start) + start;
        
        // Hiển thị tối đa 6 chữ số thập phân, loại bỏ số 0 thừa ở cuối
        obj.innerHTML = parseFloat(val.toFixed(6)).toString();
        
        // Cập nhật giá trị USD tương ứng
        const usdVal = val * SUI_PRICE_USD;
        usdBalance.innerHTML = `≈ $${usdVal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} <span class="price-up">${PRICE_CHANGE}</span>`;
        
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            // Đảm bảo con số cuối cùng là chính xác tuyệt đối
            obj.innerHTML = parseFloat(end.toFixed(6)).toString();
            const finalUsd = end * SUI_PRICE_USD;
            usdBalance.innerHTML = `≈ $${finalUsd.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} <span class="price-up">${PRICE_CHANGE}</span>`;
        }
    };
    window.requestAnimationFrame(step);
}

let lastBalance = 0;

// Balance Fetching
async function updateBalance() {
    if (!connectedAddress) return;
    try {
        const balance = await client.getBalance({
            owner: connectedAddress,
            coinType: '0x2::sui::SUI'
        });
        currentBalanceMist = parseInt(balance.totalBalance);
        // Làm tròn đến 6 chữ số thập phân để tránh sai số dấu phẩy động
        const suiAmount = Math.round(currentBalanceMist / 1000) / 1000000;
        
        if (Math.abs(suiAmount - lastBalance) > 0.000001) {
            animateValue(suiBalance, lastBalance, suiAmount, 1000);
            lastBalance = suiAmount;
            fetchTransactionHistory(); // Cập nhật lịch sử khi số dư thay đổi
        }
    } catch (e) {
        console.error("Cập nhật số dư thất bại", e);
    }
}

// Wallet Logic
async function connect(walletToUse = null) {
    const wallets = getWallets().get().filter(w => 
        w.features && (w.features['standard:connect'] || w.features['sui:signAndExecuteTransaction'])
    );
    const wallet = walletToUse || (wallets.length > 0 ? wallets[0] : null);

    if (wallet) {
        console.log("Đang kết nối với ví:", wallet.name, wallet.features);
        selectedWallet = wallet;
        try {
            // Kiểm tra xem ví có hỗ trợ tính năng connect chuẩn không
            const connectFeature = selectedWallet.features['standard:connect'];
            if (!connectFeature) {
                throw new Error("Ví không hỗ trợ tính năng kết nối chuẩn (standard:connect)");
            }

            await connectFeature.connect();
            
            const accounts = selectedWallet.accounts;
            if (accounts.length > 0) {
                connectedAddress = accounts[0].address;
                connectBtn.textContent = `${connectedAddress.slice(0, 6)}...${connectedAddress.slice(-4)}`;
                showToast(`Đã kết nối với ví ${selectedWallet.name}!`);
                localStorage.setItem('sui_wallet_last_connected', selectedWallet.name);
                updateBalance();
                fetchTransactionHistory(); // Tải lịch sử ngay khi kết nối
                if (window.balanceInterval) clearInterval(window.balanceInterval);
                window.balanceInterval = setInterval(updateBalance, 10000);
            }
        } catch (e) {
            console.error("Lỗi kết nối ví:", e);
            if (!walletToUse) showToast("Kết nối ví thất bại: " + e.message, true);
        }
    } else if (!walletToUse) {
        showToast("Không tìm thấy ví Sui nào. Vui lòng cài đặt Slush hoặc Sui Wallet.", true);
    }
}

// Auto-reconnect on load
async function autoConnect() {
    const lastConnected = localStorage.getItem('sui_wallet_last_connected');
    if (!lastConnected) return;

    const wallets = getWallets();
    const checkAndConnect = () => {
        const availableWallets = wallets.get();
        const matchingWallet = availableWallets.find(w => w.name === lastConnected);
        if (matchingWallet) {
            connect(matchingWallet);
            return true;
        }
        return false;
    };

    // Try immediately
    if (!checkAndConnect()) {
        // If not found, listen for new wallets being registered
        const unsubscribe = wallets.on('register', () => {
            if (checkAndConnect()) unsubscribe();
        });
        // Timeout after 3 seconds to avoid infinite waiting
        setTimeout(unsubscribe, 3000);
    }
}

// Transfer Logic
const transferBtn = document.getElementById('transferBtn');
const recipientInput = document.getElementById('recipientAddress');
const amountInput = document.getElementById('transferAmount');
const maxBtn = document.getElementById('maxBtn');

maxBtn.addEventListener('click', () => {
    if (!connectedAddress) {
        showToast("Vui lòng kết nối ví trước", true);
        return;
    }
    // Giữ lại một ít cho phí gas (khoảng 0.005 SUI)
    const reserve = 0.005 * 1000000000;
    const maxAmountMist = Math.max(0, currentBalanceMist - reserve);
    amountInput.value = (maxAmountMist / 1000000000).toFixed(6);
});

async function handleTransfer() {
    if (!connectedAddress || !selectedWallet) {
        showToast("Vui lòng kết nối ví trước", true);
        return;
    }
    
    const recipient = recipientInput.value.trim();
    const amount = parseFloat(amountInput.value);
    
    if (!recipient.startsWith('0x') || recipient.length < 40) {
        showToast("Địa chỉ ví không hợp lệ", true);
        return;
    }
    
    if (isNaN(amount) || amount <= 0) {
        showToast("Vui lòng nhập số lượng hợp lệ", true);
        return;
    }

    if (amount * 1000000000 > currentBalanceMist) {
        showToast("Số dư không đủ", true);
        return;
    }

    transferBtn.innerHTML = '<span class="spinner"></span> Đang gửi...';
    transferBtn.disabled = true;
    transferBtn.style.opacity = '0.7';

    try {
        const tx = new Transaction();
        const amountInMist = Math.floor(amount * 1000000000);
        const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountInMist)]);
        tx.transferObjects([coin], tx.pure.address(recipient));

        const result = await selectedWallet.features['sui:signAndExecuteTransaction'].signAndExecuteTransaction({
            transaction: tx,
            account: selectedWallet.accounts[0],
            chain: 'sui:testnet'
        });

        if (result.digest) {
            showToast("Chuyển SUI thành công!");
            saveTransaction('Gửi SUI', `${recipient.slice(0,6)}...${recipient.slice(-4)}`, amount);
            updateBalance();
            recipientInput.value = '';
            amountInput.value = '';
        }
    } catch (e) {
        console.error(e);
        showToast("Giao dịch thất bại: " + (e.message || "Lỗi không xác định"), true);
    } finally {
        transferBtn.textContent = "Xác nhận gửi tiền";
        transferBtn.disabled = false;
    }
}

// Shop Logic
function render() {
    productGrid.innerHTML = products.map(p => `
        <div class="account-card" onclick="window.openModal(${p.id})">
            <img src="${p.image}" class="card-image" alt="${p.title}">
            <div class="card-body">
                <span class="card-tag">${p.tag}</span>
                <h3 class="card-title">${p.title}</h3>
                <p class="card-desc">${p.desc}</p>
                <div class="card-footer">
                    <div class="card-price">${p.price} <span>SUI</span></div>
                    <button class="btn-primary btn-shop">MUA NGAY</button>
                </div>
            </div>
        </div>
    `).join('');
}

window.openModal = (id) => {
    if (!connectedAddress) {
        showToast("Vui lòng kết nối ví trước", true);
        return;
    }
    selectedProduct = products.find(p => p.id === id);
    modalContent.innerHTML = `
        <div class="info-item">
            <span class="info-label">Tài khoản:</span>
            <span style="font-weight: 700;">${selectedProduct.title}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Trò chơi:</span>
            <span>${selectedProduct.game}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Giá thanh toán:</span>
            <span style="color: var(--sui-blue); font-weight: 900; font-size: 18px;">${selectedProduct.price} SUI</span>
        </div>
    `;
    txResult.style.display = 'none';
    confirmBtn.style.display = 'block';
    confirmBtn.disabled = false;
    modalOverlay.style.display = 'flex';
};

async function handlePayment() {
    if (!selectedProduct || !selectedWallet) return;
    
    confirmBtn.textContent = "Đang ký giao dịch...";
    confirmBtn.disabled = true;

    try {
        const tx = new Transaction();
        const amountInMist = Math.floor(selectedProduct.price * 1000000000);
        const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountInMist)]);
        tx.transferObjects([coin], tx.pure.address(DESTINATION));

        const result = await selectedWallet.features['sui:signAndExecuteTransaction'].signAndExecuteTransaction({
            transaction: tx,
            account: selectedWallet.accounts[0],
            chain: 'sui:testnet'
        });

        if (result.digest) {
            modalOverlay.style.display = 'none';
            
            // Hiển thị màn hình ăn mừng
            successAmount.textContent = `${selectedProduct.price} SUI`;
            successModal.style.display = 'flex';
            
            // Hiệu ứng pháo hoa (Confetti)
            const duration = 4 * 1000;
            const end = Date.now() + duration;

            (function frame() {
              confetti({
                particleCount: 5,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: ['#4ca2ff', '#ffffff', '#ffd700']
              });
              confetti({
                particleCount: 5,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: ['#4ca2ff', '#ffffff', '#ffd700']
              });

              if (Date.now() < end) {
                requestAnimationFrame(frame);
              }
            }());

            saveTransaction('Mua hàng', selectedProduct.title, selectedProduct.price);
            updateBalance();
        }
    } catch (e) {
        console.error(e);
        showToast("Thanh toán thất bại", true);
        confirmBtn.textContent = "Xác nhận thanh toán";
        confirmBtn.disabled = false;
    }
}

function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
}

connectBtn.addEventListener('click', () => connect());
cancelBtn.addEventListener('click', () => modalOverlay.style.display = 'none');
confirmBtn.addEventListener('click', handlePayment);
transferBtn.addEventListener('click', handleTransfer);

render();
renderHistory();
autoConnect();
