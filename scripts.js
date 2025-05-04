// 主题切换功能
function toggleTheme() {
    const body = document.body;
    const sunIcon = document.getElementById('sun-icon');
    const moonIcon = document.getElementById('moon-icon');
    if (body.classList.contains('theme-light')) {
        body.classList.remove('theme-light');
        body.classList.add('theme-dark');
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
        localStorage.setItem('theme', 'dark');
    } else {
        body.classList.remove('theme-dark');
        body.classList.add('theme-light');
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
        localStorage.setItem('theme', 'light');
    }
}

// 加载保存的主题设置
function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    const body = document.body;
    const sunIcon = document.getElementById('sun-icon');
    const moonIcon = document.getElementById('moon-icon');
    if (savedTheme === 'dark') {
        body.classList.remove('theme-light');
        body.classList.add('theme-dark');
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
    } else {
        body.classList.remove('theme-dark');
        body.classList.add('theme-light');
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
    }
}

// 切换 API Token 可见性
function toggleTokenVisibility() {
    const apiTokenInput = document.getElementById('apiToken');
    const eyeClosed = document.querySelector('.eye-closed');
    const eyeOpen = document.querySelector('.eye-open');
    if (apiTokenInput.classList.contains('blurred-text')) {
        apiTokenInput.classList.remove('blurred-text');
        eyeClosed.style.display = 'none';
        eyeOpen.style.display = 'block';
    } else {
        apiTokenInput.classList.add('blurred-text');
        eyeClosed.style.display = 'block';
        eyeOpen.style.display = 'none';
    }
    localStorage.setItem('blurToken', apiTokenInput.classList.contains('blurred-text'));
}

// 粘贴 API Token 从剪贴板
function pasteToken() {
    const apiTokenInput = document.getElementById('apiToken');
    if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText()
            .then(text => {
                if (text) {
                    apiTokenInput.value = text.trim();
                    saveData();
                    alert('API Token 已从剪贴板粘贴成功');
                } else {
                    alert('剪贴板为空，请手动粘贴（Ctrl+V）');
                }
            })
            .catch(err => {
                alert('无法访问剪贴板，请手动粘贴（Ctrl+V）。错误：' + err.message);
            });
    } else {
        alert('当前浏览器不支持自动粘贴功能，请手动粘贴（Ctrl+V）');
    }
}

// 切换编辑器标签
function switchEditorTab(tab) {
    const editTab = document.querySelectorAll('.editor-tab')[0];
    const previewTab = document.querySelectorAll('.editor-tab')[1];
    const messageInput = document.getElementById('message');
    const markdownPreview = document.getElementById('markdownPreview');
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
        markdownPreview.innerHTML = messageInput.value.trim() ? marked.parse(messageInput.value) : '<p>无内容预览</p>';
    }
}

// 折叠面板切换
function togglePanel(header) {
    const panelContent = header.nextElementSibling;
    header.classList.toggle('collapsed');
    panelContent.classList.toggle('collapsed');
}

// 文件预览功能
const fileInput = document.getElementById('fileInput');
const previewContainer = document.getElementById('previewContainer');
const uploadArea = document.getElementById('uploadArea');
const messageInput = document.getElementById('message');
const markdownPreview = document.getElementById('markdownPreview');
const apiTokenInput = document.getElementById('apiToken');
const minDelayInput = document.getElementById('minDelay');
const maxDelayInput = document.getElementById('maxDelay');
const minDelayRange = document.getElementById('minDelayRange');
const maxDelayRange = document.getElementById('maxDelayRange');
let fileItems = []; // 存储多个文件
let channelCount = 1; // 频道输入框计数器
let channelStates = {}; // 存储每个频道的启用/禁用状态
let uploadStartTime = 0; // 上传开始时间
let totalUploadedBytes = 0; // 总上传字节数
let lastUploadedBytes = 0; // 上一次更新的字节数，用于计算网速
let speedUpdateInterval = null; // 网速更新定时器
let sendMode = 'sequential'; // 默认发送模式为逐条发送

// Markdown 预览功能
messageInput.addEventListener('input', function() {
    const text = messageInput.value.trim();
    saveData();
    if (document.querySelectorAll('.editor-tab')[1].classList.contains('active')) {
        markdownPreview.innerHTML = text ? marked.parse(text) : '<p>无内容预览</p>';
    }
});

// 随机延迟滑块和输入框同步
minDelayRange.addEventListener('input', function() {
    minDelayInput.value = this.value;
    if (parseInt(this.value) > parseInt(maxDelayInput.value)) {
        maxDelayInput.value = this.value;
        maxDelayRange.value = this.value;
    }
    saveData();
});

maxDelayRange.addEventListener('input', function() {
    maxDelayInput.value = this.value;
    if (parseInt(this.value) < parseInt(minDelayInput.value)) {
        minDelayInput.value = this.value;
        minDelayRange.value = this.value;
    }
    saveData();
});

minDelayInput.addEventListener('input', function() {
    if (this.value < 0) this.value = 0;
    minDelayRange.value = this.value;
    if (parseInt(this.value) > parseInt(maxDelayInput.value)) {
        maxDelayInput.value = this.value;
        maxDelayRange.value = this.value;
    }
    saveData();
});

maxDelayInput.addEventListener('input', function() {
    if (this.value < 0) this.value = 0;
    maxDelayRange.value = this.value;
    if (parseInt(this.value) < parseInt(minDelayInput.value)) {
        minDelayInput.value = this.value;
        minDelayRange.value = this.value;
    }
    saveData();
});

