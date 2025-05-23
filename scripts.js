// --- 全局变量 ---
let fileItems = []; // 存储多个文件 { file: File, name: string, size: number, type: string, previewUrl?: string, id: string, selected: boolean }
let channelGroupsData = {}; // { groupId: { name: string, enabled: boolean, panelOpen: boolean, channels: { channelId: { url: string, enabled: boolean, spoiler: boolean, fetchedInfo: { guildName: string, channelName: string, guildId: string, channelId: string } | null, alias?: string } } } }
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
let messageTemplates = {}; // 消息模板存储
let sendStatistics = { // 发送统计数据
    totalSends: 0,
    successfulSends: 0,
    failedSends: 0,
    totalBytes: 0,
    channelStats: {},
    startTime: Date.now()
};
let autoSaveInterval = null; // 自动保存定时器
let lastSelectedFileId = null; // For shift-click selection in file previews

// --- DOM 元素引用 ---
let apiTokenInput, minDelayInput, maxDelayInput, minDelayRange, maxDelayRange,
    messageInput, markdownPreview, fileInput, previewContainer, uploadArea,
    statusLog, loadingOverlay, progressPopup, popupProgressBars, popupSpeedDisplay,
    popupUploadSpeed, sendModeToggleBtn, themeToggleBtn, themeWipeContainer,
    newGroupNameInput, groupsListContainer, imagePreviewModal, fullPreviewImage,
    pageContainer, storagePreferenceSelect, localFileControls, loadSettingsFileBtn,
    settingsFileInput, saveSettingsFileBtn, cancelSendBtn, saveSettingsBtn,
    channelSearchInput, channelImportInput, messageTemplateSelect, statsModal,
    statsContent, checkTokenBtn, showStatsBtn;

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
    channelSearchInput = document.getElementById('channelSearchInput');
    channelImportInput = document.getElementById('channelImportInput');
    messageTemplateSelect = document.getElementById('messageTemplateSelect');
    statsModal = document.getElementById('statsModal');
    statsContent = document.getElementById('statsContent');
    checkTokenBtn = document.getElementById('checkTokenBtn');
    showStatsBtn = document.getElementById('showStatsBtn');
}

// --- Helper Functions ---
function generateUniqueId(prefix = 'id_') {
    return prefix + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- 全局错误处理 ---
window.addEventListener('unhandledrejection', event => {
    console.error('未处理的Promise错误:', event.reason);
    updateStatus(`系统错误: ${event.reason?.message || event.reason}`, 'error');
});

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
}

