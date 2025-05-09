// --- 全局变量 ---
let fileItems = []; // 存储多个文件 { file: File, name: string, size: number, type: string, previewUrl?: string, id: string }
let channelGroupsData = {}; // { groupId: { name: string, enabled: boolean, panelOpen: boolean, channels: { channelId: { url: string, enabled: boolean, spoiler: boolean, fetchedInfo: { guildName: string, channelName: string } | null } } } }
let sendMode = 'sequential'; // 'sequential' 或 'parallel'
let uploadStartTime = 0;
let totalUploadedBytes = 0;
let lastSpeedUpdateTime = 0;
let lastUploadedBytesSnapshot = 0;
let speedUpdateInterval = null;
let lottieAnimation;
let isSending = false;
let isAnimatingTheme = false;

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
const statusLog = document.getElementById('status');
const loadingOverlay = document.getElementById('loadingOverlay');
const progressPopup = document.getElementById('progressPopup');
const popupProgressBars = document.getElementById('popupProgressBars');
const popupSpeedDisplay = document.getElementById('popupSpeedDisplay');
const popupUploadSpeed = document.getElementById('popupUploadSpeed');
const sendModeToggleBtn = document.getElementById('sendModeToggle');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeWipeContainer = document.getElementById('themeWipeContainer');
const newGroupNameInput = document.getElementById('newGroupNameInput');
const groupsListContainer = document.getElementById('groupsListContainer');
const imagePreviewModal = document.getElementById('imagePreviewModal');
const fullPreviewImage = document.getElementById('fullPreviewImage');
const pageContainer = document.querySelector('.container');


// --- Helper ---
function generateUniqueId(prefix = 'id_') {
    return prefix + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

// --- 主题管理 ---
function toggleTheme() {
    if (isAnimatingTheme) return;
    isAnimatingTheme = true;
    themeToggleBtn.disabled = true;

    const body = document.body;
    const isLight = body.classList.contains('theme-light');
    const targetTheme = isLight ? 'dark' : 'light';

    themeWipeContainer.style.display = 'block';
    themeWipeContainer.innerHTML = ''; 

    let wipeColors = isLight
        ? ['theme-wipe-red', 'theme-wipe-blue', 'theme-wipe-final-dark']
        : ['theme-wipe-red', 'theme-wipe-blue', 'theme-wipe-final-light'];

    const wipes = wipeColors.map(colorClass => {
        const wipe = document.createElement('div');
        wipe.classList.add('theme-wipe', colorClass);
        themeWipeContainer.appendChild(wipe);
        return wipe;
    });

    const animationDuration = 400; 
    const delayBetweenWipes = 100;

    requestAnimationFrame(() => {
        requestAnimationFrame(() => { 
            wipes.forEach((wipe, index) => {
                setTimeout(() => {
                    wipe.classList.add('active');
                    if (index === wipes.length - 1) { // Last wipe starts
                        body.classList.toggle('theme-light', targetTheme === 'light');
                        body.classList.toggle('theme-dark', targetTheme === 'dark');
                        localStorage.setItem('theme', targetTheme);
                    }
                }, delayBetweenWipes * index);
            });

            setTimeout(() => {
                themeWipeContainer.style.display = 'none';
                themeWipeContainer.innerHTML = '';

                // Fade in content after wipe animation
                if (pageContainer) {
                    pageContainer.classList.remove('visible'); // Ensure it's not visible (resets opacity to 0 via CSS)
                    void pageContainer.offsetWidth; // Trigger reflow
                    pageContainer.classList.add('visible'); // Trigger fade-in via CSS transition
                }
                
                isAnimatingTheme = false;
                themeToggleBtn.disabled = false;
            }, delayBetweenWipes * (wipes.length - 1) + animationDuration);
        });
    });
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    const body = document.body;
    const isDark = savedTheme === 'dark';
    body.classList.toggle('theme-light', !isDark);
    body.classList.toggle('theme-dark', isDark);

    if (pageContainer) {
        // pageContainer starts with opacity 0 due to CSS.
        // Add 'visible' class to trigger fade-in.
        // Add a slight delay for initial load if desired for visual pacing.
        setTimeout(() => {
            pageContainer.classList.add('visible');
        }, 100); // 0.1s delay, can be 0 if no delay is preferred
    }
}

// --- API Token 管理 ---
function toggleTokenVisibility() {
    const eyeClosed = document.querySelector('.eye-closed');
    const eyeOpen = document.querySelector('.eye-open');
    const isBlurred = apiTokenInput.classList.toggle('blurred-text');
    eyeClosed.style.display = isBlurred ? 'block' : 'none';
    eyeOpen.style.display = isBlurred ? 'none' : 'block';
    localStorage.setItem('blurToken', isBlurred.toString());
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

// --- 文件处理 & 预览 ---
function updateFilePreview() {
    previewContainer.innerHTML = '';
    fileItems.forEach((item, index) => {
        const thumbnailWrapper = document.createElement('div');
        thumbnailWrapper.className = 'thumbnail';
        thumbnailWrapper.id = item.id;

        let contentHTML = '';
        if (item.type.startsWith('image/') && item.previewUrl) {
            contentHTML = `
                <img src="${item.previewUrl}" alt="${item.name}" class="file-image-preview" onclick="openImagePreviewModal('${item.previewUrl}')">
                <div class="file-info">
                    <span title="${item.name}">${item.name}</span>
                    <span>${formatFileSize(item.size)}</span>
                </div>
            `;
        } else if (item.type.startsWith('image/')) { // Image, but previewUrl not loaded yet
             contentHTML = `
                <div class="file-image-placeholder">加载中...</div>
                <div class="file-info">
                    <span title="${item.name}">${item.name}</span>
                    <span>${formatFileSize(item.size)}</span>
                </div>
            `;
        } else { // Not an image
            contentHTML = `
                <div class="file-info">
                    <span title="${item.name}">${item.name}</span>
                    <span>${formatFileSize(item.size)}</span>
                </div>
            `;
        }

        thumbnailWrapper.innerHTML = `
            ${contentHTML}
            <button class="remove-btn" onclick="removeFile(${index})">×</button>
        `;
        
        thumbnailWrapper.classList.remove('fade-out-active'); // Ensure not fading out if re-added
        void thumbnailWrapper.offsetWidth; // Trigger reflow
        thumbnailWrapper.classList.add('fade-in'); // Add fade-in class for new elements
        previewContainer.appendChild(thumbnailWrapper);
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
    const itemToRemove = fileItems[index];
    if (!itemToRemove) return;

    const element = document.getElementById(itemToRemove.id);

    if (element) {
        element.classList.remove('fade-in');
        element.classList.add('fade-out-active');
        
        element.addEventListener('animationend', function handleAnimationEnd() {
            element.removeEventListener('animationend', handleAnimationEnd);
            
            const currentActualIndex = fileItems.findIndex(fi => fi.id === itemToRemove.id);
            if (currentActualIndex !== -1) {
                fileItems.splice(currentActualIndex, 1);
            }
            // Re-render to update indices for other remove buttons and clean up the removed element from DOM implicitly
            updateFilePreview(); 
        }, { once: true });

    } else {
        // Fallback if element not found, just update data and re-render
        fileItems.splice(index, 1);
        updateFilePreview();
    }
}


fileInput.addEventListener('change', handleFiles);
uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); uploadArea.classList.remove('dragover'); });
uploadArea.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); uploadArea.classList.remove('dragover'); handleFiles(e); });
uploadArea.addEventListener('click', () => fileInput.click());
document.addEventListener('paste', handlePaste);

