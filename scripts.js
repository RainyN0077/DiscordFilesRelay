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
let isCancellingSend = false; // For send task cancellation
let currentAbortController = null; // For aborting fetch/XHR
let isAnimatingTheme = false;
let currentStorageMethod = 'localStorage'; // 'localStorage' or 'localFile'
let draggedFileItemId = null; // For file reordering

// --- DOM 元素引用 ---
let apiTokenInput, minDelayInput, maxDelayInput, minDelayRange, maxDelayRange,
    messageInput, markdownPreview, fileInput, previewContainer, uploadArea,
    statusLog, loadingOverlay, progressPopup, popupProgressBars, popupSpeedDisplay,
    popupUploadSpeed, sendModeToggleBtn, themeToggleBtn, themeWipeContainer,
    newGroupNameInput, groupsListContainer, imagePreviewModal, fullPreviewImage,
    pageContainer, storagePreferenceSelect, localFileControls, loadSettingsFileBtn,
    settingsFileInput, saveSettingsFileBtn, cancelSendBtn, saveSettingsBtn;

function initializeDOMElements() {
    apiTokenInput = document.getElementById('apiToken');
    minDelayInput = document.getElementById('minDelay');
    maxDelayInput = document.getElementById('maxDelay');
    minDelayRange = document.getElementById('minDelayRange');
    maxDelayRange = document.getElementById('maxDelayRange');
    messageInput = document.getElementById('message');
    markdownPreview = document.getElementById('markdownPreview');
    fileInput = document.getElementById('fileInput');
    previewContainer = document.getElementById('previewContainer');
    uploadArea = document.getElementById('uploadArea');
    statusLog = document.getElementById('status');
    loadingOverlay = document.getElementById('loadingOverlay');
    progressPopup = document.getElementById('progressPopup');
    popupProgressBars = document.getElementById('popupProgressBars');
    popupSpeedDisplay = document.getElementById('popupSpeedDisplay');
    popupUploadSpeed = document.getElementById('popupUploadSpeed');
    sendModeToggleBtn = document.getElementById('sendModeToggle');
    themeToggleBtn = document.getElementById('themeToggleBtn');
    themeWipeContainer = document.getElementById('themeWipeContainer');
    newGroupNameInput = document.getElementById('newGroupNameInput');
    groupsListContainer = document.getElementById('groupsListContainer');
    imagePreviewModal = document.getElementById('imagePreviewModal');
    fullPreviewImage = document.getElementById('fullPreviewImage');
    pageContainer = document.querySelector('.container');
    cancelSendBtn = document.getElementById('cancelSendBtn');
    saveSettingsBtn = document.getElementById('saveSettingsBtn');


    storagePreferenceSelect = document.getElementById('storagePreference');
    localFileControls = document.getElementById('localFileControls');
    loadSettingsFileBtn = document.getElementById('loadSettingsFileBtn');
    settingsFileInput = document.getElementById('settingsFileInput');
    saveSettingsFileBtn = document.getElementById('saveSettingsFileBtn');
}


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
                    if (index === wipes.length - 1) { 
                        body.classList.toggle('theme-light', targetTheme === 'light');
                        body.classList.toggle('theme-dark', targetTheme === 'dark');
                    }
                }, delayBetweenWipes * index);
            });

            setTimeout(() => {
                themeWipeContainer.style.display = 'none';
                themeWipeContainer.innerHTML = '';
                if (pageContainer) {
                    pageContainer.classList.remove('visible'); 
                    void pageContainer.offsetWidth; 
                    pageContainer.classList.add('visible'); 
                }
                isAnimatingTheme = false;
                themeToggleBtn.disabled = false;
                // Removed collectSettingsAndSave();
            }, delayBetweenWipes * (wipes.length - 1) + animationDuration);
        });
    });
}


// --- API Token 管理 ---
function toggleTokenVisibility() {
    const eyeClosed = document.querySelector('.eye-closed');
    const eyeOpen = document.querySelector('.eye-open');
    const isBlurred = apiTokenInput.classList.toggle('blurred-text');
    eyeClosed.style.display = isBlurred ? 'block' : 'none';
    eyeOpen.style.display = isBlurred ? 'none' : 'block';
    // Removed collectSettingsAndSave();
}

