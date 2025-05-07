// --- 全局变量 ---
let fileItems = []; // 存储多个文件
let channelCount = 1; // 频道输入框计数器
// 修改 channelStates 结构以存储 enabled, spoiler, 和 url
let channelStates = {}; // 存储每个频道的启用/禁用/剧透状态 { channelIndex: { enabled: boolean, spoiler: boolean, url: string } }
let sendMode = 'sequential'; // 'sequential' 或 'parallel'
let uploadStartTime = 0; // Upload start time (not used directly in this version, but kept)
let totalUploadedBytes = 0; // 总上传字节数 (用于并行模式的累加)
let lastSpeedUpdateTime = 0; // 上次速度更新时间
let lastUploadedBytesSnapshot = 0; // 上次速度更新时的总字节数
let speedUpdateInterval = null; // 网速更新定时器
let lottieAnimation; // Lottie 动画实例
let isSending = false; // 防止重复发送
let isAnimatingTheme = false; // 新增：防止重复触发主题动画

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
const themeToggleBtn = document.getElementById('themeToggleBtn'); // 新增：获取主题切换按钮
const themeWipeContainer = document.getElementById('themeWipeContainer'); // 新增：获取动画容器

// --- 主题管理 ---
function toggleTheme() {
    if (isAnimatingTheme) {
        // 防止动画正在进行时重复触发
        return;
    }
    isAnimatingTheme = true;
    themeToggleBtn.disabled = true; // 禁用按钮

    const body = document.body;
    const isLight = body.classList.contains('theme-light');
    const targetTheme = isLight ? 'dark' : 'light';

    // 显示动画容器
    themeWipeContainer.style.display = 'block';
    themeWipeContainer.innerHTML = ''; // 清空之前的色块

    // Determine wipe colors based on direction
    let wipeColors;
    if (isLight) { // Light to Dark (White -> Black) -> Red, Blue, Black
        wipeColors = ['theme-wipe-red', 'theme-wipe-blue', 'theme-wipe-final-dark'];
    } else { // Dark to Light (Black -> White) -> Red, Blue, White
        wipeColors = ['theme-wipe-red', 'theme-wipe-blue', 'theme-wipe-final-light'];
    }


    // Create wipe elements
    const wipes = wipeColors.map(colorClass => {
        const wipe = document.createElement('div');
        wipe.classList.add('theme-wipe', colorClass);
        themeWipeContainer.appendChild(wipe);
        return wipe;
    });


    // Animation timing
    const animationDuration = 400; // CSS transition duration in ms
    const delayBetweenWipes = 100; // Delay before starting the next wipe

    // Use requestAnimationFrame to ensure elements are in DOM before triggering transition
    requestAnimationFrame(() => {
        requestAnimationFrame(() => { // Double rAF for safety
            // Trigger wipes sequentially with delay
            wipes.forEach((wipe, index) => {
                setTimeout(() => {
                    wipe.classList.add('active');
                }, delayBetweenWipes * index);
            });


            // 切换主题并清理 (在最后一个色块动画完成后)
            setTimeout(() => {
                // 切换 body 的主题类
                body.classList.toggle('theme-light', targetTheme === 'light');
                body.classList.toggle('theme-dark', targetTheme === 'dark');

                // Update sun/moon icon display
                const sunIcon = document.getElementById('sun-icon');
                const moonIcon = document.getElementById('moon-icon');
                sunIcon.style.display = targetTheme === 'light' ? 'block' : 'none';
                moonIcon.style.display = targetTheme === 'dark' ? 'block' : 'none';

                // Save theme setting
                localStorage.setItem('theme', targetTheme);

                // Hide animation container and remove wipes
                themeWipeContainer.style.display = 'none';
                themeWipeContainer.innerHTML = ''; // Clear wipes

                isAnimatingTheme = false;
                themeToggleBtn.disabled = false; // Enable button
            }, delayBetweenWipes * (wipes.length - 1) + animationDuration); // Wait for the last animation to complete
        });
    });
}


function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    const body = document.body;
    const sunIcon = document.getElementById('sun-icon');
    const moonIcon = document.getElementById('moon-icon');
    const isDark = savedTheme === 'dark';

    // Directly set theme class and icon display, no animation on initial load
    body.classList.toggle('theme-light', !isDark);
    body.classList.toggle('theme-dark', isDark);
    sunIcon.style.display = !isDark ? 'block' : 'none';
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
    // Initialize state for the new channel
    channelStates[channelCount] = { enabled: true, spoiler: false, url: '' };
    const newChannelDiv = createChannelElement(channelCount, channelStates[channelCount]);
    channelGroup.appendChild(newChannelDiv);
    setupChannelInputListeners(newChannelDiv.querySelector('input[type="text"]'), channelCount);
    saveData();
}

