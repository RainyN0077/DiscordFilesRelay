// --- 全局变量 ---
let fileItems = []; // 存储多个文件
let channelCount = 1; // 频道输入框计数器
let channelStates = {}; // 存储每个频道的启用/禁用状态 { channelIndex: boolean }
let sendMode = 'sequential'; // 'sequential' 或 'parallel'
let uploadStartTime = 0; // 上传开始时间
let totalUploadedBytes = 0; // 总上传字节数 (用于并行模式的累加)
let lastSpeedUpdateTime = 0; // 上次速度更新时间
let lastUploadedBytesSnapshot = 0; // 上次速度更新时的总字节数
let speedUpdateInterval = null; // 网速更新定时器
let lottieAnimation; // Lottie 动画实例
let isSending = false; // 防止重复发送

// --- DOM 元素引用 ---
const apiTokenInput = document.getElementById('apiToken');
const minDelayInput = document.getElementById('minDelay');
const maxDelayInput = document.getElementById('maxDelay');
const minDelayRange = document.getElementById('minDelayRange');
const maxDelayRange = document.getElementById('maxDelayRange');
const messageInput = document.getElementById('message');
const markdownPreview = document.getElementById('markdownPreview');
const fileInput = document.getElementById('fileInput');
const previewContainer = document.getElementById('previewContainer');
const uploadArea = document.getElementById('uploadArea');
const channelGroup = document.getElementById('channelGroup');
const statusLog = document.getElementById('status');
const loadingOverlay = document.getElementById('loadingOverlay');
const progressPopup = document.getElementById('progressPopup');
const popupProgressBars = document.getElementById('popupProgressBars');
const popupSpeedDisplay = document.getElementById('popupSpeedDisplay');
const popupUploadSpeed = document.getElementById('popupUploadSpeed');
const sendModeToggleBtn = document.getElementById('sendModeToggle');

// --- 主题管理 ---
function toggleTheme() {
    const body = document.body;
    const sunIcon = document.getElementById('sun-icon');
    const moonIcon = document.getElementById('moon-icon');
    const isLight = body.classList.contains('theme-light');
    body.classList.toggle('theme-light', !isLight);
    body.classList.toggle('theme-dark', isLight);
    sunIcon.style.display = isLight ? 'none' : 'block';
    moonIcon.style.display = isLight ? 'block' : 'none';
    localStorage.setItem('theme', isLight ? 'dark' : 'light');
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    const body = document.body;
    const sunIcon = document.getElementById('sun-icon');
    const moonIcon = document.getElementById('moon-icon');
    const isDark = savedTheme === 'dark';
    body.classList.toggle('theme-light', !isDark);
    body.classList.toggle('theme-dark', isDark);
    sunIcon.style.display = isDark ? 'none' : 'block';
    moonIcon.style.display = isDark ? 'block' : 'none';
}

// --- API Token 管理 ---
function toggleTokenVisibility() {
    const eyeClosed = document.querySelector('.eye-closed');
    const eyeOpen = document.querySelector('.eye-open');
    const isBlurred = apiTokenInput.classList.toggle('blurred-text');
    eyeClosed.style.display = isBlurred ? 'block' : 'none';
    eyeOpen.style.display = isBlurred ? 'none' : 'block';
    localStorage.setItem('blurToken', isBlurred);
}

function pasteToken() {
    if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText()
            .then(text => {
                if (text) {
                    apiTokenInput.value = text.trim();
                    saveData();
                    updateStatus('状态：API Token 已从剪贴板粘贴。', 'info');
                } else {
                    updateStatus('状态：剪贴板为空。', 'error');
                }
            })
            .catch(err => {
                updateStatus('状态：无法访问剪贴板，请手动粘贴。错误：' + err.message, 'error');
            });
    } else {
        updateStatus('状态：浏览器不支持自动粘贴，请手动粘贴。', 'error');
    }
}

// --- 编辑器管理 ---
function switchEditorTab(tab) {
    const editTab = document.querySelectorAll('.editor-tab')[0];
    const previewTab = document.querySelectorAll('.editor-tab')[1];
    if (tab === 'edit') {
        editTab.classList.add('active');
        previewTab.classList.remove('active');
        messageInput.style.display = 'block';
        markdownPreview.style.display = 'none';
    } else {
        editTab.classList.remove('active');
        previewTab.classList.add('active');
        messageInput.style.display = 'none';
        markdownPreview.style.display = 'block';
        renderMarkdownPreview();
    }
}

function renderMarkdownPreview() {
    const text = messageInput.value.trim();
    markdownPreview.innerHTML = text ? marked.parse(text) : '<p>无内容预览</p>';
}

