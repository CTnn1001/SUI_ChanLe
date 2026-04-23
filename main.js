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

const leaderboardBody = document.getElementById('leaderboardBody');
const leaderboardLoading = document.getElementById('leaderboardLoading');
const winTicker = document.getElementById('winTicker');
const userLevelBadge = document.getElementById('userLevel');

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

        updateUserLevel();
        renderHistory();
    } catch (e) {
        console.error("Lỗi khi tải lịch sử giao dịch:", e);
    }
}


function updateUserLevel() {
    if (!connectedAddress) return;

    const casinoBets = allTransactions.filter(tx => tx.isSender && tx.casinoResult);
    
    // Tính tổng số tiền đã cược để tính Level
    const totalWageredMist = casinoBets.reduce((sum, tx) => sum + Math.abs(tx.amountMist), 0);
    const totalWageredSui = totalWageredMist / 1e9;

    // Tính Level
    let level = 'Đồng';
    let levelClass = 'level-bronze';
    
    if (totalWageredSui >= 200) {
        level = 'Kim Cương';
        levelClass = 'level-diamond';
    } else if (totalWageredSui >= 50) {
        level = 'Vàng';
        levelClass = 'level-gold';
    } else if (totalWageredSui >= 10) {
        level = 'Bạc';
        levelClass = 'level-silver';
    }

    if (userLevelBadge) {
        userLevelBadge.textContent = level;
        userLevelBadge.className = `level-badge ${levelClass}`;
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

function setActiveTab(target) {
    tabBtns.forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === target);
    });
    sections.forEach(s => {
        s.classList.toggle('active', s.id === `${target}-section`);
    });
    localStorage.setItem('active_tab', target);
    
    if (target === 'leaderboard') {
        fetchLeaderboard();
    }
}

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        setActiveTab(target);
    });
});

// Load saved tab on startup
const savedTab = localStorage.getItem('active_tab');
if (savedTab) {
    setActiveTab(savedTab);
}

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

    const amount = parseFloat(casinoAmountInput.value);

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

// Logic cho bảng thông báo mới
document.addEventListener('DOMContentLoaded', () => {
    const noticeModal = document.getElementById('noticeModal');
    const closeNotice = document.getElementById('closeNotice');
    const closeToday = document.getElementById('closeToday');

    // Kiểm tra xem đã đóng trong hôm nay chưa
    const closedDate = localStorage.getItem('notice_closed_date');
    const today = new Date().toDateString();

    if (closedDate !== today) {
        // Hiện bảng sau 500ms để người dùng thấy mượt mà
        setTimeout(() => {
            if (noticeModal) {
                noticeModal.style.display = 'flex';
                noticeModal.classList.add('active');
            }
        }, 500);
    }

    // Đóng bình thường
    closeNotice?.addEventListener('click', () => {
        noticeModal.style.display = 'none';
    });

    // Đóng trong hôm nay
    closeToday?.addEventListener('click', () => {
        localStorage.setItem('notice_closed_date', today);
        noticeModal.style.display = 'none';
    });
});

// Kiểm giao dịch logic
const checkTxBtn = document.getElementById('checkTxBtn');
const checkTxDigestInput = document.getElementById('checkTxDigest');
const checkTxResultDiv = document.getElementById('checkTxResult');
const checkResultText = document.getElementById('checkResultText');