function pasteToken() {
    if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText()
            .then(text => {
                if (text) {
                    apiTokenInput.value = text.trim();
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

async function checkTokenValidity() {
    const token = apiTokenInput.value.trim();
    if (!token) {
        updateStatus('状态：请先输入 Token。', 'error');
        return;
    }

    checkTokenBtn.disabled = true;
    checkTokenBtn.textContent = '检查中...';
  
    try {
        const response = await fetch('https://discord.com/api/v9/users/@me', {
            headers: { 'Authorization': token }
        });
      
        if (response.ok) {
            const userData = await response.json();
            updateStatus(`状态：Token 有效！用户：${userData.username}#${userData.discriminator}`, 'success');
        } else {
            updateStatus(`状态：Token 无效或已过期 (${response.status})`, 'error');
        }
    } catch (error) {
        updateStatus('状态：检查 Token 时发生错误：' + error.message, 'error');
    } finally {
        checkTokenBtn.disabled = false;
        checkTokenBtn.textContent = '检查 Token 有效性';
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
    // Ensure marked is available and use marked.parse (or marked.marked for newer versions if API changes)
    if (window.marked && typeof window.marked.parse === 'function') {
        markdownPreview.innerHTML = text ? marked.parse(text) : '<p>无内容预览</p>';
    } else if (window.marked && typeof window.marked === 'function') { // For marked v4+ if default export is the function
        markdownPreview.innerHTML = text ? marked(text) : '<p>无内容预览</p>';
    } else {
        markdownPreview.innerHTML = '<p>Markdown 渲染库加载失败或不可用。</p>';
        console.warn("Marked.js library not found or 'parse' function is missing.");
    }
}

// --- 消息模板管理 ---
function saveMessageTemplate() {
    const templateName = prompt('请输入模板名称：');
    if (!templateName) return;
  
    const content = messageInput.value.trim();
    if (!content) {
        updateStatus('状态：消息内容为空，无法保存模板。', 'error');
        return;
    }
  
    messageTemplates[templateName] = content;
    updateMessageTemplateSelect();
    updateStatus(`状态：消息模板 "${templateName}" 已保存。`, 'success');
    saveSettings(); // Save settings after modifying templates
}

function loadMessageTemplate() {
    const selectedTemplate = messageTemplateSelect.value;
    if (!selectedTemplate) return;
  
    messageInput.value = messageTemplates[selectedTemplate];
    renderMarkdownPreview();
    updateStatus(`状态：已加载消息模板 "${selectedTemplate}"。`, 'info');
}

function deleteMessageTemplate() {
    const selectedTemplate = messageTemplateSelect.value;
    if (!selectedTemplate) {
        updateStatus('状态：请先选择要删除的模板。', 'error');
        return;
    }
  
    if (confirm(`确定要删除模板 "${selectedTemplate}" 吗？`)) {
        delete messageTemplates[selectedTemplate];
        updateMessageTemplateSelect();
        updateStatus(`状态：消息模板 "${selectedTemplate}" 已删除。`, 'info');
        saveSettings(); // Save settings after modifying templates
    }
}

function updateMessageTemplateSelect() {
    messageTemplateSelect.innerHTML = '<option value="">选择消息模板...</option>';
    Object.keys(messageTemplates).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        messageTemplateSelect.appendChild(option);
    });
}

// --- 文件处理 & 预览 ---
function updateFilePreview() {
    previewContainer.innerHTML = '';
    fileItems.forEach((item) => {
        const thumbnailWrapper = document.createElement('div');
        thumbnailWrapper.className = 'thumbnail';
        if (item.selected) thumbnailWrapper.classList.add('selected');
        thumbnailWrapper.id = item.id;
        thumbnailWrapper.draggable = true;
        thumbnailWrapper.onclick = (e) => {
            if (!e.target.closest('.remove-btn') && !e.target.closest('video') && !e.target.closest('audio')) { // Prevent selection on controls
                toggleFileSelection(item.id, e);
            }
        };

        let previewElementHTML = '';
        if (item.type.startsWith('image/') && item.previewUrl) {
            previewElementHTML = `<img src="${item.previewUrl}" alt="${item.name}" class="file-image-preview">`;
        } else if (item.type.startsWith('image/')) { 
             previewElementHTML = `<div class="file-image-placeholder">加载中...</div>`;
        } else if (item.type.startsWith('video/') && item.previewUrl) {
            previewElementHTML = `<video src="${item.previewUrl}" class="file-video-preview" controls></video>`;
        } else if (item.type.startsWith('audio/') && item.previewUrl) {
            previewElementHTML = `<audio src="${item.previewUrl}" class="file-audio-preview" controls></audio>`;
        } else { 
            const iconType = getFileIcon(item.type);
            previewElementHTML = `<div class="file-icon">${iconType}</div>`;
        }

        thumbnailWrapper.innerHTML = `
            ${previewElementHTML}
            <div class="file-info">
                <span title="${item.name}">${item.name}</span>
                <span>${formatFileSize(item.size)}</span>
            </div>
            <button class="remove-btn" onclick="removeFileById('${item.id}')">×</button>
            <div class="selection-checkbox" style="display: ${item.selected ? 'block' : 'none'};">✓</div>
        `;
      
        if (item.type.startsWith('image/') && item.previewUrl) {
            const imgElement = thumbnailWrapper.querySelector('.file-image-preview');
            if (imgElement) {
                imgElement.onclick = (e) => {
                    e.stopPropagation(); // Prevent thumbnail selection toggle
                    openImagePreviewModal(item.previewUrl);
                };
            }
        }
        
        thumbnailWrapper.classList.remove('fade-out-active'); 
        void thumbnailWrapper.offsetWidth; 
        thumbnailWrapper.classList.add('fade-in'); 
        previewContainer.appendChild(thumbnailWrapper);

        thumbnailWrapper.addEventListener('dragstart', handleDragStart);
        thumbnailWrapper.addEventListener('dragover', handleDragOver);
        thumbnailWrapper.addEventListener('dragleave', handleDragLeave);
        thumbnailWrapper.addEventListener('drop', handleDrop);
        thumbnailWrapper.addEventListener('dragend', handleDragEnd);
    });

    if (fileItems.length === 0) {
        previewContainer.innerHTML = '<p class="empty-preview-text">暂无文件</p>';
    }
  
    checkFileSizeWarnings();
}

function getFileIcon(type) {
    if (type.startsWith('video/')) return '🎥';
    if (type.startsWith('audio/')) return '🎵';
    if (type.includes('pdf')) return '📄';
    if (type.includes('zip') || type.includes('rar')) return '📦';
    if (type.includes('text')) return '📝';
    return '📎';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function checkFileSizeWarnings() {
    const warnings = [];
    fileItems.forEach(item => {
        // Discord limits: Free: 25MB, Nitro Basic/Classic: 50MB, Nitro: 500MB
        // The original script used 8MB and 50MB. Keeping these thresholds for consistency with the provided script.
        if (item.size > 8 * 1024 * 1024 && item.size <= 50 * 1024 * 1024) { // Example: Between 8MB and 50MB
            warnings.push(`文件 "${item.name}" (${formatFileSize(item.size)}) 较大，可能需要 Discord Nitro 上传。`);
        } else if (item.size > 50 * 1024 * 1024) { // Example: Over 50MB
            warnings.push(`文件 "${item.name}" (${formatFileSize(item.size)}) 非常大，可能无法上传。`);
        }
    });
  
    if (warnings.length > 0) {
        updateStatus('警告：' + warnings.join(' '), 'error');
    }
}

function toggleFileSelection(fileId, event) {
    const item = fileItems.find(fi => fi.id === fileId);
    if (!item) return;
  
    if (event.shiftKey && lastSelectedFileId) {
        const lastIndex = fileItems.findIndex(fi => fi.id === lastSelectedFileId);
        const currentIndex = fileItems.findIndex(fi => fi.id === fileId);
        const [start, end] = [Math.min(lastIndex, currentIndex), Math.max(lastIndex, currentIndex)];
      
        for (let i = start; i <= end; i++) {
            fileItems[i].selected = true;
        }
    } else if (event.ctrlKey || event.metaKey) {
        item.selected = !item.selected;
    } else {
        fileItems.forEach(fi => fi.selected = (fi.id === fileId)); // Select only current, deselect others
    }
  
    lastSelectedFileId = item.selected ? fileId : null; // Update lastSelected only if it's now selected
    updateFilePreview();
}

function selectAllFiles() {
    fileItems.forEach(item => item.selected = true);
    lastSelectedFileId = fileItems.length > 0 ? fileItems[fileItems.length - 1].id : null;
    updateFilePreview();
    updateStatus(`状态：已选择所有文件（${fileItems.length}个）。`, 'info');
}

function deselectAllFiles() {
    fileItems.forEach(item => item.selected = false);
    lastSelectedFileId = null;
    updateFilePreview();
    updateStatus('状态：已取消所有选择。', 'info');
}

function removeSelectedFiles() {
    const selectedCount = fileItems.filter(item => item.selected).length;
    if (selectedCount === 0) {
        updateStatus('状态：请先选择要删除的文件。', 'error');
        return;
    }
  
    if (confirm(`确定要删除选中的 ${selectedCount} 个文件吗？`)) {
        const itemsToRemove = fileItems.filter(item => item.selected);
        itemsToRemove.forEach(item => {
            if (item.previewUrl && (item.type.startsWith('video/') || item.type.startsWith('audio/')) && item.previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(item.previewUrl);
            }
        });
        fileItems = fileItems.filter(item => !item.selected);
        lastSelectedFileId = null;
        updateFilePreview();
        updateStatus(`状态：已删除 ${selectedCount} 个文件。`, 'info');
    }
}

function clearAllFiles() {
    if (fileItems.length === 0) {
        updateStatus('状态：没有文件需要清空。', 'info');
        return;
    }
  
    if (confirm(`确定要清空所有 ${fileItems.length} 个文件吗？`)) {
        fileItems.forEach(item => {
            if (item.previewUrl && (item.type.startsWith('video/') || item.type.startsWith('audio/')) && item.previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(item.previewUrl);
            }
        });
        fileItems = [];
        lastSelectedFileId = null;
        updateFilePreview();
        updateStatus('状态：已清空所有文件。', 'info');
    }
}

function removeFileById(fileId) {
    const element = document.getElementById(fileId);
    const itemIndex = fileItems.findIndex(fi => fi.id === fileId);
    const itemToRemove = itemIndex !== -1 ? fileItems[itemIndex] : null;

    if (element && itemToRemove) {
        element.classList.remove('fade-in');
        element.classList.add('fade-out-active');
      
        element.addEventListener('animationend', function handleAnimationEnd() {
            element.removeEventListener('animationend', handleAnimationEnd);
            const currentActualIndex = fileItems.findIndex(fi => fi.id === fileId);
            if (currentActualIndex !== -1) {
                const actuallyRemovedItem = fileItems.splice(currentActualIndex, 1)[0];
                if (actuallyRemovedItem.previewUrl && (actuallyRemovedItem.type.startsWith('video/') || actuallyRemovedItem.type.startsWith('audio/')) && actuallyRemovedItem.previewUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(actuallyRemovedItem.previewUrl);
                }
            }
            if (lastSelectedFileId === fileId) lastSelectedFileId = null;
            updateFilePreview(); 
        }, { once: true });
    } else if (itemToRemove) {
        if (itemToRemove.previewUrl && (itemToRemove.type.startsWith('video/') || itemToRemove.type.startsWith('audio/')) && itemToRemove.previewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(itemToRemove.previewUrl);
        }
        fileItems.splice(itemIndex, 1);
        if (lastSelectedFileId === fileId) lastSelectedFileId = null;
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
                previewUrl: null,
                selected: false
            };
            
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    fileItem.previewUrl = e.target.result;
                    // Update thumbnail if it's already rendered (e.g. placeholder)
                    const existingThumb = document.getElementById(fileItem.id);
                    if (existingThumb) {
                        const imgEl = existingThumb.querySelector('.file-image-preview') || document.createElement('img');
                        imgEl.src = fileItem.previewUrl;
                        if (!imgEl.classList.contains('file-image-preview')) { 
                            imgEl.className = 'file-image-preview';
                            imgEl.alt = fileItem.name;
                            const placeholder = existingThumb.querySelector('.file-image-placeholder');
                            if (placeholder) placeholder.replaceWith(imgEl);
                        }
                         // Add click handler for modal after image is loaded
                        imgEl.onclick = (ev) => {
                            ev.stopPropagation();
                            openImagePreviewModal(fileItem.previewUrl);
                        };
                    } else {
                         updateFilePreview(); // Full rerender if thumb not found (less likely path)
                    }
                };
                reader.readAsDataURL(file);
            } else if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
                fileItem.previewUrl = URL.createObjectURL(fileItem.file);
            }
            fileItems.push(fileItem); // Add after potential async previewUrl setup
            addedCount++;
        }
    }

    if (addedCount > 0) {
        // If preview was empty, or for new items if not, do a full update for simplicity and consistency
        updateFilePreview(); 
    }
    if (ignoredCount > 0) {
        updateStatus(`状态：最多只能上传10个文件（Discord 限制），${ignoredCount}个文件已被忽略。`, 'error');
    }
    if (fileItems.length === 0 && previewContainer.innerHTML.trim() === '') { // Ensure empty text if all cleared
        previewContainer.innerHTML = '<p class="empty-preview-text">暂无文件</p>';
    }
  
    checkFileSizeWarnings();
    if (event.target) event.target.value = null; // Reset file input to allow selecting the same file again
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
                let extension = 'png'; // Default for pasted images
                if (blob.type === 'image/jpeg') extension = 'jpg';
                else if (blob.type === 'image/gif') extension = 'gif';
                else if (blob.type === 'image/webp') extension = 'webp';
                // For other file types from clipboard, blob.name might be empty
                const originalName = blob.name && blob.name !== 'image.png' ? blob.name : `pasted-file-${Date.now()}.${extension}`;
              
                const file = new File([blob], originalName, { type: blob.type });

                if (!fileItems.some(existing => existing.name === file.name && existing.size === file.size)) { 
                     const fileId = generateUniqueId('file_');
                     const fileItem = {
                        file: file,
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        id: fileId,
                        previewUrl: null,
                        selected: false
                    };
                    
                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                            fileItem.previewUrl = ev.target.result;
                            // Similar to handleFiles, update if placeholder exists or full rerender
                            const existingThumb = document.getElementById(fileItem.id);
                            if (existingThumb) { 
                                const imgEl = existingThumb.querySelector('.file-image-preview') || document.createElement('img');
                                imgEl.src = fileItem.previewUrl;
                                if (!imgEl.classList.contains('file-image-preview')) {
                                    imgEl.className = 'file-image-preview';
                                    imgEl.alt = fileItem.name;
                                    const placeholder = existingThumb.querySelector('.file-image-placeholder');
                                    if (placeholder) placeholder.replaceWith(imgEl);
                                }
                                imgEl.onclick = (event) => {
                                    event.stopPropagation();
                                    openImagePreviewModal(fileItem.previewUrl);
                                };
                            } else {
                                updateFilePreview();
                            }
                        };
                        reader.readAsDataURL(file);
                    } else if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
                         fileItem.previewUrl = URL.createObjectURL(fileItem.file);
                    }
                    fileItems.push(fileItem);
                    filesPastedCount++;
                }
            }
        }
    }
    if (filesPastedCount > 0) {
        updateFilePreview(); // Full update after paste
        updateStatus(`状态：从剪贴板粘贴了 ${filesPastedCount} 个文件。`, 'info');
    }
    if (ignoredCount > 0 && fileItems.length >=10) {
         updateStatus('状态：已达到10个文件上限（Discord 限制），后续粘贴的文件将被忽略。', 'error');
    }
    checkFileSizeWarnings();
}