messageInput.addEventListener('input', () => {
    saveData();
    if (document.querySelectorAll('.editor-tab')[1].classList.contains('active')) {
        renderMarkdownPreview();
    }
});

// --- 折叠面板 ---
function togglePanel(header) {
    const panelContent = header.nextElementSibling;
    header.classList.toggle('collapsed');
    panelContent.classList.toggle('collapsed');
}

// --- 文件处理 ---
function updateFilePreview() {
    previewContainer.innerHTML = '';
    fileItems.forEach((file, index) => {
        const thumbnail = document.createElement('div');
        thumbnail.className = 'thumbnail';
        thumbnail.innerHTML = `
            <div class="file-preview">
                <span>${file.name}</span>
                <span>${formatFileSize(file.size)}</span>
            </div>
            <button class="remove-btn" onclick="removeFile(${index})">×</button>
        `;
        previewContainer.appendChild(thumbnail);
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function removeFile(index) {
    fileItems.splice(index, 1);
    updateFilePreview();
}

fileInput.addEventListener('change', handleFiles);
uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
uploadArea.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); handleFiles(e); });
uploadArea.addEventListener('click', () => fileInput.click());
document.addEventListener('paste', handlePaste);

function handleFiles(event) {
    const files = event.target?.files || event.dataTransfer?.files;
    if (!files) return;

    const currentFileCount = fileItems.length;
    const filesToAdd = Array.from(files).filter(file =>
        !fileItems.some(existing => existing.name === file.name && existing.size === file.size)
    );

    const availableSlots = 10 - currentFileCount;
    const addedFiles = filesToAdd.slice(0, availableSlots);

    fileItems = [...fileItems, ...addedFiles];

    if (filesToAdd.length > availableSlots) {
        updateStatus(`状态：最多只能上传10个文件，${filesToAdd.length - availableSlots}个文件已被忽略。`, 'error');
    }
    if (addedFiles.length > 0) {
        updateFilePreview();
    }
}

function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;

    let filesPasted = 0;
    for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && fileItems.length < 10) {
            const blob = items[i].getAsFile();
            if (blob) {
                 // 尝试保留原始文件名，如果不存在则生成一个
                const originalName = blob.name || `pasted-image-${Date.now()}.png`; // 假设是图片，给个默认扩展名
                // 生成唯一标识符避免同名文件冲突 (即使来自粘贴)
                const uniquePrefix = `paste-${Date.now()}-${Math.random().toString(36).substring(2, 8)}-`;
                const file = new File([blob], uniquePrefix + originalName, { type: blob.type });

                if (!fileItems.some(existing => existing.name === file.name)) {
                    fileItems.push(file);
                    filesPasted++;
                }
            }
             if (fileItems.length >= 10) {
                 updateStatus('状态：已达到10个文件上限，后续粘贴的文件将被忽略。', 'error');
                 break;
             }
        }
    }
    if (filesPasted > 0) {
        updateFilePreview();
        updateStatus(`状态：从剪贴板粘贴了 ${filesPasted} 个文件。`, 'info');
    }
}


// --- 随机延迟 ---
minDelayRange.addEventListener('input', updateDelay);
maxDelayRange.addEventListener('input', updateDelay);
minDelayInput.addEventListener('input', updateDelay);
maxDelayInput.addEventListener('input', updateDelay);

function updateDelay(event) {
    const source = event.target.id.includes('Range') ? 'range' : 'input';
    const type = event.target.id.includes('min') ? 'min' : 'max';

    let rangeInput = type === 'min' ? minDelayRange : maxDelayRange;
    let numberInput = type === 'min' ? minDelayInput : maxDelayInput;

    if (source === 'range') {
        numberInput.value = rangeInput.value;
    } else {
        if (numberInput.value < 0) numberInput.value = 0;
        rangeInput.value = numberInput.value;
    }

    // Ensure min <= max
    if (parseInt(minDelayInput.value) > parseInt(maxDelayInput.value)) {
        if (type === 'min') {
            maxDelayInput.value = minDelayInput.value;
            maxDelayRange.value = minDelayInput.value;
        } else {
            minDelayInput.value = maxDelayInput.value;
            minDelayRange.value = maxDelayInput.value;
        }
    }
    saveData();
}

function getRandomDelay() {
    const min = parseInt(minDelayInput.value) || 0;
    const max = parseInt(maxDelayInput.value) || 0;
    if (min >= max) {
        return min * 1000;
    }
    return (min + Math.random() * (max - min)) * 1000;
}