async function handleCheckTransaction() {
    const digest = checkTxDigestInput.value.trim();
    if (!digest) {
        showToast("Vui lòng nhập mã giao dịch (Digest)", true);
        return;
    }

    checkTxBtn.disabled = true;
    checkTxBtn.innerHTML = '<span class="spinner"></span> Đang kiểm tra...';
    checkTxResultDiv.style.display = 'none';

    try {
        // 1. Fetch transaction details
        const tx = await client.getTransactionBlock({
            digest: digest,
            options: {
                showBalanceChanges: true,
                showEffects: true,
                showInput: true
            }
        });

        if (!tx) throw new Error("Giao dịch không tồn tại");

        const sender = tx.transaction.data.sender;
        const recipientChange = tx.balanceChanges?.find(bc => 
            (bc.owner.AddressOwner === DESTINATION || bc.owner === DESTINATION) && 
            (bc.coinType === '0x2::sui::SUI' || bc.coinType.endsWith('SUI'))
        );

        // Kiểm tra xem có gửi đến nhà cái không
        if (!recipientChange || parseInt(recipientChange.amount) <= 0) {
            setCheckResult("Giao dịch không tồn tại", "result-not-found");
            return;
        }

        const amountMist = parseInt(recipientChange.amount);
        const rawAmountStr = (amountMist / 1000000000).toString();
        
        // Tính toán xem có phải là cược thắng không
        let isWin = false;
        let ratio = 0;
        let lastDigit = null;
        
        const digits = digest.match(/\d/g);
        if (digits) {
            lastDigit = parseInt(digits[digits.length - 1]);
        }

        if (lastDigit !== null && rawAmountStr.includes('.')) {
            const decimalPart = rawAmountStr.split('.')[1].replace(/0+$/, "");
            if (decimalPart.length > 0) {
                const lastAmountDigit = decimalPart.charAt(decimalPart.length - 1);
                if (lastAmountDigit === '1' && [1, 3, 5, 7].includes(lastDigit)) { isWin = true; ratio = 2.4; }
                else if (lastAmountDigit === '2' && [2, 4, 6, 8].includes(lastDigit)) { isWin = true; ratio = 2.4; }
                else if (lastAmountDigit === '4' && [5, 6, 7, 8].includes(lastDigit)) { isWin = true; ratio = 2.2; }
                else if (lastAmountDigit === '3' && [1, 2, 3, 4].includes(lastDigit)) { isWin = true; ratio = 2.2; }
            }
        }

        if (!isWin) {
            setCheckResult("Bạn đã thua", "result-not-found");
            return;
        }

        // 2. Nếu thắng, tìm giao dịch trả thưởng từ nhà cái -> người gửi
        // Ta tìm các giao dịch mà nhà cái gửi đi sau thời điểm này
        const payouts = await client.queryTransactionBlocks({
            filter: { FromAddress: DESTINATION },
            options: { showBalanceChanges: true, showEffects: true },
            limit: 50,
            descendingOrder: true
        });

        const expectedRewardMist = Math.floor(amountMist * ratio);
        
        // Tìm payout phù hợp (gửi đến sender, số lượng khớp, timestamp sau bet)
        const payoutFound = payouts.data.find(ptx => {
            const toSender = ptx.balanceChanges?.find(bc => 
                bc.owner.AddressOwner === sender && 
                parseInt(bc.amount) >= expectedRewardMist * 0.99 // Cho phép sai số nhỏ do gas hoặc tính toán
            );
            const isAfter = parseInt(ptx.timestampMs || 0) >= parseInt(tx.timestampMs || 0);
            return toSender && isAfter;
        });

        if (payoutFound) {
            setCheckResult("Giao dịch đã trả thưởng", "result-success");
        } else {
            setCheckResult("Giao dịch bị lỗi (Chưa trả thưởng)", "result-error");
        }

    } catch (e) {
        console.error(e);
        setCheckResult("Giao dịch không tồn tại", "result-not-found");
    } finally {
        checkTxBtn.disabled = false;
        checkTxBtn.textContent = "Xác nhận";
    }
}

function setCheckResult(text, className) {
    checkResultText.textContent = text;
    checkResultText.className = className;
    checkTxResultDiv.style.display = 'block';
}

if (checkTxBtn) {
    checkTxBtn.addEventListener('click', handleCheckTransaction);
}

// Leaderboard Logic
async function fetchLeaderboard() {
    if (!leaderboardBody) return;
    
    leaderboardLoading.style.display = 'block';
    leaderboardBody.innerHTML = '';
    
    try {
        // Fetch recent transactions to the house
        const txs = await client.queryTransactionBlocks({
            filter: { ToAddress: DESTINATION },
            options: { showBalanceChanges: true, showInput: true, showEffects: true },
            limit: 100,
            descendingOrder: true
        });

        const stats = {};

        txs.data.forEach(tx => {
            if (tx.effects.status.status !== 'success') return;

            const sender = tx.transaction.data.sender;
            const digest = tx.digest;
            
            // Tìm sự thay đổi số dư của nhà cái (số dương là tiền nhận được)
            const houseChange = tx.balanceChanges.find(bc => 
                (bc.owner.AddressOwner === DESTINATION || bc.owner === DESTINATION) && 
                (bc.coinType === '0x2::sui::SUI' || bc.coinType.endsWith('SUI'))
            );
            
            if (!houseChange || parseInt(houseChange.amount) <= 0) return;

            const amountMist = parseInt(houseChange.amount);
            const rawAmountStr = (amountMist / 1000000000).toString();
            
            // Logic cược:
            if (!rawAmountStr.includes('.')) return;
            const decimalPart = rawAmountStr.split('.')[1].replace(/0+$/, "");
            if (decimalPart.length === 0) return;
            
            const lastAmountDigit = decimalPart.charAt(decimalPart.length - 1);
            const digits = digest.match(/\d/g);
            if (!digits) return;
            const lastDigit = parseInt(digits[digits.length - 1]);

            if (!stats[sender]) {
                stats[sender] = { address: sender, wins: 0, losses: 0, profitMist: 0 };
            }

            let isWin = false;
            let ratio = 0;

            if (lastAmountDigit === '1' && [1, 3, 5, 7].includes(lastDigit)) { isWin = true; ratio = 2.4; }
            else if (lastAmountDigit === '2' && [2, 4, 6, 8].includes(lastDigit)) { isWin = true; ratio = 2.4; }
            else if (lastAmountDigit === '4' && [5, 6, 7, 8].includes(lastDigit)) { isWin = true; ratio = 2.2; }
            else if (lastAmountDigit === '3' && [1, 2, 3, 4].includes(lastDigit)) { isWin = true; ratio = 2.2; }

            if (isWin) {
                stats[sender].wins++;
                stats[sender].profitMist += Math.floor(amountMist * (ratio - 1));
            } else {
                stats[sender].losses++;
                stats[sender].profitMist -= amountMist;
            }
        });

        // Convert to array and sort by profit
        const leaderboardData = Object.values(stats)
            .sort((a, b) => b.profitMist - a.profitMist)
            .slice(0, 10); // Top 10

        if (leaderboardData.length === 0) {
            leaderboardBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--sui-text-dim);">Chưa có dữ liệu người chơi</td></tr>';
        } else {
            leaderboardBody.innerHTML = leaderboardData.map((user, index) => `
                <tr>
                    <td>
                        <div class="rank-badge ${index < 3 ? 'rank-' + (index + 1) : ''}">${index + 1}</div>
                    </td>
                    <td style="font-family: monospace; font-size: 13px;">
                        ${user.address.slice(0, 10)}...${user.address.slice(-6)}
                    </td>
                    <td style="text-align: center; color: #10b981; font-weight: 800;">${user.wins}</td>
                    <td style="text-align: center; color: #ef4444; font-weight: 800;">${user.losses}</td>
                    <td style="text-align: right; font-weight: 900; color: ${user.profitMist >= 0 ? '#10b981' : '#ef4444'};">
                        ${user.profitMist >= 0 ? '+' : ''}${(user.profitMist / 1e9).toFixed(2)} SUI
                    </td>
                </tr>
            `).join('');
        }
    } catch (e) {
        console.error("Lỗi khi tải bảng xếp hạng:", e);
        leaderboardBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #ef4444;">Lỗi khi tải dữ liệu từ Blockchain</td></tr>';
    } finally {
        leaderboardLoading.style.display = 'none';
    }
}

