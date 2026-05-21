/**
 * ==========================================================================
 * SMTH IMAGE GUARDIAN - CORE APPLICATION ENGINE
 * High-Performance Client-Side Image Watermarking, Optimizing, and Batch ZIP Export
 * ==========================================================================
 */

// Global Application State
const state = {
    imagesQueue: [],        // Array of image objects: { id, file, name, size, imgObject, processed: false }
    activeIndex: -1,        // Index of the currently active/selected image
    logoImage: null,        // Global Image object for the pre-copied company logo
    logoLoaded: false,      // Logo loading status flag
    watermarkMode: 'logo',  // 'logo' | 'text' | 'both'
    presetTemplate: 'diagonal-tiled', // 'diagonal-tiled' | 'corner-badge' | 'center-stamp'
    watermarkText: '55KVARTAL',
    opacity: 0.15,          // Opacity level of watermark layers (0.05 to 0.60)
    logoScale: 0.12,        // Scale of logo relative to photo dimensions
    textSize: 16,           // Text font size in pixels (scales up with high-res photos)
    exportFormat: 'image/webp', // 'image/webp' | 'image/jpeg'
    exportQuality: 0.82,    // Compression quality for WebP/JPEG (0.50 to 0.95)
    isProcessing: false     // Batch download processing lock
};

// DOM Elements Selection
const elements = {
    dropzone: document.getElementById('image-dropzone'),
    fileInput: document.getElementById('file-input'),
    queueList: document.getElementById('queue-list'),
    queueCount: document.getElementById('queue-count'),
    clearQueueBtn: document.getElementById('clear-queue-btn'),
    canvas: document.getElementById('editor-canvas'),
    canvasPlaceholder: document.getElementById('canvas-placeholder'),
    canvasLoader: document.getElementById('canvas-loader'),
    activeFilename: document.getElementById('active-filename'),
    logoIndicator: document.getElementById('logo-indicator'),
    
    // Sliders
    watermarkOpacity: document.getElementById('watermark-opacity'),
    opacityVal: document.getElementById('opacity-val'),
    logoScaleInput: document.getElementById('logo-scale'),
    scaleVal: document.getElementById('scale-val'),
    textSizeInput: document.getElementById('text-size'),
    fontVal: document.getElementById('font-size-val'),
    exportQualityInput: document.getElementById('export-quality'),
    qualityVal: document.getElementById('quality-val'),
    watermarkTextInput: document.getElementById('watermark-text'),
    
    // Action Buttons
    downloadActiveBtn: document.getElementById('download-active-btn'),
    downloadBatchBtn: document.getElementById('download-batch-btn'),
    downloadFolderBtn: document.getElementById('download-folder-btn'),
    
    // Controls toggles
    tabButtons: document.querySelectorAll('.tab-btn'),
    presetCards: document.querySelectorAll('.preset-card'),
    formatButtons: document.querySelectorAll('.format-btn'),
    
    // Control Groups for toggling visibility
    dynamicTextInputGroup: document.querySelector('.dynamic-text-input-group'),
    logoOnlyControl: document.querySelector('.logo-only-control'),
    textOnlyControl: document.querySelector('.text-only-control')
};

// Canvas Context
const ctx = elements.canvas.getContext('2d');

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
window.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // 1. Attempt to load the pre-copied logo from the directory
    loadLogo();

    // Setup API Support toggles
    if (window.showDirectoryPicker && elements.downloadFolderBtn) {
        elements.downloadFolderBtn.style.display = 'flex';
        // Hide ZIP button to keep the UI clean if folder API is supported
        elements.downloadBatchBtn.style.display = 'none';
    }

    // 2. Setup Event Listeners
    setupDropzoneEvents();
    setupControlPanelEvents();
    setupButtonEvents();
}

/* ==========================================================================
   LOGO LOADING ENGINE
   ========================================================================== */