// Drag and Drop File Reordering
function handleDragStart(e) {
    draggedFileItemId = e.target.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', e.target.id); // Required for Firefox
    setTimeout(() => e.target.classList.add('dragging'), 0);
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const targetThumbnail = e.target.closest('.thumbnail');
    if (targetThumbnail && targetThumbnail.id !== draggedFileItemId) {
        // Visual cue for drop target
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
        // If droppedOnId is null (dropped on empty area), append to end.
        // Otherwise, find index of target.
        const targetItemIndex = droppedOnId 
            ? fileItems.findIndex(item => item.id === droppedOnId) 
            : fileItems.length;

        if (draggedItemIndex !== -1) { // targetItemIndex will always be valid or length
            const [draggedItem] = fileItems.splice(draggedItemIndex, 1);
            // Adjust target index if dragging an item from before to after its original position
            const adjustedTargetIndex = (droppedOnId && draggedItemIndex < targetItemIndex) 
                ? targetItemIndex -1 
                : targetItemIndex;
            fileItems.splice(adjustedTargetIndex, 0, draggedItem);
            updateFilePreview();
        }
    }
    if(targetThumbnail) targetThumbnail.classList.remove('drag-over-target');
    document.querySelectorAll('.thumbnail.dragging').forEach(el => el.classList.remove('dragging'));
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    const allThumbnails = Array.from(previewContainer.querySelectorAll('.thumbnail'));
    allThumbnails.forEach(thumb => thumb.classList.remove('drag-over-target'));
    draggedFileItemId = null;
}

// --- Image Preview Modal ---
function openImagePreviewModal(imageUrl) {
    fullPreviewImage.src = imageUrl;
    imagePreviewModal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Prevent background scroll
}

function closeImagePreviewModal() {
    imagePreviewModal.style.display = 'none';
    fullPreviewImage.src = ''; // Clear image to free memory if it's a large dataURL
    document.body.style.overflow = ''; // Restore scroll
}

// --- 频道与频道组管理 ---
function addNewGroup() {
    const newGroupName = newGroupNameInput.value.trim();
    if (!newGroupName) {
        updateStatus('状态：请输入组名。', 'error');
        return;
    }

    const groupId = generateUniqueId('group_');
    channelGroupsData[groupId] = {
        name: newGroupName,
        enabled: true,
        panelOpen: true,
        channels: {}
    };

    newGroupNameInput.value = '';
    renderChannelGroups();
    updateStatus(`状态：已添加新组 "${newGroupName}"。`, 'success');
    saveSettings();
}

function renderChannelGroups() {
    groupsListContainer.innerHTML = '';

    if (Object.keys(channelGroupsData).length === 0) {
        groupsListContainer.innerHTML = `
            <div class="empty-state">
                <p>暂无频道组。请先创建一个组，然后添加频道。</p>
            </div>
        `;
        return;
    }

    const searchTerm = channelSearchInput.value.toLowerCase().trim();

    Object.keys(channelGroupsData).forEach(groupId => {
        const group = channelGroupsData[groupId];
        
        const groupChannels = Object.keys(group.channels).map(channelId => ({
            id: channelId,
            ...group.channels[channelId]
        }));

        const filteredGroupChannels = searchTerm 
            ? groupChannels.filter(channel => 
                (channel.fetchedInfo?.channelName || '').toLowerCase().includes(searchTerm) ||
                (channel.fetchedInfo?.guildName || '').toLowerCase().includes(searchTerm) ||
                (channel.alias || '').toLowerCase().includes(searchTerm) ||
                channel.url.toLowerCase().includes(searchTerm)
            ) : groupChannels;
        
        if (searchTerm && filteredGroupChannels.length === 0) return; // Skip group if search yields no channels in it
        
        const groupElement = document.createElement('div');
        groupElement.className = 'channel-group';
        groupElement.dataset.groupId = groupId;

        const groupHeaderHTML = `
            <div class="group-header">
                <div class="group-title-container">
                    <input type="checkbox" id="group-enabled-${groupId}" ${group.enabled ? 'checked' : ''} onchange="toggleGroupEnabled('${groupId}', this.checked)">
                    <span class="toggle-group-panel" onclick="toggleGroupPanel('${groupId}')">
                        ${group.panelOpen ? '▼' : '►'}
                    </span>
                    <label for="group-enabled-${groupId}" class="group-name-label"><h3>${group.name}</h3></label>
                </div>
                <div class="group-actions">
                    <button class="secondary-btn" onclick="renameGroup('${groupId}')">重命名</button>
                    <button class="secondary-btn" onclick="addChannelToGroup('${groupId}')">添加频道</button>
                    <button class="danger-btn" onclick="removeGroup('${groupId}')">删除组</button>
                </div>
            </div>
        `;
        groupElement.innerHTML = groupHeaderHTML;

        if (group.panelOpen) {
            const channelsContainer = document.createElement('div');
            channelsContainer.className = 'channels-container';
            
            if (filteredGroupChannels.length === 0 && groupChannels.length > 0) { // Group has channels, but none match search
                 channelsContainer.innerHTML = `<div class="empty-channels"><p>没有匹配搜索的频道</p></div>`;
            } else if (groupChannels.length === 0) { // Group is empty
                 channelsContainer.innerHTML = `<div class="empty-channels"><p>该组暂无频道</p></div>`;
            } else {
                filteredGroupChannels.forEach(channel => {
                    const channelElement = document.createElement('div');
                    channelElement.className = 'channel-item';
                    
                    const displayName = channel.fetchedInfo
                        ? `${channel.fetchedInfo.guildName} / ${channel.fetchedInfo.channelName}`
                        : channel.alias || '未知频道 (请获取信息)';
                    
                    const channelHTML = `
                        <div class="channel-header">
                            <input type="checkbox" id="channel-enabled-${groupId}-${channel.id}" ${channel.enabled ? 'checked' : ''} 
                                onchange="toggleChannelEnabled('${groupId}', '${channel.id}', this.checked)">
                            <div class="channel-info">
                                <label for="channel-enabled-${groupId}-${channel.id}" class="channel-name">${displayName}</label>
                                <div class="channel-url">${channel.url}</div>
                                ${channel.fetchedInfo ? '' : '<span class="fetch-warning">⚠️ 未获取频道信息</span>'}
                            </div>
                            <div class="channel-actions">
                                <label class="spoiler-checkbox">
                                    <input type="checkbox" ${channel.spoiler ? 'checked' : ''} 
                                        onchange="toggleChannelSpoiler('${groupId}', '${channel.id}', this.checked)">
                                    <span>标为剧透</span>
                                </label>
                                <button class="secondary-btn" onclick="setChannelAlias('${groupId}', '${channel.id}')">
                                    ${channel.alias ? '修改别名' : '设置别名'}
                                </button>
                                <button class="secondary-btn" onclick="fetchChannelInfoWrapper('${groupId}', '${channel.id}', this)">
                                    ${channel.fetchedInfo ? '刷新信息' : '获取信息'}
                                </button>
                                <button class="danger-btn" onclick="removeChannel('${groupId}', '${channel.id}')">删除</button>
                            </div>
                        </div>
                    `;
                    channelElement.innerHTML = channelHTML;
                    channelsContainer.appendChild(channelElement);
                });
            }
            groupElement.appendChild(channelsContainer);
        }
        groupsListContainer.appendChild(groupElement);
    });
}