function handleFiles(event) {
    const files = event.target?.files || event.dataTransfer?.files;
    if (!files) return;

    const filesToAdd = Array.from(files);
    let addedCount = 0;
    let ignoredCount = 0;

    for (const file of filesToAdd) {
        if (fileItems.length >= 10) {
            ignoredCount++;
            continue;
        }
        if (!fileItems.some(existing => existing.name === file.name && existing.size === file.size)) {
            const fileId = generateUniqueId('file_');
            const fileItem = {
                file: file,
                name: file.name,
                size: file.size,
                type: file.type,
                id: fileId,
                previewUrl: null
            };
            fileItems.push(fileItem);
            addedCount++;

            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    fileItem.previewUrl = e.target.result;
                    // Efficiently update only the specific item's preview if DOM element exists
                    const existingThumb = document.getElementById(fileItem.id);
                    if (existingThumb) {
                        const imgEl = existingThumb.querySelector('.file-image-preview') || document.createElement('img');
                        imgEl.src = fileItem.previewUrl;
                        if (!imgEl.classList.contains('file-image-preview')) { // If it was a placeholder
                            imgEl.className = 'file-image-preview';
                            imgEl.alt = fileItem.name;
                            imgEl.onclick = () => openImagePreviewModal(fileItem.previewUrl);
                            const placeholder = existingThumb.querySelector('.file-image-placeholder');
                            if (placeholder) placeholder.replaceWith(imgEl);
                        }
                    } else {
                         updateFilePreview(); // Fallback to full re-render
                    }
                };
                reader.readAsDataURL(file);
            }
        }
    }

    if (addedCount > 0) {
        updateFilePreview(); // Initial render for new items
    }
    if (ignoredCount > 0) {
        updateStatus(`状态：最多只能上传10个文件，${ignoredCount}个文件已被忽略。`, 'error');
    }
}

function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    let filesPastedCount = 0;
    let ignoredCount = 0;

    for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
            if (fileItems.length >= 10) {
                ignoredCount++;
                continue;
            }
            const blob = items[i].getAsFile();
            if (blob) {
                // Try to get a reasonable extension for pasted images
                let extension = 'png';
                if (blob.type === 'image/jpeg') extension = 'jpg';
                else if (blob.type === 'image/gif') extension = 'gif';
                else if (blob.type === 'image/webp') extension = 'webp';

                const originalName = blob.name && blob.name !== 'image.png' ? blob.name : `pasted-image-${Date.now()}.${extension}`;
                
                const file = new File([blob], originalName, { type: blob.type });

                if (!fileItems.some(existing => existing.name === file.name && existing.size === file.size)) { // Check using constructed file
                     const fileId = generateUniqueId('file_');
                     const fileItem = {
                        file: file,
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        id: fileId,
                        previewUrl: null
                    };
                    fileItems.push(fileItem);
                    filesPastedCount++;

                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                            fileItem.previewUrl = ev.target.result;
                            const existingThumb = document.getElementById(fileItem.id);
                            if (existingThumb) { // Similar update logic as in handleFiles
                                const imgEl = existingThumb.querySelector('.file-image-preview') || document.createElement('img');
                                imgEl.src = fileItem.previewUrl;
                                if (!imgEl.classList.contains('file-image-preview')) {
                                    imgEl.className = 'file-image-preview';
                                    imgEl.alt = fileItem.name;
                                    imgEl.onclick = () => openImagePreviewModal(fileItem.previewUrl);
                                    const placeholder = existingThumb.querySelector('.file-image-placeholder');
                                    if (placeholder) placeholder.replaceWith(imgEl);
                                }
                            } else {
                                updateFilePreview();
                            }
                        };
                        reader.readAsDataURL(file);
                    }
                }
            }
        }
    }
    if (filesPastedCount > 0) {
        updateFilePreview();
        updateStatus(`状态：从剪贴板粘贴了 ${filesPastedCount} 个文件。`, 'info');
    }
    if (ignoredCount > 0 && fileItems.length >=10) {
         updateStatus('状态：已达到10个文件上限，后续粘贴的文件将被忽略。', 'error');
    }
}