function pasteToken() {
    if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText()
            .then(text => {
                if (text) {
                    apiTokenInput.value = text.trim();
                    // Removed collectSettingsAndSave();
                    updateStatus('状态：API Token 已从剪贴板粘贴。请记得手动保存设置。', 'info');
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


// --- 文件处理 & 预览 ---
function updateFilePreview() {
    previewContainer.innerHTML = '';
    fileItems.forEach((item, index) => {
        const thumbnailWrapper = document.createElement('div');
        thumbnailWrapper.className = 'thumbnail';
        thumbnailWrapper.id = item.id;
        thumbnailWrapper.draggable = true; // For reordering

        let contentHTML = '';
        if (item.type.startsWith('image/') && item.previewUrl) {
            contentHTML = `
                <img src="${item.previewUrl}" alt="${item.name}" class="file-image-preview" onclick="openImagePreviewModal('${item.previewUrl}')">
                <div class="file-info">
                    <span title="${item.name}">${item.name}</span>
                    <span>${formatFileSize(item.size)}</span>
                </div>
            `;
        } else if (item.type.startsWith('image/')) { 
             contentHTML = `
                <div class="file-image-placeholder">加载中...</div>
                <div class="file-info">
                    <span title="${item.name}">${item.name}</span>
                    <span>${formatFileSize(item.size)}</span>
                </div>
            `;
        } else { 
            contentHTML = `
                <div class="file-info">
                    <span title="${item.name}">${item.name}</span>
                    <span>${formatFileSize(item.size)}</span>
                </div>
            `;
        }

        thumbnailWrapper.innerHTML = `
            ${contentHTML}
            <button class="remove-btn" onclick="removeFileById('${item.id}')">×</button>
        `;
        
        thumbnailWrapper.classList.remove('fade-out-active'); 
        void thumbnailWrapper.offsetWidth; 
        thumbnailWrapper.classList.add('fade-in'); 
        previewContainer.appendChild(thumbnailWrapper);

        // Add drag events for reordering
        thumbnailWrapper.addEventListener('dragstart', handleDragStart);
        thumbnailWrapper.addEventListener('dragover', handleDragOver);
        thumbnailWrapper.addEventListener('dragleave', handleDragLeave);
        thumbnailWrapper.addEventListener('drop', handleDrop);
        thumbnailWrapper.addEventListener('dragend', handleDragEnd);
    });
    if (fileItems.length === 0) {
        previewContainer.innerHTML = '<p class="empty-preview-text">暂无文件</p>';
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function removeFileById(fileId) {
    const element = document.getElementById(fileId);
    const itemIndex = fileItems.findIndex(fi => fi.id === fileId);

    if (element && itemIndex !== -1) {
        element.classList.remove('fade-in');
        element.classList.add('fade-out-active');
        
        element.addEventListener('animationend', function handleAnimationEnd() {
            element.removeEventListener('animationend', handleAnimationEnd);
            const currentActualIndex = fileItems.findIndex(fi => fi.id === fileId); // Re-check index
            if (currentActualIndex !== -1) {
                fileItems.splice(currentActualIndex, 1);
            }
            updateFilePreview(); 
        }, { once: true });
    } else if (itemIndex !== -1) { // Fallback if element not found but item exists
        fileItems.splice(itemIndex, 1);
        updateFilePreview();
    }
}


function handleFiles(event) {
    const files = event.target?.files || event.dataTransfer?.files;
    if (!files) return;

    const filesToAdd = Array.from(files);
    let addedCount = 0;
    let ignoredCount = 0;
    const currentFileCount = fileItems.length;

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
                    // Smart update instead of full re-render if possible
                    const existingThumb = document.getElementById(fileItem.id);
                    if (existingThumb) {
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
                         // This can happen if updateFilePreview was called before reader finished for all files
                         updateFilePreview(); 
                    }
                };
                reader.readAsDataURL(file);
            }
        }
    }

    if (addedCount > 0) {
        if (currentFileCount === 0) updateFilePreview(); // Full render if it was empty
        else { // Append new items efficiently
            const newItems = fileItems.slice(currentFileCount);
            newItems.forEach(item => {
                const thumbnailWrapper = document.createElement('div');
                thumbnailWrapper.className = 'thumbnail';
                thumbnailWrapper.id = item.id;
                thumbnailWrapper.draggable = true;
                let contentHTML = '';
                 if (item.type.startsWith('image/') && !item.previewUrl) { // Placeholder for images being loaded
                    contentHTML = `
                        <div class="file-image-placeholder">加载中...</div>
                        <div class="file-info"><span title="${item.name}">${item.name}</span><span>${formatFileSize(item.size)}</span></div>`;
                } else { // Non-image or image already has preview (unlikely here, but robust)
                     contentHTML = `
                        ${item.type.startsWith('image/') && item.previewUrl ? `<img src="${item.previewUrl}" alt="${item.name}" class="file-image-preview" onclick="openImagePreviewModal('${item.previewUrl}')">` : ''}
                        <div class="file-info"><span title="${item.name}">${item.name}</span><span>${formatFileSize(item.size)}</span></div>`;
                }
                thumbnailWrapper.innerHTML = `${contentHTML}<button class="remove-btn" onclick="removeFileById('${item.id}')">×</button>`;
                thumbnailWrapper.classList.add('fade-in');
                thumbnailWrapper.addEventListener('dragstart', handleDragStart);
                thumbnailWrapper.addEventListener('dragover', handleDragOver);
                thumbnailWrapper.addEventListener('dragleave', handleDragLeave);
                thumbnailWrapper.addEventListener('drop', handleDrop);
                thumbnailWrapper.addEventListener('dragend', handleDragEnd);

                const emptyText = previewContainer.querySelector('.empty-preview-text');
                if(emptyText) emptyText.remove();
                previewContainer.appendChild(thumbnailWrapper);
            });
        }
    }
    if (ignoredCount > 0) {
        updateStatus(`状态：最多只能上传10个文件（Discord 限制），${ignoredCount}个文件已被忽略。`, 'error');
    }
    if (fileItems.length === 0 && previewContainer.innerHTML.trim() === '') { // Ensure empty text if all removed
        previewContainer.innerHTML = '<p class="empty-preview-text">暂无文件</p>';
    }
}

function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    let filesPastedCount = 0;
    let ignoredCount = 0;
    const currentFileCount = fileItems.length;


    for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
            if (fileItems.length >= 10) {
                ignoredCount++;
                continue;
            }
            const blob = items[i].getAsFile();
            if (blob) {
                let extension = 'png';
                if (blob.type === 'image/jpeg') extension = 'jpg';
                else if (blob.type === 'image/gif') extension = 'gif';
                else if (blob.type === 'image/webp') extension = 'webp';

                const originalName = blob.name && blob.name !== 'image.png' ? blob.name : `pasted-image-${Date.now()}.${extension}`;
                
                const file = new File([blob], originalName, { type: blob.type });

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
                    filesPastedCount++;

                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                            fileItem.previewUrl = ev.target.result;
                            const existingThumb = document.getElementById(fileItem.id);
                            if (existingThumb) { 
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
                                // Possible if updateFilePreview was called between paste and reader.onload
                                updateFilePreview(); // Less efficient but ensures correctness
                            }
                        };
                        reader.readAsDataURL(file);
                    }
                }
            }
        }
    }
    if (filesPastedCount > 0) {
        if (currentFileCount === 0 && filesPastedCount === fileItems.length) updateFilePreview();
        else handleFiles({ target: { files: [] } }); // Trigger smart append/update logic
        updateStatus(`状态：从剪贴板粘贴了 ${filesPastedCount} 个文件。`, 'info');
    }
    if (ignoredCount > 0 && fileItems.length >=10) {
         updateStatus('状态：已达到10个文件上限（Discord 限制），后续粘贴的文件将被忽略。', 'error');
    }
}

// Drag and Drop File Reordering
function handleDragStart(e) {
    draggedFileItemId = e.target.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', e.target.id);
    setTimeout(() => e.target.classList.add('dragging'), 0);
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const targetThumbnail = e.target.closest('.thumbnail');
    if (targetThumbnail && targetThumbnail.id !== draggedFileItemId) {
        const allThumbnails = Array.from(previewContainer.querySelectorAll('.thumbnail'));
        allThumbnails.forEach(thumb => thumb.classList.remove('drag-over-target'));
        targetThumbnail.classList.add('drag-over-target');
    }
}

function handleDragLeave(e) {
    const targetThumbnail = e.target.closest('.thumbnail');
    if (targetThumbnail) {
        targetThumbnail.classList.remove('drag-over-target');
    }
}

function handleDrop(e) {
    e.preventDefault();
    const targetThumbnail = e.target.closest('.thumbnail');
    const droppedOnId = targetThumbnail ? targetThumbnail.id : null;

    if (draggedFileItemId && draggedFileItemId !== droppedOnId) {
        const draggedItemIndex = fileItems.findIndex(item => item.id === draggedFileItemId);
        const targetItemIndex = droppedOnId ? fileItems.findIndex(item => item.id === droppedOnId) : fileItems.length;

        if (draggedItemIndex !== -1 && targetItemIndex !== -1) {
            const [draggedItem] = fileItems.splice(draggedItemIndex, 1);
            // Adjust target index if dragged item was before target
            const adjustedTargetIndex = draggedItemIndex < targetItemIndex ? targetItemIndex -1 : targetItemIndex;
            fileItems.splice(adjustedTargetIndex, 0, draggedItem);
            updateFilePreview(); // Re-render with new order
        }
    }
    if(targetThumbnail) targetThumbnail.classList.remove('drag-over-target');
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    const allThumbnails = Array.from(previewContainer.querySelectorAll('.thumbnail'));
    allThumbnails.forEach(thumb => thumb.classList.remove('drag-over-target'));
    draggedFileItemId = null;
}


// --- Image Preview Modal ---
function openImagePreviewModal(imageUrl) {
    if (!imageUrl) return;
    fullPreviewImage.src = imageUrl;
    imagePreviewModal.style.display = 'flex';
    void imagePreviewModal.offsetWidth; 
    imagePreviewModal.classList.remove('fade-out-modal');
    imagePreviewModal.classList.add('fade-in-modal');
}

function closeImagePreviewModal() {
    imagePreviewModal.classList.remove('fade-in-modal');
    imagePreviewModal.classList.add('fade-out-modal');
    setTimeout(() => {
        imagePreviewModal.style.display = 'none';
        fullPreviewImage.src = ''; 
    }, 300); 
}