// 更新文件预览
function updateFilePreview() {
    previewContainer.innerHTML = '';
    if (fileItems.length > 0) {
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
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes >= 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    } else if (bytes >= 1024) {
        return (bytes / 1024).toFixed(2) + ' KB';
    } else {
        return bytes + ' B';
    }
}

// 删除指定文件
function removeFile(index) {
    fileItems.splice(index, 1);
    updateFilePreview();
}

// 加载本地保存的数据
function loadSavedData() {
    // 加载 API Token
    const savedApiToken = localStorage.getItem('apiToken');
    if (savedApiToken) {
        apiTokenInput.value = savedApiToken;
    }

    // 加载模糊设置
    const savedBlurToken = localStorage.getItem('blurToken');
    const eyeClosed = document.querySelector('.eye-closed');
    const eyeOpen = document.querySelector('.eye-open');
    if (savedBlurToken !== null && savedBlurToken === 'false') {
        apiTokenInput.classList.remove('blurred-text');
        eyeClosed.style.display = 'none';
        eyeOpen.style.display = 'block';
    } else {
        apiTokenInput.classList.add('blurred-text');
        eyeClosed.style.display = 'block';
        eyeOpen.style.display = 'none';
    }

    // 加载随机延迟设置
    const savedMinDelay = localStorage.getItem('minDelay');
    if (savedMinDelay !== null) {
        minDelayInput.value = savedMinDelay;
        minDelayRange.value = savedMinDelay;
    }
    const savedMaxDelay = localStorage.getItem('maxDelay');
    if (savedMaxDelay !== null) {
        maxDelayInput.value = savedMaxDelay;
        maxDelayRange.value = savedMaxDelay;
    }

    // 加载附加消息
    const savedMessage = localStorage.getItem('message');
    if (savedMessage) {
        messageInput.value = savedMessage;
    }

    // 加载频道地址和状态
    const savedChannels = localStorage.getItem('channels');
    const savedStates = localStorage.getItem('channelStates');
    if (savedChannels) {
        const channels = JSON.parse(savedChannels);
        const states = savedStates ? JSON.parse(savedStates) : {};
        if (channels.length > 0) {
            document.getElementById('channelGroup').innerHTML = '';
            channelCount = 0;
            channels.forEach((channel, index) => {
                channelCount++;
                const isEnabled = states[channelCount] !== false;
                const newChannelDiv = document.createElement('div');
                newChannelDiv.className = `channel-item${isEnabled ? '' : ' disabled'}`;
                newChannelDiv.id = `channel-${channelCount}`;
                newChannelDiv.innerHTML = `
                    <button class="channel-toggle-btn ${isEnabled ? 'enabled-btn' : 'disabled-btn'}" onclick="toggleChannel(${channelCount})">${isEnabled ? '已启用' : '已禁用'}</button>
                    <div class="input-group channel-info">
                        <span id="channel-name-${channelCount}">服务器：未识别 | 频道：未识别</span>
                        <input type="text" value="${channel}" placeholder="请输入目标频道地址，例如：https://discord.com/channels/xxx/yyy" ${isEnabled ? '' : 'disabled'}>
                    </div>
                    <button class="delete-btn" onclick="removeChannel(${channelCount})">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                `;
                document.getElementById('channelGroup').appendChild(newChannelDiv);
                channelStates[channelCount] = isEnabled;
                const input = newChannelDiv.querySelector('input[type="text"]');
                input.addEventListener('input', function() {
                    saveData();
                    if (channelStates[channelCount]) fetchChannelInfo(channelCount);
                });
                input.addEventListener('change', function() {
                    saveData();
                    if (channelStates[channelCount]) fetchChannelInfo(channelCount);
                });
                input.addEventListener('blur', function() {
                    saveData();
                    if (channelStates[channelCount]) fetchChannelInfo(channelCount);
                });
                if (channel && isEnabled) fetchChannelInfo(channelCount);
            });
        }
    }
}

// 保存数据到本地
function saveData() {
    localStorage.setItem('apiToken', apiTokenInput.value.trim());
    localStorage.setItem('blurToken', apiTokenInput.classList.contains('blurred-text'));
    localStorage.setItem('minDelay', parseInt(minDelayInput.value) || 0);
    localStorage.setItem('maxDelay', parseInt(maxDelayInput.value) || 0);
    localStorage.setItem('message', messageInput.value.trim());
    const channelInputs = document.querySelectorAll('#channelGroup input[type="text"]');
    const channelUrls = Array.from(channelInputs).map(input => input.value.trim());
    localStorage.setItem('channels', JSON.stringify(channelUrls));
    localStorage.setItem('channelStates', JSON.stringify(channelStates));
}