function toggleGroupPanel(groupId) {
    if (channelGroupsData[groupId]) {
        channelGroupsData[groupId].panelOpen = !channelGroupsData[groupId].panelOpen;
        renderChannelGroups();
        saveSettings(); // Panel open state should be saved
    }
}

function toggleGroupEnabled(groupId, enabled) {
    if (channelGroupsData[groupId]) {
        channelGroupsData[groupId].enabled = enabled;
        Object.keys(channelGroupsData[groupId].channels).forEach(channelId => {
            channelGroupsData[groupId].channels[channelId].enabled = enabled;
        });
        renderChannelGroups(); // Re-render to reflect changes in checkboxes
        saveSettings();
    }
}

function renameGroup(groupId) {
    if (channelGroupsData[groupId]) {
        const currentName = channelGroupsData[groupId].name;
        const newName = prompt(`请输入组的新名称:`, currentName);
        if (newName && newName.trim() !== '' && newName.trim() !== currentName) {
            channelGroupsData[groupId].name = newName.trim();
            renderChannelGroups();
            updateStatus(`状态：已将组 "${currentName}" 重命名为 "${newName.trim()}"。`, 'info');
            saveSettings();
        }
    }
}

function removeGroup(groupId) {
    if (channelGroupsData[groupId]) {
        const groupName = channelGroupsData[groupId].name;
        const channelCount = Object.keys(channelGroupsData[groupId].channels).length;
      
        if (confirm(`确定要删除组 "${groupName}" 及其包含的 ${channelCount} 个频道吗？`)) {
            delete channelGroupsData[groupId];
            renderChannelGroups();
            updateStatus(`状态：已删除组 "${groupName}"。`, 'info');
            saveSettings();
        }
    }
}

function addChannelToGroup(groupId) {
    if (channelGroupsData[groupId]) {
        const channelUrl = prompt("请输入 Discord 频道的 URL（例如：https://discord.com/channels/GUILD_ID/CHANNEL_ID）：");
        if (!channelUrl || !channelUrl.trim()) return;
      
        const trimmedUrl = channelUrl.trim();
        const urlPattern = /^https?:\/\/(?:ptb\.|canary\.)?discord\.com\/channels\/\d{17,19}\/\d{17,19}(\/\d{17,19})?$/i; // Discord IDs are usually 17-19 digits. Optional message ID at end.
        if (!urlPattern.test(trimmedUrl.split('?')[0])) { // Remove query params before test
            updateStatus(`状态：无效的 Discord 频道 URL。请确保格式为 https://discord.com/channels/服务器ID/频道ID`, 'error');
            return;
        }
      
        let isDuplicate = false;
        Object.values(channelGroupsData).forEach(group => {
            Object.values(group.channels).forEach(channel => {
                if (channel.url === trimmedUrl) {
                    isDuplicate = true;
                }
            });
        });
      
        if (isDuplicate) {
            updateStatus(`状态：该频道 URL 已存在于某个组中。`, 'error');
            return;
        }
      
        const channelIdKey = generateUniqueId('channel_'); // Internal key for the object
        channelGroupsData[groupId].channels[channelIdKey] = {
            url: trimmedUrl,
            enabled: true,
            spoiler: false,
            fetchedInfo: null,
            alias: ''
        };
      
        renderChannelGroups();
        updateStatus(`状态：已将频道添加到组 "${channelGroupsData[groupId].name}"。正在尝试获取信息...`, 'success');
        saveSettings();
        fetchChannelInfoWrapper(groupId, channelIdKey, null); // Attempt to fetch info
    }
}

function toggleChannelEnabled(groupId, channelId, enabled) {
    if (channelGroupsData[groupId] && channelGroupsData[groupId].channels[channelId]) {
        channelGroupsData[groupId].channels[channelId].enabled = enabled;
        // No re-render needed as checkbox handles its own state via onchange
        saveSettings();
    }
}

function toggleChannelSpoiler(groupId, channelId, spoiler) {
    if (channelGroupsData[groupId] && channelGroupsData[groupId].channels[channelId]) {
        channelGroupsData[groupId].channels[channelId].spoiler = spoiler;
        saveSettings();
    }
}

function setChannelAlias(groupId, channelId) {
    if (channelGroupsData[groupId] && channelGroupsData[groupId].channels[channelId]) {
        const channel = channelGroupsData[groupId].channels[channelId];
        const currentAlias = channel.alias || '';
        const newAlias = prompt("请输入频道别名（便于识别，留空则清除）：", currentAlias);
      
        if (newAlias !== null) { 
            channel.alias = newAlias.trim();
            renderChannelGroups();
            updateStatus(`状态：频道别名已${newAlias.trim() ? '更新' : '清除'}。`, 'info');
            saveSettings();
        }
    }
}

function removeChannel(groupId, channelId) {
    if (channelGroupsData[groupId] && channelGroupsData[groupId].channels[channelId]) {
        const channel = channelGroupsData[groupId].channels[channelId];
        const channelName = channel.fetchedInfo?.channelName || channel.alias || channel.url;
      
        if (confirm(`确定要从组 "${channelGroupsData[groupId].name}" 删除频道 "${channelName}" 吗？`)) {
            delete channelGroupsData[groupId].channels[channelId];
            renderChannelGroups();
            updateStatus(`状态：已删除频道 "${channelName}"。`, 'info');
            saveSettings();
        }
    }
}

async function fetchChannelInfoWrapper(groupId, channelId, buttonElement) {
    if (buttonElement) {
        buttonElement.textContent = '获取中...';
        buttonElement.disabled = true;
    }
    await fetchChannelInfo(groupId, channelId);
    // Re-render will update button text, or do it manually if no full re-render
    if (buttonElement) { // If button still exists (not re-rendered away)
         const channel = channelGroupsData[groupId]?.channels[channelId];
         if (channel) {
            buttonElement.textContent = channel.fetchedInfo ? '刷新信息' : '获取信息';
         }
         buttonElement.disabled = false;
    }
     renderChannelGroups(); // Ensure UI consistency
}