// --- 频道管理 ---
function addChannel() {
    channelCount++;
    const newChannelDiv = createChannelElement(channelCount, '', true);
    channelGroup.appendChild(newChannelDiv);
    channelStates[channelCount] = true; // 新频道默认启用
    setupChannelInputListeners(newChannelDiv.querySelector('input[type="text"]'), channelCount);
    saveData();
}

function removeChannel(id) {
    const channelDiv = document.getElementById(`channel-${id}`);
    if (channelDiv) {
        channelDiv.remove();
        delete channelStates[id];
        // 如果删除了最后一个，自动添加一个
        if (document.querySelectorAll('#channelGroup .channel-item').length === 0) {
            addChannel();
        } else {
             // 更新 channelCount 为当前最大 ID (如果需要精确跟踪的话)
            const remainingIds = Array.from(document.querySelectorAll('#channelGroup .channel-item'))
                                     .map(el => parseInt(el.id.split('-')[1]));
            channelCount = remainingIds.length > 0 ? Math.max(...remainingIds) : 0;
        }
        saveData();
    }
}

function toggleChannel(id) {
    const channelDiv = document.getElementById(`channel-${id}`);
    const input = channelDiv.querySelector('input[type="text"]');
    const toggleBtn = channelDiv.querySelector('.channel-toggle-btn');
    const isEnabled = !channelStates[id]; // Toggle the state

    channelStates[id] = isEnabled;
    channelDiv.classList.toggle('disabled', !isEnabled);
    input.disabled = !isEnabled;
    toggleBtn.classList.toggle('enabled-btn', isEnabled);
    toggleBtn.classList.toggle('disabled-btn', !isEnabled);
    toggleBtn.textContent = isEnabled ? '已启用' : '已禁用';

    if (isEnabled && input.value.trim()) {
        fetchChannelInfo(id);
    } else if (!isEnabled) {
        // 如果禁用，清空识别信息
         const channelNameSpan = document.getElementById(`channel-name-${id}`);
         if(channelNameSpan) {
             channelNameSpan.textContent = '服务器：未识别 | 频道：未识别';
         }
    }
    saveData();
}

function enableAllChannels() {
    Object.keys(channelStates).forEach(idStr => {
        const id = parseInt(idStr);
        if (!channelStates[id]) { // Only toggle if currently disabled
            toggleChannel(id);
        }
    });
}

function disableAllChannels() {
     Object.keys(channelStates).forEach(idStr => {
        const id = parseInt(idStr);
        if (channelStates[id]) { // Only toggle if currently enabled
            toggleChannel(id);
        }
    });
}

function createChannelElement(id, url, isEnabled) {
    const div = document.createElement('div');
    div.className = `channel-item${isEnabled ? '' : ' disabled'}`;
    div.id = `channel-${id}`;
    div.innerHTML = `
        <button class="channel-toggle-btn ${isEnabled ? 'enabled-btn' : 'disabled-btn'}" onclick="toggleChannel(${id})">${isEnabled ? '已启用' : '已禁用'}</button>
        <div class="input-group channel-info">
            <span id="channel-name-${id}">服务器：未识别 | 频道：未识别</span>
            <input type="text" value="${url}" placeholder="请输入目标频道地址，例如：https://discord.com/channels/xxx/yyy" ${isEnabled ? '' : 'disabled'}>
        </div>
        <button class="delete-btn" onclick="removeChannel(${id})">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
        </button>
    `;
    return div;
}

function setupChannelInputListeners(inputElement, id) {
    inputElement.addEventListener('input', () => {
        saveData();
        if (channelStates[id]) fetchChannelInfo(id); // Fetch info while typing if enabled
    });
    inputElement.addEventListener('change', () => { // Also fetch on change (e.g., paste)
        saveData();
        if (channelStates[id]) fetchChannelInfo(id);
    });
     inputElement.addEventListener('blur', () => { // Fetch on blur too
        saveData();
        if (channelStates[id]) fetchChannelInfo(id);
    });
}