function loadLogo() {
    state.logoImage = new Image();
    
    // Check if the base64 injected logo exists to prevent Canvas Tainting
    if (typeof LOGO_BASE64 !== 'undefined') {
        state.logoImage.src = LOGO_BASE64;
    } else {
        state.logoImage.src = 'logo.png';
    }
    
    state.logoImage.onload = () => {
        state.logoLoaded = true;
        updateLogoIndicatorStatus(true, 'Логотип 55KVARTAL загружен', 'logo.png успешно загружен');
        triggerCanvasRender();
    };
    
    state.logoImage.onerror = () => {
        state.logoLoaded = false;
        updateLogoIndicatorStatus(false, 'Логотип не найден', 'Поместите logo.png в эту папку');
        // Fall back to Text Only mode if logo fails to load
        setWatermarkMode('text');
    };
}

function updateLogoIndicatorStatus(success, title, subtitle) {
    const dot = elements.logoIndicator.querySelector('.logo-indicator-dot');
    const titleEl = elements.logoIndicator.querySelector('.logo-title');
    const subEl = elements.logoIndicator.querySelector('.logo-sub');
    
    if (success) {
        dot.className = 'logo-indicator-dot success';
        titleEl.textContent = title;
        subEl.textContent = subtitle;
    } else {
        dot.className = 'logo-indicator-dot warning';
        titleEl.textContent = title;
        subEl.textContent = subtitle;
    }
}

/* ==========================================================================
   DROPZONE & FILE UPLOAD HANDLERS
   ========================================================================== */
function setupDropzoneEvents() {
    // Trigger file selection on click
    elements.dropzone.addEventListener('click', () => {
        elements.fileInput.click();
    });
    
    // Prevent default behaviors for drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        elements.dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });
    
    // Add/remove class for visual feedback
    ['dragenter', 'dragover'].forEach(eventName => {
        elements.dropzone.addEventListener(eventName, () => {
            elements.dropzone.classList.add('dragover');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        elements.dropzone.addEventListener(eventName, () => {
            elements.dropzone.classList.remove('dragover');
        }, false);
    });
    
    // Handle dropped files
    elements.dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
            handleFilesSelected(dt.files);
        }
    });
    
    // Handle file dialog selection
    elements.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFilesSelected(e.target.files);
        }
        elements.fileInput.value = ''; // Reset input to allow re-uploading same files
    });
}