async function fetchChannelInfo(groupId, channelIdKey) {
    const group = channelGroupsData[groupId];
    if (!group || !group.channels[channelIdKey]) return;
  
    const channelObj = group.channels[channelIdKey];
    const token = apiTokenInput.value.trim();
  
    if (!token) {
        updateStatus('状态：请先输入 API Token。Token 无效无法获取频道信息。', 'error');
        return;
    }
  
    const match = channelObj.url.match(/\/channels\/(\d+)\/(\d+)/);
    if (!match) {
        updateStatus(`状态：无法从 URL "${channelObj.url}" 解析服务器和频道 ID。`, 'error');
        channelObj.fetchedInfo = { error: 'Invalid URL format' }; // Mark as attempted with error
        saveSettings();
        return;
    }
  
    const [, discordGuildId, discordChannelId] = match;
  
    showLoadingOverlay();
  
    try {
        const channelResponse = await fetch(`https://discord.com/api/v9/channels/${discordChannelId}`, {
            headers: { 'Authorization': token }
        });
        if (!channelResponse.ok) throw new Error(`获取频道信息失败 (${channelResponse.status})`);
        const channelData = await channelResponse.json();
      
        const guildResponse = await fetch(`https://discord.com/api/v9/guilds/${discordGuildId}`, {
            headers: { 'Authorization': token }
        });
        if (!guildResponse.ok) throw new Error(`获取服务器信息失败 (${guildResponse.status})`);
        const guildData = await guildResponse.json();
      
        channelObj.fetchedInfo = {
            guildName: guildData.name,
            channelName: channelData.name,
            guildId: discordGuildId,
            channelId: discordChannelId
        };
        updateStatus(`状态：成功获取 "${guildData.name} / ${channelData.name}" 信息。`, 'success');
    } catch (error) {
        channelObj.fetchedInfo = { error: error.message }; // Store error for diagnosis
        updateStatus(`状态：获取 "${channelObj.url}" 信息失败: ${error.message}`, 'error');
    } finally {
        hideLoadingOverlay();
        saveSettings(); // Save fetched info or error
        // renderChannelGroups(); // Moved to wrapper or calling function
    }
}

function enableAllChannelsGlobally() {
    Object.values(channelGroupsData).forEach(group => {
        group.enabled = true;
        Object.values(group.channels).forEach(channel => {
            channel.enabled = true;
        });
    });
    renderChannelGroups();
    updateStatus('状态：已启用所有频道。', 'info');
    saveSettings();
}

function disableAllChannelsGlobally() {
     Object.values(channelGroupsData).forEach(group => {
        group.enabled = false; // Also disable the group itself
        Object.values(group.channels).forEach(channel => {
            channel.enabled = false;
        });
    });
    renderChannelGroups();
    updateStatus('状态：已禁用所有频道。', 'info');
    saveSettings();
}

const debouncedFilterChannels = debounce(() => renderChannelGroups(), 300);
function filterChannels() {
    debouncedFilterChannels();
}