async function fetchChannelInfo(id) {
    const apiToken = apiTokenInput.value.trim();
    const channelItem = document.getElementById(`channel-${id}`);
    if (!channelItem || !channelStates[id]) return; // Don't fetch if disabled

    const channelInput = channelItem.querySelector('input[type="text"]');
    const channelUrl = channelInput.value.trim();
    const channelNameSpan = document.getElementById(`channel-name-${id}`);

    if (!apiToken) {
        channelNameSpan.textContent = '服务器：需Token | 频道：需Token';
        return; // Don't log status if only token is missing
    }
    if (!channelUrl) {
        channelNameSpan.textContent = '服务器：未识别 | 频道：未识别';
        return;
    }

    const urlParts = channelUrl.match(/channels\/(\d+)\/(\d+)/);
    if (!urlParts || urlParts.length < 3) {
        channelNameSpan.textContent = '服务器：格式错误 | 频道：格式错误';
        return;
    }
    const guildId = urlParts[1];
    const channelId = urlParts[2];

    channelNameSpan.textContent = '服务器：获取中... | 频道：获取中...';

    try {
        const timeout = 5000; // 5 seconds
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const headers = { 'Authorization': apiToken };

        // Fetch channel info
        const channelResponse = await fetch(`https://discord.com/api/v9/channels/${channelId}`, {
            method: 'GET', headers, signal: controller.signal
        });
        clearTimeout(timeoutId); // Clear timeout if fetch succeeded

        if (!channelResponse.ok) {
            throw new Error(`频道信息获取失败 (${channelResponse.status})`);
        }
        const channelData = await channelResponse.json();
        const channelName = channelData.name || '未知频道';

        // Fetch guild info (using guildId from URL, safer than relying on channelData.guild_id)
        let guildName = '未知服务器';
        if (guildId !== '@me') { // Don't fetch guild if it's a DM channel
             const guildController = new AbortController();
             const guildTimeoutId = setTimeout(() => guildController.abort(), timeout);
             try {
                const guildResponse = await fetch(`https://discord.com/api/v9/guilds/${guildId}`, {
                    method: 'GET', headers, signal: guildController.signal
                });
                clearTimeout(guildTimeoutId);
                if (guildResponse.ok) {
                    const guildData = await guildResponse.json();
                    guildName = guildData.name || '未知服务器';
                } else {
                     console.warn(`获取服务器 ${guildId} 信息失败: ${guildResponse.status}`);
                     // Keep guildName as '未知服务器'
                }
             } catch (guildErr) {
                 clearTimeout(guildTimeoutId);
                 console.warn(`获取服务器 ${guildId} 信息时出错: ${guildErr.message}`);
                 // Keep guildName as '未知服务器'
             }
        } else {
            guildName = "私信"; // It's a DM channel
        }

        channelNameSpan.textContent = `服务器：${guildName} | 频道：#${channelName}`;
        // Don't clutter status log during normal info fetching
        // updateStatus(`状态：频道 ${id} 信息更新成功。`, 'success');

    } catch (err) {
        channelNameSpan.textContent = '服务器：获取失败 | 频道：获取失败';
        // Only log error if it's not an AbortError (timeout) or if user specifically tries to send
        if (err.name !== 'AbortError') {
            updateStatus(`状态：频道 ${id} 信息获取失败: ${err.message}`, 'error');
        } else {
             updateStatus(`状态：频道 ${id} 信息获取超时。`, 'error');
        }
    }
}

// --- 发送模式管理 ---
function toggleSendMode() {
    if (sendMode === 'sequential') {
        sendMode = 'parallel';
        sendModeToggleBtn.textContent = '切换为逐条发送';
        sendModeToggleBtn.classList.remove('secondary-btn');
        sendModeToggleBtn.classList.add('primary-btn'); // Highlight parallel
    } else {
        sendMode = 'sequential';
        sendModeToggleBtn.textContent = '切换为并行发送';
         sendModeToggleBtn.classList.remove('primary-btn');
        sendModeToggleBtn.classList.add('secondary-btn'); // Default sequential
    }
    localStorage.setItem('sendMode', sendMode);
    updateStatus(`状态：发送模式已切换为 ${sendMode === 'sequential' ? '逐条发送' : '并行发送'}。`, 'info');
}

function loadSendMode() {
    const savedMode = localStorage.getItem('sendMode');
    if (savedMode === 'parallel') {
        sendMode = 'parallel';
        sendModeToggleBtn.textContent = '切换为逐条发送';
        sendModeToggleBtn.classList.remove('secondary-btn');
        sendModeToggleBtn.classList.add('primary-btn');
    } else {
        sendMode = 'sequential'; // Default to sequential
        sendModeToggleBtn.textContent = '切换为并行发送';
        sendModeToggleBtn.classList.remove('primary-btn');
        sendModeToggleBtn.classList.add('secondary-btn');
    }
}

// --- 状态与进度 ---
function updateStatus(message, type = 'info') {
    const p = document.createElement('p');
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    if (type === 'success') p.classList.add('success');
    if (type === 'error') p.classList.add('error');
    statusLog.appendChild(p);
    // Auto-scroll to bottom
    statusLog.scrollTop = statusLog.scrollHeight;
}

function showLoading() {
    loadingOverlay.style.display = 'flex';
    if (lottieAnimation) lottieAnimation.play();
}

function hideLoading() {
    loadingOverlay.style.display = 'none';
    if (lottieAnimation) lottieAnimation.stop();
}

