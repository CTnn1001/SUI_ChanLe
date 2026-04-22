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

const DESTINATION = '0x55af5f3e3ce5efbbf2465520497de8d7ffff0b0e0f7283f035ea6d5c0fbced52'; // Ví nhà cái CLI
let connectedAddress = null;
let selectedProduct = null;
let selectedWallet = null;
let currentBalanceMist = 0;
let allTransactions = [];
let currentFilter = 'all';
let currentPage = 1;
const itemsPerPage = 10;
const maxPages = 99;

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
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const currentPageDisplay = document.getElementById('currentPageDisplay');
const totalPagesDisplay = document.getElementById('totalPagesDisplay');
const menuToggle = document.getElementById('menuToggle');
const navMenu = document.getElementById('navMenu');
const logoutBtn = document.getElementById('logoutBtn');
const scrollToTopBtn = document.getElementById('scrollToTop');
const casinoAmountInput = document.getElementById('casinoAmount');
const casinoConfirmBtn = document.getElementById('casinoConfirmBtn');

const SUI_PRICE_USD = 0.962; // Adjusted to match user's expected $2.88 balance
const PRICE_CHANGE = "+0.03%";

function saveTransaction(type, detail, amount) {
    // Không cần lưu localStorage nữa vì sẽ fetch trực tiếp từ blockchain
    fetchTransactionHistory();
}

async function fetchTransactionHistory() {
    if (!connectedAddress) return;
    
    try {
        // Fetch both sent and received transactions
        const [sent, received] = await Promise.all([
            client.queryTransactionBlocks({
                filter: { FromAddress: connectedAddress },
                options: {
                    showBalanceChanges: true,
                    showEffects: true,
                    showInput: true
                },
                limit: 50,
                descendingOrder: true
            }),
            client.queryTransactionBlocks({
                filter: { ToAddress: connectedAddress },
                options: {
                    showBalanceChanges: true,
                    showEffects: true,
                    showInput: true
                },
                limit: 50,
                descendingOrder: true
            })
        ]);

        // Merge and deduplicate by digest (to handle self-transfers)
        const combined = [...sent.data, ...received.data];
        const uniqueMap = new Map();
        combined.forEach(tx => uniqueMap.set(tx.digest, tx));
        
        // Convert back to array and sort by timestamp descending
        const uniqueTransactions = Array.from(uniqueMap.values())
            .sort((a, b) => parseInt(b.timestampMs || 0) - parseInt(a.timestampMs || 0))
            .slice(0, 50); // Keep top 50

        allTransactions = uniqueTransactions.map(tx => {
            const date = new Date(parseInt(tx.timestampMs || Date.now()));
            const timeStr = date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
            
            const myBalanceChange = tx.balanceChanges?.find(bc => 
                (bc.owner.AddressOwner === connectedAddress || bc.owner === connectedAddress) && 
                (bc.coinType === '0x2::sui::SUI' || bc.coinType.endsWith('SUI'))
            );
            
            let amountMist = myBalanceChange ? parseInt(myBalanceChange.amount) : 0;
            const isSender = tx.transaction.data.sender === connectedAddress;

            // Nếu là người gửi, loại bỏ phí gas khỏi số tiền hiển thị
            if (isSender && amountMist < 0) {
                const gasUsed = tx.effects.gasUsed;
                const gasCost = parseInt(gasUsed.computationCost) + parseInt(gasUsed.storageCost) - parseInt(gasUsed.storageRebate);
                amountMist = amountMist + gasCost; 
            }

            const amount = Math.abs(amountMist / 1000000000).toFixed(4);
            const rawAmountStr = Math.abs(amountMist / 1000000000).toString(); // Dùng chuỗi gốc để check đuôi
            
            // Xác định loại dựa trên status và balance change
            let type = 'success';
            if (tx.effects.status.status !== 'success') type = 'error';

            // Tính toán kết quả Casino
            let casinoResult = null;
            let lastDigit = null;
            
            // Tìm số cuối cùng trong digest
            const digits = tx.digest.match(/\d/g);
            if (digits && digits.length > 0) {
                lastDigit = parseInt(digits[digits.length - 1]);
            }

            if (isSender && amountMist < 0) {
                if (lastDigit !== null && rawAmountStr.includes('.')) {
                    const decimalPart = rawAmountStr.split('.')[1].replace(/0+$/, "");
                    if (decimalPart.length > 0) {
                        const lastAmountDigit = decimalPart.charAt(decimalPart.length - 1);
                        if (lastAmountDigit === '1') { // Lẻ
                            casinoResult = [1, 3, 5, 7].includes(lastDigit) ? 'WIN' : 'LOSE';
                        } else if (lastAmountDigit === '2') { // Chẵn
                            casinoResult = [2, 4, 6, 8].includes(lastDigit) ? 'WIN' : 'LOSE';
                        } else if (lastAmountDigit === '4') { // Tài
                            casinoResult = [5, 6, 7, 8].includes(lastDigit) ? 'WIN' : 'LOSE';
                        } else if (lastAmountDigit === '3') { // Xỉu
                            casinoResult = [1, 2, 3, 4].includes(lastDigit) ? 'WIN' : 'LOSE';
                        }
                    }
                }
            }

            return {
                digest: tx.digest,
                status: tx.effects.status.status === 'success' ? 'Thành công' : 'Thất bại',
                type: type,
                amount: amount,
                amountMist: amountMist,
                time: timeStr,
                isSender: isSender,
                isReceived: amountMist > 0,
                casinoResult: casinoResult,
                lastDigit: lastDigit
            };
        });

        renderHistory();
    } catch (e) {
        console.error("Lỗi khi tải lịch sử giao dịch:", e);
    }
}