// Live Win Feed Logic
async function updateLiveWinFeed() {
    if (!winTicker) return;

    try {
        const txs = await client.queryTransactionBlocks({
            filter: { ToAddress: DESTINATION },
            options: { showBalanceChanges: true, showInput: true },
            limit: 20,
            descendingOrder: true
        });

        const wins = [];
        txs.data.forEach(tx => {
            const digest = tx.digest;
            const sender = tx.transaction.data.sender;
            const houseChange = tx.balanceChanges.find(bc => 
                (bc.owner.AddressOwner === DESTINATION || bc.owner === DESTINATION) && 
                (bc.coinType === '0x2::sui::SUI' || bc.coinType.endsWith('SUI'))
            );
            
            if (!houseChange || parseInt(houseChange.amount) <= 0) return;

            const amountMist = parseInt(houseChange.amount);
            const rawAmountStr = (amountMist / 1000000000).toString();
            if (!rawAmountStr.includes('.')) return;
            
            const decimalPart = rawAmountStr.split('.')[1].replace(/0+$/, "");
            const lastAmountDigit = decimalPart.charAt(decimalPart.length - 1);
            const digits = digest.match(/\d/g);
            if (!digits) return;
            const lastDigit = parseInt(digits[digits.length - 1]);

            let isWin = false;
            let ratio = 0;
            if (lastAmountDigit === '1' && [1, 3, 5, 7].includes(lastDigit)) { isWin = true; ratio = 2.4; }
            else if (lastAmountDigit === '2' && [2, 4, 6, 8].includes(lastDigit)) { isWin = true; ratio = 2.4; }
            else if (lastAmountDigit === '4' && [5, 6, 7, 8].includes(lastDigit)) { isWin = true; ratio = 2.2; }
            else if (lastAmountDigit === '3' && [1, 2, 3, 4].includes(lastDigit)) { isWin = true; ratio = 2.2; }

            if (isWin) {
                wins.push({
                    addr: sender.slice(0, 6) + '...' + sender.slice(-4),
                    amount: (amountMist * ratio / 1e9).toFixed(2)
                });
            }
        });

        if (wins.length > 0) {
            // Nhân đôi danh sách để tạo hiệu ứng chạy vô tận mượt mà hơn
            const displayWins = [...wins, ...wins, ...wins];
            winTicker.innerHTML = displayWins.map(w => `
                <div class="ticker-item">
                    <span class="ticker-addr">${w.addr}</span>
                    <span class="ticker-label">thắng</span>
                    <span class="ticker-amount">${w.amount} SUI</span>
                    <span class="ticker-icon">🎉</span>
                </div>
            `).join('');
            
            // Điều chỉnh tốc độ animation dựa trên số lượng item
            winTicker.style.animationDuration = `${wins.length * 5}s`;
        }
    } catch (e) {
        console.error("Lỗi Live Win Feed:", e);
    }
}

// Khởi chạy Live Win Feed
updateLiveWinFeed();
setInterval(updateLiveWinFeed, 30000); // Cập nhật mỗi 30s