function initializeLottie() {
    lottieAnimation = lottie.loadAnimation({
        container: document.getElementById('loadingSpinner'),
        renderer: 'svg',
        loop: true,
        autoplay: false, // Control manually
        path: 'https://assets2.lottiefiles.com/packages/lf20_usmfxnmu.json'
    });
}

function showProgressPopup(channels) {
    popupProgressBars.innerHTML = ''; // Clear previous bars
    totalUploadedBytes = 0;
    lastUploadedBytesSnapshot = 0;
    lastSpeedUpdateTime = Date.now();

    channels.forEach((channelData, index) => {
        // Use a unique ID for elements within the popup
        const popupChannelId = `popup-channel-${channelData.originalIndex}`;
        const channelNameSpan = document.getElementById(`channel-name-${channelData.originalIndex}`);
        const displayName = channelNameSpan ? channelNameSpan.textContent : `频道 ${channelData.originalIndex}`;

        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';
        progressContainer.id = `progress-container-${popupChannelId}`;
        progressContainer.innerHTML = `
            <div class="progress-label">
                <span title="${displayName}">${displayName}</span>
                <span id="progress-percent-${popupChannelId}">0%</span>
            </div>
            <div class="progress-bar">
                <div class="progress" id="progress-${popupChannelId}" style="width: 0%;"></div>
            </div>
        `;
        popupProgressBars.appendChild(progressContainer);
    });

    popupUploadSpeed.textContent = '上传速度：0 B/s';
    popupSpeedDisplay.style.display = 'block'; // Show speed display
    progressPopup.style.display = 'flex'; // Show the modal
    startUploadSpeedUpdate(); // Start speed calculation
}

function hideProgressPopup() {
    progressPopup.style.display = 'none';
    stopUploadSpeedUpdate(); // Stop speed calculation
    popupProgressBars.innerHTML = ''; // Clear bars when closing
}

// Update progress for a specific channel in the popup
// percentage is 0-100
function updatePopupProgressBar(originalChannelIndex, percentage) {
    const popupChannelId = `popup-channel-${originalChannelIndex}`;
    const progressElement = document.getElementById(`progress-${popupChannelId}`);
    const progressPercent = document.getElementById(`progress-percent-${popupChannelId}`);

    if (progressElement && progressPercent) {
        percentage = Math.max(0, Math.min(100, percentage)); // Clamp percentage
        progressElement.style.width = `${percentage}%`;
        progressPercent.textContent = `${Math.round(percentage)}%`;
    } else {
        console.warn(`Progress bar elements not found for popup channel ID: ${popupChannelId}`);
    }
}

// Update the overall upload speed display in the popup
function updatePopupSpeedDisplay() {
    const now = Date.now();
    const elapsedSeconds = (now - lastSpeedUpdateTime) / 1000;

    // Avoid division by zero and update reasonably often (e.g., > 100ms)
    if (elapsedSeconds < 0.1) {
        return;
    }

    const deltaBytes = totalUploadedBytes - lastUploadedBytesSnapshot;
    const speed = deltaBytes / elapsedSeconds; // Bytes per second

    popupUploadSpeed.textContent = `上传速度：${formatFileSize(speed)}/s`;

    // Update snapshot for next calculation
    lastUploadedBytesSnapshot = totalUploadedBytes;
    lastSpeedUpdateTime = now;
}

function startUploadSpeedUpdate() {
    if (speedUpdateInterval) return; // Already running
    lastUploadedBytesSnapshot = totalUploadedBytes; // Reset snapshot
    lastSpeedUpdateTime = Date.now();
    // Update speed more frequently for smoother display
    speedUpdateInterval = setInterval(updatePopupSpeedDisplay, 250); // Update 4 times per second
}

function stopUploadSpeedUpdate() {
    if (speedUpdateInterval) {
        clearInterval(speedUpdateInterval);
        speedUpdateInterval = null;
        // Set final speed to 0 or leave the last calculated value? Let's reset.
        popupUploadSpeed.textContent = '上传速度：0 B/s';
    }
}

// --- Data Saving/Loading ---
function saveData() {
    localStorage.setItem('apiToken', apiTokenInput.value.trim());
    localStorage.setItem('blurToken', apiTokenInput.classList.contains('blurred-text'));
    localStorage.setItem('minDelay', minDelayInput.value);
    localStorage.setItem('maxDelay', maxDelayInput.value);
    localStorage.setItem('message', messageInput.value); // Save full message including whitespace potentially

    const channelData = {};
     const channelItems = document.querySelectorAll('#channelGroup .channel-item');
     channelItems.forEach(item => {
         const id = parseInt(item.id.split('-')[1]);
         const input = item.querySelector('input[type="text"]');
         const url = input.value.trim();
         const enabled = channelStates[id] ?? true; // Default to true if state somehow missing
         channelData[id] = { url, enabled };
     });
    localStorage.setItem('channelData', JSON.stringify(channelData));
    localStorage.setItem('sendMode', sendMode); // Save send mode
}