// --- 随机延迟 ---
function updateDelay(event) { 
    if (event && event.target) { 
        const source = event.target.id.includes('Range') ? 'range' : 'input';
        const type = event.target.id.includes('min') ? 'min' : 'max';
        let rangeInput = type === 'min' ? minDelayRange : maxDelayRange;
        let numberInput = type === 'min' ? minDelayInput : maxDelayInput;
        if (source === 'range') numberInput.value = rangeInput.value;
        else {
            if (numberInput.value < 0) numberInput.value = 0;
            rangeInput.value = numberInput.value;
        }
    }
    if (parseInt(minDelayInput.value) > parseInt(maxDelayInput.value)) {
        if (event && event.target && event.target.id.includes('min')) { 
            maxDelayInput.value = minDelayInput.value;
            maxDelayRange.value = minDelayInput.value;
        } else { 
            minDelayInput.value = maxDelayInput.value;
            minDelayRange.value = maxDelayInput.value;
        }
    }
    // Removed collectSettingsAndSave();
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
    // Removed collectSettingsAndSave();
    renderGroupsAndChannels();
    updateStatus(`状态：已添加频道组 "${groupName}"。请记得手动保存设置。`, 'info');
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
    const panelContent = headerElement.nextElementSibling; 
    panelContent.classList.toggle('collapsed', !group.panelOpen);
    const actionsPerGroup = panelContent.nextElementSibling; 
    if (actionsPerGroup) actionsPerGroup.classList.toggle('collapsed', !group.panelOpen);
    
    const groupItemDiv = document.getElementById(groupId);
    if (groupItemDiv) groupItemDiv.classList.toggle('collapsed-group', !group.panelOpen);

    // Removed collectSettingsAndSave();
}


function renameGroup(groupId, newName) {
    if (channelGroupsData[groupId]) {
        channelGroupsData[groupId].name = newName.trim() || "未命名组";
        // Removed collectSettingsAndSave();
        updateStatus(`状态：频道组 ${groupId} 已重命名为 "${channelGroupsData[groupId].name}"。请记得手动保存设置。`, 'info');
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
        // Removed collectSettingsAndSave();
        updateStatus(`状态：频道组 "${group.name}" 已${group.enabled ? '启用' : '禁用'}。请记得手动保存设置。`, 'info');
    }
}

function deleteGroup(groupId, event) {
    event.stopPropagation();
    const group = channelGroupsData[groupId];
    if (group && confirm(`确定要删除频道组 "${group.name}" 及其所有频道吗？`)) {
        const groupName = group.name;
        delete channelGroupsData[groupId];
        // Removed collectSettingsAndSave();
        renderGroupsAndChannels();
        updateStatus(`状态：频道组 "${groupName}" 已删除。请记得手动保存设置。`, 'info');
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
        // Removed collectSettingsAndSave();
        renderGroupsAndChannels(); 
        updateStatus(`状态：已在组 "${group.name}" 中添加新频道。请记得手动保存设置。`, 'info');
        const newChannelInput = document.querySelector(`#channel_${groupId}_${channelId} input[type="text"]`);
        if (newChannelInput) newChannelInput.focus();
    }
}