// --- Image Preview Modal ---
function openImagePreviewModal(imageUrl) {
    if (!imageUrl) return;
    fullPreviewImage.src = imageUrl;
    imagePreviewModal.style.display = 'flex';
    void imagePreviewModal.offsetWidth; // Force reflow
    imagePreviewModal.classList.remove('fade-out-modal');
    imagePreviewModal.classList.add('fade-in-modal');
}

function closeImagePreviewModal() {
    imagePreviewModal.classList.remove('fade-in-modal');
    imagePreviewModal.classList.add('fade-out-modal');
    setTimeout(() => {
        imagePreviewModal.style.display = 'none';
        fullPreviewImage.src = ''; // Clear image
    }, 300); // Match animation duration
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
    if (source === 'range') numberInput.value = rangeInput.value;
    else {
        if (numberInput.value < 0) numberInput.value = 0;
        rangeInput.value = numberInput.value;
    }
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
    return (min >= max ? min : (min + Math.random() * (max - min))) * 1000;
}

// --- 频道组与频道管理 ---

function addNewGroup() {
    const groupName = newGroupNameInput.value.trim() || `新频道组 ${Object.keys(channelGroupsData).length + 1}`;
    const groupId = generateUniqueId('group_');
    channelGroupsData[groupId] = {
        name: groupName,
        enabled: true,
        panelOpen: true,
        channels: {}
    };
    newGroupNameInput.value = '';
    saveData();
    renderGroupsAndChannels();
    updateStatus(`状态：已添加频道组 "${groupName}"。`, 'info');
}

function renderGroupsAndChannels() {
    groupsListContainer.innerHTML = '';
    Object.entries(channelGroupsData).forEach(([groupId, groupData]) => {
        const groupElement = createGroupElement(groupId, groupData);
        groupsListContainer.appendChild(groupElement);
        const channelsListElement = groupElement.querySelector('.group-channels-list');
        Object.entries(groupData.channels).forEach(([channelId, channelData]) => {
            const channelElement = createChannelElement(groupId, channelId, channelData);
            channelsListElement.appendChild(channelElement);
            const inputEl = channelElement.querySelector('input[type="text"]');
            setupChannelInputListeners(inputEl, groupId, channelId);
            if (channelData.enabled && channelData.url && !channelData.fetchedInfo) {
                 fetchChannelInfo(groupId, channelId);
            }
        });
    });
}

function createGroupElement(groupId, groupData) {
    const groupDiv = document.createElement('div');
    groupDiv.className = `group-item card ${groupData.panelOpen ? '' : 'collapsed-group'}`;
    groupDiv.id = groupId;

    groupDiv.innerHTML = `
        <div class="group-header panel-header ${groupData.panelOpen ? '' : 'collapsed'}" onclick="toggleGroupPanel('${groupId}', this)">
            <input type="text" class="group-name-display" value="${groupData.name}" 
                   onchange="renameGroup('${groupId}', this.value)" 
                   onclick="event.stopPropagation()" 
                   placeholder="组名">
            <div class="group-actions">
                <button class="group-toggle-btn ${groupData.enabled ? 'enabled-btn' : 'disabled-btn'}" 
                        onclick="toggleGroupEnabledState('${groupId}', event)">
                    ${groupData.enabled ? '已启用组' : '已禁用组'}
                </button>
                <button class="secondary-btn add-channel-to-group-btn" onclick="addChannelToGroup('${groupId}', event)">添加频道</button>
                <button class="danger-btn delete-group-btn" onclick="deleteGroup('${groupId}', event)">删除组</button>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="panel-chevron">
                    <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
                </svg>
            </div>
        </div>
        <div class="panel-content group-channels-list ${groupData.panelOpen ? '' : 'collapsed'}">
        </div>
        <div class="channel-actions-per-group ${groupData.panelOpen ? '' : 'collapsed'}">
             <button class="secondary-btn" onclick="enableAllChannelsInGroup('${groupId}')">本组频道全启用</button>
             <button class="secondary-btn" onclick="disableAllChannelsInGroup('${groupId}')">本组频道全禁用</button>
        </div>
    `;
    // Ensure actions per group also collapse
    if (!groupData.panelOpen) {
        groupDiv.querySelector('.channel-actions-per-group').classList.add('collapsed');
    }
    return groupDiv;
}

function toggleGroupPanel(groupId, headerElement) {
    const group = channelGroupsData[groupId];
    if (!group) return;
    group.panelOpen = !group.panelOpen;
    
    headerElement.classList.toggle('collapsed', !group.panelOpen);
    const panelContent = headerElement.nextElementSibling; // .group-channels-list
    panelContent.classList.toggle('collapsed', !group.panelOpen);
    const actionsPerGroup = panelContent.nextElementSibling; // .channel-actions-per-group
    if (actionsPerGroup) actionsPerGroup.classList.toggle('collapsed', !group.panelOpen);
    
    const groupItemDiv = document.getElementById(groupId);
    if (groupItemDiv) groupItemDiv.classList.toggle('collapsed-group', !group.panelOpen);

    saveData();
}


function renameGroup(groupId, newName) {
    if (channelGroupsData[groupId]) {
        channelGroupsData[groupId].name = newName.trim() || "未命名组";
        saveData();
        updateStatus(`状态：频道组 ${groupId} 已重命名为 "${channelGroupsData[groupId].name}"。`, 'info');
    }
}