// 获取频道和服务器信息，添加超时和详细错误处理
async function fetchChannelInfo(channelIndex) {
    const apiToken = apiTokenInput.value.trim();
    const channelItem = document.getElementById(`channel-${channelIndex}`);
    if (!channelItem) return;
    const channelInput = channelItem.querySelector('input[type="text"]');
    const channelUrl = channelInput.value.trim();
    const channelNameSpan = document.getElementById(`channel-name-${channelIndex}`);

    if (!apiToken || !channelUrl) {
        channelNameSpan.textContent = '服务器：未识别 | 频道：未识别';
        updateStatus(`状态：频道 ${channelIndex} 信息获取失败 - API Token 或频道地址为空`, 'error');
        return;
    }

    try {
        const parts = channelUrl.split('/');
        const channelId = parts.pop();
        const guildId = parts.length > 2 ? parts[parts.length - 2] : null;
        if (!channelId || !guildId) {
            channelNameSpan.textContent = '服务器：无效地址 | 频道：无效地址';
            updateStatus(`状态：频道 ${channelIndex} 地址无效 - 格式错误`, 'error');
            return;
        }

        channelNameSpan.textContent = '服务器：正在获取... | 频道：正在获取...';
        updateStatus(`状态：正在获取频道 ${channelIndex} 信息...`);

        // 设置超时 5 秒
        const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('请求超时')), ms));
        const fetchWithTimeout = (url, options, ms = 5000) => Promise.race([
            fetch(url, options),
            timeout(ms)
        ]);

        const channelResponse = await fetchWithTimeout(`https://discord.com/api/v9/channels/${channelId}`, {
            method: 'GET',
            headers: { 'Authorization': apiToken }
        });

        let channelName = '获取失败';
        let guildName = '获取失败';

        if (channelResponse.ok) {
            const channelData = await channelResponse.json();
            channelName = channelData.name || '未知频道';
            const guildIdFromChannel = channelData.guild_id;
            if (guildIdFromChannel) {
                const guildResponse = await fetchWithTimeout(`https://discord.com/api/v9/guilds/${guildIdFromChannel}`, {
                    method: 'GET',
                    headers: { 'Authorization': apiToken }
                });
                if (guildResponse.ok) {
                    const guildData = await guildResponse.json();
                    guildName = guildData.name || '未知服务器';
                } else {
                    updateStatus(`状态：频道 ${channelIndex} 服务器信息获取失败 - 错误码：${guildResponse.status}`, 'error');
                }
            }
            channelNameSpan.textContent = `服务器：${guildName} | 频道：#${channelName}`;
            updateStatus(`状态：成功获取频道 ${channelIndex} 信息 - 服务器：${guildName} | 频道：#${channelName}`, 'success');
        } else {
            channelNameSpan.textContent = '服务器：获取失败 | 频道：获取失败';
            updateStatus(`状态：频道 ${channelIndex} 信息获取失败 - 错误码：${channelResponse.status}`, 'error');
        }
    } catch (err) {
        channelNameSpan.textContent = '服务器：获取失败 | 频道：获取失败';
        updateStatus(`状态：频道 ${channelIndex} 信息获取失败 - 错误：${err.message}`, 'error');
    }
}

// 切换频道启用/禁用状态
function toggleChannel(channelIndex) {
    const channelDiv = document.getElementById(`channel-${channelIndex}`);
    const input = channelDiv.querySelector('input[type="text"]');
    const toggleBtn = channelDiv.querySelector('.channel-toggle-btn');
    const isEnabled = channelStates[channelIndex];
    if (isEnabled) {
        channelDiv.classList.add('disabled');
        input.disabled = true;
        channelStates[channelIndex] = false;
        toggleBtn.classList.remove('enabled-btn');
        toggleBtn.classList.add('disabled-btn');
        toggleBtn.textContent = '已禁用';
    } else {
        channelDiv.classList.remove('disabled');
        input.disabled = false;
        channelStates[channelIndex] = true;
        toggleBtn.classList.remove('disabled-btn');
        toggleBtn.classList.add('enabled-btn');
        toggleBtn.textContent = '已启用';
        if (input.value.trim()) fetchChannelInfo(channelIndex);
    }
    saveData();
}

// 一键启用所有频道
function enableAllChannels() {
    const channelItems = document.querySelectorAll('#channelGroup .channel-item');
    for (let i = 1; i <= channelCount; i++) {
        const channelDiv = document.getElementById(`channel-${i}`);
        if (channelDiv) {
            const input = channelDiv.querySelector('input[type="text"]');
            const toggleBtn = channelDiv.querySelector('.channel-toggle-btn');
            channelDiv.classList.remove('disabled');
            input.disabled = false;
            channelStates[i] = true;
            toggleBtn.classList.remove('disabled-btn');
            toggleBtn.classList.add('enabled-btn');
            toggleBtn.textContent = '已启用';
            if (input.value.trim()) fetchChannelInfo(i);
        }
    }
    saveData();
}

// 一键禁用所有频道
function disableAllChannels() {
    const channelItems = document.querySelectorAll('#channelGroup .channel-item');
    for (let i = 1; i <= channelCount; i++) {
        const channelDiv = document.getElementById(`channel-${i}`);
        if (channelDiv) {
            const input = channelDiv.querySelector('input[type="text"]');
            const toggleBtn = channelDiv.querySelector('.channel-toggle-btn');
            channelDiv.classList.add('disabled');
            input.disabled = true;
            channelStates[i] = false;
            toggleBtn.classList.remove('enabled-btn');
            toggleBtn.classList.add('disabled-btn');
            toggleBtn.textContent = '已禁用';
        }
    }
    saveData();
}