function exportChannelList() {
    if (Object.keys(channelGroupsData).length === 0) {
        updateStatus('状态：没有频道数据可导出。', 'info');
        return;
    }
    const channelDataToExport = JSON.parse(JSON.stringify(channelGroupsData)); // Deep clone
    // Optionally strip internal keys or simplify structure if needed for export
    
    const blob = new Blob([JSON.stringify(channelDataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'discord_channels_config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    updateStatus('状态：频道列表已导出。', 'success');
}

function importChannelList() {
    if (channelImportInput) {
        channelImportInput.click();
    }
}

// --- 发送功能 ---
function toggleSendMode() {
    sendMode = sendMode === 'sequential' ? 'parallel' : 'sequential';
    sendModeToggleBtn.textContent = `切换为${sendMode === 'sequential' ? '并行' : '顺序'}发送`;
    updateStatus(`状态：已切换为${sendMode === 'sequential' ? '顺序' : '并行'}发送模式。`, 'info');
}

function handleCancelSend() {
    if (!isSending) return;
    
    isCancellingSend = true;
    cancelSendBtn.textContent = '正在取消...';
    cancelSendBtn.disabled = true;
    
    if (currentAbortController) {
        currentAbortController.abort(); // This will trigger abort in fetch/XHR
    }
    // Status update will happen in the sendContent's finally or catch block
}

async function sendFileAndText() {
    if (fileItems.length === 0 && !messageInput.value.trim()) {
         updateStatus('状态：请添加文件或输入消息内容。', 'error');
        return;
    }
    if (fileItems.length === 0) { // Only text if no files
        await sendContent('text');
        return;
    }
    await sendContent('both');
}

async function sendFile() {
    if (fileItems.length === 0) {
        updateStatus('状态：请先添加文件。', 'error');
        return;
    }
    await sendContent('file');
}

async function sendText() {
    const message = messageInput.value.trim();
    if (!message) {
        updateStatus('状态：请输入消息内容。', 'error');
        return;
    }
    await sendContent('text');
}

async function sendContent(contentType) {
    if (isSending) {
        updateStatus('状态：已有发送任务正在进行中。', 'error');
        return;
    }
    
    const token = apiTokenInput.value.trim();
    if (!token) {
        updateStatus('状态：请先输入 API Token。', 'error');
        return;
    }
    
    const enabledChannels = [];
    Object.keys(channelGroupsData).forEach(groupId => {
        const group = channelGroupsData[groupId];
        if (group.enabled) {
            Object.keys(group.channels).forEach(channelIdKey => { // Use channelIdKey (internal key)
                const channel = group.channels[channelIdKey];
                if (channel.enabled) {
                    enabledChannels.push({
                        url: channel.url,
                        groupName: group.name,
                        channelName: channel.fetchedInfo?.channelName || channel.alias || '未知频道',
                        guildName: channel.fetchedInfo?.guildName || '未知服务器',
                        spoiler: channel.spoiler,
                        groupId, // Group's ID
                        channelIdKey // Channel's internal key
                    });
                }
            });
        }
    });
    
    if (enabledChannels.length === 0) {
        updateStatus('状态：没有启用的频道可以发送。', 'error');
        return;
    }
    
    const message = messageInput.value.trim();
    if (contentType === 'text' && !message) {
        updateStatus('状态：请输入消息内容。', 'error');
        return;
    }
    if (contentType === 'both' && !message && fileItems.length === 0) {
        updateStatus('状态：请输入消息内容或选择文件。', 'error');
        return;
    }


    isSending = true;
    isCancellingSend = false;
    currentAbortController = new AbortController(); // New controller for this send operation
    
    showProgressPopup();
    popupProgressBars.innerHTML = ''; // Clear previous bars
    enabledChannels.forEach((channel, index) => {
        const progressBarContainer = document.createElement('div');
        progressBarContainer.className = 'progress-container';
        progressBarContainer.innerHTML = `
            <div class="progress-info">
                <span class="channel-name-popup">${channel.guildName} / ${channel.channelName}</span>
                <span class="progress-percentage" id="progress-percentage-${index}">0%</span>
            </div>
            <div class="progress-bar-outer"><div class="progress-bar" id="progress-bar-${index}" style="width: 0%"></div></div>
            <div class="progress-status" id="progress-status-${index}">等待中...</div>
        `;
        popupProgressBars.appendChild(progressBarContainer);
    });
    
    uploadStartTime = Date.now();
    totalUploadedBytes = 0;
    lastSpeedUpdateTime = uploadStartTime;
    lastUploadedBytesSnapshot = 0;
    
    if (speedUpdateInterval) clearInterval(speedUpdateInterval); // Clear any existing interval
    speedUpdateInterval = setInterval(() => {
        const currentTime = Date.now();
        const timeElapsedSinceLastUpdate = (currentTime - lastSpeedUpdateTime) / 1000;
        if (timeElapsedSinceLastUpdate > 0) {
            const bytesUploadedSinceLastUpdate = totalUploadedBytes - lastUploadedBytesSnapshot;
            const currentSpeed = bytesUploadedSinceLastUpdate / timeElapsedSinceLastUpdate;
            popupUploadSpeed.textContent = `上传速度：${formatSpeed(currentSpeed)}`;
            lastSpeedUpdateTime = currentTime;
            lastUploadedBytesSnapshot = totalUploadedBytes;
        }
    }, 1000);
    
    let allSendsSuccessful = true;
    let finalStatusMessage = '发送操作已完成。';

    try {
        updateStatus('状态：开始发送操作...', 'info');
        const minDelay = Math.max(0, parseFloat(minDelayInput.value) || 1);
        const maxDelay = Math.max(minDelay, parseFloat(maxDelayInput.value) || 5);
        
        if (sendMode === 'sequential') {
            for (let i = 0; i < enabledChannels.length; i++) {
                if (isCancellingSend) {
                    finalStatusMessage = '发送操作已被用户取消。';
                    updateStatus(finalStatusMessage, 'warning');
                    allSendsSuccessful = false;
                    break;
                }
                const channel = enabledChannels[i];
                const success = await sendToChannel(channel, i, token, contentType, message, enabledChannels.length);
                if (!success) allSendsSuccessful = false;
                
                if (i < enabledChannels.length - 1 && !isCancellingSend) {
                    const delay = Math.random() * (maxDelay - minDelay) * 1000 + minDelay * 1000;
                    updateStatus(`状态：等待 ${(delay/1000).toFixed(1)} 秒...`, 'info');
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        } else { // Parallel
            const sendPromises = enabledChannels.map((channel, index) => 
                sendToChannel(channel, index, token, contentType, message, enabledChannels.length)
            );
            const results = await Promise.all(sendPromises);
            if (results.some(r => !r)) allSendsSuccessful = false;
            if (isCancellingSend) {
                 finalStatusMessage = '部分发送操作可能已被用户取消。';
                 updateStatus(finalStatusMessage, 'warning');
                 allSendsSuccessful = false;
            }
        }
    } catch (error) { // This catch is for errors not handled by individual sendToChannel
        allSendsSuccessful = false;
        if (error.name === 'AbortError' || isCancellingSend) {
            finalStatusMessage = '发送操作已被用户取消。';
            updateStatus(finalStatusMessage, 'warning');
        } else {
            finalStatusMessage = `状态：发送过程中发生意外错误: ${error.message}`;
            updateStatus(finalStatusMessage, 'error');
            console.error('SendContent Error:', error);
        }
    } finally {
        clearInterval(speedUpdateInterval);
        speedUpdateInterval = null;
        isSending = false;
        // isCancellingSend should be reset at the start of sendContent
        currentAbortController = null;
        
        cancelSendBtn.textContent = '取消发送';
        cancelSendBtn.disabled = false; // Re-enable cancel button or it will be stuck if user retries
        
        if (!isCancellingSend) { // Only update final status if not already handled by cancellation logic
             updateStatus(allSendsSuccessful ? '状态：所有发送任务已完成。' : '状态：部分发送任务失败或被取消。请查看日志和进度详情。', allSendsSuccessful ? 'success' : 'error');
        }
        // The progress popup remains visible for review; user closes it manually.
    }
}

async function sendToChannel(channel, index, token, contentType, message, totalChannels) {
    const progressStatusEl = document.getElementById(`progress-status-${index}`);
    const progressBarEl = document.getElementById(`progress-bar-${index}`);
    let success = false;
    try {
        if (isCancellingSend) throw new Error('用户已取消');
        progressStatusEl.textContent = '发送中...';
        progressStatusEl.className = 'progress-status sending';
        
        const match = channel.url.match(/\/channels\/\d+\/(\d+)/);
        if (!match) throw new Error(`无效频道URL: ${channel.url}`);
        const discordChannelId = match[1];
        
        if (contentType === 'text' || (contentType === 'both' && fileItems.length === 0)) {
            await sendMessageToChannel(discordChannelId, message, token, index);
            updateProgressBar(index, 100);
            updateChannelStatistics(channel.groupId, channel.channelIdKey, true, 0); // Use channelIdKey
        } else if (contentType === 'file' || contentType === 'both') {
            for (let i = 0; i < fileItems.length; i++) {
                if (isCancellingSend) throw new Error('用户已取消');
                const fileItem = fileItems[i];
                const messageText = (contentType === 'both' && i === 0) ? message : ''; // Send text only with the first file
                await sendFileToChannel(discordChannelId, fileItem, messageText, token, channel.spoiler, index, i, fileItems.length);
                updateChannelStatistics(channel.groupId, channel.channelIdKey, true, fileItem.size); // Use channelIdKey
            }
            updateProgressBar(index, 100); // Mark as complete after all files for this channel
        }
        
        progressStatusEl.textContent = '发送成功';
        progressStatusEl.className = 'progress-status success';
        if(progressBarEl) progressBarEl.style.backgroundColor = 'var(--success-color)';
        updateStatus(`成功发送到 ${channel.guildName}/${channel.channelName} (${index + 1}/${totalChannels})`, 'success');
        success = true;

    } catch (error) {
        if (isCancellingSend && error.message === '用户已取消') {
             progressStatusEl.textContent = '已取消';
             progressStatusEl.className = 'progress-status warning';
        } else {
            progressStatusEl.textContent = `失败: ${error.message.substring(0, 50)}${error.message.length > 50 ? '...' : ''}`;
            progressStatusEl.className = 'progress-status error';
        }
        if(progressBarEl) progressBarEl.style.backgroundColor = 'var(--error-color)';
        updateChannelStatistics(channel.groupId, channel.channelIdKey, false, 0); // Use channelIdKey
        updateStatus(`发送到 ${channel.guildName}/${channel.channelName} 失败: ${error.message}`, 'error');
        success = false;
    }
    return success; // Return status for Promise.all in parallel mode
}

async function sendMessageToChannel(discordChannelId, message, token, progressIndex) {
    if (isCancellingSend) throw { name: 'AbortError', message: '用户已取消' };
    
    const url = `https://discord.com/api/v9/channels/${discordChannelId}/messages`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message }),
        signal: currentAbortController.signal
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(`API ${response.status}: ${errorData.message}`);
    }
    return await response.json();
}

async function sendFileToChannel(discordChannelId, fileItem, message, token, spoiler, progressIndex, fileLoopIndex, totalFilesLoop) {
    if (isCancellingSend) throw { name: 'AbortError', message: '用户已取消' };
    
    let fileName = fileItem.name;
    if (spoiler && !fileName.startsWith('SPOILER_')) {
        fileName = `SPOILER_${fileName}`;
    }
    
    const formData = new FormData();
    if (message) formData.append('payload_json', JSON.stringify({ content: message }));
    formData.append('files[0]', fileItem.file, fileName);
    
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const abortHandler = () => {
            xhr.abort();
            // reject({ name: 'AbortError', message: '用户已取消' }); // Redundant if xhr.onabort handles it
        };
        currentAbortController.signal.addEventListener('abort', abortHandler, { once: true });
        
        xhr.open('POST', `https://discord.com/api/v9/channels/${discordChannelId}/messages`);
        xhr.setRequestHeader('Authorization', token);
        // Content-Type is set automatically by FormData with XHR
        
        let fileSpecificUploadedBytes = 0;
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const overallProgress = (fileLoopIndex + (event.loaded / event.total)) / totalFilesLoop * 100;
                updateProgressBar(progressIndex, overallProgress);
                
                const newBytesSinceLastXHRProgress = event.loaded - fileSpecificUploadedBytes;
                totalUploadedBytes += newBytesSinceLastXHRProgress;
                fileSpecificUploadedBytes = event.loaded;
            }
        };
        
        xhr.onload = () => {
            currentAbortController.signal.removeEventListener('abort', abortHandler);
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText));
            } else {
                const errorData = JSON.parse(xhr.responseText || '{}');
                reject(new Error(`API ${xhr.status}: ${errorData.message || xhr.statusText}`));
            }
        };
        xhr.onerror = () => {
            currentAbortController.signal.removeEventListener('abort', abortHandler);
            reject(new Error('网络错误'));
        };
        xhr.onabort = () => {
            currentAbortController.signal.removeEventListener('abort', abortHandler);
            reject({ name: 'AbortError', message: '用户已取消' });
        };
        xhr.send(formData);
    });
}

function updateProgressBar(index, percentage) {
    const progressBar = document.getElementById(`progress-bar-${index}`);
    const percentageText = document.getElementById(`progress-percentage-${index}`);
    if (progressBar && percentageText) {
        const cappedPercentage = Math.min(100, Math.max(0, Math.round(percentage)));
        progressBar.style.width = `${cappedPercentage}%`;
        percentageText.textContent = `${cappedPercentage}%`;
    }
}

function formatSpeed(bytesPerSecond) {
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
}