function handleFilesSelected(filesList) {
    const validFiles = Array.from(filesList).filter(file => file.type.startsWith('image/'));
    if (validFiles.length === 0) return;

    elements.canvasLoader.style.display = 'flex';
    let loadedCount = 0;

    validFiles.forEach(file => {
        const id = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const imgObject = new Image();
            imgObject.onload = () => {
                state.imagesQueue.push({
                    id: id,
                    file: file,
                    name: file.name,
                    size: formatBytes(file.size),
                    imgObject: imgObject,
                    processed: false
                });

                loadedCount++;
                if (loadedCount === validFiles.length) {
                    elements.canvasLoader.style.display = 'none';
                    updateQueueUI();
                    
                    // If no active image is selected, auto-select the first newly uploaded image
                    if (state.activeIndex === -1) {
                        selectQueueItem(state.imagesQueue.length - validFiles.length);
                    }
                }
            };
            imgObject.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

/* ==========================================================================
   QUEUE MANAGEMENT WORKSPACE
   ========================================================================== */
function updateQueueUI() {
    const queueList = elements.queueList;
    elements.queueCount.textContent = `${state.imagesQueue.length} Изображений`;
    
    // Toggle Clear All Button
    elements.clearQueueBtn.disabled = state.imagesQueue.length === 0;
    elements.downloadBatchBtn.disabled = state.imagesQueue.length === 0;
    if (elements.downloadFolderBtn) {
        elements.downloadFolderBtn.disabled = state.imagesQueue.length === 0;
    }

    if (state.imagesQueue.length === 0) {
        queueList.innerHTML = `
            <div class="empty-queue-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="placeholder-icon">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-3.75 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
                <p>Изображения пока не загружены</p>
            </div>
        `;
        
        // Clear canvas preview
        clearCanvas();
        elements.downloadActiveBtn.disabled = true;
        elements.activeFilename.textContent = 'Изображение не выбрано';
        return;
    }

    queueList.innerHTML = '';
    state.imagesQueue.forEach((item, index) => {
        const isActive = index === state.activeIndex;
        
        const card = document.createElement('div');
        card.className = `queue-item ${isActive ? 'active' : ''}`;
        card.dataset.index = index;
        
        card.innerHTML = `
            <div class="thumb-container">
                <img src="${item.imgObject.src}" class="thumb-image" alt="Thumbnail">
            </div>
            <div class="queue-details">
                <span class="filename" title="${item.name}">${item.name}</span>
                <span class="file-info">${item.size} • ${item.imgObject.naturalWidth}×${item.imgObject.naturalHeight}</span>
                <span class="status-badge ${item.processed ? 'done' : 'pending'}">
                    ${item.processed ? 'Готово ✓' : 'Ожидает'}
                </span>
            </div>
            <div class="queue-action" title="Удалить фото" onclick="removeQueueItem(event, ${index})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="queue-action-icon">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/>
                    <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
            </div>
        `;
        
        // Add click listener to select image
        card.addEventListener('click', (e) => {
            // Avoid selecting if clicking delete button
            if (e.target.closest('.queue-action')) return;
            selectQueueItem(index);
        });
        
        queueList.appendChild(card);
    });
}

function selectQueueItem(index) {
    if (index < 0 || index >= state.imagesQueue.length) return;
    
    state.activeIndex = index;
    const activeItem = state.imagesQueue[index];
    
    elements.activeFilename.textContent = activeItem.name;
    elements.downloadActiveBtn.disabled = false;
    
    updateQueueUI();
    triggerCanvasRender();
}

window.removeQueueItem = function(e, index) {
    e.stopPropagation(); // Stop click from selecting deleted card
    
    state.imagesQueue.splice(index, 1);
    
    // Adjust active index
    if (state.activeIndex === index) {
        state.activeIndex = state.imagesQueue.length > 0 ? 0 : -1;
    } else if (state.activeIndex > index) {
        state.activeIndex--;
    }
    
    updateQueueUI();
    if (state.activeIndex !== -1) {
        selectQueueItem(state.activeIndex);
    }
};

/* ==========================================================================
   CONTROL PANEL LOGIC & EVENT HANDLERS
   ========================================================================== */
function setupControlPanelEvents() {
    // Mode Buttons (Logo Only / Text Only / Both)
    elements.tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setWatermarkMode(btn.dataset.mode);
        });
    });

    // Preset Templates Grid
    elements.presetCards.forEach(card => {
        card.addEventListener('click', () => {
            elements.presetCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            state.presetTemplate = card.dataset.preset;
            triggerCanvasRender();
        });
    });

    // Format Toggle Buttons (WebP vs. JPEG)
    elements.formatButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.formatButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.exportFormat = btn.dataset.format;
            
            // Adjust label text
            const notice = document.querySelector('.export-notice');
            if (state.exportFormat === 'image/webp') {
                notice.textContent = 'WebP идеально подходит для современных сайтов, сжимая файлы до 75% без видимой потери качества.';
            } else {
                notice.textContent = 'JPEG предлагает отличную совместимость, но больший размер файла по сравнению с WebP.';
            }
        });
    });

    // Text Input Key Listener
    elements.watermarkTextInput.addEventListener('input', (e) => {
        state.watermarkText = e.target.value;
        triggerCanvasRender();
    });

    // Sliders Real-Time Updates
    elements.watermarkOpacity.addEventListener('input', (e) => {
        state.opacity = parseFloat(e.target.value) / 100;
        elements.opacityVal.textContent = `${e.target.value}%`;
        triggerCanvasRender();
    });

    elements.logoScaleInput.addEventListener('input', (e) => {
        state.logoScale = parseFloat(e.target.value) / 100;
        elements.scaleVal.textContent = `${e.target.value}%`;
        triggerCanvasRender();
    });

    elements.textSizeInput.addEventListener('input', (e) => {
        state.textSize = parseInt(e.target.value);
        elements.fontVal.textContent = `${e.target.value}px`;
        triggerCanvasRender();
    });

    elements.exportQualityInput.addEventListener('input', (e) => {
        state.exportQuality = parseFloat(e.target.value) / 100;
        elements.qualityVal.textContent = `${e.target.value}%`;
    });
}