function loadSavedData() {
    // API Token and Blur
    apiTokenInput.value = localStorage.getItem('apiToken') || '';
    const savedBlurToken = localStorage.getItem('blurToken');
    const shouldBlur = savedBlurToken === null || savedBlurToken === 'true'; // Default to blurred
    apiTokenInput.classList.toggle('blurred-text', shouldBlur);
    document.querySelector('.eye-closed').style.display = shouldBlur ? 'block' : 'none';
    document.querySelector('.eye-open').style.display = shouldBlur ? 'none' : 'block';


    // Delay
    minDelayInput.value = localStorage.getItem('minDelay') || '1';
    maxDelayInput.value = localStorage.getItem('maxDelay') || '5';
    minDelayRange.value = minDelayInput.value; // Sync sliders
    maxDelayRange.value = maxDelayInput.value;

    // Message
    messageInput.value = localStorage.getItem('message') || '';
    renderMarkdownPreview(); // Render preview if needed

    // Channels
    const savedChannelData = localStorage.getItem('channelData');
    channelGroup.innerHTML = ''; // Clear existing (usually just the default one)
    channelStates = {}; // Reset states
    let maxId = 0;
    if (savedChannelData) {
        const channels = JSON.parse(savedChannelData);
        Object.entries(channels).forEach(([idStr, data]) => {
            const id = parseInt(idStr);
            const { url, enabled } = data;
            channelStates[id] = enabled;
            const channelDiv = createChannelElement(id, url, enabled);
            channelGroup.appendChild(channelDiv);
            const input = channelDiv.querySelector('input[type="text"]');
            setupChannelInputListeners(input, id);
            if (enabled && url) {
                fetchChannelInfo(id); // Fetch info for enabled channels with URLs
            }
             maxId = Math.max(maxId, id);
        });
    }
     // Ensure there's at least one channel input
    if (Object.keys(channelStates).length === 0) {
        addChannel(); // Adds channel 1
        channelCount = 1;
    } else {
        channelCount = maxId; // Set counter to the highest loaded ID
    }


    // Send Mode
    loadSendMode();
}

// --- Core Sending Logic ---

// Shared validation and preparation
function prepareSend() {
     if (isSending) {
        updateStatus('状态：错误 - 当前有发送任务正在进行中，请稍候。', 'error');
        return null;
    }

    const apiToken = apiTokenInput.value.trim();
    if (!apiToken) {
        updateStatus('状态：错误 - 请填写 API Token！', 'error');
        return null;
    }

    const enabledChannels = Object.entries(channelStates)
        .filter(([id, enabled]) => enabled)
        .map(([idStr, enabled]) => {
            const id = parseInt(idStr);
            const input = document.querySelector(`#channel-${id} input[type="text"]`);
            const url = input ? input.value.trim() : '';
            const channelIdMatch = url.match(/channels\/\d+\/(\d+)/);
            const channelId = channelIdMatch ? channelIdMatch[1] : null;
            return {
                originalIndex: id, // Keep track of the original ID for progress updates
                url: url,
                channelId: channelId,
                name: document.getElementById(`channel-name-${id}`)?.textContent || `频道 ${id}` // For display
            };
        })
        .filter(channel => channel.url && channel.channelId); // Filter out invalid or empty URLs/IDs

    if (enabledChannels.length === 0) {
        updateStatus('状态：错误 - 请至少启用一个有效格式的频道地址！', 'error');
        return null;
    }

    isSending = true; // Set sending flag
    showLoading();
    updateStatus(`状态：开始发送任务 (${sendMode === 'sequential' ? '逐条' : '并行'})...`);
    showProgressPopup(enabledChannels); // Show popup with only valid, enabled channels

    return { apiToken, channels: enabledChannels };
}

// Cleanup after sending finishes (or fails)
function finishSend() {
    hideLoading();
    // Don't hide the popup immediately, let user see the final status
    // hideProgressPopup();
    stopUploadSpeedUpdate();
    updateStatus('状态：所有发送任务已处理完毕。');
    isSending = false; // Reset sending flag
}