// --- 统计数据管理 ---
function updateChannelStatistics(groupId, channelIdKey, success, bytes) {
    sendStatistics.totalSends++;
    if (success) {
        sendStatistics.successfulSends++;
        sendStatistics.totalBytes += bytes;
    } else {
        sendStatistics.failedSends++;
    }
    
    const statKey = `${groupId}_${channelIdKey}`;
    if (!sendStatistics.channelStats[statKey]) {
        sendStatistics.channelStats[statKey] = { groupId, channelIdKey, sends: 0, successful: 0, failed: 0, bytes: 0 };
    }
    const channelStat = sendStatistics.channelStats[statKey];
    channelStat.sends++;
    if (success) {
        channelStat.successful++;
        channelStat.bytes += bytes;
    } else {
        channelStat.failed++;
    }
    saveStatistics();
}

function showStatistics() {
    const successRate = sendStatistics.totalSends > 0 ? ((sendStatistics.successfulSends / sendStatistics.totalSends) * 100).toFixed(1) : '0';
    const daysSinceStart = Math.floor((Date.now() - (sendStatistics.startTime || Date.now())) / (1000 * 60 * 60 * 24));
    
    const channelStatsArray = Object.values(sendStatistics.channelStats)
        .sort((a, b) => b.sends - a.sends)
        .slice(0, 10); 
    
    let channelStatsHTML = '';
    if (channelStatsArray.length > 0) {
        channelStatsHTML = '<h4>频道统计 (Top 10 按发送次数)</h4><table class="stats-table">' +
            '<thead><tr><th>频道</th><th>发送</th><th>成功率</th><th>数据量</th></tr></thead><tbody>';
        channelStatsArray.forEach(stat => {
            const channelInfo = getChannelInfoById(stat.groupId, stat.channelIdKey);
            const chName = channelInfo ? `${channelInfo.guildName} / ${channelInfo.channelName}` : '未知频道';
            const chSuccessRate = stat.sends > 0 ? ((stat.successful / stat.sends) * 100).toFixed(1) : '0';
            channelStatsHTML += `<tr><td>${chName}</td><td>${stat.sends}</td><td>${chSuccessRate}%</td><td>${formatFileSize(stat.bytes)}</td></tr>`;
        });
        channelStatsHTML += '</tbody></table>';
    } else {
        channelStatsHTML = '<p>暂无详细频道统计数据。</p>';
    }
    
    statsContent.innerHTML = `
        <div class="stats-overview">
            <div class="stat-item"><div class="stat-value">${sendStatistics.totalSends}</div><div class="stat-label">总发送</div></div>
            <div class="stat-item"><div class="stat-value">${successRate}%</div><div class="stat-label">成功率</div></div>
            <div class="stat-item"><div class="stat-value">${formatFileSize(sendStatistics.totalBytes)}</div><div class="stat-label">总数据</div></div>
            <div class="stat-item"><div class="stat-value">${daysSinceStart}</div><div class="stat-label">使用天数</div></div>
        </div>
        ${channelStatsHTML}
    `;
    statsModal.style.display = 'flex';
}

function closeStatsModal() {
    statsModal.style.display = 'none';
}

function clearStatistics() {
    if (confirm('确定要清空所有统计数据吗？此操作不可撤销。')) {
        sendStatistics = { totalSends: 0, successfulSends: 0, failedSends: 0, totalBytes: 0, channelStats: {}, startTime: Date.now() };
        saveStatistics();
        updateStatus('状态：统计数据已清空。', 'info');
        if (statsModal.style.display === 'flex') showStatistics(); // Refresh if open
        else closeStatsModal();
    }
}

function getChannelInfoById(groupId, channelIdKey) {
    const group = channelGroupsData[groupId];
    if (group && group.channels[channelIdKey]) {
        const ch = group.channels[channelIdKey];
        return {
            guildName: ch.fetchedInfo?.guildName || '未知服',
            channelName: ch.fetchedInfo?.channelName || ch.alias || '未知频道'
        };
    }
    return null;
}

// --- UI 状态管理 ---
function showLoadingOverlay() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
        if (!lottieAnimation && window.lottie) { // Ensure lottie is available
            lottieAnimation = lottie.loadAnimation({
                container: document.getElementById('loadingSpinner'),
                renderer: 'svg', loop: true, autoplay: true,
                path: 'https://lottie.host/bfd271a8-6d9e-4b2d-b703-33d3bdb2bfed/yZWXgYsNTI.json'
            });
        } else if (lottieAnimation) {
            lottieAnimation.play();
        }
    }
}

function hideLoadingOverlay() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
        if (lottieAnimation) lottieAnimation.pause();
    }
}

function showProgressPopup() {
    if (progressPopup) {
        progressPopup.style.display = 'flex';
        document.getElementById('progressPopupTitle').textContent = `发送进度 - ${sendMode === 'sequential' ? '顺序发送' : '并行发送'}`;
    }
}

function hideProgressPopup() {
    if (progressPopup) progressPopup.style.display = 'none';
}

function updateStatus(message, type = 'info') {
    if (!statusLog) return;
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('p');
    logEntry.className = `log-entry log-${type}`; // Consistent class prefix
    logEntry.innerHTML = `[${timestamp}] ${message.replace(/</g, "<").replace(/>/g, ">")}`; // Basic XSS protection
    
    if (statusLog.firstChild && statusLog.firstChild.textContent === '状态：等待操作...') {
        statusLog.innerHTML = ''; // Clear initial message
    }
    statusLog.appendChild(logEntry);
    statusLog.scrollTop = statusLog.scrollHeight;
    
    const maxLogEntries = 100;
    while (statusLog.children.length > maxLogEntries) {
        statusLog.removeChild(statusLog.firstChild);
    }
}

function clearStatusLog() {
    if (statusLog) statusLog.innerHTML = '<p>状态：日志已清空。</p>';
}