function removeChannel(id) {
    const channelDiv = document.getElementById(`channel-${id}`);
    if (channelDiv) {
        channelDiv.remove();
        delete channelStates[id];
        // If deleted the last one, add a new default one
        if (Object.keys(channelStates).length === 0) {
            addChannel();
        } else {
             // Re-calculate channelCount based on remaining IDs if needed, or just increment on add
             // Keeping channelCount as a simple counter for new IDs is fine too.
        }
        saveData();
    }
}

function toggleChannel(id) {
    const channelDiv = document.getElementById(`channel-${id}`);
    const input = channelDiv.querySelector('input[type="text"]');
    const toggleBtn = channelDiv.querySelector('.channel-toggle-btn');
    const spoilerBtn = channelDiv.querySelector('.spoiler-toggle-btn'); // Get spoiler button
    const isEnabled = !(channelStates[id]?.enabled ?? true); // Toggle the state, default to true if state missing

    if (!channelStates[id]) channelStates[id] = { enabled: true, spoiler: false, url: '' }; // Ensure state exists
    channelStates[id].enabled = isEnabled;

    channelDiv.classList.toggle('disabled', !isEnabled);
    input.disabled = !isEnabled;
    // Also disable spoiler button if channel is disabled
    if(spoilerBtn) spoilerBtn.disabled = !isEnabled;

    toggleBtn.classList.toggle('enabled-btn', isEnabled);
    toggleBtn.classList.toggle('disabled-btn', !isEnabled);
    toggleBtn.textContent = isEnabled ? '已启用' : '已禁用';

    if (isEnabled && input.value.trim()) {
        fetchChannelInfo(id);
    } else if (!isEnabled) {
        // If disabled, clear identification info
         const channelNameSpan = document.getElementById(`channel-name-${id}`);
         if(channelNameSpan) {
             channelNameSpan.textContent = '服务器：未识别 | 频道：未识别';
         }
    }
    saveData();
}

// 新增：切换剧透标签状态
function toggleSpoiler(id) {
    const spoilerBtn = document.getElementById(`spoiler-btn-${id}`);
     if (!spoilerBtn || spoilerBtn.disabled) return; // Do nothing if button is disabled

    if (!channelStates[id]) channelStates[id] = { enabled: true, spoiler: false, url: '' }; // Ensure state exists

    const isSpoiler = !(channelStates[id].spoiler ?? false); // Toggle state, default to false
    channelStates[id].spoiler = isSpoiler;

    spoilerBtn.classList.toggle('spoiler-on', isSpoiler);
    spoilerBtn.classList.toggle('spoiler-off', !isSpoiler);
    spoilerBtn.textContent = isSpoiler ? '剧透' : '无剧透';

    updateStatus(`状态：频道 ${id} (${document.getElementById(`channel-name-${id}`)?.textContent || '未识别'}) 文件剧透标签已${isSpoiler ? '开启' : '关闭'}。`, 'info');
    saveData();
}

function enableAllChannels() {
    Object.keys(channelStates).forEach(idStr => {
        const id = parseInt(idStr);
        if (!channelStates[id]?.enabled) { // Only toggle if currently disabled
            toggleChannel(id);
        }
    });
}

function disableAllChannels() {
     Object.keys(channelStates).forEach(idStr => {
        const id = parseInt(idStr);
        if (channelStates[id]?.enabled) { // Only toggle if currently enabled
            toggleChannel(id);
        }
    });
}