function createChannelElement(groupId, channelId, channelData) {
    const div = document.createElement('div');
    div.className = `channel-item ${channelData.enabled ? '' : 'disabled'}`;
    div.id = `channel_${groupId}_${channelId}`;
    const uniqueChannelNameId = `channel-name-${groupId}-${channelId}`;
    const uniqueRetryBtnId = `retry-btn-${groupId}-${channelId}`;

    let fetchedInfoHTML = `服务器：未识别 | 频道：未识别`;
    let retryButtonHTML = '';

    if (channelData.fetchedInfo) {
        fetchedInfoHTML = `服务器：${channelData.fetchedInfo.guildName} | 频道：#${channelData.fetchedInfo.channelName}`;
    } else if (channelData.url) { // URL exists but no fetchedInfo (could be due to error or pending)
        fetchedInfoHTML = `服务器：获取失败 | 频道：获取失败`;
        retryButtonHTML = `
            <button id="${uniqueRetryBtnId}" class="retry-fetch-btn" onclick="retryFetchChannelInfo('${groupId}', '${channelId}', this)" title="重试获取频道信息">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            </button>`;
    }


    div.innerHTML = `
        <button class="channel-toggle-btn ${channelData.enabled ? 'enabled-btn' : 'disabled-btn'}" 
                onclick="toggleChannelEnabledState('${groupId}', '${channelId}')">
            ${channelData.enabled ? '已启用' : '已禁用'}
        </button>
        <div class="input-group channel-info-container"> 
            <div class="channel-fetched-info-wrapper">
                <span id="${uniqueChannelNameId}" class="channel-fetched-info">${fetchedInfoHTML}</span>
                ${retryButtonHTML}
            </div>
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

async function retryFetchChannelInfo(groupId, channelId, buttonElement) {
    if (buttonElement) {
        buttonElement.disabled = true;
        buttonElement.classList.add('loading');
    }
    await fetchChannelInfo(groupId, channelId); // This function will update UI and save
    // fetchChannelInfo should handle re-enabling or removing the button based on outcome.
    // For simplicity, if fetchChannelInfo doesn't explicitly re-enable, we do it here,
    // but ideally, it's handled by UI update from fetchChannelInfo.
    // A full re-render by renderGroupsAndChannels() will also fix this.
    // To be safe, let's re-enable if it still exists.
    const currentButton = document.getElementById(buttonElement.id);
    if (currentButton) {
        currentButton.disabled = false;
        currentButton.classList.remove('loading');
    }
}


function setupChannelInputListeners(inputElement, groupId, channelId) {
    const discordChannelUrlPattern = /^https:\/\/discord\.com\/channels\/(\d+|@me)\/\d+$/;

    inputElement.addEventListener('input', () => {
        const group = channelGroupsData[groupId];
        if (group && group.channels[channelId]) {
            const newUrl = inputElement.value.trim();
            group.channels[channelId].url = newUrl;
            // Removed collectSettingsAndSave();

            const channelNameSpan = document.getElementById(`channel-name-${groupId}-${channelId}`);
            const retryBtn = document.getElementById(`retry-btn-${groupId}-${channelId}`);
            
            if (!newUrl) {
                if(channelNameSpan) channelNameSpan.textContent = '服务器：未识别 | 频道：未识别';
                group.channels[channelId].fetchedInfo = null;
                if(retryBtn) retryBtn.style.display = 'none';
                // Removed collectSettingsAndSave();
                return;
            }

            if (!discordChannelUrlPattern.test(newUrl) && newUrl !== '') {
                 if(channelNameSpan) channelNameSpan.textContent = '服务器：URL格式无效 | 频道：URL格式无效';
                 group.channels[channelId].fetchedInfo = null;
                 if(retryBtn) retryBtn.style.display = 'block'; // Show retry even for format error, as user might fix it
                 // Removed collectSettingsAndSave();
                 // Do not attempt to fetch if format is clearly wrong
                 if (inputElement._fetchTimeout) clearTimeout(inputElement._fetchTimeout);
                 return;
            }

            if (group.channels[channelId].enabled && group.channels[channelId].url) {
                if (inputElement._fetchTimeout) clearTimeout(inputElement._fetchTimeout);
                inputElement._fetchTimeout = setTimeout(() => fetchChannelInfo(groupId, channelId), 500);
            } else {
                if (channelNameSpan) channelNameSpan.textContent = '服务器：未识别 | 频道：未识别'; // Or URL related message if invalid
                group.channels[channelId].fetchedInfo = null;
                if(retryBtn) retryBtn.style.display = newUrl ? 'block' : 'none';
                // Removed collectSettingsAndSave();
            }
        }
    });
}

function toggleChannelEnabledState(groupId, channelId) {
    const group = channelGroupsData[groupId];
    const channel = group?.channels[channelId];
    if (channel) {
        channel.enabled = !channel.enabled;
        // Removed collectSettingsAndSave();
        renderGroupsAndChannels(); 
        updateStatus(`状态：组 "${group.name}" 内频道 ${channelId} 已${channel.enabled ? '启用' : '禁用'}。请记得手动保存设置。`, 'info');
        if(channel.enabled && channel.url && !channel.fetchedInfo) {
            fetchChannelInfo(groupId, channelId); // Fetch info if enabled and not already fetched
        }
    }
}

function toggleChannelSpoilerState(groupId, channelId) {
    const group = channelGroupsData[groupId];
    const channel = group?.channels[channelId];
    if (channel && channel.enabled) { 
        channel.spoiler = !channel.spoiler;
        // Removed collectSettingsAndSave();
        renderGroupsAndChannels(); 
        updateStatus(`状态：组 "${group.name}" 内频道 ${channelId} 剧透标签已${channel.spoiler ? '开启' : '关闭'}。请记得手动保存设置。`, 'info');
    }
}

function removeChannelFromGroup(groupId, channelId) {
    const group = channelGroupsData[groupId];
    if (group && group.channels[channelId] && confirm(`确定要从组 "${group.name}" 中删除此频道吗？`)) {
        delete group.channels[channelId];
        // Removed collectSettingsAndSave();
        renderGroupsAndChannels();
        updateStatus(`状态：已从组 "${group.name}" 中删除频道 ${channelId}。请记得手动保存设置。`, 'info');
    }
}

async function fetchChannelInfo(groupId, channelId) {
    const apiToken = apiTokenInput.value.trim();
    const group = channelGroupsData[groupId];
    const channel = group?.channels[channelId];
    const channelNameSpan = document.getElementById(`channel-name-${groupId}-${channelId}`);
    const retryBtn = document.getElementById(`retry-btn-${groupId}-${channelId}`);


    if (!channel || !channel.enabled || !channelNameSpan) {
        if (retryBtn) { // Ensure retry button is visible if fetch fails before starting
             retryBtn.style.display = channel && channel.url ? 'block' : 'none';
             retryBtn.disabled = false; retryBtn.classList.remove('loading');
        }
        return;
    }
    
    channel.fetchedInfo = null; 
    if (retryBtn) {
        retryBtn.disabled = true; retryBtn.classList.add('loading');
    }

    const channelUrl = channel.url.trim();
    if (!apiToken) {
        channelNameSpan.textContent = '服务器：需Token | 频道：需Token';
        if (retryBtn) { retryBtn.style.display = 'block'; retryBtn.disabled = false; retryBtn.classList.remove('loading');}
        // Removed collectSettingsAndSave();
        return;
    }
    if (!channelUrl) {
        channelNameSpan.textContent = '服务器：未识别 | 频道：未识别';
        if (retryBtn) { retryBtn.style.display = 'none'; retryBtn.disabled = false; retryBtn.classList.remove('loading');}
        // Removed collectSettingsAndSave();
        return;
    }
    
    const urlParts = channelUrl.match(/channels\/(\d+|@me)\/(\d+)/);
    if (!urlParts || urlParts.length < 3) {
        channelNameSpan.textContent = '服务器：格式错误 | 频道：格式错误';
        if (retryBtn) { retryBtn.style.display = 'block'; retryBtn.disabled = false; retryBtn.classList.remove('loading');}
        // Removed collectSettingsAndSave();
        return;
    }
    const discordGuildId = urlParts[1]; 
    const discordChannelId = urlParts[2];

    channelNameSpan.textContent = '服务器：获取中... | 频道：获取中...';

    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    try {
        const timeout = 8000;
        // const controller = new AbortController(); // Replaced by global currentAbortController
        const timeoutId = setTimeout(() => currentAbortController.abort("timeout"), timeout);
        const headers = { 'Authorization': apiToken };

        const channelResponse = await fetch(`https://discord.com/api/v9/channels/${discordChannelId}`, {
            method: 'GET', headers, signal
        });
        clearTimeout(timeoutId);

        if (!channelResponse.ok) {
            let errorMsg = `频道信息获取失败 (${channelResponse.status})`;
            try {
                const errData = await channelResponse.json();
                errorMsg = errData.message || errorMsg;
                if (errData.code === 50001) errorMsg = "无权限访问此频道";
                else if (errData.code === 10003) errorMsg = "目标频道不存在";
            } catch (e) { /* ignore json parse error */ }
            throw new Error(errorMsg);
        }
        const channelData = await channelResponse.json();
        const fetchedChannelName = channelData.name || '未知频道';

        let fetchedGuildName = '未知服务器';
        if (discordGuildId !== '@me' && channelData.guild_id) { 
             const guildController = new AbortController();
             const guildTimeoutId = setTimeout(() => guildController.abort("timeout"), timeout);
             try {
                const guildResponse = await fetch(`https://discord.com/api/v9/guilds/${channelData.guild_id}`, { 
                    method: 'GET', headers, signal: guildController.signal
                });
                clearTimeout(guildTimeoutId);
                if (guildResponse.ok) {
                    const guildData = await guildResponse.json();
                    fetchedGuildName = guildData.name || '未知服务器';
                } else {
                    // Could add specific guild error parsing here
                }
             } catch (guildErr) { clearTimeout(guildTimeoutId); /* ignore guild fetch error */ }
        } else if (discordGuildId === '@me' || channelData.type === 1) { 
            fetchedGuildName = "私信";
        }

        channel.fetchedInfo = { guildName: fetchedGuildName, channelName: fetchedChannelName };
        channelNameSpan.textContent = `服务器：${fetchedGuildName} | 频道：#${fetchedChannelName}`;
        if (retryBtn) retryBtn.style.display = 'none'; // Hide on success
    } catch (err) {
        channel.fetchedInfo = null;
        let displayError = '服务器：获取失败 | 频道：获取失败';
        if (err.message.includes("timeout")) displayError = '服务器：超时 | 频道：超时';
        else if (err.message) displayError = `错误: ${err.message.substring(0,30)}`;

        channelNameSpan.textContent = displayError;
        if (retryBtn) {
            retryBtn.style.display = 'block';
            retryBtn.disabled = false; 
            retryBtn.classList.remove('loading');
        }
        if (err.name !== 'AbortError' || (err.message && !err.message.includes("timeout"))) { // Don't log explicit user aborts or timeouts as errors unless it's not a timeout
            updateStatus(`状态：频道 ${channelId} (组 "${group.name}") 信息获取失败: ${err.message}`, 'error');
        }
    } finally {
        if (currentAbortController && signal === currentAbortController.signal) {
             currentAbortController = null; // Clear global controller if it was ours
        }
        // Removed collectSettingsAndSave(); // Fetched info is in memory, user saves manually
    }
}


function enableAllChannelsInGroup(groupId) {
    const group = channelGroupsData[groupId];
    if (group) {
        Object.values(group.channels).forEach(channel => channel.enabled = true);
        // Removed collectSettingsAndSave();
        renderGroupsAndChannels(); // Will trigger fetches for newly enabled channels if needed
        updateStatus(`状态：频道组 "${group.name}" 内所有频道已启用。请记得手动保存设置。`, 'info');
    }
}