// 新增频道输入框
function addChannel() {
    channelCount++;
    const channelGroup = document.getElementById('channelGroup');
    const newChannelDiv = document.createElement('div');
    newChannelDiv.className = 'channel-item';
    newChannelDiv.id = `channel-${channelCount}`;
    newChannelDiv.innerHTML = `
        <button class="channel-toggle-btn enabled-btn" onclick="toggleChannel(${channelCount})">已启用</button>
        <div class="input-group channel-info">
            <span id="channel-name-${channelCount}">服务器：未识别 | 频道：未识别</span>
            <input type="text" placeholder="请输入目标频道地址，例如：https://discord.com/channels/xxx/yyy">
        </div>
        <button class="delete-btn" onclick="removeChannel(${channelCount})">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
        </button>
    `;
    channelGroup.appendChild(newChannelDiv);
    channelStates[channelCount] = true;
    const input = newChannelDiv.querySelector('input[type="text"]');
    input.addEventListener('input', function() {
        saveData();
        if (channelStates[channelCount]) fetchChannelInfo(channelCount);
    });
    input.addEventListener('change', function() {
        saveData();
        if (channelStates[channelCount]) fetchChannelInfo(channelCount);
    });
    input.addEventListener('blur', function() {
        saveData();
        if (channelStates[channelCount]) fetchChannelInfo(channelCount);
    });
    saveData();
}

// 删除频道输入框
function removeChannel(id) {
    const channelDiv = document.getElementById(`channel-${id}`);
    if (channelDiv) {
        channelDiv.remove();
        delete channelStates[id];
        // 调整 channelCount 为当前最大 ID
        const remainingChannels = document.querySelectorAll('#channelGroup .channel-item');
        if (remainingChannels.length > 0) {
            channelCount = Math.max(...Array.from(remainingChannels).map(ch => parseInt(ch.id.split('-')[1])));
        } else {
            channelCount = 0;
            addChannel(); // 如果没有频道了，自动添加一个新的
        }
        saveData();
    }
}

// 页面加载时读取保存的数据和主题
window.onload = function() {
    loadTheme();
    loadSavedData();
    initializeLottie();
    ensureInputFocus();
    updateSendModeButtons();
};

// 确保输入框在移动端可获取焦点
function ensureInputFocus() {
    const inputs = document.querySelectorAll('input[type="text"]');
    inputs.forEach(input => {
        input.addEventListener('touchstart', function(e) {
            e.stopPropagation();
            this.focus();
        });
        input.addEventListener('click', function(e) {
            e.stopPropagation();
            this.focus();
        });
    });
}

// 初始化 Lottie 加载动画
let lottieAnimation;
function initializeLottie() {
    lottieAnimation = lottie.loadAnimation({
        container: document.getElementById('loadingSpinner'),
        renderer: 'svg',
        loop: true,
        autoplay: false,
        path: 'https://assets2.lottiefiles.com/packages/lf20_usmfxnmu.json' // 环形进度条动画
    });
}

// 显示加载状态
function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
    if (lottieAnimation) lottieAnimation.play();
}

// 隐藏加载状态
function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
    if (lottieAnimation) lottieAnimation.stop();
}

// 监听输入变化时保存数据
apiTokenInput.addEventListener('input', saveData);
messageInput.addEventListener('input', saveData);

// 文件上传功能
fileInput.addEventListener('change', function(e) {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        const newFiles = files.filter(file => !fileItems.some(existing => existing.name === file.name && existing.size === file.size));
        fileItems = [...fileItems, ...newFiles].slice(0, 10);
        if (fileItems.length < files.length + fileItems.length) {
            alert('最多只能上传10个文件，超出部分将被忽略。');
        }
        updateFilePreview();
    }
});

// 拖放上传
uploadArea.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.stopPropagation();
});

uploadArea.addEventListener('drop', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
        const newFiles = files.filter(file => !fileItems.some(existing => existing.name === file.name && existing.size === file.size));
        fileItems = [...fileItems, ...newFiles].slice(0, 10);
        if (fileItems.length < files.length + fileItems.length) {
            alert('最多只能上传10个文件，超出部分将被忽略。');
        }
        updateFilePreview();
    }
});

uploadArea.addEventListener('click', function() {
    fileInput.click();
});

// 监听剪贴板粘贴事件
document.addEventListener('paste', function(e) {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && fileItems.length < 10) {
            const blob = items[i].getAsFile();
            const uniqueName = `pasted-file-${Date.now()}-${Math.floor(Math.random() * 1000)}${blob.name ? blob.name : '.bin'}`;
            const file = new File([blob], uniqueName, { type: blob.type });
            if (!fileItems.some(existing => existing.name === file.name)) {
                fileItems.push(file);
                updateFilePreview();
            }
            if (fileItems.length >= 10) {
                alert('最多只能上传10个文件，超出部分将被忽略。');
                break;
            }
        }
    }
});

// 切换发送模式
function toggleSendMode(mode) {
    sendMode = mode;
    updateSendModeButtons();
}

// 更新发送模式按钮样式
function updateSendModeButtons() {
    const sequentialBtn = document.getElementById('sequentialBtn');
    const parallelBtn = document.getElementById('parallelBtn');
    if (sendMode === 'sequential') {
        sequentialBtn.classList.remove('secondary-btn');
        sequentialBtn.classList.add('primary-btn');
        parallelBtn.classList.remove('primary-btn');
        parallelBtn.classList.add('secondary-btn');
    } else {
        sequentialBtn.classList.remove('primary-btn');
        sequentialBtn.classList.add('secondary-btn');
        parallelBtn.classList.remove('secondary-btn');
        parallelBtn.classList.add('primary-btn');
    }
}