// Send File implementation
async function sendFile() {
    const prep = prepareSend();
    if (!prep) return;
    const { apiToken, channels } = prep;

    if (fileItems.length === 0) {
        updateStatus('状态：错误 - 请至少选择一个文件！', 'error');
        hideLoading();
        hideProgressPopup(); // Hide popup if validation fails early
        isSending = false;
        return;
    }

    try {
        if (sendMode === 'sequential') {
            await sendSequentially(apiToken, channels, 'file');
        } else {
            await sendParallelly(apiToken, channels, 'file');
        }
    } catch (error) {
        updateStatus(`状态：发送过程中发生意外错误: ${error.message}`, 'error');
    } finally {
        finishSend();
    }
}

// Send Text implementation
async function sendText() {
    const prep = prepareSend();
    if (!prep) return;
    const { apiToken, channels } = prep;
    const message = messageInput.value.trim();

    if (!message) {
        updateStatus('状态：错误 - 请输入消息内容！', 'error');
        hideLoading();
        hideProgressPopup();
        isSending = false;
        return;
    }

     try {
        if (sendMode === 'sequential') {
            await sendSequentially(apiToken, channels, 'text', message);
        } else {
            await sendParallelly(apiToken, channels, 'text', message);
        }
    } catch (error) {
        updateStatus(`状态：发送过程中发生意外错误: ${error.message}`, 'error');
    } finally {
        finishSend();
    }
}

// Send File and Text implementation
async function sendFileAndText() {
    const prep = prepareSend();
    if (!prep) return;
    const { apiToken, channels } = prep;
    const message = messageInput.value.trim();

    if (fileItems.length === 0) {
        updateStatus('状态：错误 - 请至少选择一个文件！', 'error');
        hideLoading();
        hideProgressPopup();
        isSending = false;
        return;
    }
     if (!message) {
        updateStatus('状态：错误 - 请输入消息内容！', 'error');
        hideLoading();
        hideProgressPopup();
        isSending = false;
        return;
    }

      try {
        if (sendMode === 'sequential') {
            await sendSequentially(apiToken, channels, 'fileAndText', message);
        } else {
            await sendParallelly(apiToken, channels, 'fileAndText', message);
        }
    } catch (error) {
        updateStatus(`状态：发送过程中发生意外错误: ${error.message}`, 'error');
    } finally {
        finishSend();
    }
}


// --- Sequential Sending ---
async function sendSequentially(apiToken, channels, type, message = '') {
    for (const channel of channels) {
        const delayTime = getRandomDelay();
        updateStatus(`状态：频道 ${channel.originalIndex} (${channel.name}) - 等待 ${Math.round(delayTime / 1000)}s 延迟...`);
        // Simulate delay progress (0% to 50%)
        await delayWithProgress(delayTime, channel.originalIndex, 0, 50);

        updateStatus(`状态：频道 ${channel.originalIndex} (${channel.name}) - 开始发送...`);
        try {
            await sendSingleRequest(apiToken, channel, type, message, (progress) => {
                // Update progress from 50% to 100% based on upload/request
                 updatePopupProgressBar(channel.originalIndex, 50 + progress * 0.5);
            });
            updateStatus(`状态：频道 ${channel.originalIndex} (${channel.name}) - 发送成功。`, 'success');
            updatePopupProgressBar(channel.originalIndex, 100); // Mark as complete
        } catch (error) {
            updateStatus(`状态：频道 ${channel.originalIndex} (${channel.name}) - 发送失败: ${error.message}`, 'error');
            updatePopupProgressBar(channel.originalIndex, 100); // Mark as complete even on failure
        }
    }
}

// --- Parallel Sending ---
async function sendParallelly(apiToken, channels, type, message = '') {
    const promises = channels.map(channel => {
        return (async () => {
            const delayTime = getRandomDelay();
            updateStatus(`状态：频道 ${channel.originalIndex} (${channel.name}) - 等待 ${Math.round(delayTime / 1000)}s 延迟...`);
            await delayWithProgress(delayTime, channel.originalIndex, 0, 50);

            updateStatus(`状态：频道 ${channel.originalIndex} (${channel.name}) - 开始发送...`);
            try {
                await sendSingleRequest(apiToken, channel, type, message, (progress) => {
                    updatePopupProgressBar(channel.originalIndex, 50 + progress * 0.5);
                });
                updateStatus(`状态：频道 ${channel.originalIndex} (${channel.name}) - 发送成功。`, 'success');
                updatePopupProgressBar(channel.originalIndex, 100);
                return { status: 'fulfilled', channelId: channel.originalIndex };
            } catch (error) {
                updateStatus(`状态：频道 ${channel.originalIndex} (${channel.name}) - 发送失败: ${error.message}`, 'error');
                updatePopupProgressBar(channel.originalIndex, 100);
                 return { status: 'rejected', channelId: channel.originalIndex, reason: error.message };
            }
        })(); // Immediately invoke the async function
    });

    // Wait for all parallel tasks to settle (complete or fail)
    await Promise.allSettled(promises);
}