function toggleGroupEnabledState(groupId, event) {
    event.stopPropagation();
    const group = channelGroupsData[groupId];
    if (group) {
        group.enabled = !group.enabled;
        const button = event.target;
        button.textContent = group.enabled ? '已启用组' : '已禁用组';
        button.classList.toggle('enabled-btn', group.enabled);
        button.classList.toggle('disabled-btn', !group.enabled);
        saveData();
        updateStatus(`状态：频道组 "${group.name}" 已${group.enabled ? '启用' : '禁用'}。`, 'info');
    }
}

function deleteGroup(groupId, event) {
    event.stopPropagation();
    const group = channelGroupsData[groupId];
    if (group && confirm(`确定要删除频道组 "${group.name}" 及其所有频道吗？`)) {
        const groupName = group.name;
        delete channelGroupsData[groupId];
        saveData();
        renderGroupsAndChannels();
        updateStatus(`状态：频道组 "${groupName}" 已删除。`, 'info');
    }
}

function addChannelToGroup(groupId, event) {
    event.stopPropagation();
    const group = channelGroupsData[groupId];
    if (group) {
        const channelId = generateUniqueId('channel_');
        group.channels[channelId] = {
            url: '',
            enabled: true,
            spoiler: false,
            fetchedInfo: null
        };
        if (!group.panelOpen) {
            group.panelOpen = true; 
        }
        saveData();
        renderGroupsAndChannels(); 
        updateStatus(`状态：已在组 "${group.name}" 中添加新频道。`, 'info');
        const newChannelInput = document.querySelector(`#channel_${groupId}_${channelId} input[type="text"]`);
        if (newChannelInput) newChannelInput.focus();
    }
}

function createChannelElement(groupId, channelId, channelData) {
    const div = document.createElement('div');
    div.className = `channel-item ${channelData.enabled ? '' : 'disabled'}`;
    div.id = `channel_${groupId}_${channelId}`;
    const uniqueChannelNameId = `channel-name-${groupId}-${channelId}`;

    div.innerHTML = `
        <button class="channel-toggle-btn ${channelData.enabled ? 'enabled-btn' : 'disabled-btn'}" 
                onclick="toggleChannelEnabledState('${groupId}', '${channelId}')">
            ${channelData.enabled ? '已启用' : '已禁用'}
        </button>
        <div class="input-group channel-info-container"> <!-- Renamed for clarity -->
            <span id="${uniqueChannelNameId}" class="channel-fetched-info">
                ${channelData.fetchedInfo ? `服务器：${channelData.fetchedInfo.guildName} | 频道：#${channelData.fetchedInfo.channelName}` : '服务器：未识别 | 频道：未识别'}
            </span>
            <input type="text" value="${channelData.url}" 
                   placeholder="请输入目标频道地址，例如：https://discord.com/channels/xxx/yyy" 
                   ${channelData.enabled ? '' : 'disabled'}>
        </div>
        <button class="spoiler-toggle-btn ${channelData.spoiler ? 'spoiler-on' : 'spoiler-off'}" 
                onclick="toggleChannelSpoilerState('${groupId}', '${channelId}')" 
                ${channelData.enabled ? '' : 'disabled'}>
            ${channelData.spoiler ? '剧透' : '无剧透'}
        </button>
        <button class="delete-btn" onclick="removeChannelFromGroup('${groupId}', '${channelId}')">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
    `;
    return div;
}

function setupChannelInputListeners(inputElement, groupId, channelId) {
    inputElement.addEventListener('input', () => {
        const group = channelGroupsData[groupId];
        if (group && group.channels[channelId]) {
            group.channels[channelId].url = inputElement.value.trim();
            saveData();
            if (group.channels[channelId].enabled && group.channels[channelId].url) {
                if (inputElement._fetchTimeout) clearTimeout(inputElement._fetchTimeout);
                inputElement._fetchTimeout = setTimeout(() => fetchChannelInfo(groupId, channelId), 500);
            } else {
                const channelNameSpan = document.getElementById(`channel-name-${groupId}-${channelId}`);
                if (channelNameSpan) channelNameSpan.textContent = '服务器：未识别 | 频道：未识别';
                group.channels[channelId].fetchedInfo = null;
                saveData();
            }
        }
    });
}

function toggleChannelEnabledState(groupId, channelId) {
    const group = channelGroupsData[groupId];
    const channel = group?.channels[channelId];
    if (channel) {
        channel.enabled = !channel.enabled;
        saveData();
        renderGroupsAndChannels(); 
        updateStatus(`状态：组 "${group.name}" 内频道 ${channelId} 已${channel.enabled ? '启用' : '禁用'}。`, 'info');
    }
}

function toggleChannelSpoilerState(groupId, channelId) {
    const group = channelGroupsData[groupId];
    const channel = group?.channels[channelId];
    if (channel && channel.enabled) { 
        channel.spoiler = !channel.spoiler;
        saveData();
        renderGroupsAndChannels(); 
        updateStatus(`状态：组 "${group.name}" 内频道 ${channelId} 剧透标签已${channel.spoiler ? '开启' : '关闭'}。`, 'info');
    }
}

function removeChannelFromGroup(groupId, channelId) {
    const group = channelGroupsData[groupId];
    if (group && group.channels[channelId] && confirm(`确定要从组 "${group.name}" 中删除此频道吗？`)) {
        delete group.channels[channelId];
        saveData();
        renderGroupsAndChannels();
        updateStatus(`状态：已从组 "${group.name}" 中删除频道 ${channelId}。`, 'info');
    }
}

async function fetchChannelInfo(groupId, channelId) {
    const apiToken = apiTokenInput.value.trim();
    const group = channelGroupsData[groupId];
    const channel = group?.channels[channelId];
    const channelNameSpan = document.getElementById(`channel-name-${groupId}-${channelId}`);

    if (!channel || !channel.enabled || !channelNameSpan) return;
    
    channel.fetchedInfo = null; 

    const channelUrl = channel.url.trim();
    if (!apiToken) {
        channelNameSpan.textContent = '服务器：需Token | 频道：需Token';
        saveData(); return;
    }
    if (!channelUrl) {
        channelNameSpan.textContent = '服务器：未识别 | 频道：未识别';
        saveData(); return;
    }
    
    const urlParts = channelUrl.match(/channels\/(\d+|@me)\/(\d+)/);
    if (!urlParts || urlParts.length < 3) {
        channelNameSpan.textContent = '服务器：格式错误 | 频道：格式错误';
        saveData(); return;
    }
    const discordGuildId = urlParts[1]; 
    const discordChannelId = urlParts[2];

    channelNameSpan.textContent = '服务器：获取中... | 频道：获取中...';

    try {
        const timeout = 8000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        const headers = { 'Authorization': apiToken };

        const channelResponse = await fetch(`https://discord.com/api/v9/channels/${discordChannelId}`, {
            method: 'GET', headers, signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!channelResponse.ok) throw new Error(`频道信息获取失败 (${channelResponse.status})`);
        const channelData = await channelResponse.json();
        const fetchedChannelName = channelData.name || '未知频道';

        let fetchedGuildName = '未知服务器';
        if (discordGuildId !== '@me' && channelData.guild_id) { // Use guild_id from channel data if available
             const guildController = new AbortController();
             const guildTimeoutId = setTimeout(() => guildController.abort(), timeout);
             try {
                const guildResponse = await fetch(`https://discord.com/api/v9/guilds/${channelData.guild_id}`, { // Use channelData.guild_id
                    method: 'GET', headers, signal: guildController.signal
                });
                clearTimeout(guildTimeoutId);
                if (guildResponse.ok) {
                    const guildData = await guildResponse.json();
                    fetchedGuildName = guildData.name || '未知服务器';
                }
             } catch (guildErr) { clearTimeout(guildTimeoutId); }
        } else if (discordGuildId === '@me' || channelData.type === 1) { // DM or Group DM
            fetchedGuildName = "私信";
            if (channelData.recipients && channelData.recipients.length === 1) {
                 // For 1-on-1 DM, channel name is often the other user's name.
                 // If channelData.name is empty, try to use recipient's name.
                 // fetchedChannelName = channelData.name || channelData.recipients[0].username || '私聊频道';
            } else if (channelData.recipients && channelData.recipients.length > 1 && !channelData.name) {
                // fetchedChannelName = "群组私信"; // Or list participants
            }
        }


        channel.fetchedInfo = { guildName: fetchedGuildName, channelName: fetchedChannelName };
        channelNameSpan.textContent = `服务器：${fetchedGuildName} | 频道：#${fetchedChannelName}`;
    } catch (err) {
        channel.fetchedInfo = null;
        channelNameSpan.textContent = '服务器：获取失败 | 频道：获取失败';
        if (err.name !== 'AbortError') {
            updateStatus(`状态：频道 ${channelId} (组 "${group.name}") 信息获取失败: ${err.message}`, 'error');
        } else {
             updateStatus(`状态：频道 ${channelId} (组 "${group.name}") 信息获取超时。`, 'error');
        }
    } finally {
        saveData();
    }
}