function setWatermarkMode(mode) {
    state.watermarkMode = mode;
    
    // Toggle Control Input visibilities dynamically based on Mode
    if (mode === 'logo') {
        elements.logoOnlyControl.style.display = 'flex';
        elements.textOnlyControl.style.display = 'none';
        elements.dynamicTextInputGroup.style.display = 'none';
    } else if (mode === 'text') {
        elements.logoOnlyControl.style.display = 'none';
        elements.textOnlyControl.style.display = 'flex';
        elements.dynamicTextInputGroup.style.display = 'flex';
    } else if (mode === 'both') {
        elements.logoOnlyControl.style.display = 'flex';
        elements.textOnlyControl.style.display = 'flex';
        elements.dynamicTextInputGroup.style.display = 'flex';
    }
    
    triggerCanvasRender();
}

/* ==========================================================================
   BUTTON CLICK ENGINE
   ========================================================================== */
function setupButtonEvents() {
    elements.clearQueueBtn.addEventListener('click', () => {
        state.imagesQueue = [];
        state.activeIndex = -1;
        updateQueueUI();
        if (typeof showToast === 'function') showToast('Очередь очищена', 'info');
    });

    elements.downloadActiveBtn.addEventListener('click', () => {
        downloadActiveImage();
    });

    elements.downloadBatchBtn.addEventListener('click', () => {
        downloadBatchZip();
    });

    if (elements.downloadFolderBtn) {
        elements.downloadFolderBtn.addEventListener('click', () => {
            downloadBatchToDirectory();
        });
    }
}

/* ==========================================================================
   HIGH-FIDELITY CANVAS RENDERING SYSTEM
   ========================================================================== */
function clearCanvas() {
    ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    elements.canvas.style.display = 'none';
    elements.canvasPlaceholder.style.display = 'flex';
}

function triggerCanvasRender() {
    if (state.activeIndex === -1 || state.imagesQueue.length === 0) {
        clearCanvas();
        return;
    }
    
    elements.canvasPlaceholder.style.display = 'none';
    elements.canvas.style.display = 'block';
    
    const activeItem = state.imagesQueue[state.activeIndex];
    renderWatermarkedCanvas(elements.canvas, activeItem.imgObject);
}

/**
 * Draws the photo and dynamic watermarks on the given target canvas at FULL RESOLUTION.
 */
function renderWatermarkedCanvas(targetCanvas, sourceImgObject) {
    // 1. Set canvas physical pixel dimensions to match the raw source photo.
    // This guarantees full image quality output on export!
    const width = sourceImgObject.naturalWidth;
    const height = sourceImgObject.naturalHeight;
    targetCanvas.width = width;
    targetCanvas.height = height;

    const canvasCtx = targetCanvas.getContext('2d');
    
    // 2. Draw raw image baseline
    canvasCtx.drawImage(sourceImgObject, 0, 0, width, height);

    // 3. Compose Watermark Layers
    canvasCtx.save();
    
    // Setup generic global composite operation and alpha
    canvasCtx.globalAlpha = state.opacity;
    
    // Calculate canvas dynamic sizing scalar based on image width to keep logo proportions looking consistent.
    // Standard baseline width of 1920px
    const scaleScalar = width / 1920; 

    // Apply Chosen Design Template
    if (state.presetTemplate === 'diagonal-tiled') {
        drawDiagonalTiledPattern(canvasCtx, width, height, scaleScalar);
    } else if (state.presetTemplate === 'corner-badge') {
        drawCornerBadgePattern(canvasCtx, width, height, scaleScalar);
    } else if (state.presetTemplate === 'center-stamp') {
        drawCenterStampPattern(canvasCtx, width, height, scaleScalar);
    }

    canvasCtx.restore();
}

