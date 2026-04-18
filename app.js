const ASSETS = [
    { symbol: 'BTCUSDT', name: 'Bitcoin', base: 'btc' },
    { symbol: 'ETHUSDT', name: 'Ethereum', base: 'eth' },
    { symbol: 'BNBUSDT', name: 'BNB', base: 'bnb' },
    { symbol: 'SOLUSDT', name: 'Solana', base: 'sol' },
    { symbol: 'XRPUSDT', name: 'XRP', base: 'xrp' },
    { symbol: 'ADAUSDT', name: 'Cardano', base: 'ada' },
    { symbol: 'DOGEUSDT', name: 'Dogecoin', base: 'doge' },
    { symbol: 'AVAXUSDT', name: 'Avalanche', base: 'avax' },
    { symbol: 'LINKUSDT', name: 'Chainlink', base: 'link' },
    { symbol: 'DOTUSDT', name: 'Polkadot', base: 'dot' },
    { symbol: 'LTCUSDT', name: 'Litecoin', base: 'ltc' },
    { symbol: 'BCHUSDT', name: 'Bitcoin Cash', base: 'bch' },
];

const MOCK_WALLET = [
    { symbol: 'BTCUSDT', amount: 0.15, avgPrice: 60000 },
    { symbol: 'ETHUSDT', amount: 3.5, avgPrice: 3000 },
    { symbol: 'SOLUSDT', amount: 45, avgPrice: 130 },
];

let cryptoDataMap = new Map(); // symbol -> data

// Safe local storage
let openRouterApiKey = '';
try {
    openRouterApiKey = localStorage.getItem('openrouter_key') || '';
} catch (e) {
    console.warn("LocalStorage access denied");
}

let isWsConnected = false;
let wsConnection = null;
let analyticsChart = null;

// DOM Elements
const grid = document.getElementById('crypto-grid');
const cardTemplate = document.getElementById('crypto-card-template');
const walletTemplate = document.getElementById('wallet-asset-template');
const statusIndicator = document.querySelector('.status-indicator');
const apiKeyBtn = document.getElementById('toggle-api-key');
const apiKeySection = document.getElementById('api-key-section');
const apiKeyInput = document.getElementById('openrouter-api-key');
const saveKeyBtn = document.getElementById('save-key-btn');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatHistory = document.getElementById('chat-history');

// Navigation Elements
const navLinks = document.querySelectorAll('.nav-link');
const viewSections = document.querySelectorAll('.view-section');
const pageTitle = document.getElementById('page-title');

// Init Dashboard (only runs AFTER successful auth)
async function initDashboard() {
    setupUI();
    setupNavigation();
    await fetchInitialData();
    connectWebSocket();

    // Inject Profile Info
    try {
        const activeEmail = localStorage.getItem('active_user');
        if (activeEmail) {
            const users = JSON.parse(localStorage.getItem('users_db') || '{}');
            if (users[activeEmail]) {
                document.getElementById('display-name').textContent = users[activeEmail].name;
                document.getElementById('setting-name').value = users[activeEmail].name;
                document.getElementById('setting-email').value = users[activeEmail].email;
            }
        }
    } catch (e) { console.error("Could not load profile", e); }
}