function disableAllChannelsInGroup(groupId) {
    const group = channelGroupsData[groupId];
    if (group) {
        Object.values(group.channels).forEach(channel => channel.enabled = false);
        // Removed collectSettingsAndSave();
        renderGroupsAndChannels();
        updateStatus(`状态：频道组 "${group.name}" 内所有频道已禁用。请记得手动保存设置。`, 'info');
    }
}

function enableAllChannelsGlobally() {
    Object.values(channelGroupsData).forEach(group => {
        Object.values(group.channels).forEach(channel => channel.enabled = true);
    });
    // Removed collectSettingsAndSave();
    renderGroupsAndChannels(); // Will trigger fetches
    updateStatus('状态：所有组的所有频道已全部启用。请记得手动保存设置。', 'info');
}

function disableAllChannelsGlobally() {
    Object.values(channelGroupsData).forEach(group => {
        Object.values(group.channels).forEach(channel => channel.enabled = false);
    });
    // Removed collectSettingsAndSave();
    renderGroupsAndChannels();
    updateStatus('状态：所有组的所有频道已全部禁用。请记得手动保存设置。', 'info');
}


// --- 发送模式管理 ---
function toggleSendMode() {
    sendMode = sendMode === 'sequential' ? 'parallel' : 'sequential';
    sendModeToggleBtn.textContent = sendMode === 'sequential' ? '切换为并行发送' : '切换为逐条发送';
    sendModeToggleBtn.classList.toggle('primary-btn', sendMode === 'parallel');
    sendModeToggleBtn.classList.toggle('secondary-btn', sendMode === 'sequential');
    // Removed collectSettingsAndSave();
    updateStatus(`状态：发送模式已切换为 ${sendMode === 'sequential' ? '逐条发送' : '并行发送'}。请记得手动保存设置。`, 'info');
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
    const spinnerElement = document.getElementById('loadingSpinner');
    if (spinnerElement) {
        lottieAnimation = lottie.loadAnimation({
            container: spinnerElement,
            renderer: 'svg', loop: true, autoplay: false,
            path: 'https://assets2.lottiefiles.com/packages/lf20_usmfxnmu.json'
        });
    }
}