// 延迟函数，支持进度更新
function delayWithProgress(ms, channelIndex) {
    return new Promise(resolve => {
        const startTime = Date.now();
        const intervalId = setInterval(() => {
            const currentTime = Date.now();
            const elapsedTime = currentTime - startTime;
            const progress = Math.min((elapsedTime / ms) * 50, 50); // 前50%进度基于延迟时间
            updateProgressBar(channelIndex, progress);
            if (elapsedTime >= ms) {
                clearInterval(intervalId);
                updateProgressBar(channelIndex, 50); // 确保延迟完成后进度为50%
                resolve();
            }
        }, 200); // 每200毫秒更新一次，即每秒5次
    });
}

// 获取随机延迟时间
function getRandomDelay() {
    const minDelay = parseInt(minDelayInput.value) || 0;
    const maxDelay = parseInt(maxDelayInput.value) || 0;
    if (minDelay >= maxDelay) {
        return minDelay * 1000;
    }
    const range = (maxDelay - minDelay) * 1000;
    return (minDelay * 1000) + Math.floor(Math.random() * range);
}

// 更新状态日志
function updateStatus(message, type = 'info') {
    const statusLog = document.getElementById('status');
    const p = document.createElement('p');
    p.textContent = message;
    if (type === 'success') p.classList.add('success');
    if (type === 'error') p.classList.add('error');
    statusLog.appendChild(p);
    statusLog.scrollTo({ top: statusLog.scrollHeight, behavior: 'smooth' });
}

// 计算并更新上传速度，每秒5次更新
function startUploadSpeedUpdate() {
    if (speedUpdateInterval) return; // 避免重复启动定时器
    lastUploadedBytes = totalUploadedBytes;
    uploadStartTime = Date.now();
    speedUpdateInterval = setInterval(() => {
        const currentTime = Date.now();
        const elapsedTime = (currentTime - uploadStartTime) / 1000; // 转换为秒
        const deltaBytes = totalUploadedBytes - lastUploadedBytes;
        const deltaTime = elapsedTime > 0.2 ? 0.2 : elapsedTime; // 避免除以0或过小的时间间隔
        const speed = deltaBytes / deltaTime; // 字节/秒
        const speedDisplay = document.getElementById('uploadSpeed');
        if (speed > 1024 * 1024) {
            speedDisplay.textContent = `上传速度：${(speed / (1024 * 1024)).toFixed(2)} MB/s`;
        } else if (speed > 1024) {
            speedDisplay.textContent = `上传速度：${(speed / 1024).toFixed(2)} KB/s`;
        } else {
            speedDisplay.textContent = `上传速度：${speed.toFixed(2)} B/s`;
        }
        lastUploadedBytes = totalUploadedBytes;
        uploadStartTime = currentTime; // 重置时间起点
    }, 200); // 每200毫秒更新一次，即每秒5次
}

// 停止上传速度更新
function stopUploadSpeedUpdate() {
    if (speedUpdateInterval) {
        clearInterval(speedUpdateInterval);
        speedUpdateInterval = null;
        const speedDisplay = document.getElementById('uploadSpeed');
        speedDisplay.textContent = '上传速度：0 B/s';
    }
}

// 初始化进度条
function initializeProgressBars(channels) {
    const progressBarsContainer = document.getElementById('progressBars');
    progressBarsContainer.innerHTML = '';
    if (sendMode === 'sequential' || channels.length === 1) {
        channels.forEach((channel, index) => {
            const channelName = document.getElementById(`channel-name-${index + 1}`)?.textContent || `频道 ${index + 1}`;
            const progressContainer = document.createElement('div');
            progressContainer.className = 'progress-container';
            progressContainer.id = `progress-container-${index + 1}`;
            progressContainer.innerHTML = `
                <div class="progress-label">
                    <span>${channelName}</span>
                    <span id="progress-percent-${index + 1}">0%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress" id="progress-${index + 1}" style="width: 0%;"></div>
                </div>
            `;
            progressBarsContainer.appendChild(progressContainer);
        });
    } else {
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';
        progressContainer.id = `progress-container-total`;
        progressContainer.innerHTML = `
            <div class="progress-label">
                <span>总进度</span>
                <span id="progress-percent-total">0%</span>
            </div>
            <div class="progress-bar">
                <div class="progress" id="progress-total" style="width: 0%;"></div>
            </div>
        `;
        progressBarsContainer.appendChild(progressContainer);
    }
    document.getElementById('speedDisplay').style.display = 'block';
    document.getElementById('progressBars').style.display = 'block';
    document.getElementById('uploadSpeed').textContent = '上传速度：0 B/s';
}

// 更新进度条
function updateProgressBar(channelIndex, percentage) {
    if (sendMode === 'sequential') {
        const progressElement = document.getElementById(`progress-${channelIndex}`);
        const progressPercent = document.getElementById(`progress-percent-${channelIndex}`);
        if (progressElement && progressPercent) {
            progressElement.style.width = `${percentage}%`;
            progressPercent.textContent = `${Math.round(percentage)}%`;
        }
    } else {
        const progressElement = document.getElementById(`progress-total`);
        const progressPercent = document.getElementById(`progress-percent-total`);
        if (progressElement && progressPercent) {
            progressElement.style.width = `${percentage}%`;
            progressPercent.textContent = `${Math.round(percentage)}%`;
        }
    }
}

// 隐藏进度条和网速显示
function hideProgressBars() {
    document.getElementById('speedDisplay').style.display = 'none';
    document.getElementById('progressBars').style.display = 'none';
    document.getElementById('progressBars').innerHTML = '';
}