/* ==========================================================================
   WATERMARK PATTERN COMPOSITIONS
   ========================================================================== */

/**
 * Strategy: A diagonal tiled mesh.
 * This repeats text/logo rotated elegantly across the property, 
 * crossing details to make cropping/AI-erasure impossible, yet clean & light.
 */
function drawDiagonalTiledPattern(canvasCtx, imgWidth, imgHeight, scaleScalar) {
    const spacingX = Math.max(350 * scaleScalar, 200);
    const spacingY = Math.max(250 * scaleScalar, 150);
    
    // Save state, rotate context centered
    canvasCtx.translate(imgWidth / 2, imgHeight / 2);
    canvasCtx.rotate(-30 * Math.PI / 180);
    canvasCtx.translate(-imgWidth / 2, -imgHeight / 2);

    // Expand drawing limits to cover rotated canvas edges
    const startX = -imgWidth;
    const endX = imgWidth * 2;
    const startY = -imgHeight;
    const endY = imgHeight * 2;

    // Determine watermark sizes based on scale inputs
    const logoW = state.logoLoaded ? state.logoImage.naturalWidth * state.logoScale * scaleScalar : 0;
    const logoH = state.logoLoaded ? state.logoImage.naturalHeight * state.logoScale * scaleScalar : 0;
    
    // Precise scalable font
    const fontSize = Math.max(state.textSize * scaleScalar, 11);
    canvasCtx.font = `600 ${fontSize}px ${varExtractor('--font-primary') || 'Plus Jakarta Sans'}`;
    canvasCtx.fillStyle = '#ffffff';
    canvasCtx.textAlign = 'center';
    canvasCtx.textBaseline = 'middle';

    // Solid elegant text shadow for readability over light property tiles/windows
    canvasCtx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    canvasCtx.shadowBlur = Math.max(3 * scaleScalar, 1.5);
    canvasCtx.shadowOffsetX = Math.max(1 * scaleScalar, 0.5);
    canvasCtx.shadowOffsetY = Math.max(1 * scaleScalar, 0.5);

    // Double loop tiling
    for (let x = startX; x < endX; x += spacingX) {
        for (let y = startY; y < endY; y += spacingY) {
            // Slight offset between rows for beautiful staggered visual layout
            const offset = (Math.floor(y / spacingY) % 2) * (spacingX / 2);
            const posX = x + offset;
            
            if (state.watermarkMode === 'logo' && state.logoLoaded) {
                canvasCtx.drawImage(state.logoImage, posX - logoW / 2, y - logoH / 2, logoW, logoH);
            } else if (state.watermarkMode === 'text') {
                canvasCtx.fillText(state.watermarkText, posX, y);
            } else if (state.watermarkMode === 'both') {
                // Drawing stacked logo + text below
                if (state.logoLoaded) {
                    canvasCtx.drawImage(state.logoImage, posX - logoW / 2, y - logoH / 2 - (fontSize * 0.6), logoW, logoH);
                    canvasCtx.fillText(state.watermarkText, posX, y + logoH / 2);
                } else {
                    canvasCtx.fillText(state.watermarkText, posX, y);
                }
            }
        }
    }
}

/**
 * Strategy: A premium clean bottom-right brand seal.
 * Professional, unobtrusive corporate listing signature.
 */