// Auth Boot Sequence
function bootApp() {
    // Auth UI State toggles
    document.getElementById('btn-goto-login').addEventListener('click', () => {
        document.getElementById('auth-choice-screen').classList.add('hidden');
        document.getElementById('auth-login-screen').classList.remove('hidden');
    });

    document.getElementById('btn-goto-register').addEventListener('click', () => {
        document.getElementById('auth-choice-screen').classList.add('hidden');
        document.getElementById('auth-register-screen').classList.remove('hidden');
    });

    document.querySelectorAll('.auth-back').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('auth-login-screen').classList.add('hidden');
            document.getElementById('auth-register-screen').classList.add('hidden');
            document.getElementById('auth-choice-screen').classList.remove('hidden');
        });
    });

    // Handle Login
    document.getElementById('btn-submit-login').addEventListener('click', () => {
        const email = document.getElementById('login-email').value.trim();
        const pass = document.getElementById('login-password').value;
        const errEl = document.getElementById('login-error');

        try {
            const users = JSON.parse(localStorage.getItem('users_db') || '{}');
            if (users[email] && users[email].password === pass) {
                // Success
                localStorage.setItem('active_user', email);
                enterDashboard();
            } else {
                errEl.textContent = 'Invalid email or password.';
                errEl.classList.remove('hidden');
            }
        } catch (e) {
            errEl.textContent = 'System error accessing DB.';
            errEl.classList.remove('hidden');
        }
    });

    // Handle Registration
    document.getElementById('btn-submit-register').addEventListener('click', () => {
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const pass = document.getElementById('reg-password').value;
        const errEl = document.getElementById('reg-error');

        if (!name || !email || !pass) {
            errEl.textContent = 'Please fill all fields.';
            errEl.classList.remove('hidden');
            return;
        }

        try {
            const users = JSON.parse(localStorage.getItem('users_db') || '{}');
            if (users[email]) {
                errEl.textContent = 'User already exists! Please login.';
                errEl.classList.remove('hidden');
            } else {
                users[email] = { name, email, password: pass };
                localStorage.setItem('users_db', JSON.stringify(users));
                localStorage.setItem('active_user', email);
                enterDashboard();
            }
        } catch (e) {
            errEl.textContent = 'System error writing to DB.';
            errEl.classList.remove('hidden');
        }
    });
}

function enterDashboard() {
    // Hide auth sequence
    document.getElementById('auth-portal').classList.add('hidden');
    // Show main app
    document.getElementById('app-container').classList.remove('hidden');

    // Boot internal logic
    initDashboard();
}

window.addEventListener('DOMContentLoaded', bootApp);

function setupNavigation() {
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();

            navLinks.forEach(l => l.classList.remove('active'));
            viewSections.forEach(v => {
                v.classList.remove('active');
                v.classList.add('hidden');
            });

            link.classList.add('active');

            const titleMap = {
                'view-dashboard': 'Market Overview',
                'view-analytics': 'Analytics',
                'view-wallet': 'My Wallet',
                'view-settings': 'Settings'
            };
            const targetId = link.getAttribute('data-target');
            pageTitle.textContent = titleMap[targetId] || 'NeonCrypto';

            const targetView = document.getElementById(targetId);
            if (targetView) {
                targetView.classList.remove('hidden');
                targetView.classList.add('active');
            }

            // Special cases on view open
            if (targetId === 'view-analytics' && !analyticsChart) {
                initChart();
            }
        });
    });
}

function setupUI() {
    if (openRouterApiKey) {
        apiKeyInput.value = openRouterApiKey;
        enableChat();
    }

    apiKeyBtn.addEventListener('click', () => {
        apiKeySection.classList.toggle('hidden');
    });

    saveKeyBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            openRouterApiKey = key;
            try {
                localStorage.setItem('openrouter_key', key);
            } catch (e) {
                console.warn("Could not save to LocalStorage");
            }
            apiKeySection.classList.add('hidden');
            enableChat();
            addMessage('System', 'API Key saved! You can now chat with me about the market.');
        } else {
            addMessage('System', 'Please enter a valid OpenRouter API Key.');
        }
    });

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleChatSubmit();
    });
    sendBtn.addEventListener('click', handleChatSubmit);

    // Settings logic
    document.getElementById('save-profile-btn').addEventListener('click', () => {
        const btn = document.getElementById('save-profile-btn');
        const name = document.getElementById('setting-name').value;
        if (name) {
            document.getElementById('display-name').textContent = name;
        }
        btn.textContent = 'Saved Perfectly!';
        btn.style.background = 'var(--accent-green)';
        setTimeout(() => {
            btn.textContent = 'Save Changes';
            btn.style.background = 'var(--accent-neon)';
        }, 2000);
    });

    // Toggle AI Popup
    const aiToggleBtn = document.getElementById('toggle-ai-popup');
    if (aiToggleBtn) {
        aiToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelector('.ai-sidebar').classList.toggle('active-popup');
        });
    }
}

function enableChat() {
    chatInput.disabled = false;
    sendBtn.disabled = false;
}

