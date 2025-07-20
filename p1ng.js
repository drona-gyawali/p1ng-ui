// Production configuration
const PRODUCTION_MODE = false;
const MAX_HISTORY_ITEMS = 5;

let isTestRunning = false;
let testResults = {};
let testHistory = JSON.parse(localStorage.getItem('speedTestHistory')) || [];

const intitialserver = "https://p1ng-lbgf.onrender.com/"
let API_BASE = ''; // Will be set dynamically from /select_server

// DOM elements
const startButton = document.getElementById('startButton');
const testStatus = document.getElementById('testStatus');
const resultsPanel = document.getElementById('resultsPanel');
const historyList = document.getElementById('historyList');

// Dynamically fetch server and set API_BASE
async function initializeServer() {
    try {
        const response = await fetch(`${intitialserver}select_server`, {
            method: 'POST',
            headers: { 'accept': 'application/json' }
        });

        if (!response.ok) throw new Error('Failed to fetch server info');

        const data = await response.json();
        const hostname = data.selected_server.hostname.trim(); // Remove trailing space
        const protocol = data.selected_server.protocols_supported.includes('https') ? 'https' : 'http';
        API_BASE = `${protocol}://${hostname}`;

        loadIPInfo();
        renderHistory();

    } catch (error) {
        console.error('Error initializing server:', error);
        API_BASE = 'http://127.0.0.1:8000'; // fallback
        loadIPInfo();
        renderHistory();
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    initializeServer();

    startButton.addEventListener('click', () => {
        if (!isTestRunning) {
            startTest();
        }
    });
});

// Optimized animation function using requestAnimationFrame
function animateValue(elementId, start, end, duration = 800, suffix = '') {
    const element = document.getElementById(elementId);
    const startTime = performance.now();

    const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = start + (end - start) * easeOut;

        element.textContent = Math.round(current * 10) / 10 + suffix;

        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    };

    requestAnimationFrame(animate);
}

// Fast progress ring animation
function updateProgressRing(ringId, progress) {
    const ring = document.getElementById(ringId);
    const progressBar = ring.querySelector('.progress-bar');
    const circumference = 2 * Math.PI * 70;
    const offset = circumference - (progress / 100) * circumference;
    progressBar.style.strokeDashoffset = offset;
}

// Load IP information with error handling
async function loadIPInfo() {
    try {
        const response = await fetch(`${API_BASE}/ip_details`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            const data = await response.json();
            displayIPInfo(data);
        } else {
            throw new Error('Failed to fetch IP details');
        }
    } catch (error) {
        document.getElementById('ipInfo').innerHTML = `
            <div class="info-row">
                <span class="info-label">Network info unavailable</span>
                <span class="info-value">Error</span>
            </div>
        `;
        console.error('IP info error:', error);
    }
}

// Display IP information
function displayIPInfo(data) {
    document.getElementById('ipInfo').innerHTML = `
        <div class="info-row">
            <span class="info-label">IP Address</span>
            <span class="info-value">${data.ip || 'N/A'}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Location</span>
            <span class="info-value">${data.city || 'Unknown'}, ${data.region || 'Unknown'}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Country</span>
            <span class="info-value">${data.country || 'Unknown'}</span>
        </div>
        <div class="info-row">
            <span class="info-label">ISP</span>
            <span class="info-value">${data.isp || 'Unknown'}</span>
        </div>
    `;
}

document.getElementById("year").textContent = new Date().getFullYear();

// Update test status message
function updateTestStatus(message) {
    testStatus.textContent = message;
    testStatus.classList.add('visible');
}

// Set progress ring active state
function setProgressRingActive(ringId, active) {
    const ring = document.getElementById(ringId);
    ring.classList.toggle('active', active);
}

// Start the speed test
async function startTest() {
    if (isTestRunning) return;

    isTestRunning = true;
    startButton.disabled = true;
    startButton.textContent = 'Testing...';
    resultsPanel.classList.remove('visible');

    // Reset values
    document.getElementById('downloadSpeed').textContent = '0';
    document.getElementById('uploadSpeed').textContent = '0';
    document.getElementById('pingValue').textContent = '0';
    document.querySelectorAll('.progress-ring').forEach(ring => {
        ring.classList.remove('active');
        updateProgressRing(ring.id, 0);
    });

    try {
        // Ping test
        updateTestStatus('Testing latency...');
        setProgressRingActive('pingProgress', true);
        await runPingTest();
        setProgressRingActive('pingProgress', false);
        updateProgressRing('pingProgress', 100);

        // Download test
        updateTestStatus('Testing download speed...');
        setProgressRingActive('downloadProgress', true);
        await runDownloadTest();
        setProgressRingActive('downloadProgress', false);
        updateProgressRing('downloadProgress', 100);

        // Upload test
        updateTestStatus('Testing upload speed...');
        setProgressRingActive('uploadProgress', true);
        await runUploadTest();
        setProgressRingActive('uploadProgress', false);
        updateProgressRing('uploadProgress', 100);

        updateTestStatus('Test completed successfully!');
        showResults();
        saveToHistory();

    } catch (error) {
        showError(`Test failed: ${error.message}`);
        console.error('Speed test error:', error);
    } finally {
        isTestRunning = false;
        startButton.disabled = false;
        startButton.textContent = 'Start Test';
        setTimeout(() => {
            testStatus.classList.remove('visible');
        }, 3000);
    }
}