function drawCornerBadgePattern(canvasCtx, imgWidth, imgHeight, scaleScalar) {
    const padding = Math.max(50 * scaleScalar, 20); // 5% border inset padding

    // Sizing
    const logoW = state.logoLoaded ? state.logoImage.naturalWidth * state.logoScale * 1.5 * scaleScalar : 0;
    const logoH = state.logoLoaded ? state.logoImage.naturalHeight * state.logoScale * 1.5 * scaleScalar : 0;
    
    const fontSize = Math.max(state.textSize * 1.2 * scaleScalar, 14);
    canvasCtx.font = `600 ${fontSize}px ${varExtractor('--font-primary') || 'Plus Jakarta Sans'}`;
    canvasCtx.fillStyle = '#ffffff';
    
    canvasCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    canvasCtx.shadowBlur = Math.max(4 * scaleScalar, 2);
    canvasCtx.shadowOffsetX = Math.max(2 * scaleScalar, 1);
    canvasCtx.shadowOffsetY = Math.max(2 * scaleScalar, 1);

    if (state.watermarkMode === 'logo' && state.logoLoaded) {
        const drawX = imgWidth - logoW - padding;
        const drawY = imgHeight - logoH - padding;
        canvasCtx.drawImage(state.logoImage, drawX, drawY, logoW, logoH);
    } else if (state.watermarkMode === 'text') {
        canvasCtx.textAlign = 'right';
        canvasCtx.textBaseline = 'bottom';
        canvasCtx.fillText(state.watermarkText, imgWidth - padding, imgHeight - padding);
    } else if (state.watermarkMode === 'both') {
        canvasCtx.textAlign = 'right';
        canvasCtx.textBaseline = 'middle';
        
        const drawX = imgWidth - logoW - padding;
        const textY = imgHeight - padding - (fontSize / 2);
        const logoY = textY - logoH - (fontSize / 2);
        
        if (state.logoLoaded) {
            canvasCtx.drawImage(state.logoImage, imgWidth - logoW - padding, logoY, logoW, logoH);
        }
        canvasCtx.fillText(state.watermarkText, imgWidth - padding, textY);
    }
}

/**
 * Strategy: A centralized, large but ultra-faint circular or textual stamp.
 * Fades directly into the center room focus.
 */
function drawCenterStampPattern(canvasCtx, imgWidth, imgHeight, scaleScalar) {
    const centerX = imgWidth / 2;
    const centerY = imgHeight / 2;

    const logoW = state.logoLoaded ? state.logoImage.naturalWidth * state.logoScale * 2.2 * scaleScalar : 0;
    const logoH = state.logoLoaded ? state.logoImage.naturalHeight * state.logoScale * 2.2 * scaleScalar : 0;
    
    const fontSize = Math.max(state.textSize * 1.5 * scaleScalar, 16);
    canvasCtx.font = `700 ${fontSize}px ${varExtractor('--font-primary') || 'Plus Jakarta Sans'}`;
    canvasCtx.fillStyle = '#ffffff';
    canvasCtx.textAlign = 'center';
    canvasCtx.textBaseline = 'middle';
    
    canvasCtx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    canvasCtx.shadowBlur = Math.max(5 * scaleScalar, 2.5);
    canvasCtx.shadowOffsetX = Math.max(2 * scaleScalar, 1);
    canvasCtx.shadowOffsetY = Math.max(2 * scaleScalar, 1);

    if (state.watermarkMode === 'logo' && state.logoLoaded) {
        canvasCtx.drawImage(state.logoImage, centerX - logoW / 2, centerY - logoH / 2, logoW, logoH);
    } else if (state.watermarkMode === 'text') {
        canvasCtx.fillText(state.watermarkText, centerX, centerY);
    } else if (state.watermarkMode === 'both') {
        if (state.logoLoaded) {
            canvasCtx.drawImage(state.logoImage, centerX - logoW / 2, centerY - logoH / 2 - (fontSize * 0.8), logoW, logoH);
            canvasCtx.fillText(state.watermarkText, centerX, centerY + logoH / 2);
        } else {
            canvasCtx.fillText(state.watermarkText, centerX, centerY);
        }
    }
}