function exportStatusLog() {
    if (!statusLog) return;
    const logText = Array.from(statusLog.children).map(p => p.textContent).join('\n');
    if (!logText.trim() || logText.includes('日志已清空')) {
        updateStatus('状态：没有日志内容可导出。', 'info');
        return;
    }
    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `discord-forwarder-log-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    updateStatus('状态：日志已导出。', 'success');
}

// --- 设置保存与加载 ---
function saveSettings() {
    const settings = {
        apiToken: apiTokenInput.value, // Not blurring here, blur is display only
        minDelay: parseFloat(minDelayInput.value) || 1,
        maxDelay: parseFloat(maxDelayInput.value) || 5,
        message: messageInput.value,
        channelGroups: channelGroupsData,
        sendMode: sendMode,
        messageTemplates: messageTemplates,
        theme: document.body.classList.contains('theme-dark') ? 'dark' : 'light', // Corrected logic
        version: '1.2.1' // Bump version if settings structure changed
    };
    
    try {
        if (currentStorageMethod === 'localStorage') {
            localStorage.setItem('discordForwarderSettings', JSON.stringify(settings));
            updateStatus('状态：设置已保存到浏览器存储。', 'success');
        } else if (currentStorageMethod === 'localFile') {
            // This is triggered by the "保存当前设置到文件" button which calls saveSettings
            // Or the global "保存设置" button when method is localFile.
            const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'discord_forwarder_settings.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            updateStatus('状态：设置文件已开始下载。请手动保存。', 'success');
        }
    } catch (error) {
        updateStatus(`状态：保存设置失败: ${error.message}`, 'error');
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
            updateStatus('错误：浏览器存储已满，无法保存设置。请尝试清理或使用文件存储。', 'error');
        }
    }
}

function saveStatistics() {
    try {
        localStorage.setItem('discordForwarderStats', JSON.stringify(sendStatistics));
    } catch (error) {
        console.error('保存统计数据失败:', error);
         if (error instanceof DOMException && error.name === 'QuotaExceededError') {
            updateStatus('警告：浏览器存储已满，无法保存统计数据。', 'warning');
        }
    }
}

function loadSettings() {
    try {
        const savedSettings = localStorage.getItem('discordForwarderSettings');
        if (savedSettings) {
            applySettings(JSON.parse(savedSettings));
            updateStatus('状态：设置已从浏览器存储加载。', 'success');
        } else {
            updateStatus('状态：未找到浏览器存储的设置。', 'info');
        }
        
        const savedStats = localStorage.getItem('discordForwarderStats');
        if (savedStats) {
            const parsedStats = JSON.parse(savedStats);
            // Basic validation/migration if needed
            if (parsedStats.startTime) sendStatistics = parsedStats;
            else sendStatistics.startTime = Date.now(); // Ensure startTime exists
        } else {
             sendStatistics.startTime = Date.now();
        }
    } catch (error) {
        updateStatus(`状态：加载设置/统计失败: ${error.message}`, 'error');
        localStorage.removeItem('discordForwarderSettings'); // Clear corrupted settings
        localStorage.removeItem('discordForwarderStats');
    }
}

function applySettings(settings) {
    if (!settings) return;
    if (settings.apiToken) apiTokenInput.value = settings.apiToken;
    // API Token visibility should reset to blurred by default.
    apiTokenInput.classList.add('blurred-text');
    document.querySelector('.eye-closed').style.display = 'block';
    document.querySelector('.eye-open').style.display = 'none';

    if (settings.minDelay !== undefined) {
        minDelayInput.value = settings.minDelay;
        minDelayRange.value = settings.minDelay;
    }
    if (settings.maxDelay !== undefined) {
        maxDelayInput.value = settings.maxDelay;
        maxDelayRange.value = settings.maxDelay;
    }
    if (settings.message !== undefined) messageInput.value = settings.message;
    if (settings.channelGroups) channelGroupsData = settings.channelGroups; else channelGroupsData = {};
    if (settings.sendMode) {
        sendMode = settings.sendMode;
        sendModeToggleBtn.textContent = `切换为${sendMode === 'sequential' ? '并行' : '顺序'}发送`;
    }
    if (settings.messageTemplates) messageTemplates = settings.messageTemplates; else messageTemplates = {};
    updateMessageTemplateSelect(); // Ensure select is populated
    
    const currentThemeIsDark = document.body.classList.contains('theme-dark');
    if (settings.theme === 'dark' && !currentThemeIsDark) {
        toggleTheme();
    } else if (settings.theme === 'light' && currentThemeIsDark) {
        toggleTheme();
    }
    
    renderChannelGroups();
    renderMarkdownPreview(); // Render message with loaded content
}

function loadSettingsFromFile() {
    settingsFileInput.click(); // Triggers 'change' event handled by handleSettingsFileSelect
}

function handleSettingsFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type !== 'application/json') {
        updateStatus('状态：请选择 .json 格式的设置文件。', 'error');
        settingsFileInput.value = ''; // Reset input
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const loadedSettings = JSON.parse(e.target.result);
            applySettings(loadedSettings);
            updateStatus('状态：设置已成功从文件加载。', 'success');
        } catch (error) {
            updateStatus(`状态：加载设置文件失败: ${error.message}`, 'error');
        } finally {
            settingsFileInput.value = ''; // Reset input
        }
    };
    reader.onerror = () => {
        updateStatus('状态：读取文件时发生错误。', 'error');
        settingsFileInput.value = ''; // Reset input
    };
    reader.readAsText(file);
}

function storageMethodChanged() {
    currentStorageMethod = storagePreferenceSelect.value;
    localFileControls.style.display = currentStorageMethod === 'localFile' ? 'block' : 'none';
    updateStatus(`状态：存储方式已切换为 ${storagePreferenceSelect.options[storagePreferenceSelect.selectedIndex].text}。`, 'info');
}

// --- 初始化 ---
function initializeEventListeners() {
    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFiles);
    
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => { e.preventDefault(); uploadArea.classList.remove('dragover'); handleFiles(e); });
    
    document.addEventListener('paste', handlePaste);
    
    minDelayRange.addEventListener('input', () => minDelayInput.value = minDelayRange.value);
    minDelayInput.addEventListener('input', () => { // Use input for immediate sync
        let val = Math.min(Math.max(parseFloat(minDelayInput.value) || 0, 0), 30);
        minDelayRange.value = val;
        if (parseFloat(minDelayInput.value) !== val) minDelayInput.value = val; // Correct if out of bounds
    });
    maxDelayRange.addEventListener('input', () => maxDelayInput.value = maxDelayRange.value);
    maxDelayInput.addEventListener('input', () => {
        let val = Math.min(Math.max(parseFloat(maxDelayInput.value) || 0, 0), 30);
        maxDelayRange.value = val;
         if (parseFloat(maxDelayInput.value) !== val) maxDelayInput.value = val;
    });
    
    messageInput.addEventListener('input', debounce(renderMarkdownPreview, 300));
    
    saveSettingsBtn.addEventListener('click', saveSettings);
    storagePreferenceSelect.addEventListener('change', storageMethodChanged);
    loadSettingsFileBtn.addEventListener('click', loadSettingsFromFile);
    settingsFileInput.addEventListener('change', handleSettingsFileSelect);
    saveSettingsFileBtn.addEventListener('click', saveSettings); // This specific button for file save
    
    channelImportInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (typeof importedData !== 'object' || importedData === null) throw new Error('文件格式不正确');
                
                // Basic merge: overwrite or add groups/channels
                Object.keys(importedData).forEach(groupId => {
                    if (!channelGroupsData[groupId]) {
                        channelGroupsData[groupId] = importedData[groupId];
                    } else { // Merge channels if group exists
                        const existingGroup = channelGroupsData[groupId];
                        const importedGroup = importedData[groupId];
                        existingGroup.name = importedGroup.name || existingGroup.name;
                        existingGroup.enabled = importedGroup.enabled !== undefined ? importedGroup.enabled : existingGroup.enabled;
                        existingGroup.panelOpen = importedGroup.panelOpen !== undefined ? importedGroup.panelOpen : existingGroup.panelOpen;
                        existingGroup.channels = {...existingGroup.channels, ...(importedGroup.channels || {})};
                    }
                });
                renderChannelGroups();
                updateStatus('状态：频道列表已导入并合并。', 'success');
                saveSettings();
            } catch (error) {
                updateStatus(`状态：导入频道列表失败: ${error.message}`, 'error');
            } finally {
                channelImportInput.value = ''; // Reset file input
            }
        };
        reader.readAsText(file);
    });
    
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    autoSaveInterval = setInterval(() => {
        if (currentStorageMethod === 'localStorage' && !isSending) { // Don't autosave during send
            saveSettings(); // This will show a status message, maybe make a silent version for autosave
        }
    }, 60 * 1000); // Autosave every minute
    
    window.addEventListener('beforeunload', (e) => {
        if (isSending) {
            e.preventDefault();
            e.returnValue = '文件正在发送中，确定要离开此页面吗？未完成的发送将会中断。';
            return e.returnValue;
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveSettings();
        }
        if (e.key === 'Delete') {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                return; // Don't interfere with typing
            }
            if (fileItems.some(item => item.selected)) {
                e.preventDefault();
                removeSelectedFiles();
            }
        }
    });
}

function initialize() {
    initializeDOMElements();
    initializeEventListeners();
    loadSettings(); // Load settings first
    storageMethodChanged(); // Then set up storage UI based on loaded/default
    
    renderChannelGroups();
    renderMarkdownPreview();
    updateFilePreview(); // Initial call to show "暂无文件" or existing
    
    const defaultThemeIsDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (!localStorage.getItem('discordForwarderSettings') && defaultThemeIsDark && document.body.classList.contains('theme-light')) {
        toggleTheme(); // Set to dark if OS prefers and no saved theme
    } else if (localStorage.getItem('discordForwarderSettings')) {
        // Theme is handled by applySettings
    }
    
    updateStatus('状态：Discord 文件转发工具已加载。版本 1.2.1', 'success');
    if (!window.fetch || !window.Promise || !window.localStorage || !window.FileReader || !window.URL.createObjectURL) {
        updateStatus('警告：您的浏览器可能过于老旧，无法完全支持本工具。请更新或更换浏览器。', 'error');
    }
    
    setTimeout(() => { if (pageContainer) pageContainer.classList.add('visible'); }, 100);
}

document.addEventListener('DOMContentLoaded', initialize);

window.addEventListener('unload', () => {
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    if (lottieAnimation) { lottieAnimation.destroy(); lottieAnimation = null; }
    fileItems.forEach(item => {
        if (item.previewUrl && (item.type.startsWith('video/') || item.type.startsWith('audio/')) && item.previewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(item.previewUrl);
        }
    });
});