function enableAllChannelsInGroup(groupId) {
    const group = channelGroupsData[groupId];
    if (group) {
        Object.values(group.channels).forEach(channel => channel.enabled = true);
        saveData();
        renderGroupsAndChannels();
        updateStatus(`状态：频道组 "${group.name}" 内所有频道已启用。`, 'info');
    }
}

function disableAllChannelsInGroup(groupId) {
    const group = channelGroupsData[groupId];
    if (group) {
        Object.values(group.channels).forEach(channel => channel.enabled = false);
        saveData();
        renderGroupsAndChannels();
        updateStatus(`状态：频道组 "${group.name}" 内所有频道已禁用。`, 'info');
    }
}

function enableAllChannelsGlobally() {
    Object.values(channelGroupsData).forEach(group => {
        Object.values(group.channels).forEach(channel => channel.enabled = true);
    });
    saveData();
    renderGroupsAndChannels();
    updateStatus('状态：所有组的所有频道已全部启用。', 'info');
}

function disableAllChannelsGlobally() {
    Object.values(channelGroupsData).forEach(group => {
        Object.values(group.channels).forEach(channel => channel.enabled = false);
    });
    saveData();
    renderGroupsAndChannels();
    updateStatus('状态：所有组的所有频道已全部禁用。', 'info');
}


// --- 发送模式管理 ---
function toggleSendMode() {
    sendMode = sendMode === 'sequential' ? 'parallel' : 'sequential';
    sendModeToggleBtn.textContent = sendMode === 'sequential' ? '切换为并行发送' : '切换为逐条发送';
    sendModeToggleBtn.classList.toggle('primary-btn', sendMode === 'parallel');
    sendModeToggleBtn.classList.toggle('secondary-btn', sendMode === 'sequential');
    localStorage.setItem('sendMode', sendMode);
    updateStatus(`状态：发送模式已切换为 ${sendMode === 'sequential' ? '逐条发送' : '并行发送'}。`, 'info');
}