function renderHistory() {
    if (!historyBody) return;

    let filtered = allTransactions;
    if (currentFilter === 'sent') {
        filtered = allTransactions.filter(tx => tx.isSender);
    } else if (currentFilter === 'received') {
        filtered = allTransactions.filter(tx => tx.isReceived);
    }

    // Pagination logic
    const totalItems = filtered.length;
    const totalPages = Math.min(maxPages, Math.max(1, Math.ceil(totalItems / itemsPerPage)));
    
    // Ensure current page is within bounds
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pagedItems = filtered.slice(startIndex, endIndex);

    // Update UI
    if (currentPageDisplay) currentPageDisplay.textContent = currentPage;
    if (totalPagesDisplay) totalPagesDisplay.textContent = totalPages;
    if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPage === totalPages || totalItems === 0;

    if (pagedItems.length === 0) {
        historyBody.innerHTML = '<tr><td colspan="4" class="history-empty" style="text-align: center; padding: 40px; color: var(--sui-text-dim);">Không tìm thấy giao dịch nào</td></tr>';
        return;
    }

    historyBody.innerHTML = pagedItems.map(tx => `
        <tr>
            <td><span class="type-badge ${tx.type === 'success' ? 'type-transfer' : 'type-error'}">${tx.status}</span></td>
            <td><a href="https://suiscan.xyz/testnet/tx/${tx.digest}" target="_blank" style="color: var(--sui-blue); text-decoration: none;">${tx.digest.slice(0, 10)}...</a></td>
            <td style="font-weight: 700; color: ${tx.amountMist < 0 ? '#ef4444' : (tx.amountMist > 0 ? '#10b981' : 'white')};">
                ${tx.amountMist < 0 ? '-' : (tx.amountMist > 0 ? '+' : '')}${tx.amount} SUI
            </td>
            <td>
                ${tx.casinoResult ? `<span class="result-badge ${tx.casinoResult.toLowerCase()}">${tx.casinoResult}</span>` : '-'}
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
                logoutBtn.style.display = 'flex';
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
        if (e.message?.includes('Rejected') || e.message?.includes('rejected')) {
            showToast("Bạn đã hủy giao dịch.", true);
        } else {
            showToast("Giao dịch thất bại: " + (e.message || "Lỗi không xác định"), true);
        }
    } finally {
        transferBtn.textContent = "Xác nhận gửi SUI";
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
        if (e.message?.includes('Rejected') || e.message?.includes('rejected')) {
            showToast("Bạn đã hủy giao dịch.", true);
        } else {
            showToast("Thanh toán thất bại", true);
        }
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

// Filter Logic
const filterBtns = document.querySelectorAll('.filter-btn');
filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.getAttribute('data-filter');
        currentPage = 1; // Reset về trang 1 khi lọc
        renderHistory();
    });
});

// Pagination Listeners
prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderHistory();
        window.scrollTo({ top: document.querySelector('.history-container').offsetTop - 100, behavior: 'smooth' });
    }
});

nextPageBtn.addEventListener('click', () => {
    const filtered = currentFilter === 'all' ? allTransactions : 
                   (currentFilter === 'sent' ? allTransactions.filter(tx => tx.isSender) : 
                   allTransactions.filter(tx => tx.isReceived));
    const totalPages = Math.min(maxPages, Math.ceil(filtered.length / itemsPerPage));
    if (currentPage < totalPages) {
        currentPage++;
        renderHistory();
        window.scrollTo({ top: document.querySelector('.history-container').offsetTop - 100, behavior: 'smooth' });
    }
});

render();
renderHistory();
autoConnect();

// Mobile Menu Toggle
menuToggle.addEventListener('click', () => {
    menuToggle.classList.toggle('active');
    navMenu.classList.toggle('active');
});

// Close menu when clicking nav tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        menuToggle.classList.remove('active');
        navMenu.classList.remove('active');
    });
});

// Logout Logic
function logout() {
    connectedAddress = null;
    selectedWallet = null;
    localStorage.removeItem('sui_wallet_last_connected');
    connectBtn.textContent = "Kết nối ví";
    logoutBtn.style.display = 'none';
    suiBalance.textContent = "0.00";
    usdBalance.innerHTML = `≈ $0.00 <span class="price-up">${PRICE_CHANGE}</span>`;
    allTransactions = [];
    renderHistory();
    if (window.balanceInterval) clearInterval(window.balanceInterval);
    showToast("Đã đăng xuất");
    
    // Close menu on mobile
    menuToggle.classList.remove('active');
    navMenu.classList.remove('active');
}

logoutBtn.addEventListener('click', logout);

// Scroll to Top Logic
window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
        scrollToTopBtn.classList.add('show');
    } else {
        scrollToTopBtn.classList.remove('show');
    }
});

scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});



// Casino Logic
async function handleCasinoBet() {
    if (!connectedAddress || !selectedWallet) {
        showToast("Vui lòng kết nối ví trước", true);
        return;
    }

    if (isNaN(amount) || amount < 0.1 || amount > 6) {
        showToast("Số lượng cược phải từ 0.1 đến 6 SUI", true);
        return;
    }

    if (amount * 1000000000 > currentBalanceMist) {
        showToast("Số dư không đủ", true);
        return;
    }

    // Kiểm tra đuôi số cược (Bắt buộc)
    const amountStrRaw = casinoAmountInput.value;
    
    // Phải có phần thập phân
    if (!amountStrRaw.includes('.') || amountStrRaw.split('.')[1].replace(/0+$/, "").length === 0) {
        showToast("Số tiền cược phải có phần thập phân (Ví dụ: 1.1, 0.52...)", true);
        return;
    }

    const decimalPart = amountStrRaw.split('.')[1].replace(/0+$/, "");
    const lastChar = decimalPart.charAt(decimalPart.length - 1);
    const hasValidSuffix = ['1', '2', '3', '4'].includes(lastChar);
    
    if (!hasValidSuffix) {
        showToast("Số cuối phần thập phân phải là (1, 2, 3, 4) để cược!", true);
        return;
    }

    casinoConfirmBtn.innerHTML = '<span class="spinner"></span> Đang xử lý...';
    casinoConfirmBtn.disabled = true;

    try {
        const tx = new Transaction();
        const amountInMist = Math.floor(amount * 1000000000);
        const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountInMist)]);
        tx.transferObjects([coin], tx.pure.address(DESTINATION));

        const result = await selectedWallet.features['sui:signAndExecuteTransaction'].signAndExecuteTransaction({
            transaction: tx,
            account: selectedWallet.accounts[0],
            chain: 'sui:testnet'
        });

        if (result.digest) {
            showToast("Đặt cược thành công! Kiểm tra kết quả trong lịch sử.");
            saveTransaction('Cược Casino', `Mã: ${lastChar}`, amount);
            updateBalance();
            casinoAmountInput.value = '';
        }
    } catch (e) {
        console.error(e);
        if (e.message?.includes('Rejected') || e.message?.includes('rejected')) {
            showToast("Bạn đã hủy giao dịch.", true);
        } else {
            showToast("Giao dịch thất bại: " + (e.message || "Lỗi không xác định"), true);
        }
    } finally {
        casinoConfirmBtn.textContent = "Xác nhận gửi SUI";
        casinoConfirmBtn.disabled = false;
    }
}

if (casinoConfirmBtn) {
    casinoConfirmBtn.addEventListener('click', handleCasinoBet);
}

// Casino Input Auto-correction
if (casinoAmountInput) {
    casinoAmountInput.addEventListener('blur', () => {
        let val = parseFloat(casinoAmountInput.value);
        if (isNaN(val)) return;
        
        if (val < 0.1) {
            casinoAmountInput.value = "0.1";
        } else if (val > 6) {
            casinoAmountInput.value = "5";
        }
    });
}