// 使用 XMLHttpRequest 发送文件到 Discord 频道，支持上传进度监控
async function sendFile() {
    const apiToken = apiTokenInput.value.trim();
    const channelInputs = document.querySelectorAll('#channelGroup input[type="text"]');
    const channels = Array.from(channelInputs)
        .map((input, index) => ({
            url: input.value.trim(),
            enabled: channelStates[index + 1]
        }))
        .filter(channel => channel.url !== '' && channel.enabled);

    if (!apiToken) {
        updateStatus('状态：错误 - 请填写 API Token！', 'error');
        return;
    }
    if (channels.length === 0) {
        updateStatus('状态：错误 - 请至少启用一个有效的频道地址！', 'error');
        return;
    }
    if (fileItems.length === 0) {
        updateStatus('状态：错误 - 请至少上传一个文件！', 'error');
        return;
    }

    updateStatus('状态：正在发送...');
    showLoading();
    initializeProgressBars(channels);
    totalUploadedBytes = 0;
    lastUploadedBytes = 0;
    startUploadSpeedUpdate();

    if (sendMode === 'sequential') {
        for (let i = 0; i < channels.length; i++) {
            const channel = channels[i];
            try {
                const channelId = channel.url.split('/').pop();
                if (!channelId) {
                    updateStatus(`状态：错误 - 无效的频道地址：${channel.url}`, 'error');
                    updateProgressBar(i + 1, 100); // 标记为完成，即使失败
                    continue;
                }

                const delayTime = getRandomDelay();
                updateStatus(`状态：等待随机延迟 ${Math.round(delayTime / 1000)} 秒后发送到频道 ${channel.url}`);
                await delayWithProgress(delayTime, i + 1); // 使用带进度更新的延迟函数

                if (fileItems.length > 0) {
                    const formData = new FormData();
                    let totalSize = 0;
                    fileItems.forEach((file, index) => {
                        formData.append(`file${index}`, file);
                        totalSize += file.size;
                    });

                    // 使用 XMLHttpRequest 替代 fetch，以便监听上传进度
                    await new Promise((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.open('POST', `https://discord.com/api/v9/channels/${channelId}/messages`, true);
                        xhr.setRequestHeader('Authorization', apiToken);

                        // 监听上传进度
                        xhr.upload.onprogress = (event) => {
                            if (event.lengthComputable) {
                                totalUploadedBytes = event.loaded;
                                // 进度条更新为50%（延迟） + (上传进度/总大小)*50%
                                const uploadProgress = (event.loaded / event.total) * 50;
                                updateProgressBar(i + 1, 50 + uploadProgress);
                            }
                        };

                        xhr.onload = () => {
                            if (xhr.status >= 200 && xhr.status < 300) {
                                updateStatus(`状态：成功发送文件到频道 ${channel.url}`, 'success');
                                updateProgressBar(i + 1, 100);
                                resolve(xhr.response);
                            } else {
                                try {
                                    const error = JSON.parse(xhr.responseText);
                                    updateStatus(`状态：发送失败到频道 ${channel.url}，错误：${error.message || '未知错误'}`, 'error');
                                } catch {
                                    updateStatus(`状态：发送失败到频道 ${channel.url}，错误：状态码 ${xhr.status}`, 'error');
                                }
                                updateProgressBar(i + 1, 100);
                                reject(new Error(`HTTP error: ${xhr.status}`));
                            }
                        };

                        xhr.onerror = () => {
                            updateStatus(`状态：发送失败到频道 ${channel.url}，错误：网络错误`, 'error');
                            updateProgressBar(i + 1, 100);
                            reject(new Error('Network error'));
                        };

                        xhr.send(formData);
                    });
                }
            } catch (err) {
                updateStatus(`状态：发送失败到频道 ${channel.url}，错误：${err.message}`, 'error');
                updateProgressBar(i + 1, 100); // 标记为完成，即使失败
            }
        }
    } else {
        const promises = channels.map(async (channel, i) => {
            try {
                const channelId = channel.url.split('/').pop();
                if (!channelId) {
                    updateStatus(`状态：错误 - 无效的频道地址：${channel.url}`, 'error');
                    return;
                }

                const delayTime = getRandomDelay();
                updateStatus(`状态：等待随机延迟 ${Math.round(delayTime / 1000)} 秒后发送到频道 ${channel.url}`);
                await delayWithProgress(delayTime, i + 1);

                if (fileItems.length > 0) {
                    const formData = new FormData();
                    let totalSize = 0;
                    fileItems.forEach((file, index) => {
                        formData.append(`file${index}`, file);
                        totalSize += file.size;
                    });

                    await new Promise((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.open('POST', `https://discord.com/api/v9/channels/${channelId}/messages`, true);
                        xhr.setRequestHeader('Authorization', apiToken);

                        xhr.upload.onprogress = (event) => {
                            if (event.lengthComputable) {
                                totalUploadedBytes += event.loaded / channels.length;
                                const uploadProgress = (totalUploadedBytes / (totalSize * channels.length)) * 100;
                                updateProgressBar(1, uploadProgress);
                            }
                        };

                        xhr.onload = () => {
                            if (xhr.status >= 200 && xhr.status < 300) {
                                updateStatus(`状态：成功发送文件到频道 ${channel.url}`, 'success');
                                resolve(xhr.response);
                            } else {
                                try {
                                    const error = JSON.parse(xhr.responseText);
                                    updateStatus(`状态：发送失败到频道 ${channel.url}，错误：${error.message || '未知错误'}`, 'error');
                                } catch {
                                    updateStatus(`状态：发送失败到频道 ${channel.url}，错误：状态码 ${xhr.status}`, 'error');
                                }
                                reject(new Error(`HTTP error: ${xhr.status}`));
                            }
                        };

                        xhr.onerror = () => {
                            updateStatus(`状态：发送失败到频道 ${channel.url}，错误：网络错误`, 'error');
                            reject(new Error('Network error'));
                        };

                        xhr.send(formData);
                    });
                }
            } catch (err) {
                updateStatus(`状态：发送失败到频道 ${channel.url}，错误：${err.message}`, 'error');
            }
        });
        await Promise.all(promises);
        updateProgressBar(1, 100);
    }
    stopUploadSpeedUpdate();
    hideLoading();
    hideProgressBars();
}