function loadSendMode() {
    const savedMode = localStorage.getItem('sendMode');
    sendMode = savedMode === 'parallel' ? 'parallel' : 'sequential'; 
    sendModeToggleBtn.textContent = sendMode === 'sequential' ? '切换为并行发送' : '切换为逐条发送';
    sendModeToggleBtn.classList.toggle('primary-btn', sendMode === 'parallel');
    sendModeToggleBtn.classList.toggle('secondary-btn', sendMode === 'sequential');
}

// --- 状态与进度 ---
function updateStatus(message, type = 'info') {
    const p = document.createElement('p');
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    if (type === 'success') p.classList.add('success');
    if (type === 'error') p.classList.add('error');
    statusLog.appendChild(p);
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
        renderer: 'svg', loop: true, autoplay: false,
        path: 'https://assets2.lottiefiles.com/packages/lf20_usmfxnmu.json'
    });
}

function showProgressPopup(activeChannelsForSending) { 
    popupProgressBars.innerHTML = '';
    totalUploadedBytes = 0;
    lastUploadedBytesSnapshot = 0;
    lastSpeedUpdateTime = Date.now();

    activeChannelsForSending.forEach(ch => {
        const popupChannelId = `popup-channel-${ch.originalChannelId}`; 
        const displayName = ch.name; 

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
    popupSpeedDisplay.style.display = 'block';
    progressPopup.style.display = 'flex';
    void progressPopup.offsetWidth; // Force reflow for animation
    progressPopup.classList.remove('fade-out-modal');
    progressPopup.classList.add('fade-in-modal');
    startUploadSpeedUpdate();
}

function hideProgressPopup() {
    progressPopup.classList.remove('fade-in-modal');
    progressPopup.classList.add('fade-out-modal');
    setTimeout(() => {
        progressPopup.style.display = 'none';
        popupProgressBars.innerHTML = ''; // Clear bars after fade out
    }, 300); // Match CSS animation duration
    stopUploadSpeedUpdate();
}

function updatePopupProgressBar(originalChannelId, percentage) { 
    const popupChannelId = `popup-channel-${originalChannelId}`;
    const progressElement = document.getElementById(`progress-${popupChannelId}`);
    const progressPercent = document.getElementById(`progress-percent-${popupChannelId}`);
    if (progressElement && progressPercent) {
        percentage = Math.max(0, Math.min(100, percentage));
        progressElement.style.width = `${percentage}%`;
        progressPercent.textContent = `${Math.round(percentage)}%`;
    }
}

function updatePopupSpeedDisplay() {
    const now = Date.now();
    const elapsedSeconds = (now - lastSpeedUpdateTime) / 1000;
    if (elapsedSeconds < 0.1) return; // Avoid division by zero or too frequent updates
    const deltaBytes = totalUploadedBytes - lastUploadedBytesSnapshot;
    const speed = deltaBytes / elapsedSeconds;
    popupUploadSpeed.textContent = `上传速度：${formatFileSize(speed)}/s`;
    lastUploadedBytesSnapshot = totalUploadedBytes;
    lastSpeedUpdateTime = now;
}

function startUploadSpeedUpdate() {
    if (speedUpdateInterval) return;
    lastUploadedBytesSnapshot = totalUploadedBytes; // Reset for current session
    lastSpeedUpdateTime = Date.now();
    speedUpdateInterval = setInterval(updatePopupSpeedDisplay, 250); // Update speed every 250ms
}
function stopUploadSpeedUpdate() {
    if (speedUpdateInterval) {
        clearInterval(speedUpdateInterval);
        speedUpdateInterval = null;
    }
}

// --- Data Saving/Loading ---
function saveData() {
    localStorage.setItem('apiToken', apiTokenInput.value.trim());
    localStorage.setItem('blurToken', apiTokenInput.classList.contains('blurred-text').toString());
    localStorage.setItem('minDelay', minDelayInput.value);
    localStorage.setItem('maxDelay', maxDelayInput.value);
    localStorage.setItem('message', messageInput.value);
    localStorage.setItem('channelGroupsData', JSON.stringify(channelGroupsData));
    localStorage.setItem('sendMode', sendMode);
}

function loadSavedData() {
    apiTokenInput.value = localStorage.getItem('apiToken') || '';
    const savedBlurToken = localStorage.getItem('blurToken');
    const shouldBlur = savedBlurToken === null || savedBlurToken === 'true';
    apiTokenInput.classList.toggle('blurred-text', shouldBlur);
    document.querySelector('.eye-closed').style.display = shouldBlur ? 'block' : 'none';
    document.querySelector('.eye-open').style.display = shouldBlur ? 'none' : 'block';

    minDelayInput.value = localStorage.getItem('minDelay') || '1';
    maxDelayInput.value = localStorage.getItem('maxDelay') || '5';
    minDelayRange.value = minDelayInput.value;
    maxDelayRange.value = maxDelayInput.value;

    messageInput.value = localStorage.getItem('message') || '';
    renderMarkdownPreview();

    const savedChannelGroups = localStorage.getItem('channelGroupsData');
    channelGroupsData = savedChannelGroups ? JSON.parse(savedChannelGroups) : {};

    for (const groupId in channelGroupsData) {
        const group = channelGroupsData[groupId];
        if (typeof group.panelOpen === 'undefined') group.panelOpen = true; 
        for (const channelId in group.channels) {
            // Fetched info is simple data, no need to reset unless structure changes
        }
    }


    if (Object.keys(channelGroupsData).length === 0) {
        const defaultGroupId = generateUniqueId('group_');
        channelGroupsData[defaultGroupId] = {
            name: "默认组",
            enabled: true,
            panelOpen: true,
            channels: {}
        };
        saveData(); 
    }
    renderGroupsAndChannels();

    loadSendMode();
}

// --- Core Sending Logic ---
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

    const activeChannelsForSending = [];
    for (const groupId in channelGroupsData) {
        const group = channelGroupsData[groupId];
        if (group.enabled) {
            for (const channelIdInGroup in group.channels) {
                const channel = group.channels[channelIdInGroup];
                if (channel.enabled && channel.url) {
                    const urlParts = channel.url.match(/channels\/(\d+|@me)\/(\d+)/);
                    const discordChannelId = urlParts ? urlParts[2] : null;
                    if (discordChannelId) {
                        activeChannelsForSending.push({
                            originalGroupId: groupId,
                            originalChannelId: channelIdInGroup, 
                            discordChannelApiId: discordChannelId, 
                            url: channel.url,
                            name: channel.fetchedInfo 
                                  ? `组: ${group.name} | 服: ${channel.fetchedInfo.guildName} | 频: #${channel.fetchedInfo.channelName}` 
                                  : `组: ${group.name} | 频: ${channelIdInGroup}`, // Use the internal channelId as fallback
                            spoiler: channel.spoiler
                        });
                    }
                }
            }
        }
    }

    if (activeChannelsForSending.length === 0) {
        updateStatus('状态：错误 - 请至少启用一个有效格式的目标频道（在已启用的组内）！', 'error');
        return null;
    }

    isSending = true;
    showLoading();
    updateStatus(`状态：开始发送任务 (${sendMode === 'sequential' ? '逐条' : '并行'})...`);
    showProgressPopup(activeChannelsForSending); 

    return { apiToken, channels: activeChannelsForSending }; 
}

function finishSend() {
    hideLoading();
    // Keep progress popup open until explicitly closed by user, or closed after a short delay.
    // For now, manual close is fine.
    // hideProgressPopup(); // Or call this after a delay, or let user close
    stopUploadSpeedUpdate(); // Ensure speed update stops regardless
    updateStatus('状态：所有发送任务已处理完毕。');
    isSending = false;
}

async function sendFile() {
    const prep = prepareSend();
    if (!prep) return;
    const { apiToken, channels } = prep;
    if (fileItems.length === 0) {
        updateStatus('状态：错误 - 请至少选择一个文件！', 'error');
        hideLoading(); hideProgressPopup(); isSending = false; return;
    }
    try {
        if (sendMode === 'sequential') await sendSequentially(apiToken, channels, 'file');
        else await sendParallelly(apiToken, channels, 'file');
    } catch (error) { updateStatus(`状态：发送过程中发生意外错误: ${error.message}`, 'error'); }
    finally { finishSend(); }
}

async function sendText() {
    const prep = prepareSend();
    if (!prep) return;
    const { apiToken, channels } = prep;
    const message = messageInput.value.trim();
    if (!message) {
        updateStatus('状态：错误 - 请输入消息内容！', 'error');
        hideLoading(); hideProgressPopup(); isSending = false; return;
    }
    try {
        if (sendMode === 'sequential') await sendSequentially(apiToken, channels, 'text', message);
        else await sendParallelly(apiToken, channels, 'text', message);
    } catch (error) { updateStatus(`状态：发送过程中发生意外错误: ${error.message}`, 'error'); }
    finally { finishSend(); }
}

async function sendFileAndText() {
    const prep = prepareSend();
    if (!prep) return;
    const { apiToken, channels } = prep;
    const message = messageInput.value.trim();
    if (fileItems.length === 0) {
        updateStatus('状态：错误 - 请至少选择一个文件！', 'error');
        hideLoading(); hideProgressPopup(); isSending = false; return;
    }
    if (!message && fileItems.length > 0) { // Allow sending files without text if message is empty
        // No error, just proceed.
    } else if (!message && fileItems.length === 0) { // Should be caught by fileItems.length === 0
         updateStatus('状态：错误 - 请选择文件或输入消息内容！', 'error');
         hideLoading(); hideProgressPopup(); isSending = false; return;
    }
    // If message is empty but files are present, it's valid for 'fileAndText' (becomes like 'file' with optional text)

    try {
        if (sendMode === 'sequential') await sendSequentially(apiToken, channels, 'fileAndText', message);
        else await sendParallelly(apiToken, channels, 'fileAndText', message);
    } catch (error) { updateStatus(`状态：发送过程中发生意外错误: ${error.message}`, 'error'); }
    finally { finishSend(); }
}

async function sendSequentially(apiToken, channels, type, message = '') {
    for (const channel of channels) { 
        const delayTime = getRandomDelay();
        updateStatus(`状态：${channel.name} - 等待 ${Math.round(delayTime / 1000)}s 延迟...`);
        await delayWithProgress(delayTime, channel.originalChannelId, 0, 50); // Delay shows 0-50% progress
        updateStatus(`状态：${channel.name} - 开始发送...`);
        try {
            await sendSingleRequest(apiToken, channel, type, message, (progress) => {
                 updatePopupProgressBar(channel.originalChannelId, 50 + progress * 0.5); // Sending is 50-100%
            });
            updateStatus(`状态：${channel.name} - 发送成功。`, 'success');
            updatePopupProgressBar(channel.originalChannelId, 100);
        } catch (error) {
            updateStatus(`状态：${channel.name} - 发送失败: ${error.message}`, 'error');
            updatePopupProgressBar(channel.originalChannelId, 100); // Mark as complete even on error for UI
        }
    }
}

async function sendParallelly(apiToken, channels, type, message = '') {
    const promises = channels.map(channel => { 
        return (async () => {
            const delayTime = getRandomDelay();
            updateStatus(`状态：${channel.name} - 等待 ${Math.round(delayTime / 1000)}s 延迟...`);
            await delayWithProgress(delayTime, channel.originalChannelId, 0, 50);
            updateStatus(`状态：${channel.name} - 开始发送...`);
            try {
                await sendSingleRequest(apiToken, channel, type, message, (progress) => {
                    updatePopupProgressBar(channel.originalChannelId, 50 + progress * 0.5);
                });
                updateStatus(`状态：${channel.name} - 发送成功。`, 'success');
                updatePopupProgressBar(channel.originalChannelId, 100);
                return { status: 'fulfilled', channelId: channel.originalChannelId };
            } catch (error) {
                updateStatus(`状态：${channel.name} - 发送失败: ${error.message}`, 'error');
                updatePopupProgressBar(channel.originalChannelId, 100);
                 return { status: 'rejected', channelId: channel.originalChannelId, reason: error.message };
            }
        })();
    });
    await Promise.allSettled(promises);
}

async function sendSingleRequest(apiToken, channel, type, message, onProgress) {
    const url = `https://discord.com/api/v9/channels/${channel.discordChannelApiId}/messages`;
    const headers = { 'Authorization': apiToken };
    let body = null;
    let useXhr = false;

    if (type === 'file' || type === 'fileAndText') {
        useXhr = true;
        const formData = new FormData();
        const isSpoiler = channel.spoiler;
        
        // Attach files
        fileItems.forEach((item, index) => { // Use fileItems from global scope
            const filename = isSpoiler ? `SPOILER_${item.name}` : item.name;
            formData.append(`files[${index}]`, item.file, filename); // Discord expects files[N]
        });
        
        // Attach payload_json for content and other message parameters
        const payload = {};
        if (message) payload.content = message;
        // if (isSpoiler && fileItems.length > 0) { // Spoiler is per-file now, not global for message
        //    // Discord handles spoiler attachments via SPOILER_ prefix
        // }
        // Add other potential payload fields if needed, e.g., embeds, tts etc.
        // For attachments, payload_json is mostly for content.
        if (Object.keys(payload).length > 0 || fileItems.length > 0) { // Must send payload_json if files are present, even if empty content
             formData.append('payload_json', JSON.stringify(payload));
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
            Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
            let channelUploadedBytes = 0;
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const currentChannelProgress = (event.loaded / event.total) * 100;
                    onProgress(currentChannelProgress);
                    const delta = event.loaded - channelUploadedBytes;
                    totalUploadedBytes += delta; // Update global counter
                    channelUploadedBytes = event.loaded;
                }
            };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    onProgress(100); // Ensure progress hits 100%
                    const finalDelta = (xhr.upload.total || channelUploadedBytes) - channelUploadedBytes;
                    if (finalDelta > 0) totalUploadedBytes += finalDelta;
                    try {
                         resolve(xhr.responseText ? JSON.parse(xhr.responseText) : {});
                    } catch (e) { resolve({}); } // Resolve even if parse fails, success based on status
                } else {
                    let errorMsg = `HTTP ${xhr.status}`;
                    try { errorMsg = JSON.parse(xhr.responseText).message || errorMsg; }
                    catch { errorMsg = `${errorMsg}: ${xhr.responseText.substring(0,100)}`;}
                    reject(new Error(errorMsg));
                }
            };
            xhr.onerror = () => reject(new Error('网络错误或请求被中断'));
            xhr.ontimeout = () => reject(new Error('请求超时'));
            xhr.timeout = 600000; // 10 minutes timeout for uploads
            xhr.send(body);
        } else { // fetch for text-only messages
            fetch(url, { method: 'POST', headers, body })
                .then(async response => {
                    if (response.ok) {
                        onProgress(100);
                        const text = await response.text();
                        return text ? JSON.parse(text) : {};
                    } else {
                        const errorText = await response.text();
                        let errorMsg = `HTTP ${response.status}`;
                        try { errorMsg = JSON.parse(errorText).message || errorMsg; }
                        catch { errorMsg = `${errorMsg}: ${errorText.substring(0, 100)}...`; }
                        throw new Error(errorMsg);
                    }
                })
                .then(data => resolve(data))
                .catch(error => reject(error));
        }
    });
}