// Simple helper to fetch document styling font
function varExtractor(cssVarName) {
    return getComputedStyle(document.documentElement).getPropertyValue(cssVarName).trim();
}

/* ==========================================================================
   EXPORT SYSTEMS (DOWNLOAD SINGLE / BULK ZIP WRAPPER)
   ========================================================================= */

/**
 * Standard Single File Download Handler
 */
function downloadActiveImage() {
    if (state.activeIndex === -1 || state.imagesQueue.length === 0) return;
    
    const activeItem = state.imagesQueue[state.activeIndex];
    
    // Create custom formatted export filename
    const origName = activeItem.name.substring(0, activeItem.name.lastIndexOf('.')) || activeItem.name;
    const formatExt = state.exportFormat === 'image/webp' ? 'webp' : 'jpg';
    const newFilename = `${origName}_protected.${formatExt}`;

    triggerSingleDownload(elements.canvas, newFilename, state.exportFormat, state.exportQuality);
    
    // Flag queue item status as completed
    activeItem.processed = true;
    if (typeof showToast === 'function') showToast(`Скачано ${newFilename}`, 'success');
    
    // Auto-advance to next image for blazing fast workflows
    if (state.activeIndex < state.imagesQueue.length - 1) {
        selectQueueItem(state.activeIndex + 1);
    } else {
        updateQueueUI();
    }
}

/**
 * Triggers browser download dialog for a canvas element.
 */