function showProgressPopup(activeChannelsForSending) { 
    popupProgressBars.innerHTML = '';
    totalUploadedBytes = 0;
    lastUploadedBytesSnapshot = 0;
    lastSpeedUpdateTime = Date.now();
    isCancellingSend = false; // Reset cancellation flag
    if(cancelSendBtn) {
        cancelSendBtn.disabled = false;
        cancelSendBtn.textContent = "取消发送";
    }


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
            <div class="progress-status" id="progress-status-${popupChannelId}">等待中...</div>
        `;
        popupProgressBars.appendChild(progressContainer);
    });

    popupUploadSpeed.textContent = '上传速度：0 B/s';
    popupSpeedDisplay.style.display = 'block';
    progressPopup.style.display = 'flex';
    void progressPopup.offsetWidth; 
    progressPopup.classList.remove('fade-out-modal');
    progressPopup.classList.add('fade-in-modal');
    startUploadSpeedUpdate();
}

function hideProgressPopup() {
    progressPopup.classList.remove('fade-in-modal');
    progressPopup.classList.add('fade-out-modal');
    setTimeout(() => {
        progressPopup.style.display = 'none';
        popupProgressBars.innerHTML = ''; 
    }, 300); 
    stopUploadSpeedUpdate();
}

function updatePopupChannelStatus(originalChannelId, statusText, statusType = '') {
    const popupChannelId = `popup-channel-${originalChannelId}`;
    const statusElement = document.getElementById(`progress-status-${popupChannelId}`);
    if (statusElement) {
        statusElement.textContent = statusText;
        statusElement.className = 'progress-status'; // Reset classes
        if (statusType) {
            statusElement.classList.add(statusType); // e.g., 'success', 'error', 'cancelled'
        }
    }
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
    if (elapsedSeconds < 0.1) return; 
    const deltaBytes = totalUploadedBytes - lastUploadedBytesSnapshot;
    const speed = deltaBytes / elapsedSeconds;
    popupUploadSpeed.textContent = `上传速度：${formatFileSize(speed)}/s`;
    lastUploadedBytesSnapshot = totalUploadedBytes;
    lastSpeedUpdateTime = now;
}

function startUploadSpeedUpdate() {
    if (speedUpdateInterval) return;
    lastUploadedBytesSnapshot = totalUploadedBytes; 
    lastSpeedUpdateTime = Date.now();
    speedUpdateInterval = setInterval(updatePopupSpeedDisplay, 250); 
}
function stopUploadSpeedUpdate() {
    if (speedUpdateInterval) {
        clearInterval(speedUpdateInterval);
        speedUpdateInterval = null;
    }
}

function handleCancelSend() {
    if (isSending && !isCancellingSend) {
        isCancellingSend = true;
        updateStatus("状态：用户请求取消发送...", "info");
        if (cancelSendBtn) {
            cancelSendBtn.disabled = true;
            cancelSendBtn.textContent = "正在取消...";
        }
        if (currentAbortController) {
            currentAbortController.abort("user_cancelled"); // Abort ongoing fetch/XHR
        }
        // Further cancellation logic is handled within send loops and delay functions
    }
}


// --- Data Saving/Loading & Management ---

const dataManager = {
    async saveData(data) {
        if (currentStorageMethod === 'localStorage') {
            localStorage.setItem('appSettings', JSON.stringify(data));
            updateStatus('设置已保存到浏览器。', 'info');
        } else if (currentStorageMethod === 'localFile') {
            const jsonData = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'discord_forwarder_settings.json'; 
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            updateStatus('设置文件 "discord_forwarder_settings.json" 下载已启动。请手动保存到您希望的位置。', 'info');
        }
    },
    async loadData() {
        return new Promise((resolve) => {
            if (currentStorageMethod === 'localStorage') {
                const savedData = localStorage.getItem('appSettings');
                if (savedData) {
                    try {
                        resolve(JSON.parse(savedData));
                    } catch (e) {
                        updateStatus('从浏览器存储解析设置时出错。使用默认设置。', 'error');
                        resolve(getDefaultSettings());
                    }
                } else {
                    resolve(getDefaultSettings()); 
                }
            } else if (currentStorageMethod === 'localFile') {
                updateStatus('已选择本地文件存储。请使用“从文件加载设置”按钮加载您的设置。', 'info');
                resolve(getDefaultSettings()); 
            }
        });
    }
};

function getDefaultSettings() {
    const defaultGroupId = generateUniqueId('group_');
    const defaultGroupsData = {};
    defaultGroupsData[defaultGroupId] = {
        name: "默认组",
        enabled: true,
        panelOpen: true,
        channels: {}
    };
    return {
        apiToken: '',
        blurToken: 'true',
        minDelay: '1',
        maxDelay: '5',
        message: '',
        channelGroupsData: defaultGroupsData,
        sendMode: 'sequential',
        theme: 'light'
    };
}

function manualSaveSettings() {
    collectSettingsAndSave();
}

function collectSettingsAndSave() {
    const settings = {
        apiToken: apiTokenInput.value.trim(),
        blurToken: apiTokenInput.classList.contains('blurred-text').toString(),
        minDelay: minDelayInput.value,
        maxDelay: maxDelayInput.value,
        message: messageInput.value,
        channelGroupsData: channelGroupsData,
        sendMode: sendMode,
        theme: document.body.classList.contains('theme-dark') ? 'dark' : 'light'
    };
    dataManager.saveData(settings).catch(err => {
        updateStatus(`保存设置时出错: ${err.message}`, 'error');
    });
}

async function loadSavedData() {
    const preferredMethod = localStorage.getItem('storagePreference') || 'localStorage';
    storagePreferenceSelect.value = preferredMethod;
    updateStorageMethodUI(preferredMethod); 

    const settings = await dataManager.loadData(); 
    applySettings(settings);

    if (pageContainer) {
        setTimeout(() => {
            pageContainer.classList.add('visible');
        }, 100);
    }
}

function applySettings(settings) {
    apiTokenInput.value = settings.apiToken || '';
    const shouldBlur = settings.blurToken === null || settings.blurToken === 'true';
    apiTokenInput.classList.toggle('blurred-text', shouldBlur);
    document.querySelector('.eye-closed').style.display = shouldBlur ? 'block' : 'none';
    document.querySelector('.eye-open').style.display = shouldBlur ? 'none' : 'block';

    minDelayInput.value = settings.minDelay || '1';
    maxDelayInput.value = settings.maxDelay || '5';
    minDelayRange.value = minDelayInput.value;
    maxDelayRange.value = maxDelayInput.value;
    updateDelay({}); // Pass empty object or null if event isn't available

    messageInput.value = settings.message || '';
    if (markdownPreview) renderMarkdownPreview();

    channelGroupsData = settings.channelGroupsData || {};
    if (Object.keys(channelGroupsData).length === 0) {
        const defaultGroupId = generateUniqueId('group_');
        channelGroupsData[defaultGroupId] = { name: "默认组", enabled: true, panelOpen: true, channels: {} };
    }
    for (const groupId in channelGroupsData) {
        const group = channelGroupsData[groupId];
        if (typeof group.panelOpen === 'undefined') group.panelOpen = true;
    }
    if (groupsListContainer) renderGroupsAndChannels(); // This will trigger fetchChannelInfo for relevant channels

    sendMode = settings.sendMode || 'sequential';
    if (sendModeToggleBtn) {
        sendModeToggleBtn.textContent = sendMode === 'sequential' ? '切换为并行发送' : '切换为逐条发送';
        sendModeToggleBtn.classList.toggle('primary-btn', sendMode === 'parallel');
        sendModeToggleBtn.classList.toggle('secondary-btn', sendMode === 'sequential');
    }
    
    const themeToApply = settings.theme || 'light';
    document.body.classList.toggle('theme-light', themeToApply === 'light');
    document.body.classList.toggle('theme-dark', themeToApply === 'dark');

    updateStatus('设置已应用。', 'info');
}


function updateStorageMethodUI(method) {
    currentStorageMethod = method;
    if (method === 'localFile') {
        localFileControls.style.display = 'flex';
    } else {
        localFileControls.style.display = 'none';
    }
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

    isCancellingSend = false; // Reset cancellation flag for new send operation
    currentAbortController = new AbortController(); // Prepare a new AbortController for this send operation


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
                                  : `组: ${group.name} | 频: ${channelIdInGroup.substring(0,10)}...`, 
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
    stopUploadSpeedUpdate(); 
    updateStatus(`状态：所有发送任务已${isCancellingSend ? '取消' : '处理完毕'}。`);
    isSending = false;
    isCancellingSend = false;
    currentAbortController = null; // Clean up AbortController
    if(cancelSendBtn) {
        cancelSendBtn.disabled = false;
        cancelSendBtn.textContent = "取消发送";
    }
    // Don't hide progress popup immediately if cancelled, let user see final statuses
    if (!isCancellingSend) {
       // hideProgressPopup(); // Or keep it open with final statuses
    }
}

async function sendFile() {
    const prep = prepareSend();
    if (!prep) return;
    const { apiToken, channels } = prep;
    if (fileItems.length === 0) {
        updateStatus('状态：错误 - 请至少选择一个文件！', 'error');
        hideLoading(); hideProgressPopup(); isSending = false; currentAbortController = null; return;
    }
    try {
        if (sendMode === 'sequential') await sendSequentially(apiToken, channels, 'file');
        else await sendParallelly(apiToken, channels, 'file');
    } catch (error) { 
        if (error.name !== 'AbortError' || (error.message && !error.message.includes("user_cancelled") && !error.message.includes("timeout"))) {
            updateStatus(`状态：发送过程中发生意外错误: ${error.message}`, 'error');
        }
    }
    finally { finishSend(); }
}

async function sendText() {
    const prep = prepareSend();
    if (!prep) return;
    const { apiToken, channels } = prep;
    const message = messageInput.value.trim();
    if (!message) {
        updateStatus('状态：错误 - 请输入消息内容！', 'error');
        hideLoading(); hideProgressPopup(); isSending = false; currentAbortController = null; return;
    }
    try {
        if (sendMode === 'sequential') await sendSequentially(apiToken, channels, 'text', message);
        else await sendParallelly(apiToken, channels, 'text', message);
    } catch (error) { 
        if (error.name !== 'AbortError' || (error.message && !error.message.includes("user_cancelled") && !error.message.includes("timeout"))) {
            updateStatus(`状态：发送过程中发生意外错误: ${error.message}`, 'error');
        }
    }
    finally { finishSend(); }
}

async function sendFileAndText() {
    const prep = prepareSend();
    if (!prep) return;
    const { apiToken, channels } = prep;
    const message = messageInput.value.trim();
    if (fileItems.length === 0 && !message) { 
         updateStatus('状态：错误 - 请选择文件或输入消息内容！', 'error');
         hideLoading(); hideProgressPopup(); isSending = false; currentAbortController = null; return;
    }
    // If only message, call sendText
    if (fileItems.length === 0 && message) {
        hideLoading(); hideProgressPopup(); // Hide initial loading/popup if redirecting
        isSending = false; currentAbortController = null; // Reset state
        return sendText();
    }
    // If only files, call sendFile
    if (fileItems.length > 0 && !message) {
        hideLoading(); hideProgressPopup();
        isSending = false; currentAbortController = null;
        return sendFile();
    }

    try {
        if (sendMode === 'sequential') await sendSequentially(apiToken, channels, 'fileAndText', message);
        else await sendParallelly(apiToken, channels, 'fileAndText', message);
    } catch (error) { 
        if (error.name !== 'AbortError' || (error.message && !error.message.includes("user_cancelled") && !error.message.includes("timeout"))) {
            updateStatus(`状态：发送过程中发生意外错误: ${error.message}`, 'error');
        }
    }
    finally { finishSend(); }
}

async function sendSequentially(apiToken, channels, type, message = '') {
    for (const channel of channels) { 
        if (isCancellingSend) {
            updateStatus(`状态：${channel.name} - 发送已取消。`, 'info');
            updatePopupChannelStatus(channel.originalChannelId, "已取消", "cancelled");
            updatePopupProgressBar(channel.originalChannelId, 100); // Mark as "done" for UI
            continue; // Skip to next, or just break if all should stop
        }
        updatePopupChannelStatus(channel.originalChannelId, "等待延迟...");
        const delayTime = getRandomDelay();
        updateStatus(`状态：${channel.name} - 等待 ${Math.round(delayTime / 1000)}s 延迟...`);
        await delayWithProgress(delayTime, channel.originalChannelId, 0, 50); 
        
        if (isCancellingSend) {
            updateStatus(`状态：${channel.name} - 发送已取消 (延迟期间)。`, 'info');
            updatePopupChannelStatus(channel.originalChannelId, "已取消", "cancelled");
            updatePopupProgressBar(channel.originalChannelId, 100);
            continue;
        }
        updateStatus(`状态：${channel.name} - 开始发送...`);
        updatePopupChannelStatus(channel.originalChannelId, "发送中...");
        try {
            await sendSingleRequestWithRetry(apiToken, channel, type, message, (progress) => {
                 updatePopupProgressBar(channel.originalChannelId, 50 + progress * 0.5); 
            });
            updateStatus(`状态：${channel.name} - 发送成功。`, 'success');
            updatePopupChannelStatus(channel.originalChannelId, "发送成功", "success");
            updatePopupProgressBar(channel.originalChannelId, 100);
        } catch (error) {
            if (isCancellingSend || (error.name === 'AbortError' && error.message.includes("user_cancelled"))) {
                updateStatus(`状态：${channel.name} - 发送被用户取消。`, 'info');
                updatePopupChannelStatus(channel.originalChannelId, "已取消", "cancelled");
            } else {
                updateStatus(`状态：${channel.name} - 发送失败: ${error.message}`, 'error');
                updatePopupChannelStatus(channel.originalChannelId, `失败: ${error.message.substring(0,30)}...`, "error");
            }
            updatePopupProgressBar(channel.originalChannelId, 100); 
        }
    }
}

async function sendParallelly(apiToken, channels, type, message = '') {
    const promises = channels.map(channel => { 
        return (async () => {
            if (isCancellingSend) {
                updateStatus(`状态：${channel.name} - 发送已取消 (队列)。`, 'info');
                updatePopupChannelStatus(channel.originalChannelId, "已取消", "cancelled");
                updatePopupProgressBar(channel.originalChannelId, 100);
                return { status: 'cancelled', channelId: channel.originalChannelId };
            }
            updatePopupChannelStatus(channel.originalChannelId, "等待延迟...");
            const delayTime = getRandomDelay();
            updateStatus(`状态：${channel.name} - 等待 ${Math.round(delayTime / 1000)}s 延迟...`);
            await delayWithProgress(delayTime, channel.originalChannelId, 0, 50);
            
            if (isCancellingSend) {
                updateStatus(`状态：${channel.name} - 发送已取消 (延迟期间)。`, 'info');
                updatePopupChannelStatus(channel.originalChannelId, "已取消", "cancelled");
                updatePopupProgressBar(channel.originalChannelId, 100);
                return { status: 'cancelled', channelId: channel.originalChannelId };
            }
            updateStatus(`状态：${channel.name} - 开始发送...`);
            updatePopupChannelStatus(channel.originalChannelId, "发送中...");
            try {
                await sendSingleRequestWithRetry(apiToken, channel, type, message, (progress) => {
                    updatePopupProgressBar(channel.originalChannelId, 50 + progress * 0.5);
                });
                updateStatus(`状态：${channel.name} - 发送成功。`, 'success');
                updatePopupChannelStatus(channel.originalChannelId, "发送成功", "success");
                updatePopupProgressBar(channel.originalChannelId, 100);
                return { status: 'fulfilled', channelId: channel.originalChannelId };
            } catch (error) {
                if (isCancellingSend || (error.name === 'AbortError' && error.message.includes("user_cancelled"))) {
                    updateStatus(`状态：${channel.name} - 发送被用户取消。`, 'info');
                    updatePopupChannelStatus(channel.originalChannelId, "已取消", "cancelled");
                } else {
                    updateStatus(`状态：${channel.name} - 发送失败: ${error.message}`, 'error');
                    updatePopupChannelStatus(channel.originalChannelId, `失败: ${error.message.substring(0,30)}...`, "error");
                }
                updatePopupProgressBar(channel.originalChannelId, 100);
                return { status: 'rejected', channelId: channel.originalChannelId, reason: error.message };
            }
        })();
    });
    await Promise.allSettled(promises);
}

async function sendSingleRequestWithRetry(apiToken, channel, type, message, onProgress, maxRetries = 1, currentRetry = 0) {
    if (isCancellingSend) throw new DOMException('用户取消发送', 'AbortError');
    try {
        return await sendSingleRequest(apiToken, channel, type, message, onProgress);
    } catch (error) {
        if (isCancellingSend || (error.name === 'AbortError' && error.message.includes("user_cancelled"))) {
            throw error; // Propagate user cancellation
        }
        const isDiscordRateLimit = error.message && error.message.includes("You are being rate limited.");
        const isHttpRateLimit = /HTTP 429/.test(error.message);
        if (isDiscordRateLimit || isHttpRateLimit) {
             updateStatus(`状态：${channel.name} - 遭遇速率限制。请尝试增加延迟或减少并行数。`, 'error');
             throw error; // Do not retry on rate limits immediately
        }

        const retryableError = (error.message.includes('网络错误') || error.message.includes('请求超时') || /HTTP 5\d{2}/.test(error.message))
                                && !/HTTP 401/.test(error.message) // Don't retry on Unauthorized
                                && !/HTTP 403/.test(error.message) // Don't retry on Forbidden
                                && !/HTTP 400/.test(error.message) // Don't retry on Bad Request
                                && !/HTTP 404/.test(error.message); // Don't retry on Not Found


        if (retryableError && currentRetry < maxRetries) {
            updatePopupChannelStatus(channel.originalChannelId, `失败，重试 ${currentRetry + 1}/${maxRetries}...`, "error");
            updateStatus(`状态：${channel.name} - 发送失败，尝试重试 (${currentRetry + 1}/${maxRetries})...`, 'error');
            const delayTime = 2000 * Math.pow(2, currentRetry); // Exponential backoff
            await delayWithProgress(delayTime, channel.originalChannelId, 0, 0); // Use delay for visual feedback, no actual progress part here

            if (isCancellingSend) throw new DOMException('用户取消发送 (重试期间)', 'AbortError');
            return sendSingleRequestWithRetry(apiToken, channel, type, message, onProgress, maxRetries, currentRetry + 1);
        }
        throw error; 
    }
}


async function sendSingleRequest(apiToken, channel, type, message, onProgress) {
    if (isCancellingSend) throw new DOMException('用户取消发送', 'AbortError');

    const url = `https://discord.com/api/v9/channels/${channel.discordChannelApiId}/messages`;
    const headers = { 'Authorization': apiToken };
    let body = null;
    let useXhr = false;
    const signal = currentAbortController ? currentAbortController.signal : null;


    if (type === 'file' || type === 'fileAndText') {
        useXhr = true; // XHR for progress tracking with FormData
        const formData = new FormData();
        const isSpoiler = channel.spoiler;
        
        fileItems.forEach((item, index) => { 
            const filename = isSpoiler ? `SPOILER_${item.name}` : item.name;
            formData.append(`files[${index}]`, item.file, filename); 
        });
        
        const payload = {};
        if (message) payload.content = message;
        if (Object.keys(payload).length > 0 || fileItems.length > 0) { 
             formData.append('payload_json', JSON.stringify(payload));
        }
        body = formData;

    } else if (type === 'text') {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ content: message });
    }

    return new Promise((resolve, reject) => {
        if (signal && signal.aborted) {
            return reject(new DOMException(signal.reason || '操作已中止', 'AbortError'));
        }

        if (useXhr) {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
            let channelUploadedBytes = 0;

            const abortHandler = () => {
                if (xhr.readyState !== XMLHttpRequest.UNSENT && xhr.readyState !== XMLHttpRequest.DONE) {
                    xhr.abort();
                }
                reject(new DOMException(signal.reason || '用户取消发送 (XHR)', 'AbortError'));
            };
            if (signal) signal.addEventListener('abort', abortHandler, { once: true });

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const currentChannelProgress = (event.loaded / event.total) * 100;
                    onProgress(currentChannelProgress);
                    const delta = event.loaded - channelUploadedBytes;
                    totalUploadedBytes += delta; 
                    channelUploadedBytes = event.loaded;
                }
            };
            xhr.onload = () => {
                if (signal) signal.removeEventListener('abort', abortHandler);
                if (xhr.status >= 200 && xhr.status < 300) {
                    onProgress(100); 
                    const finalDelta = (xhr.upload.total || channelUploadedBytes) - channelUploadedBytes;
                    if (finalDelta > 0) totalUploadedBytes += finalDelta;
                    try {
                         resolve(xhr.responseText ? JSON.parse(xhr.responseText) : {});
                    } catch (e) { resolve({}); } 
                } else {
                    let errorDetail = `HTTP ${xhr.status}`;
                    try {
                        const errData = JSON.parse(xhr.responseText);
                        errorDetail = `${errData.message || errorDetail}`;
                        if (errData.errors) errorDetail += ` 详情: ${JSON.stringify(errData.errors).substring(0,100)}...`;
                        if (errData.retry_after) errorDetail += ` (请于 ${errData.retry_after.toFixed(1)}s 后重试)`;
                        if (xhr.status === 401) errorDetail = "Token 无效或缺失权限";
                        if (xhr.status === 403) errorDetail = "无权限发送到此频道";
                        if (xhr.status === 404) errorDetail = "目标频道不存在";
                        if (xhr.status === 429) errorDetail = "速率限制，请增加延迟或减少并行数";
                    } catch (e) { errorDetail = `${errorDetail}: ${xhr.responseText.substring(0,100)}...`;}
                    reject(new Error(errorDetail));
                }
            };
            xhr.onerror = () => {
                if (signal) signal.removeEventListener('abort', abortHandler);
                reject(new Error('网络错误或请求被中断'));
            };
            xhr.ontimeout = () => {
                if (signal) signal.removeEventListener('abort', abortHandler);
                reject(new Error('请求超时'));
            };
            xhr.timeout = 600000; 
            xhr.send(body);
        } else { // Fetch for text messages
            fetch(url, { method: 'POST', headers, body, signal })
                .then(async response => {
                    if (response.ok) {
                        onProgress(100);
                        const text = await response.text();
                        return text ? JSON.parse(text) : {};
                    } else {
                        let errorDetail = `HTTP ${response.status}`;
                        const errorText = await response.text();
                        try {
                            const errData = JSON.parse(errorText);
                            errorDetail = `${errData.message || errorDetail}`;
                            if (errData.errors) errorDetail += ` 详情: ${JSON.stringify(errData.errors).substring(0,100)}...`;
                            if (errData.retry_after) errorDetail += ` (请于 ${errData.retry_after.toFixed(1)}s 后重试)`;
                            if (response.status === 401) errorDetail = "Token 无效或缺失权限";
                            if (response.status === 403) errorDetail = "无权限发送到此频道";
                            if (response.status === 404) errorDetail = "目标频道不存在";
                            if (response.status === 429) errorDetail = "速率限制，请增加延迟或减少并行数";
                        } catch (e) { errorDetail = `${errorDetail}: ${errorText.substring(0, 100)}...`; }
                        throw new Error(errorDetail);
                    }
                })
                .then(data => resolve(data))
                .catch(error => {
                    if (error.name === 'AbortError') {
                        reject(new DOMException(signal.reason || '用户取消发送 (Fetch)', 'AbortError'));
                    } else {
                        reject(error);
                    }
                });
        }
    });
}