function delayWithProgress(ms, originalChannelId, startPercent, endPercent) { 
    return new Promise(resolve => {
        if (ms <= 0) {
            updatePopupProgressBar(originalChannelId, endPercent);
            resolve(); return;
        }
        const startTime = Date.now();
        const updateInterval = 50; // Update progress bar every 50ms
        const intervalId = setInterval(() => {
            const elapsedTime = Date.now() - startTime;
            if (elapsedTime >= ms) {
                clearInterval(intervalId);
                updatePopupProgressBar(originalChannelId, endPercent);
                resolve();
            } else {
                const progressFraction = elapsedTime / ms;
                updatePopupProgressBar(originalChannelId, startPercent + progressFraction * (endPercent - startPercent));
            }
        }, updateInterval);
    });
}

// --- Initialization ---
window.onload = () => {
    loadTheme(); // Applies theme and initiates container fade-in
    loadSavedData(); 
    initializeLottie();
    document.querySelector('#progressPopup .modal-close-button').addEventListener('click', hideProgressPopup);
    apiTokenInput.addEventListener('input', saveData);
    
    // Close image modal on Escape key
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && imagePreviewModal.style.display === 'flex') {
            closeImagePreviewModal();
        }
    });
    // Close image modal on click outside
    imagePreviewModal.addEventListener('click', (event) => {
        if (event.target === imagePreviewModal) {
            closeImagePreviewModal();
        }
    });
};