function triggerSingleDownload(canvasEl, filename, mimeType, quality) {
    const dataUrl = canvasEl.toDataURL(mimeType, quality);
    
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Strategy: Compiles a single batch zip of protected files client-side.
 * Uses JSZip. Falls back to rapid sequential download if CDN JSZip fails.
 */
function downloadBatchZip() {
    if (state.imagesQueue.length === 0 || state.isProcessing) return;

    state.isProcessing = true;
    elements.canvasLoader.style.display = 'flex';
    const loaderText = elements.canvasLoader.querySelector('p');
    loaderText.textContent = 'Подготовка к обработке...';
    
    // Create an offline processing canvas to avoid visual flickers during batch rendering
    const offlineCanvas = document.createElement('canvas');
    
    const formatExt = state.exportFormat === 'image/webp' ? 'webp' : 'jpg';
    const formatMime = state.exportFormat;
    const quality = state.exportQuality;

    // Check if JSZip library is available via CDN
    const hasZipLib = typeof JSZip !== 'undefined';
    let zip = null;
    if (hasZipLib) {
        zip = new JSZip();
    }

    let itemIndex = 0;

    function processNext() {
        if (itemIndex >= state.imagesQueue.length) {
            // Done Processing!
            if (hasZipLib) {
                loaderText.textContent = 'Создание ZIP архива...';
                
                zip.generateAsync({ type: 'blob' }).then(function(content) {
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(content);
                    link.download = `protected_property_photos_${Date.now()}.zip`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    finishBatchProcessing();
                });
            } else {
                finishBatchProcessing();
            }
            return;
        }

        const queueItem = state.imagesQueue[itemIndex];
        loaderText.textContent = `Обработка изображения [${itemIndex + 1}/${state.imagesQueue.length}]: ${queueItem.name}`;
        
        // Render on background canvas
        renderWatermarkedCanvas(offlineCanvas, queueItem.imgObject);
        
        const origName = queueItem.name.substring(0, queueItem.name.lastIndexOf('.')) || queueItem.name;
        const newFilename = `${origName}_protected.${formatExt}`;
        
        if (hasZipLib) {
            // Grab base64 data and append to zip
            const dataUrl = offlineCanvas.toDataURL(formatMime, quality);
            const base64Data = dataUrl.split(',')[1];
            zip.file(newFilename, base64Data, { base64: true });
            
            queueItem.processed = true;
            itemIndex++;
            setTimeout(processNext, 50); // Small interval to allow UI rendering
        } else {
            // Fallback: Trigger sequential downloads
            triggerSingleDownload(offlineCanvas, newFilename, formatMime, quality);
            
            queueItem.processed = true;
            itemIndex++;
            setTimeout(processNext, 200); // Larger interval for browser downloader buffers
        }
    }

    // Start background process loop
    setTimeout(processNext, 100);
}

function finishBatchProcessing() {
    state.isProcessing = false;
    elements.canvasLoader.style.display = 'none';
    if (typeof showToast === 'function') showToast(`Успешно обработано ${state.imagesQueue.length} изображений!`, 'success');
    updateQueueUI();
}

/* ==========================================================================
   SUPPORT UTILS
   ========================================================================== */
function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Strategy: Uses modern File System Access API to stream output directly into a local user folder.
 */
async function downloadBatchToDirectory() {
    if (state.imagesQueue.length === 0 || state.isProcessing) return;

    try {
        // Request directory handle from user
        const directoryHandle = await window.showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'pictures'
        });

        state.isProcessing = true;
        elements.canvasLoader.style.display = 'flex';
        const loaderText = elements.canvasLoader.querySelector('p');
        
        const offlineCanvas = document.createElement('canvas');
        const formatExt = state.exportFormat === 'image/webp' ? 'webp' : 'jpg';
        const formatMime = state.exportFormat;
        const quality = state.exportQuality;

        for (let i = 0; i < state.imagesQueue.length; i++) {
            const queueItem = state.imagesQueue[i];
            loaderText.textContent = `Сохранение [${i + 1}/${state.imagesQueue.length}]: ${queueItem.name}`;
            
            // Render on background canvas
            renderWatermarkedCanvas(offlineCanvas, queueItem.imgObject);
            
            const origName = queueItem.name.substring(0, queueItem.name.lastIndexOf('.')) || queueItem.name;
            const newFilename = `${origName}_protected.${formatExt}`;
            
            // Get blob from canvas using Promise for cleaner async flow
            const blob = await new Promise(resolve => offlineCanvas.toBlob(resolve, formatMime, quality));
            
            // Write to file system
            const fileHandle = await directoryHandle.getFileHandle(newFilename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            
            queueItem.processed = true;
        }

        finishBatchProcessing();
        if (typeof showToast === 'function') showToast(`Успешно сохранено в папку!`, 'success');
        
    } catch (error) {
        state.isProcessing = false;
        elements.canvasLoader.style.display = 'none';
        
        // Handle AbortError (user cancelled picker) silently
        if (error.name !== 'AbortError') {
            console.error('Directory saving failed:', error);
            if (typeof showToast === 'function') showToast('Ошибка при сохранении в папку', 'warning');
        }
    }
}

/* ==========================================================================
   ENHANCED UX: TOAST NOTIFICATIONS & KEYBOARD SHORTCUTS
   ========================================================================== */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const iconPath = type === 'success' 
        ? '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />'
        : '<path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />';

    toast.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="toast-icon">
            ${iconPath}
        </svg>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Trigger reflow for animation
    void toast.offsetWidth;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

window.addEventListener('keydown', (e) => {
    // Prevent triggering shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (state.imagesQueue.length > 0) {
        // Arrow Keys for navigation
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault();
            if (state.activeIndex < state.imagesQueue.length - 1) selectQueueItem(state.activeIndex + 1);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault();
            if (state.activeIndex > 0) selectQueueItem(state.activeIndex - 1);
        }
        
        // Delete Key to remove active image
        else if ((e.key === 'Delete' || e.key === 'Backspace') && state.activeIndex !== -1) {
            e.preventDefault();
            removeQueueItem(e, state.activeIndex);
            showToast('Image removed from queue', 'info');
        }
        
        // Ctrl+S / Cmd+S for download
        else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (state.activeIndex !== -1) {
                downloadActiveImage();
            }
        }
    }
});