function delayWithProgress(ms, originalChannelId, startPercent, endPercent) { 
    return new Promise(resolve => {
        if (isCancellingSend || ms <= 0) {
            if (!isCancellingSend) updatePopupProgressBar(originalChannelId, endPercent);
            resolve(); return;
        }
        const startTime = Date.now();
        const updateInterval = 50; 
        const intervalId = setInterval(() => {
            if (isCancellingSend) {
                clearInterval(intervalId);
                // Don't update progress if cancelled, let the main loop handle status
                resolve(); return;
            }
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
window.onload = async () => {
    initializeDOMElements();
    
    await loadSavedData(); 
    initializeLottie();
    updateFilePreview(); // Ensure empty text shows if no files initially

    // Event Listeners
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', manualSaveSettings);
    document.querySelector('#progressPopup .modal-close-button').addEventListener('click', hideProgressPopup);
    if (cancelSendBtn) cancelSendBtn.addEventListener('click', handleCancelSend);
    
    // Removed collectSettingsAndSave from these listeners
    apiTokenInput.addEventListener('input', () => {}); // No auto-save
    messageInput.addEventListener('input', () => { renderMarkdownPreview(); }); // No auto-save

    minDelayRange.addEventListener('input', (event) => { updateDelay(event); });
    maxDelayRange.addEventListener('input', (event) => { updateDelay(event); });
    minDelayInput.addEventListener('input', (event) => { updateDelay(event); });
    maxDelayInput.addEventListener('input', (event) => { updateDelay(event); });


    fileInput.addEventListener('change', handleFiles);
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); uploadArea.classList.remove('dragover'); });
    uploadArea.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); uploadArea.classList.remove('dragover'); handleFiles(e); });
    uploadArea.addEventListener('click', () => fileInput.click());
    document.addEventListener('paste', handlePaste);
    
    storagePreferenceSelect.addEventListener('change', (event) => {
        const newMethod = event.target.value;
        localStorage.setItem('storagePreference', newMethod); 
        updateStorageMethodUI(newMethod);
        if (newMethod === 'localFile') {
            updateStatus('存储方式已切换到本地文件。您可以加载现有设置或保存当前设置到文件。请记得手动保存。', 'info');
        } else {
            updateStatus('存储方式已切换到浏览器。设置将在此处保存/加载。请记得手动保存。', 'info');
        }
        // Removed collectSettingsAndSave(); 
    });

    loadSettingsFileBtn.addEventListener('click', () => {
        settingsFileInput.click();
    });

    saveSettingsFileBtn.addEventListener('click', () => {
        const originalStorageMethod = currentStorageMethod;
        currentStorageMethod = 'localFile'; // Temporarily set to ensure file download
        manualSaveSettings(); // This will collect current settings and save them using dataManager
        currentStorageMethod = originalStorageMethod; // Restore original method
    });

    settingsFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const loadedSettings = JSON.parse(e.target.result);
                    applySettings(loadedSettings); // Applies to UI and in-memory state
                    updateStatus(`设置已从 ${file.name} 加载。如需持久化，请手动保存。`, 'success');
                } catch (err) {
                    updateStatus(`读取设置文件时出错: ${err.message}`, 'error');
                }
            };
            reader.onerror = () => {
                updateStatus(`读取文件时出错: ${reader.error}`, 'error');
            };
            reader.readAsText(file);
            settingsFileInput.value = null; 
        }
    });
    
    window.addEventListener('keydown', (event) => {
        if (event.ctrlKey && (event.key === 's' || event.key === 'S')) {
            event.preventDefault();
            manualSaveSettings();
            updateStatus('设置已通过 Ctrl+S 保存。', 'info');
        }
        if (event.key === 'Escape' && imagePreviewModal.style.display === 'flex') {
            closeImagePreviewModal();
        }
    });
    imagePreviewModal.addEventListener('click', (event) => {
        if (event.target === imagePreviewModal) {
            closeImagePreviewModal();
        }
    });
};