// Fetch Data
async function fetchInitialData() {
    try {
        const symbolsStr = JSON.stringify(ASSETS.map(a => a.symbol));
        // Using Binance REST API because CoinCap is blocked on some networks
        const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${symbolsStr}`);
        const result = await response.json();

        grid.innerHTML = ''; // Clear skeleton

        if (Array.isArray(result)) {
            result.forEach(coin => {
                const assetInfo = ASSETS.find(a => a.symbol === coin.symbol);
                if (assetInfo) {
                    const data = {
                        id: coin.symbol,
                        name: assetInfo.name,
                        symbol: assetInfo.base.toUpperCase(),
                        rank: ASSETS.indexOf(assetInfo) + 1,
                        priceUsd: parseFloat(coin.lastPrice),
                        changePercent24Hr: parseFloat(coin.priceChangePercent),
                        base: assetInfo.base
                    };
                    cryptoDataMap.set(coin.symbol, data);
                    renderCard(data);
                }
            });

            // Initial render of wallet and chart if needed
            renderWallet();
        }
    } catch (err) {
        console.error("Failed to fetch initial data from Binance", err);
        grid.innerHTML = '<p class="error" style="color:red; padding: 20px;">Failed to load cryptocurrency data. Your network might be blocking the API.</p>';
    }
}

// Chart.js Logic
function initChart() {
    const ctx = document.getElementById('cryptoChart');
    if (!ctx) return;

    const labels = [];
    const dataPoints = [];

    cryptoDataMap.forEach((coin) => {
        labels.push(coin.name);
        dataPoints.push(coin.changePercent24Hr);
    });

    analyticsChart = new Chart(document.getElementById('cryptoChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '24h Change (%)',
                data: dataPoints,
                backgroundColor: dataPoints.map(val => val >= 0 ? 'rgba(0, 255, 136, 0.8)' : 'rgba(255, 51, 102, 0.8)'),
                borderColor: dataPoints.map(val => val >= 0 ? '#00ff88' : '#ff3366'),
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y', // Horizontal bars are much better for reading asset names
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#888' }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#f0f0f0', font: { size: 14 } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    padding: 12,
                    borderColor: 'rgba(255,255,255,0.2)',
                    borderWidth: 1
                }
            }
        }
    });
}

function updateChart() {
    if (!analyticsChart) return;
    const dataPoints = [];
    cryptoDataMap.forEach((coin) => {
        dataPoints.push(coin.changePercent24Hr);
    });
    analyticsChart.data.datasets[0].data = dataPoints;
    analyticsChart.data.datasets[0].backgroundColor = dataPoints.map(val => val >= 0 ? 'rgba(0, 255, 136, 0.6)' : 'rgba(255, 51, 102, 0.6)');
    analyticsChart.data.datasets[0].borderColor = dataPoints.map(val => val >= 0 ? '#00ff88' : '#ff3366');
    analyticsChart.update('none'); // Use 'none' to skip heavy animations on rapidly streaming data
}

// Wallet Rendering Logic
function renderWallet() {
    const walletList = document.getElementById('wallet-assets-list');
    const totalEl = document.getElementById('wallet-total-balance');
    const pnlEl = document.getElementById('wallet-total-pnl');

    if (!walletList) return;

    let totalValue = 0;
    let totalCost = 0;
    walletList.innerHTML = '';

    MOCK_WALLET.forEach(holding => {
        const coin = cryptoDataMap.get(holding.symbol);
        if (!coin) return;

        const currentValue = holding.amount * coin.priceUsd;
        const costValue = holding.amount * holding.avgPrice;

        totalValue += currentValue;
        totalCost += costValue;

        const clone = walletTemplate.content.cloneNode(true);
        const iconUrl = `https://assets.coincap.io/assets/icons/${coin.base}@2x.png`;

        const iconImg = clone.querySelector('.wallet-crypto-icon');
        iconImg.src = iconUrl;
        iconImg.onerror = () => { iconImg.src = `https://api.dicebear.com/7.x/initials/svg?seed=${coin.symbol}&backgroundColor=000000`; };

        clone.querySelector('.wallet-crypto-name').textContent = coin.name;
        clone.querySelector('.wallet-crypto-amount').textContent = `${holding.amount} ${coin.symbol}`;

        clone.querySelector('.wallet-fiat-value').textContent = formatPrice(currentValue);

        const profitLoss = currentValue - costValue;
        const pnlPercent = (profitLoss / costValue) * 100;

        const pnlNode = clone.querySelector('.wallet-asset-pnl');
        pnlNode.textContent = `${profitLoss >= 0 ? '+' : ''}${formatPrice(profitLoss)} (${pnlPercent.toFixed(2)}%)`;
        pnlNode.className = `wallet-asset-pnl ${profitLoss >= 0 ? 'change-up' : 'change-down'}`;

        walletList.appendChild(clone);
    });

    // Update Hero
    totalEl.textContent = formatPrice(totalValue);

    const overallPnl = totalValue - totalCost;
    const overallPnlPercent = totalCost > 0 ? (overallPnl / totalCost) * 100 : 0;

    pnlEl.textContent = `${overallPnl >= 0 ? '+' : ''}${formatPrice(overallPnl)} (${overallPnlPercent.toFixed(2)}%)`;
    pnlEl.className = `wallet-pnl ${overallPnl >= 0 ? 'change-up' : 'change-down'}`;
}