// 发送纯文本消息到 Discord 频道
async function sendText() {
    const apiToken = apiTokenInput.value.trim();
    const channelInputs = document.querySelectorAll('#channelGroup input[type="text"]');
    const channels = Array.from(channelInputs)
        .map((input, index) => ({
            url: input.value.trim(),
            enabled: channelStates[index + 1]
        }))
        .filter(channel => channel.url !== '' && channel.enabled);
    const message = messageInput.value.trim();

    if (!apiToken) {
        updateStatus('状态：错误 - 请填写 API Token！', 'error');
        return;
    }
    if (channels.length === 0) {
        updateStatus('状态：错误 - 请至少启用一个有效的频道地址！', 'error');
        return;
    }
    if (!message) {
        updateStatus('状态：错误 - 请输入消息内容！', 'error');
        return;
    }

    updateStatus('状态：正在发送...');
    showLoading();
    initializeProgressBars(channels);
    totalUploadedBytes = 0;
    lastUploadedBytes = 0;
    startUploadSpeedUpdate();

    if (sendMode === 'sequential') {
        for (let i = 0; i < channels.length; i++) {
            const channel = channels[i];
            try {
                const channelId = channel.url.split('/').pop();
                if (!channelId) {
                    updateStatus(`状态：错误 - 无效的频道地址：${channel.url}`, 'error');
                    updateProgressBar(i + 1, 100); // 标记为完成，即使失败
                    continue;
                }

                const delayTime = getRandomDelay();
                updateStatus(`状态：等待随机延迟 ${Math.round(delayTime / 1000)} 秒后发送到频道 ${channel.url}`);
                await delayWithProgress(delayTime, i + 1); // 使用带进度更新的延迟函数

                const response = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': apiToken,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ content: message })
                });

                if (response.ok) {
                    updateStatus(`状态：成功发送纯文本消息到频道 ${channel.url}`, 'success');
                    updateProgressBar(i + 1, 100);
                } else {
                    const error = await response.json();
                    updateStatus(`状态：发送失败到频道 ${channel.url}，错误：${error.message || '未知错误'}`, 'error');
                    updateProgressBar(i + 1, 100); // 标记为完成，即使失败
                }
            } catch (err) {
                updateStatus(`状态：发送失败到频道 ${channel.url}，错误：${err.message}`, 'error');
                updateProgressBar(i + 1, 100); // 标记为完成，即使失败
            }
        }
    } else {
        const promises = channels.map(async (channel, i) => {
            try {
                const channelId = channel.url.split('/').pop();
                if (!channelId) {
                    updateStatus(`状态：错误 - 无效的频道地址：${channel.url}`, 'error');
                    return;
                }

                const delayTime = getRandomDelay();
                updateStatus(`状态：等待随机延迟 ${Math.round(delayTime / 1000)} 秒后发送到频道 ${channel.url}`);
                await delayWithProgress(delayTime, i + 1);

                const response = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': apiToken,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ content: message })
                });

                if (response.ok) {
                    updateStatus(`状态：成功发送纯文本消息到频道 ${channel.url}`, 'success');
                } else {
                    const error = await response.json();
                    updateStatus(`状态：发送失败到频道 ${channel.url}，错误：${error.message || '未知错误'}`, 'error');
                }
            } catch (err) {
                updateStatus(`状态：发送失败到频道 ${channel.url}，错误：${err.message}`, 'error');
            }
        });
        await Promise.all(promises);
        updateProgressBar(1, 100);
    }
    stopUploadSpeedUpdate();
    hideLoading();
    hideProgressBars();
}