// --- Single Request Logic (Used by both sequential and parallel) ---
async function sendSingleRequest(apiToken, channel, type, message, onProgress) {
    const url = `https://discord.com/api/v9/channels/${channel.channelId}/messages`;
    const headers = { 'Authorization': apiToken };
    let body = null;
    let useXhr = false; // Use XHR only when files are involved for progress

    if (type === 'file' || type === 'fileAndText') {
        useXhr = true;
        const formData = new FormData();
        let totalSize = 0;
        fileItems.forEach((file, index) => {
            formData.append(`file${index}`, file); // Discord expects file0, file1, ...
             totalSize += file.size;
        });
        if (type === 'fileAndText' && message) {
            formData.append('payload_json', JSON.stringify({ content: message })); // Attach message as payload_json
        }
        body = formData;
    } else if (type === 'text') {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ content: message });
    }

    return new Promise((resolve, reject) => {
        if (useXhr) {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            Object.entries(headers).forEach(([key, value]) => {
                xhr.setRequestHeader(key, value);
            });

            let channelUploadedBytes = 0; // Track bytes for this specific channel request

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const currentChannelProgress = (event.loaded / event.total) * 100; // 0-100 for this request
                    onProgress(currentChannelProgress); // Report progress to the caller (0-100)

                    // Update global total uploaded bytes for speed calculation
                    // Calculate delta for this progress event relative to last known for this channel
                    const delta = event.loaded - channelUploadedBytes;
                    totalUploadedBytes += delta; // Add the difference to the global counter
                    channelUploadedBytes = event.loaded; // Update channel's progress marker
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                     // Ensure progress hits 100% on success
                    onProgress(100);
                    // Make sure final bytes are accounted for
                    const finalDelta = xhr.upload.total - channelUploadedBytes;
                    if (finalDelta > 0) totalUploadedBytes += finalDelta;
                    resolve(xhr.response);
                } else {
                    try {
                        const errorData = JSON.parse(xhr.responseText);
                        reject(new Error(errorData.message || `HTTP ${xhr.status}`));
                    } catch {
                        reject(new Error(`HTTP ${xhr.status}`));
                    }
                }
            };

            xhr.onerror = () => {
                reject(new Error('网络错误'));
            };

            xhr.ontimeout = () => {
                 reject(new Error('请求超时'));
            };
             xhr.timeout = 600000; // 10 minute timeout for uploads? Adjust as needed.

            xhr.send(body);
        } else {
            // Use fetch for simple text messages (no progress needed)
            fetch(url, { method: 'POST', headers, body })
                .then(response => {
                    if (response.ok) {
                        onProgress(100); // Text messages are instant, mark as 100%
                        return response.json(); // Or response.text() if no JSON expected
                    } else {
                        return response.json().then(err => { throw new Error(err.message || `HTTP ${response.status}`); })
                                         .catch(() => { throw new Error(`HTTP ${response.status}`); }); // Handle non-JSON errors
                    }
                })
                .then(data => resolve(data))
                .catch(error => reject(error));
        }
    });
}


// --- Helper: Delay with Progress Update ---
function delayWithProgress(ms, channelIndex, startPercent, endPercent) {
    return new Promise(resolve => {
        if (ms <= 0) {
            updatePopupProgressBar(channelIndex, endPercent);
            resolve();
            return;
        }
        const startTime = Date.now();
        const totalDuration = ms;
        const percentRange = endPercent - startPercent;

        const intervalId = setInterval(() => {
            const elapsedTime = Date.now() - startTime;
            if (elapsedTime >= totalDuration) {
                clearInterval(intervalId);
                updatePopupProgressBar(channelIndex, endPercent);
                resolve();
            } else {
                const progressFraction = elapsedTime / totalDuration;
                const currentPercent = startPercent + progressFraction * percentRange;
                updatePopupProgressBar(channelIndex, currentPercent);
            }
        }, 100); // Update progress 10 times per second during delay
    });
}

// --- Initialization ---
window.onload = () => {
    loadTheme();
    loadSavedData();
    initializeLottie();
    // Ensure input focus works on mobile (optional but good practice)
    // ensureInputFocus();
};

// Add event listeners for saving data on input change
apiTokenInput.addEventListener('input', saveData);
messageInput.addEventListener('input', saveData);

// Add listener for the new close button in the popup
document.querySelector('#progressPopup .secondary-btn').addEventListener('click', hideProgressPopup);

// (Optional) Add focus helper if needed
// function ensureInputFocus() { ... }