// Dashboard Render Logic
function renderCard(coin) {
    const clone = cardTemplate.content.cloneNode(true);
    const card = clone.querySelector('.crypto-card');
    card.id = `card-${coin.id}`;

    const iconUrl = `https://assets.coincap.io/assets/icons/${coin.base}@2x.png`;

    const iconImg = clone.querySelector('.crypto-icon');
    iconImg.src = iconUrl;
    iconImg.onerror = () => { iconImg.src = `https://api.dicebear.com/7.x/initials/svg?seed=${coin.symbol}&backgroundColor=000000`; };

    clone.querySelector('.crypto-name').textContent = coin.name;
    clone.querySelector('.crypto-symbol').textContent = coin.symbol;
    clone.querySelector('.crypto-rank').textContent = `#${coin.rank}`;

    const priceEl = clone.querySelector('.crypto-price');
    priceEl.textContent = formatPrice(coin.priceUsd);

    const changeEl = clone.querySelector('.crypto-change');
    const change = parseFloat(coin.changePercent24Hr);
    changeEl.innerHTML = `${change >= 0 ? '<i class="ph ph-trend-up"></i>' : '<i class="ph ph-trend-down"></i>'} ${Math.abs(change).toFixed(2)}%`;
    changeEl.className = `crypto-change ${change >= 0 ? 'change-up' : 'change-down'}`;

    grid.appendChild(clone);
}

function updateCardPrice(id, newPrice, newPercent) {
    const card = document.getElementById(`card-${id}`);
    if (!card) return;

    const priceEl = card.querySelector('.crypto-price');
    const oldPrice = cryptoDataMap.get(id).priceUsd;

    if (parseFloat(newPrice) !== parseFloat(oldPrice)) {
        const formattedNewPrice = formatPrice(newPrice);

        priceEl.classList.remove('price-up', 'price-down');
        void priceEl.offsetWidth;

        if (parseFloat(newPrice) > parseFloat(oldPrice)) {
            priceEl.classList.add('price-up');
        } else {
            priceEl.classList.add('price-down');
        }

        priceEl.textContent = formattedNewPrice;

        // update map
        const data = cryptoDataMap.get(id);
        data.priceUsd = newPrice;

        // Catch percent update from websocket and inject
        if (newPercent !== undefined) {
            data.changePercent24Hr = parseFloat(newPercent);
            const changeEl = card.querySelector('.crypto-change');
            changeEl.innerHTML = `${data.changePercent24Hr >= 0 ? '<i class="ph ph-trend-up"></i>' : '<i class="ph ph-trend-down"></i>'} ${Math.abs(data.changePercent24Hr).toFixed(2)}%`;
            changeEl.className = `crypto-change ${data.changePercent24Hr >= 0 ? 'change-up' : 'change-down'}`;
        }

        cryptoDataMap.set(id, data);

        // Update wallet table and chart live when prices tick
        renderWallet();
        if (analyticsChart) {
            updateChart();
        }
    }
}