// 修改 createChannelElement 以接受 channelData 对象
function createChannelElement(id, data) {
    const { url, enabled, spoiler } = data;
    const div = document.createElement('div');
    div.className = `channel-item${enabled ? '' : ' disabled'}`;
    div.id = `channel-${id}`;
    div.innerHTML = `
        <button class="channel-toggle-btn ${enabled ? 'enabled-btn' : 'disabled-btn'}" onclick="toggleChannel(${id})">${enabled ? '已启用' : '已禁用'}</button>
        <div class="input-group channel-info">
            <span id="channel-name-${id}">服务器：未识别 | 频道：未识别</span>
            <input type="text" value="${url}" placeholder="请输入目标频道地址，例如：https://discord.com/channels/xxx/yyy" ${enabled ? '' : 'disabled'}>
        </div>
        <!-- 剧透标签按钮 -->
        <button class="spoiler-toggle-btn ${spoiler ? 'spoiler-on' : 'spoiler-off'}" id="spoiler-btn-${id}" onclick="toggleSpoiler(${id})" ${enabled ? '' : 'disabled'}>${spoiler ? '剧透' : '无剧透'}</button>
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
        if (!channelStates[id]) channelStates[id] = { enabled: true, spoiler: false, url: '' };
        channelStates[id].url = inputElement.value.trim(); // Update URL in state
        saveData();
        if (channelStates[id].enabled && inputElement.value.trim()) {
             // Add a small debounce to avoid excessive API calls while typing
            if (inputElement._fetchTimeout) clearTimeout(inputElement._fetchTimeout);
            inputElement._fetchTimeout = setTimeout(() => fetchChannelInfo(id), 500);
        } else {
             // Clear info if input is empty
             const channelNameSpan = document.getElementById(`channel-name-${id}`);
             if(channelNameSpan) {
                 channelNameSpan.textContent = '服务器：未识别 | 频道：未识别';
             }
        }
    });
    // No need for 'change' or 'blur' listeners if 'input' handles URL updates and fetches
}

async function fetchChannelInfo(id) {
    const apiToken = apiTokenInput.value.trim();
    const channelItem = document.getElementById(`channel-${id}`);
     if (!channelItem || !channelStates[id]?.enabled) return; // Don't fetch if disabled or item not found

    const channelUrl = channelStates[id].url.trim(); // Get URL from state
    const channelNameSpan = document.getElementById(`channel-name-${id}`);

    if (!apiToken) {
        channelNameSpan.textContent = '服务器：需Token | 频道：需Token';
        return;
    }
    if (!channelUrl) {
        channelNameSpan.textContent = '服务器：未识别 | 频道：未识别';
        return;
    }
    
    // *** BUG FIX: Corrected regex and extraction of guildId/channelId ***
    const urlParts = channelUrl.match(/channels\/(\d+|@me)\/(\d+)/);
    if (!urlParts || urlParts.length < 3) {
        channelNameSpan.textContent = '服务器：格式错误 | 频道：格式错误';
        return;
    }
    const guildId = urlParts[1]; // e.g., server ID or "@me"
    const channelId = urlParts[2]; // e.g., channel ID

    channelNameSpan.textContent = '服务器：获取中... | 频道：获取中...';

    try {
        const timeout = 8000; // Increased timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const headers = { 'Authorization': apiToken };

        // Fetch channel info
        const channelResponse = await fetch(`https://discord.com/api/v9/channels/${channelId}`, {
            method: 'GET', headers, signal: controller.signal
        });
        clearTimeout(timeoutId); // Clear timeout if fetch succeeded

        if (!channelResponse.ok) {
            const errorText = await channelResponse.text(); // Get raw text for more info
             console.error(`频道信息获取失败 (${channelResponse.status}): ${errorText}`);
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
        // popupUploadSpeed.textContent = '上传速度：0 B/s'; // Keep the last speed
    }
}