// 发送文件和文本到 Discord 频道
async function sendFileAndText() {
    const apiToken = apiTokenInput.value.trim();
    const channelInputs = document.querySelectorAll('#channelGroup input[type="text"]');
    const channels = Array.from(channelInputs)
        .map((input, index) => ({
            url: input.value.trim(),
            enabled: channelStates[index + 1]
        }))
        .filter(channel => channel.url !== '' && channel.enabled);
    const message = messageInput.value.trim();

    if (!apiToken) {
        updateStatus('状态：错误 - 请填写 API Token！', 'error');
        return;
    }
    if (channels.length === 0) {
        updateStatus('状态：错误 - 请至少启用一个有效的频道地址！', 'error');
        return;
    }
    if (fileItems.length === 0 || !message) {
        updateStatus('状态：错误 - 请至少上传一个文件并输入消息内容！', 'error');
        return;
    }

    updateStatus('状态：正在发送...');
    showLoading();
    initializeProgressBars(channels);
    totalUploadedBytes = 0;
    lastUploadedBytes = 0;
    startUploadSpeedUpdate();

    if (sendMode === 'sequential') {
        for (let i = 0; i < channels.length; i++) {
            const channel = channels[i];
            try {
                const channelId = channel.url.split('/').pop();
                if (!channelId) {
                    updateStatus(`状态：错误 - 无效的频道地址：${channel.url}`, 'error');
                    updateProgressBar(i + 1, 100); // 标记为完成，即使失败
                    continue;
                }

                const delayTime = getRandomDelay();
                updateStatus(`状态：等待随机延迟 ${Math.round(delayTime / 1000)} 秒后发送到频道 ${channel.url}`);
                await delayWithProgress(delayTime, i + 1); // 使用带进度更新的延迟函数

                if (fileItems.length > 0) {
                    const formData = new FormData();
                    let totalSize = 0;
                    fileItems.forEach((file, index) => {
                        formData.append(`file${index}`, file);
                        totalSize += file.size;
                    });
                    if (message) {
                        formData.append('content', message);
                    }

                    // 使用 XMLHttpRequest 替代 fetch，以便监听上传进度
                    await new Promise((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.open('POST', `https://discord.com/api/v9/channels/${channelId}/messages`, true);
                        xhr.setRequestHeader('Authorization', apiToken);

                        // 监听上传进度
                        xhr.upload.onprogress = (event) => {
                            if (event.lengthComputable) {
                                totalUploadedBytes = event.loaded;
                                // 进度条更新为50%（延迟） + (上传进度/总大小)*50%
                                const uploadProgress = (event.loaded / event.total) * 50;
                                updateProgressBar(i + 1, 50 + uploadProgress);
                            }
                        };

                        xhr.onload = () => {
                            if (xhr.status >= 200 && xhr.status < 300) {
                                updateStatus(`状态：成功发送文件和消息到频道 ${channel.url}`, 'success');
                                updateProgressBar(i + 1, 100);
                                resolve(xhr.response);
                            } else {
                                try {
                                    const error = JSON.parse(xhr.responseText);
                                    updateStatus(`状态：发送失败到频道 ${channel.url}，错误：${error.message || '未知错误'}`, 'error');
                                } catch {
                                    updateStatus(`状态：发送失败到频道 ${channel.url}，错误：状态码 ${xhr.status}`, 'error');
                                }
                                updateProgressBar(i + 1, 100);
                                reject(new Error(`HTTP error: ${xhr.status}`));
                            }
                        };

                        xhr.onerror = () => {
                            updateStatus(`状态：发送失败到频道 ${channel.url}，错误：网络错误`, 'error');
                            updateProgressBar(i + 1, 100);
                            reject(new Error('Network error'));
                        };

                        xhr.send(formData);
                    });
                }
            } catch (err) {
                updateStatus(`状态：发送失败到频道 ${channel.url}，错误：${err.message}`, 'error');
                updateProgressBar(i + 1, 100); // 标记为完成，即使失败
            }
        }
    } else {
        const promises = channels.map(async (channel, i) => {
            try {
                const channelId = channel.url.split('/').pop();
                if (!channelId) {
                    updateStatus(`状态：错误 - 无效的频道地址：${channel.url}`, 'error');
                    return;
                }

                const delayTime = getRandomDelay();
                updateStatus(`状态：等待随机延迟 ${Math.round(delayTime / 1000)} 秒后发送到频道 ${channel.url}`);
                await delayWithProgress(delayTime, i + 1);

                if (fileItems.length > 0) {
                    const formData = new FormData();
                    let totalSize = 0;
                    fileItems.forEach((file, index) => {
                        formData.append(`file${index}`, file);
                        totalSize += file.size;
                    });
                    if (message) {
                        formData.append('content', message);
                    }

                    await new Promise((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.open('POST', `https://discord.com/api/v9/channels/${channelId}/messages`, true);
                        xhr.setRequestHeader('Authorization', apiToken);

                        xhr.upload.onprogress = (event) => {
                            if (event.lengthComputable) {
                                totalUploadedBytes += event.loaded / channels.length;
                                const uploadProgress = (totalUploadedBytes / (totalSize * channels.length)) * 100;
                                updateProgressBar(1, uploadProgress);
                            }
                        };

                        xhr.onload = () => {
                            if (xhr.status >= 200 && xhr.status < 300) {
                                updateStatus(`状态：成功发送文件和消息到频道 ${channel.url}`, 'success');
                                resolve(xhr.response);
                            } else {
                                try {
                                    const error = JSON.parse(xhr.responseText);
                                    updateStatus(`状态：发送失败到频道 ${channel.url}，错误：${error.message || '未知错误'}`, 'error');
                                } catch {
                                    updateStatus(`状态：发送失败到频道 ${channel.url}，错误：状态码 ${xhr.status}`, 'error');
                                }
                                reject(new Error(`HTTP error: ${xhr.status}`));
                            }
                        };

                        xhr.onerror = () => {
                            updateStatus(`状态：发送失败到频道 ${channel.url}，错误：网络错误`, 'error');
                            reject(new Error('Network error'));
                        };

                        xhr.send(formData);
                    });
                }
            } catch (err) {
                updateStatus(`状态：发送失败到频道 ${channel.url}，错误：${err.message}`, 'error');
            }
        });
        await Promise.all(promises);
        updateProgressBar(1, 100);
    }
    stopUploadSpeedUpdate();
    hideLoading();
    hideProgressBars();
}