// WebSocket 
function connectWebSocket() {
    if (cryptoDataMap.size === 0) return;

    if (wsConnection) {
        wsConnection.close();
    }

    // Binance stream for multiple symbols
    const streams = ASSETS.map(a => `${a.symbol.toLowerCase()}@ticker`).join('/');
    const wsUrl = `wss://stream.binance.com:9443/ws/${streams}`;

    wsConnection = new WebSocket(wsUrl);

    wsConnection.onopen = () => {
        isWsConnected = true;
        statusIndicator.className = 'status-indicator online';
    };

    wsConnection.onmessage = (event) => {
        const data = JSON.parse(event.data);
        // data.s = symbol, data.c = current close price, data.P = percent change string
        if (data.s && data.c) {
            updateCardPrice(data.s, data.c, data.P);
        }
    };

    wsConnection.onclose = () => {
        isWsConnected = false;
        statusIndicator.className = 'status-indicator';
        setTimeout(connectWebSocket, 5000); // Reconnect
    };

    wsConnection.onerror = (err) => {
        console.error('WebSocket Error:', err);
    };
}

let chatContextHistory = []; // Stores the conversational memory

// OpenRouter Chat Logic
async function handleChatSubmit() {
    const text = chatInput.value.trim();
    if (!text || !openRouterApiKey) return;

    chatInput.value = '';
    addMessage('User', text);

    // Add new user message to the memory array
    chatContextHistory.push({ role: "user", content: text });

    const loadingId = addTypingIndicator();

    // Construct dynamic market context
    let marketContext = "Current Top Crypto Prices:\n";
    let count = 0;
    cryptoDataMap.forEach((coin, id) => {
        if (count < 10) {
            marketContext += `${coin.name} (${coin.symbol}): $${parseFloat(coin.priceUsd).toFixed(2)}, 24h: ${parseFloat(coin.changePercent24Hr).toFixed(2)}%\n`;
        }
        count++;
    });

    const systemMessage = {
        role: "system",
        content: `You are a slick, expert crypto market analyst AI embedded in a dashboard. You act like a real person. 
Here is the real-time market data to base your answers on:
${marketContext}
Keep responses concise (under 100 words), direct, and conversational.`
    };

    // Combine system instructions with the full ongoing conversation history
    const payloadMessages = [systemMessage, ...chatContextHistory];

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openRouterApiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "openrouter/free",
                messages: payloadMessages
            })
        });

        const data = await response.json();
        removeTypingIndicator(loadingId);

        if (data.error) {
            console.error("OpenRouter Error Info:", data.error);
            addMessage('System', `API Error: ${data.error.message || JSON.stringify(data.error)}`);
            // Remove the failed user prompt from memory
            chatContextHistory.pop();
            return;
        }

        if (data.choices && data.choices.length > 0) {
            const aiResponseText = data.choices[0].message.content;
            // Add AI response to memory
            chatContextHistory.push({ role: "assistant", content: aiResponseText });
            addMessage('AI', aiResponseText);
        } else {
            console.error("OpenRouter Response Error", data);
            addMessage('System', 'Error: Received empty response from OpenRouter.');
        }

    } catch (err) {
        removeTypingIndicator(loadingId);
        console.error(err);
        addMessage('System', `Network Error connecting to AI: ${err.message}`);
        // Remove the failed user prompt from memory
        chatContextHistory.pop();
    }
}

function addMessage(sender, text) {
    const el = document.createElement('div');
    el.className = `chat-message ${sender === 'User' ? 'user-message' : sender === 'AI' ? 'ai-message' : ''}`;

    let formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formattedText = formattedText.replace(/\n/g, '<br/>');

    el.innerHTML = formattedText;
    chatHistory.appendChild(el);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function addTypingIndicator() {
    const id = 'typing-' + Date.now();
    const el = document.createElement('div');
    el.id = id;
    el.className = 'chat-message ai-message typing-dots';
    el.innerHTML = '<span></span><span></span><span></span>';
    chatHistory.appendChild(el);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return id;
}

function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) {
        el.remove();
    }
}

function formatPrice(val) {
    const num = parseFloat(val);
    if (num >= 1000) {
        return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else if (num >= 1) {
        return '$' + num.toFixed(3);
    } else {
        return '$' + num.toFixed(5);
    }
}

window.addEventListener('DOMContentLoaded', init);