// Run ping test
async function runPingTest() {
    try {
        const response = await fetch(`${API_BASE}/ping_stats?host=8.8.8.8&count=4`);
        if (!response.ok) {
            throw new Error('Ping test failed');
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        animateValue('pingValue', 0, data.ping, 500);
        testResults.ping = data.ping;
        testResults.jitter = data.jitter;
        testResults.packetLoss = data.packet_loss;

    } catch (error) {
        console.error('Ping test failed:', error);
        throw error;
    }
}

// Run download test
async function runDownloadTest() {
    let totalSpeed = 0;
    let validTests = 0;

    for (let i = 0; i < 2; i++) {
        try {
            const url = `${API_BASE}/download?size_mb=2&rand=${Math.random()}`; // Prevent cache
            const startTime = performance.now();
            const response = await fetch(url, { cache: "no-store" });

            if (!response.ok) throw new Error('Download request failed');

            const reader = response.body.getReader();
            let receivedBytes = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                receivedBytes += value.length;
            }

            const endTime = performance.now();
            const duration = (endTime - startTime) / 1000;
            const speedMbps = (receivedBytes * 8) / (1024 * 1024 * duration);

            totalSpeed += speedMbps;
            validTests++;

            animateValue('downloadSpeed', 0, speedMbps, 300);
            updateProgressRing('downloadProgress', (i + 1) * 50);

        } catch (error) {
            console.error('Download test error:', error);
        }
    }

    if (validTests === 0) throw new Error('Download test failed');

    const avgSpeed = totalSpeed / validTests;
    testResults.downloadSpeed = avgSpeed;
    animateValue('downloadSpeed', 0, avgSpeed, 500);
}

// Run upload test
async function runUploadTest() {
    const testData = new ArrayBuffer(2 * 1024 * 1024);
    let totalSpeed = 0;
    let validTests = 0;

    for (let i = 0; i < 2; i++) {
        try {
            const startTime = performance.now();
            const response = await fetch(`${API_BASE}/upload?rand=${Math.random()}`, {
                method: 'POST',
                body: testData,
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Cache-Control': 'no-store'
                }
            });

            if (!response.ok) {
                throw new Error('Upload request failed');
            }

            const result = await response.json();
            const endTime = performance.now();
            const duration = (endTime - startTime) / 1000;
            const speedMbps = (result.received_bytes * 8) / (1024 * 1024 * duration);

            totalSpeed += speedMbps;
            validTests++;

            animateValue('uploadSpeed', 0, speedMbps, 300);
            updateProgressRing('uploadProgress', (i + 1) * 50);

        } catch (error) {
            console.error('Upload test error:', error);
        }
    }

    if (validTests === 0) {
        throw new Error('Upload test failed');
    }

    const avgSpeed = totalSpeed / validTests;
    testResults.uploadSpeed = avgSpeed;
    animateValue('uploadSpeed', 0, avgSpeed, 500);
}

// Show test results
function showResults() {
    document.getElementById('resultDownload').textContent = 
        (testResults.downloadSpeed || 0).toFixed(1) + ' Mbps';
    document.getElementById('resultUpload').textContent = 
        (testResults.uploadSpeed || 0).toFixed(1) + ' Mbps';
    document.getElementById('resultPing').textContent = 
        (testResults.ping || 0).toFixed(1) + ' ms';
    document.getElementById('resultJitter').textContent = 
        (testResults.jitter || 0).toFixed(1) + ' ms';
    document.getElementById('resultPacketLoss').textContent = 
        (testResults.packetLoss || 0) + '%';

    resultsPanel.classList.add('visible');
}

// Save test to history
function saveToHistory() {
    const testResult = {
        timestamp: new Date().toISOString(),
        download: testResults.downloadSpeed.toFixed(1),
        upload: testResults.uploadSpeed.toFixed(1),
        ping: testResults.ping.toFixed(1),
        jitter: testResults.jitter.toFixed(1),
        packetLoss: testResults.packetLoss
    };

    testHistory.unshift(testResult);

    if (testHistory.length > MAX_HISTORY_ITEMS) {
        testHistory.pop();
    }

    localStorage.setItem('speedTestHistory', JSON.stringify(testHistory));
    renderHistory();
}

// Render test history
function renderHistory() {
    if (testHistory.length === 0) {
        historyList.innerHTML = '<div class="history-empty">No tests performed yet</div>';
        return;
    }

    historyList.innerHTML = '';

    testHistory.forEach(test => {
        const date = new Date(test.timestamp);
        const dateStr = date.toLocaleDateString();
        const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.innerHTML = `
            <div class="history-date">${dateStr} ${timeStr}</div>
            <div class="history-stats">
                <div class="history-stat history-download">${test.download} Mbps</div>
                <div class="history-stat history-upload">${test.upload} Mbps</div>
                <div class="history-stat history-ping">${test.ping} ms</div>
            </div>
        `;

        historyList.appendChild(historyItem);
    });
}

// Show error message
function showError(message) {
    const container = document.querySelector('.test-panel');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    container.appendChild(errorDiv);

    setTimeout(() => {
        if (errorDiv.parentNode === container) {
            container.removeChild(errorDiv);
        }
    }, 5000);
}