// --- Data Saving/Loading ---
function saveData() {
    localStorage.setItem('apiToken', apiTokenInput.value.trim());
    localStorage.setItem('blurToken', apiTokenInput.classList.contains('blurred-text'));
    localStorage.setItem('minDelay', minDelayInput.value);
    localStorage.setItem('maxDelay', maxDelayInput.value);
    localStorage.setItem('message', messageInput.value); // Save full message including whitespace potentially

    // Save the entire channelStates object
    localStorage.setItem('channelData', JSON.stringify(channelStates));
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
            // Ensure data structure is correct, provide defaults for older saved data
            const { url = '', enabled = true, spoiler = false } = data;

            channelStates[id] = { url, enabled, spoiler }; // Load state
            const channelDiv = createChannelElement(id, channelStates[id]); // Create element based on state
            channelGroup.appendChild(channelDiv);
            const input = channelDiv.querySelector('input[type="text"]');
            setupChannelInputListeners(input, id); // Setup input listeners
            if (enabled && url) {
                fetchChannelInfo(id); // Fetch info for enabled channels with URLs
            }
             maxId = Math.max(maxId, id);
        });
    }
     // Ensure there's at least one channel input
    if (Object.keys(channelStates).length === 0) {
        addChannel(); // Adds channel 1 and initializes state
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
        .filter(([id, state]) => state.enabled)
        .map(([idStr, state]) => {
            const id = parseInt(idStr);
            const url = state.url.trim();
            // Parse channelId directly here for validation too
            const channelIdMatch = url.match(/channels\/(\d+|@me)\/(\d+)/);
            const channelId = channelIdMatch ? channelIdMatch[2] : null; // Use the correct group for channelId
            return {
                originalIndex: id, // Keep track of the original ID for progress updates
                url: url,
                channelId: channelId,
                name: document.getElementById(`channel-name-${id}`)?.textContent || `频道 ${id}`, // For display
                spoiler: state.spoiler // Include spoiler state
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
        // Check spoiler state for this channel
        const isSpoiler = channelStates[channel.originalIndex]?.spoiler ?? false;

        let totalSize = 0;
        fileItems.forEach((file, index) => {
            // Prepend SPOILER_ if spoiler is enabled for this channel
            const filename = isSpoiler ? `SPOILER_${file.name}` : file.name;
            formData.append(`file${index}`, file, filename); // Append file with potentially modified name
            totalSize += file.size;
        });

        if (message) { // Include message if sending text or file+text
            // Note: If sending files, message content goes in payload_json
            formData.append('payload_json', JSON.stringify({ content: message }));
        }

        body = formData;

    } else if (type === 'text') {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ content: message });
         useXhr = false; // No need for XHR progress on text only
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
                    const finalDelta = (xhr.upload.total || channelUploadedBytes) - channelUploadedBytes; // xhr.upload.total might not be available if not lengthComputable
                     if (finalDelta > 0) totalUploadedBytes += finalDelta;

                    try {
                         // Discord API usually returns JSON on success, but can be empty (204)
                         const responseText = xhr.responseText;
                         if (responseText) {
                             const responseData = JSON.parse(responseText);
                             resolve(responseData);
                         } else {
                             resolve({}); // Empty response (e.g. 204 No Content)
                         }
                    } catch (e) {
                         console.warn(`Received non-JSON response from Discord API for channel ${channel.originalIndex}:`, xhr.responseText);
                         resolve({}); // Resolve with empty object or handle as needed
                    }

                } else {
                    try {
                        const errorData = JSON.parse(xhr.responseText);
                        reject(new Error(errorData.message || `HTTP ${xhr.status}`));
                    } catch {
                        reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText.substring(0,100)}`));
                    }
                }
            };

            xhr.onerror = () => {
                reject(new Error('网络错误或请求被中断'));
            };

            xhr.ontimeout = () => {
                 reject(new Error('请求超时'));
            };
             xhr.timeout = 600000; // 10 minute timeout for uploads.

            xhr.send(body);
        } else {
            // Use fetch for simple text messages (no progress needed)
            fetch(url, { method: 'POST', headers, body })
                .then(async response => { // Use async to await response.json()
                    if (response.ok) {
                        onProgress(100); // Text messages are instant, mark as 100%
                         try {
                            const text = await response.text(); // Get text first
                            if (text) { // If there is text, try to parse as JSON
                                return JSON.parse(text);
                            }
                            return {}; // If no text (e.g., 204 No Content), resolve with empty object
                         } catch (e) {
                             // Handle cases where response might be non-JSON but not empty
                             console.warn(`Received non-JSON response from Discord API (fetch) for channel ${channel.originalIndex}:`, text);
                             return {};
                         }
                    } else {
                         // Try to parse JSON error, fallback to status text
                        const errorText = await response.text();
                         try {
                             const errorData = JSON.parse(errorText);
                              throw new Error(errorData.message || `HTTP ${response.status}`);
                         } catch {
                              throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}...`); // Include part of response text
                         }
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
    loadTheme(); // Load theme without animation on initial load
    loadSavedData(); // This will now load channels and their states including spoiler
    initializeLottie();
    // Add event listeners for saving data on input change (already done below)
    // Add listener for the new close button in the popup (already done below)

    // Initial setup if no channels were loaded
    if (Object.keys(channelStates).length === 0) {
         // This case is handled by loadSavedData calling addChannel()
         // So no need to call addChannel() here directly.
    } else {
        // Ensure event listeners are attached to loaded inputs
        Object.keys(channelStates).forEach(idStr => {
            const id = parseInt(idStr);
            const channelDiv = document.getElementById(`channel-${id}`);
            if (channelDiv) {
                const input = channelDiv.querySelector('input[type="text"]');
                if (input) setupChannelInputListeners(input, id);
                // Spoiler button onclick is in HTML, no need to re-attach here
            }
        });
    }
};

// Add event listeners for saving data on input change
// apiTokenInput.addEventListener('input', saveData); // Handled by pasteToken and loadSavedData setting value
// messageInput.addEventListener('input', saveData); // Already has listener above

// Add listener for the new close button in the popup
document.querySelector('#progressPopup .secondary-btn').addEventListener('click', hideProgressPopup);

// (Optional) Add focus helper if needed
// function ensureInputFocus() { ... }