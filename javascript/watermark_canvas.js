(function () {
    'use strict';

    var state = {
        canvas: null,
        ctx: null,
        baseCanvas: null,
        baseCtx: null,
        canvasPixelRatio: 1,
        canvasLogicalWidth: 0,
        canvasLogicalHeight: 0,
        editorEl: null,
        imgEl: null,
        stageEl: null,
        trackedImageToken: '',
        sourceImageEl: null,
        sourceImageVisibility: null,
        isHovering: false,
        mouseX: 0,
        mouseY: 0,
        selectedType: null,
        selectedData: {},
        watermarks: [],
        activeIndex: -1,
        size: 100,
        rotation: 0,
        opacity: 1,
        zoom: 1,
        panX: 0,
        panY: 0,
        canvasReady: false,
        imgCache: {},
        letterbox: { offsetX: 0, offsetY: 0, renderW: 0, renderH: 0 },
        dragMode: 'none',
        dragHandle: null,
        isDragging: false,
        hasDragged: false,
        dragStartX: 0,
        dragStartY: 0,
        dragStartClientX: 0,
        dragStartClientY: 0,
        dragStartPanX: 0,
        dragStartPanY: 0,
        dragStartWatermark: null,
        dragStartRotation: 0,
        dragRotationOffset: 0,
        rotationDragActive: false,
        rotationMoveHandler: null,
        rotationUpHandler: null,
        suppressSliderWatermarkSync: false,
        suppressEditorControlSync: false,
        shapeDraft: null,
        pendingDeselect: false,
        pendingSyncAction: '',
        spacePressed: false,
        redrawQueued: false,
        redrawFrameId: 0,
    };

    var zoomSliderEl = null;
    var lastBridgeValue = '';
    var bridgeObserver = null;
    var bridgeInputEl = null;
    var realCtrlPressed = false;
    var initStarted = false;
    var previewResolutionTimer = 0;

    function init() {
        if (initStarted) {
            return;
        }
        initStarted = true;
        var poll = setInterval(function () {
            if (!window.WatermarkCanvasDraw || !window.WatermarkCanvasHit) {
                return;
            }
            var editorWrap = document.querySelector('#watermark_editor');
            if (!editorWrap) {
                return;
            }
            clearInterval(poll);
            state.editorEl = editorWrap;
            watchBridge();
            watchSliders();
            watchEditorControls();
            watchForImage();
            bindKeyboardState();
        }, 300);
    }

    function bindKeyboardState() {
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Control') {
                realCtrlPressed = true;
            }
            if (event.code === 'Space') {
                if (isTypingContext(event.target)) {
                    return;
                }
                state.spacePressed = true;
                if (state.isHovering || state.isDragging || event.target === state.canvas) {
                    event.preventDefault();
                }
            }
            if ((event.key === 'Delete' || event.key === 'Backspace') && !isTypingContext(event.target)) {
                if (deleteSelectedWatermark()) {
                    event.preventDefault();
                }
            }
        });

        document.addEventListener('keyup', function (event) {
            if (event.key === 'Control') {
                realCtrlPressed = false;
            }
            if (event.code === 'Space') {
                state.spacePressed = false;
            }
            updateCursor();
        });

        window.addEventListener('blur', function () {
            realCtrlPressed = false;
            state.spacePressed = false;
            state.isDragging = false;
            state.dragMode = 'none';
            stopDirectRotateDrag();
            updateCursor();
        });

        window.addEventListener('mouseup', function (event) {
            if (state.rotationDragActive) {
                return;
            }
            if (state.isDragging && event.target !== state.canvas) {
                onMouseUp(event);
            }
        });

        window.addEventListener('mousemove', function (event) {
            if (state.rotationDragActive) {
                return;
            }
            if (state.isDragging && event.target !== state.canvas) {
                onMouseMove(event);
            }
        });
    }

    function bindBridge(element) {
        if (!element || bridgeInputEl === element) {
            return;
        }
        if (bridgeObserver) {
            bridgeObserver.disconnect();
        }
        bridgeInputEl = element;
        bridgeObserver = new MutationObserver(function () { readBridge(element); });
        bridgeObserver.observe(element, { attributes: true, childList: true, characterData: true });
        element.addEventListener('input', function () { readBridge(element); });
        readBridge(element);
    }

    function watchBridge() {
        setInterval(function () {
            var current = document.querySelector('#watermark_selected_bridge textarea');
            if (!current) {
                bridgeInputEl = null;
                return;
            }
            bindBridge(current);
            readBridge(current);
        }, 250);
    }

    function readBridge(element) {
        var value = element.value || '';
        if (!value || value === lastBridgeValue) {
            return;
        }
        lastBridgeValue = value;
        try {
            var data = JSON.parse(value);
            if (!data.type) {
                state.selectedType = null;
                state.selectedData = {};
                state.shapeDraft = null;
                stopDirectRotateDrag();
            } else {
                state.selectedType = data.type;
                state.selectedData = data;
                state.activeIndex = -1;
                state.shapeDraft = null;
                if (data.type === 'image' && data.path) {
                    preloadWatermarkImage(data.path);
                }
                if (data.opacity != null) {
                    state.opacity = parseFloat(data.opacity) || state.opacity;
                    updateSlider('#watermark_opacity', state.opacity);
                }
                if (data.type === 'shape') {
                    state.rotation = 0;
                    updateSlider('#watermark_rotation', 0);
                }
            }
            syncEditorTargetState();
            redraw();
            updateCursor();
        } catch (error) {
            console.warn('[Watermark] Bridge parse failed', error);
        }
    }

    function preloadWatermarkImage(path) {
        if (!path || state.imgCache[path]) {
            return;
        }
        var image = new window.Image();
        image.onload = function () {
            state.imgCache[path] = image;
            redraw();
        };
        image.onerror = function () {
            console.warn('[Watermark] Failed to load image', path);
        };
        image.src = '/file=' + path;
    }

    function pickSourceImage(editorWrap) {
        var candidates = Array.from(editorWrap.querySelectorAll('img')).filter(function (imgEl) {
            if (!imgEl || !imgEl.src || imgEl.src === '' || imgEl.src === 'data:,') {
                return false;
            }
            if (imgEl.closest('#watermark-editor-stage')) {
                return false;
            }
            return true;
        });
        if (!candidates.length) {
            return null;
        }
        candidates.sort(function (a, b) {
            var aRect = a.getBoundingClientRect();
            var bRect = b.getBoundingClientRect();
            return (bRect.width * bRect.height) - (aRect.width * aRect.height);
        });
        return candidates[0];
    }

    function getTrackedImageToken(imgEl) {
        if (!imgEl) {
            return '';
        }
        return [
            imgEl.currentSrc || imgEl.src || '',
            imgEl.naturalWidth || 0,
            imgEl.naturalHeight || 0
        ].join('|');
    }

    function waitForImageReady(imgEl, callback) {
        var attempts = 0;
        var maxAttempts = 40;
        var timer = null;
        function cleanup() {
            imgEl.removeEventListener('load', handleLoad);
            imgEl.removeEventListener('error', handleError);
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        }
        function finish() {
            cleanup();
            if (state.imgEl === imgEl) {
                requestAnimationFrame(callback);
            }
        }
        function check() {
            if (!imgEl || !imgEl.parentElement || state.imgEl !== imgEl) {
                cleanup();
                return;
            }
            if (imgEl.complete && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
                if (imgEl.decode) {
                    imgEl.decode().then(finish).catch(finish);
                } else {
                    finish();
                }
                return;
            }
            if (attempts >= maxAttempts) {
                cleanup();
                return;
            }
            attempts += 1;
            timer = setTimeout(check, attempts < 8 ? 80 : 180);
        }
        function handleLoad() {
            check();
        }
        function handleError() {
            cleanup();
        }
        imgEl.addEventListener('load', handleLoad);
        imgEl.addEventListener('error', handleError);
        check();
    }

    function watchForImage() {
        var editorWrap = state.editorEl;
        function trySetupCanvas() {
            var imgEl = pickSourceImage(editorWrap);
            if (!imgEl || !imgEl.src || imgEl.src === '' || imgEl.src === 'data:,') {
                state.imgEl = null;
                state.trackedImageToken = '';
                if (state.canvasReady || state.stageEl) {
                    removeCanvas();
                }
                return;
            }
            var token = getTrackedImageToken(imgEl);
            if (state.canvasReady && state.stageEl && state.imgEl === imgEl && state.trackedImageToken === token) {
                syncCanvasSize();
                return;
            }
            state.imgEl = imgEl;
            state.trackedImageToken = token;
            removeCanvas();
            waitForImageReady(imgEl, function () {
                if (state.imgEl !== imgEl || state.trackedImageToken !== token) {
                    return;
                }
                setupCanvas();
            });
        }
        var observer = new MutationObserver(function () { requestAnimationFrame(trySetupCanvas); });
        observer.observe(editorWrap, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style', 'class'] });
        setInterval(trySetupCanvas, 1200);
        trySetupCanvas();
    }

    function getDisplayImageElement() {
        return state.imgEl;
    }

    function hideSourceImage() {
        if (!state.imgEl) {
            return;
        }
        if (state.sourceImageEl !== state.imgEl) {
            state.sourceImageEl = state.imgEl;
            state.sourceImageVisibility = state.imgEl.style.visibility || '';
        }
        state.sourceImageEl.style.visibility = 'hidden';
    }

    function restoreSourceImage() {
        if (state.sourceImageEl) {
            state.sourceImageEl.style.visibility = state.sourceImageVisibility === null ? '' : state.sourceImageVisibility;
        }
        state.sourceImageEl = null;
        state.sourceImageVisibility = null;
    }

    function getImgLocalRect(imgEl, host) {
        var imgLeft = 0;
        var imgTop = 0;
        var el = imgEl;
        while (el && el !== host) {
            imgLeft += el.offsetLeft;
            imgTop += el.offsetTop;
            el = el.offsetParent;
        }
        return {
            left: imgLeft,
            top: imgTop,
            width: imgEl.offsetWidth,
            height: imgEl.offsetHeight
        };
    }

    function getPreviewDetailRatio(width, height) {
        var deviceRatio = Math.max(1, window.devicePixelRatio || 1);
        if (!state.imgEl || !width || !height) {
            return deviceRatio;
        }
        var naturalScale = Math.min(
            Math.max(1, (state.imgEl.naturalWidth || width) / Math.max(1, width)),
            Math.max(1, (state.imgEl.naturalHeight || height) / Math.max(1, height))
        );
        var maxPixels = 36000000;
        var zoomBoost = Math.max(1, Math.min(3, state.zoom || 1));
        var ratio = deviceRatio * Math.min(4, naturalScale) * zoomBoost;
        var scaledPixels = width * height * ratio * ratio;
        if (scaledPixels > maxPixels) {
            ratio = Math.max(deviceRatio, Math.sqrt(maxPixels / Math.max(1, width * height)));
        }
        return Math.max(deviceRatio, ratio);
    }

    function refreshPreviewResolution(force) {
        if (!state.canvas || !state.ctx || !state.baseCanvas || !state.baseCtx) {
            return;
        }
        var width = state.canvasLogicalWidth;
        var height = state.canvasLogicalHeight;
        if (!width || !height) {
            return;
        }
        var nextRatio = getPreviewDetailRatio(width, height);
        if (!force && Math.abs(nextRatio - state.canvasPixelRatio) < 0.05) {
            return;
        }
        configureCanvasResolution(width, height);
        renderBasePreview();
    }

    function queuePreviewResolutionRefresh(delay, force) {
        if (previewResolutionTimer) {
            window.clearTimeout(previewResolutionTimer);
            previewResolutionTimer = 0;
        }
        previewResolutionTimer = window.setTimeout(function () {
            previewResolutionTimer = 0;
            refreshPreviewResolution(false);
            redraw();
        }, Math.max(0, delay || 0));
    }

    function renderBasePreview() {
        if (!state.baseCanvas || !state.baseCtx || !state.imgEl) {
            return;
        }
        var logicalWidth = state.canvasLogicalWidth || state.baseCanvas.width;
        var logicalHeight = state.canvasLogicalHeight || state.baseCanvas.height;
        state.baseCtx.setTransform(state.canvasPixelRatio, 0, 0, state.canvasPixelRatio, 0, 0);
        state.baseCtx.clearRect(0, 0, logicalWidth, logicalHeight);
        state.baseCtx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in state.baseCtx) {
            state.baseCtx.imageSmoothingQuality = 'high';
        }
        state.baseCtx.drawImage(state.imgEl, state.letterbox.offsetX, state.letterbox.offsetY, state.letterbox.renderW, state.letterbox.renderH);
        hideSourceImage();
    }
    function getLetterboxInfo(imgEl) {
        var elemW = imgEl.offsetWidth;
        var elemH = imgEl.offsetHeight;
        var natW = imgEl.naturalWidth;
        var natH = imgEl.naturalHeight;
        if (!natW || !natH || !elemW || !elemH) {
            return { offsetX: 0, offsetY: 0, renderW: elemW, renderH: elemH };
        }
        if (window.getComputedStyle(imgEl).objectFit !== 'contain') {
            return { offsetX: 0, offsetY: 0, renderW: elemW, renderH: elemH };
        }
        var elemRatio = elemW / elemH;
        var imgRatio = natW / natH;
        if (Math.abs(elemRatio - imgRatio) / imgRatio < 0.02) {
            return { offsetX: 0, offsetY: 0, renderW: elemW, renderH: elemH };
        }
        if (imgRatio > elemRatio) {
            var renderH = elemW / imgRatio;
            return { offsetX: 0, offsetY: (elemH - renderH) / 2, renderW: elemW, renderH: renderH };
        }
        var renderW = elemH * imgRatio;
        return { offsetX: (elemW - renderW) / 2, offsetY: 0, renderW: renderW, renderH: elemH };
    }

    function setupCanvas() {
        var imgEl = state.imgEl;
        var host = state.editorEl;
        if (!imgEl || !host) {
            return;
        }
        removeCanvas();
        var imgRect = getImgLocalRect(imgEl, host);
        if (!imgRect.width || !imgRect.height) {
            return;
        }
        if (window.getComputedStyle(host).position === 'static') {
            host.style.position = 'relative';
        }
        var stage = document.createElement('div');
        stage.id = 'watermark-editor-stage';
        stage.style.cssText = 'position:absolute;left:' + imgRect.left + 'px;top:' + imgRect.top + 'px;width:' + imgRect.width + 'px;height:' + imgRect.height + 'px;z-index:100;pointer-events:none;transform-origin:0 0;background:transparent;will-change:transform;contain:layout paint style;backface-visibility:hidden;';
        var baseCanvas = document.createElement('canvas');
        baseCanvas.id = 'watermark-base-canvas';
        baseCanvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:0;pointer-events:none;background:transparent;will-change:transform;backface-visibility:hidden;';
        var canvas = document.createElement('canvas');
        canvas.id = 'watermark-overlay-canvas';
        canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:1;pointer-events:auto;cursor:crosshair;background:transparent;will-change:transform;backface-visibility:hidden;';
        stage.appendChild(baseCanvas);
        stage.appendChild(canvas);
        host.appendChild(stage);
        state.stageEl = stage;
        state.baseCanvas = baseCanvas;
        state.baseCtx = baseCanvas.getContext('2d');
        state.canvas = canvas;
        state.ctx = canvas.getContext('2d');
        state.letterbox = getLetterboxInfo(imgEl);
        configureCanvasResolution(imgRect.width, imgRect.height);
        state.canvasReady = true;
        resetZoomPan();
        createZoomSlider(host);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseleave', onMouseLeave);
        canvas.addEventListener('mouseenter', function () { state.isHovering = true; updateCursor(); scheduleRedraw(); });
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('dblclick', onDblClick);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('contextmenu', function (event) {
            event.preventDefault();
            var deselectBtn = document.querySelector('button:has-text("取消选择")');
            if (!deselectBtn) {
                var buttons = Array.from(document.querySelectorAll('button'));
                deselectBtn = buttons.find(function(btn) { return btn.textContent.trim() === '取消选择'; });
            }
            if (deselectBtn) {
                deselectBtn.click();
            }
        });
        if (state._resizeObserver) {
            state._resizeObserver.disconnect();
        }
        state._resizeObserver = new ResizeObserver(function () { syncCanvasSize(); });
        state._resizeObserver.observe(imgEl);
        renderBasePreview();
        redraw();
        updateCursor();
    }

    function removeCanvas() {
        removeZoomSlider();
        restoreSourceImage();
        if (state.redrawFrameId) {
            window.cancelAnimationFrame(state.redrawFrameId);
            state.redrawFrameId = 0;
        }
        state.redrawQueued = false;
        if (state.stageEl) {
            state.stageEl.remove();
        } else {
            var old = document.querySelector('#watermark-editor-stage');
            if (old) {
                old.remove();
            }
            var oldBaseCanvas = document.querySelector('#watermark-base-canvas');
            if (oldBaseCanvas) {
                oldBaseCanvas.remove();
            }
            var oldCanvas = document.querySelector('#watermark-overlay-canvas');
            if (oldCanvas) {
                oldCanvas.remove();
            }
        }
        if (state._resizeObserver) {
            state._resizeObserver.disconnect();
            state._resizeObserver = null;
        }
        state.stageEl = null;
        state.baseCanvas = null;
        state.baseCtx = null;
        state.canvas = null;
        state.ctx = null;
        state.canvasReady = false;
        state.canvasPixelRatio = 1;
        state.canvasLogicalWidth = 0;
        state.canvasLogicalHeight = 0;
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        state.dragMode = 'none';
        state.isDragging = false;
        state.shapeDraft = null;
        stopDirectRotateDrag();
        state.activeIndex = -1;
        syncEditorTargetState();
    }
    function configureCanvasResolution(width, height) {
        if (!state.canvas || !state.ctx || !state.baseCanvas || !state.baseCtx) {
            return;
        }
        var ratio = getPreviewDetailRatio(width, height);
        state.canvasPixelRatio = ratio;
        state.canvasLogicalWidth = Math.max(1, Math.round(width));
        state.canvasLogicalHeight = Math.max(1, Math.round(height));
        state.baseCanvas.style.width = state.canvasLogicalWidth + 'px';
        state.baseCanvas.style.height = state.canvasLogicalHeight + 'px';
        state.baseCanvas.width = Math.max(1, Math.round(state.canvasLogicalWidth * ratio));
        state.baseCanvas.height = Math.max(1, Math.round(state.canvasLogicalHeight * ratio));
        state.canvas.style.width = state.canvasLogicalWidth + 'px';
        state.canvas.style.height = state.canvasLogicalHeight + 'px';
        state.canvas.width = Math.max(1, Math.round(state.canvasLogicalWidth * ratio));
        state.canvas.height = Math.max(1, Math.round(state.canvasLogicalHeight * ratio));
        state.baseCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
        state.baseCtx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in state.baseCtx) {
            state.baseCtx.imageSmoothingQuality = 'high';
        }
        state.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        state.ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in state.ctx) {
            state.ctx.imageSmoothingQuality = 'high';
        }
    }

    function syncCanvasSize() {
        if (!state.canvas || !state.imgEl || !state.stageEl || !state.editorEl) {
            return;
        }
        var imgRect = getImgLocalRect(state.imgEl, state.editorEl);
        if (!imgRect.width || !imgRect.height) {
            return;
        }
        var width = Math.round(imgRect.width);
        var height = Math.round(imgRect.height);
        state.stageEl.style.left = imgRect.left + 'px';
        state.stageEl.style.top = imgRect.top + 'px';
        state.stageEl.style.width = width + 'px';
        state.stageEl.style.height = height + 'px';
        state.letterbox = getLetterboxInfo(state.imgEl);
        if (state.canvasLogicalWidth !== width || state.canvasLogicalHeight !== height) {
            configureCanvasResolution(width, height);
        }
        renderBasePreview();
        redraw();
    }

    function createZoomSlider(container) {
        removeZoomSlider();
        var host = container;
        if (!host) {
            return;
        }
        if (window.getComputedStyle(host).position === 'static') {
            host.style.position = 'relative';
        }
        var wrapper = document.createElement('div');
        wrapper.id = 'watermark-zoom-slider-wrap';
        wrapper.style.cssText = 'position:absolute;top:8px;right:8px;bottom:8px;z-index:140;display:flex;align-items:center;pointer-events:none;';
        var slider = document.createElement('input');
        slider.type = 'range';
        slider.id = 'watermark-zoom-slider';
        slider.min = '10';
        slider.max = '1000';
        slider.step = '1';
        slider.value = '100';
        slider.style.cssText = 'width:24px;height:100%;min-height:120px;pointer-events:auto;writing-mode:vertical-lr;direction:rtl;cursor:pointer;appearance:slider-vertical;-webkit-appearance:slider-vertical;margin:0;padding:0;opacity:0.75;background:rgba(255,255,255,0.18);border-radius:999px;backdrop-filter:blur(8px);';
        slider.addEventListener('input', function () {
            var newZoom = parseFloat(slider.value) / 100;
            if (isNaN(newZoom) || newZoom <= 0) {
                return;
            }
            var parent = state.canvas ? state.canvas.parentElement : null;
            if (parent && parent.parentElement) {
                var parentRect = parent.parentElement.getBoundingClientRect();
                var cx = parentRect.width / 2;
                var cy = parentRect.height / 2;
                var ratio = newZoom / state.zoom;
                state.panX = cx - (cx - state.panX) * ratio;
                state.panY = cy - (cy - state.panY) * ratio;
            }
                state.zoom = newZoom;
            applyZoomPan();
            queuePreviewResolutionRefresh(140, true);
        });
        slider.addEventListener('change', function () {
            queuePreviewResolutionRefresh(0, true);
        });
        wrapper.appendChild(slider);
        host.appendChild(wrapper);
        zoomSliderEl = slider;
    }

    function removeZoomSlider() {
        if (zoomSliderEl) {
            zoomSliderEl.remove();
            zoomSliderEl = null;
        }
        var wrapper = document.querySelector('#watermark-zoom-slider-wrap');
        if (wrapper) {
            wrapper.remove();
        }
    }

    function syncZoomSlider() {
        if (zoomSliderEl) {
            zoomSliderEl.value = String(Math.round(state.zoom * 100));
        }
    }

    function applyZoomPan() {
        var container = state.stageEl;
        if (!container) {
            return;
        }
        var transformValue = 'translate3d(' + state.panX + 'px,' + state.panY + 'px,0) scale(' + state.zoom + ')';
        container.style.transformOrigin = '0 0';
        container.style.transform = transformValue;
        syncZoomSlider();
    }

    function resetZoomPan() {
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        if (state.stageEl) {
            state.stageEl.style.transform = '';
            state.stageEl.style.transformOrigin = '';
        }
        refreshPreviewResolution();
    }

    function getCanvasCoords(event) {
        if (!state.canvas) {
            return { x: 0, y: 0 };
        }
        var rect = state.canvas.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) * (state.canvasLogicalWidth || state.canvas.width) / rect.width,
            y: (event.clientY - rect.top) * (state.canvasLogicalHeight || state.canvas.height) / rect.height,
        };
    }

    function clampCanvasPoint(x, y) {
        if (!state.canvas) {
            return { x: x, y: y };
        }
        var width = state.canvasLogicalWidth || state.canvas.width;
        var height = state.canvasLogicalHeight || state.canvas.height;
        return {
            x: Math.max(0, Math.min(width, x)),
            y: Math.max(0, Math.min(height, y)),
        };
    }

    function isTypingContext(target) {
        if (!target) {
            return false;
        }
        var tag = (target.tagName || '').toUpperCase();
        return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
    }

    function clampRatio(value) {
        return Math.max(0, Math.min(1, value));
    }

    function canvasToRatio(canvasX, canvasY) {
        return {
            x: clampRatio((canvasX - state.letterbox.offsetX) / state.letterbox.renderW),
            y: clampRatio((canvasY - state.letterbox.offsetY) / state.letterbox.renderH),
        };
    }

    function imagePixelDelta(canvasDeltaX, canvasDeltaY) {
        if (!state.imgEl || !state.letterbox.renderW || !state.letterbox.renderH) {
            return { x: canvasDeltaX, y: canvasDeltaY };
        }
        return {
            x: canvasDeltaX * state.imgEl.naturalWidth / state.letterbox.renderW,
            y: canvasDeltaY * state.imgEl.naturalHeight / state.letterbox.renderH,
        };
    }
    function scaleExplicitDimensions(wm, scale) {
        if (!wm || !isFinite(scale) || scale <= 0 || Math.abs(scale - 1) < 0.0001) {
            return;
        }
        if (wm.shape_w && wm.shape_h) {
            wm.shape_w = Math.max(4, Math.abs(parseFloat(wm.shape_w) || 0) * scale);
            wm.shape_h = Math.max(4, Math.abs(parseFloat(wm.shape_h) || 0) * scale);
        }
        if (wm.draw_w && wm.draw_h) {
            wm.draw_w = Math.max(4, Math.abs(parseFloat(wm.draw_w) || 0) * scale);
            wm.draw_h = Math.max(4, Math.abs(parseFloat(wm.draw_h) || 0) * scale);
        }
    }

    function emitTextareaValue(selector, value) {
        var element = document.querySelector(selector + ' textarea');
        if (!element) {
            return;
        }
        var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function emitAddWatermark(payload) {
        emitTextareaValue('#watermark_click_coords', JSON.stringify(payload));
    }

    function emitEditEvent(payload) {
        emitTextareaValue('#watermark_edit_bridge', JSON.stringify(payload));
    }

    function syncActiveWatermark(action) {
        if (state.activeIndex < 0 || state.activeIndex >= state.watermarks.length) {
            return;
        }
        emitEditEvent({ action: action || 'update_existing', index: state.activeIndex, watermark: state.watermarks[state.activeIndex] });
    }

    function queueActiveWatermarkSync(action) {
        state.pendingSyncAction = action || 'update_existing';
    }

    function flushPendingWatermarkSync() {
        if (!state.pendingSyncAction) {
            return;
        }
        syncActiveWatermark(state.pendingSyncAction);
        state.pendingSyncAction = '';
    }

    function scheduleRedraw() {
        if (state.redrawQueued) {
            return;
        }
        state.redrawQueued = true;
        state.redrawFrameId = window.requestAnimationFrame(function () {
            state.redrawQueued = false;
            state.redrawFrameId = 0;
            redraw();
        });
    }

    function watchSliders() {
        var poll = setInterval(function () {
            var sizeEl = document.querySelector('#watermark_size input[type="range"]') || document.querySelector('#watermark_size input[type="number"]');
            var rotEl = document.querySelector('#watermark_rotation input[type="range"]') || document.querySelector('#watermark_rotation input[type="number"]');
            var opacEl = document.querySelector('#watermark_opacity input[type="range"]') || document.querySelector('#watermark_opacity input[type="number"]');
            if (!sizeEl || !rotEl || !opacEl) {
                return;
            }
            clearInterval(poll);
            function onChange() {
                var nextSize = parseFloat(sizeEl.value) || 100;
                var nextRotation = parseFloat(rotEl.value) || 0;
                var nextOpacity = parseFloat(opacEl.value) || 1;
                state.size = nextSize;
                state.rotation = nextRotation;
                state.opacity = nextOpacity;
                if (state.suppressSliderWatermarkSync) {
                    return;
                }
                if (state.activeIndex >= 0 && !state.selectedType && !state.suppressSliderWatermarkSync) {
                    var wm = state.watermarks[state.activeIndex];
                    var previousSize = parseFloat(wm.size || state.size || 100) || 100;
                    scaleExplicitDimensions(wm, nextSize / previousSize);
                    wm.size = nextSize;
                    wm.rotation = nextRotation;
                    wm.opacity = nextOpacity;
                    syncActiveWatermark('update_existing');
                }
                redraw();
            }
            sizeEl.addEventListener('input', onChange);
            rotEl.addEventListener('input', onChange);
            opacEl.addEventListener('input', onChange);
            onChange();
        }, 300);
    }

    function updateSlider(selector, value) {
        var inputs = [
            document.querySelector(selector + ' input[type="range"]'),
            document.querySelector(selector + ' input[type="number"]'),
        ];
        inputs.forEach(function (element) {
            if (!element) {
                return;
            }
            var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(element, value);
            element.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    function updateSliderSilently(selector, value) {
        var inputs = [
            document.querySelector(selector + ' input[type="range"]'),
            document.querySelector(selector + ' input[type="number"]'),
        ];
        inputs.forEach(function (element) {
            if (!element) {
                return;
            }
            var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(element, value);
        });
    }

    function getTextLikeControl(selector) {
        return document.querySelector(selector + ' textarea')
            || document.querySelector(selector + ' input[type="color"]')
            || document.querySelector(selector + ' input[type="text"]')
            || document.querySelector(selector + ' input:not([type="range"]):not([type="number"])');
    }

    function setControlValue(selector, value) {
        var sliderControls = getSliderControls(selector);
        if (sliderControls.length) {
            sliderControls.forEach(function (element) {
                var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(element, value);
                element.dispatchEvent(new Event('input', { bubbles: true }));
            });
            return;
        }
        var element = getTextLikeControl(selector);
        if (!element) {
            return;
        }
        var prototype = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        var setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
        setter.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function getControlValue(selector, fallback) {
        var sliderControl = getPrimarySliderControl(selector);
        if (sliderControl && sliderControl.value != null && sliderControl.value !== '') {
            return sliderControl.value;
        }
        var element = getTextLikeControl(selector);
        if (!element || element.value == null || element.value === '') {
            return fallback;
        }
        return element.value;
    }

    function getNumericControlValue(selector, fallback) {
        var sliderControl = getPrimarySliderControl(selector);
        var rawValue = sliderControl ? sliderControl.value : getControlValue(selector, fallback);
        var value = parseFloat(rawValue);
        return isNaN(value) ? fallback : value;
    }

    function getSliderControls(selector) {
        return Array.from(document.querySelectorAll(selector + ' input[type="range"], ' + selector + ' input[type="number"]'));
    }

    function getPrimarySliderControl(selector) {
        var controls = getSliderControls(selector);
        if (!controls.length) {
            return null;
        }
        return controls[0].type === 'range' ? controls[0] : (controls[1] || controls[0]);
    }

    function bindInputElements(elements, handler) {
        elements.forEach(function (element) {
            element.addEventListener('input', handler);
        });
    }

    function setVisible(selector, visible) {
        var element = document.querySelector(selector);
        if (!element) {
            return;
        }
        element.style.display = visible ? '' : 'none';
    }

    function activateTabPanel(panelId) {
        var button = document.querySelector('[aria-controls="' + panelId + '"]');
        if (button && button.getAttribute('aria-selected') !== 'true') {
            button.click();
        }
    }

    function getShapeModeValue(selector, fallback) {
        return getControlValue(selector, fallback || 'color') || fallback || 'color';
    }

    function setShapeModeValue(mode) {
        mode = mode || 'color';
        setControlValue('#watermark_shape_mode_quick_value', mode);
        activateTabPanel('watermark_shape_mode_quick_' + mode + '_tab');
    }

    function getShapeTargetDefaults() {
        var target = null;
        if (state.activeIndex >= 0 && state.watermarks[state.activeIndex] && state.watermarks[state.activeIndex].type === 'shape') {
            target = state.watermarks[state.activeIndex];
        } else if (state.selectedType === 'shape') {
            target = state.selectedData;
        }
        return {
            fill_mode: target && target.fill_mode ? target.fill_mode : getShapeModeValue('#watermark_shape_mode_quick_value', 'color'),
            color: target && target.color ? target.color : getControlValue('#watermark_shape_color', '#FFFFFF'),
            blur_size: target && target.blur_size != null ? target.blur_size : getNumericControlValue('#watermark_shape_blur_quick', 32),
            mosaic_size: target && target.mosaic_size != null ? target.mosaic_size : getNumericControlValue('#watermark_shape_mosaic_quick', 18),
            feather: target && target.feather != null ? target.feather : getNumericControlValue('#watermark_shape_feather_editor', 8)
        };
    }

    function getEditorShapeMode() {
        return getShapeTargetDefaults().fill_mode || 'color';
    }

    function updateShapeEditorVisibility(mode, visible) {
        var currentMode = mode || 'color';
        setVisible('#watermark_shape_feather_editor', visible);
        setVisible('#watermark_shape_color_editor', visible && currentMode === 'color');
        setVisible('#watermark_shape_blur_editor', visible && currentMode === 'blur');
        setVisible('#watermark_shape_mosaic_editor', visible && currentMode === 'mosaic');
    }

    function showEditorPanel(type, shapeMode) {
        setVisible('#watermark_control_hint_empty', !type);
        setVisible('#watermark_control_hint_image', type === 'image');
        setVisible('#watermark_text_content_editor', type === 'text');
        updateShapeEditorVisibility(shapeMode || getEditorShapeMode(), type === 'shape');
    }

    function getShapeValues(source) {
        var defaults = getShapeTargetDefaults();
        var useQuick = source === 'quick';
        return {
            fill_mode: useQuick ? getShapeModeValue('#watermark_shape_mode_quick_value', defaults.fill_mode) : defaults.fill_mode,
            color: useQuick ? getControlValue('#watermark_shape_color', defaults.color) : getControlValue('#watermark_shape_color_editor', defaults.color),
            blur_size: useQuick ? getNumericControlValue('#watermark_shape_blur_quick', defaults.blur_size) : getNumericControlValue('#watermark_shape_blur_editor', defaults.blur_size),
            mosaic_size: useQuick ? getNumericControlValue('#watermark_shape_mosaic_quick', defaults.mosaic_size) : getNumericControlValue('#watermark_shape_mosaic_editor', defaults.mosaic_size),
            feather: getNumericControlValue('#watermark_shape_feather_editor', defaults.feather)
        };
    }

    function applyShapeValues(target, values) {
        target.fill_mode = values.fill_mode || 'color';
        target.color = values.color || '#FFFFFF';
        target.blur_size = values.blur_size == null ? 32 : values.blur_size;
        target.mosaic_size = values.mosaic_size == null ? 18 : values.mosaic_size;
        target.feather = values.feather == null ? 8 : values.feather;
    }

    function emitSelectedBridgeState() {
        if (!state.selectedType) {
            return;
        }
        state.selectedData.ts = Date.now();
        emitTextareaValue('#watermark_selected_bridge', JSON.stringify(state.selectedData));
    }

    function syncShapeControls(source) {
        if (state.suppressEditorControlSync) {
            return;
        }
        var values = getShapeValues(source === 'quick' ? 'quick' : 'editor');
        var hasPendingShapeSelection = state.selectedType === 'shape' && state.activeIndex < 0;
        var hasActiveShape = state.activeIndex >= 0 && !state.selectedType && state.watermarks[state.activeIndex] && state.watermarks[state.activeIndex].type === 'shape';
        state.suppressEditorControlSync = true;
        try {
            if (source === 'quick') {
                setShapeModeValue(values.fill_mode);
                setControlValue('#watermark_shape_color', values.color);
                setControlValue('#watermark_shape_blur_quick', values.blur_size);
                setControlValue('#watermark_shape_mosaic_quick', values.mosaic_size);
                if (hasPendingShapeSelection) {
                    setControlValue('#watermark_shape_color_editor', values.color);
                    setControlValue('#watermark_shape_blur_editor', values.blur_size);
                    setControlValue('#watermark_shape_mosaic_editor', values.mosaic_size);
                }
            } else {
                setControlValue('#watermark_shape_color_editor', values.color);
                setControlValue('#watermark_shape_blur_editor', values.blur_size);
                setControlValue('#watermark_shape_mosaic_editor', values.mosaic_size);
                if (hasPendingShapeSelection) {
                    setControlValue('#watermark_shape_color', values.color);
                    setControlValue('#watermark_shape_blur_quick', values.blur_size);
                    setControlValue('#watermark_shape_mosaic_quick', values.mosaic_size);
                }
            }
            setControlValue('#watermark_shape_feather_editor', values.feather);
        } finally {
            state.suppressEditorControlSync = false;
        }

        if (source === 'editor' && hasActiveShape) {
            applyShapeValues(state.watermarks[state.activeIndex], values);
            syncActiveWatermark('update_existing');
            syncEditorTargetState();
            redraw();
            return;
        }

        if (hasPendingShapeSelection) {
            applyShapeValues(state.selectedData, values);
            emitSelectedBridgeState();
            syncEditorTargetState();
            redraw();
            return;
        }

        syncEditorTargetState();
    }

    function syncTextControl() {
        if (state.suppressEditorControlSync) {
            return;
        }
        var value = getControlValue('#watermark_text_content_editor', '');
        if (state.activeIndex >= 0 && !state.selectedType && state.watermarks[state.activeIndex] && state.watermarks[state.activeIndex].type === 'text') {
            state.watermarks[state.activeIndex].text = value;
            syncActiveWatermark('update_existing');
            redraw();
            return;
        }
        if (state.selectedType === 'text') {
            state.selectedData.text = value;
            emitSelectedBridgeState();
            redraw();
        }
    }

    function setEditorFields(type, data) {
        state.suppressEditorControlSync = true;
        try {
            if (type === 'text') {
                setControlValue('#watermark_text_content_editor', data.text || '');
            }
            if (type === 'shape') {
                var values = {
                    fill_mode: data.fill_mode || 'color',
                    color: data.color || '#FFFFFF',
                    blur_size: data.blur_size == null ? 32 : data.blur_size,
                    mosaic_size: data.mosaic_size == null ? 18 : data.mosaic_size,
                    feather: data.feather == null ? 8 : data.feather
                };
                if (state.selectedType === 'shape' && state.activeIndex < 0) {
                    setShapeModeValue(values.fill_mode);
                    setControlValue('#watermark_shape_color', values.color);
                    setControlValue('#watermark_shape_blur_quick', values.blur_size);
                    setControlValue('#watermark_shape_mosaic_quick', values.mosaic_size);
                }
                setControlValue('#watermark_shape_color_editor', values.color);
                setControlValue('#watermark_shape_blur_editor', values.blur_size);
                setControlValue('#watermark_shape_mosaic_editor', values.mosaic_size);
                setControlValue('#watermark_shape_feather_editor', values.feather);
                updateShapeEditorVisibility(values.fill_mode, true);
            }
        } finally {
            state.suppressEditorControlSync = false;
        }
    }

    function syncEditorTargetState() {
        var target = null;
        if (state.activeIndex >= 0 && state.activeIndex < state.watermarks.length) {
            target = state.watermarks[state.activeIndex];
        } else if (state.selectedType) {
            target = state.selectedData;
        }
        showEditorPanel(target ? target.type : null, target && target.type === 'shape' ? (target.fill_mode || 'color') : getShapeModeValue('#watermark_shape_mode_quick_value', 'color'));
        if (target) {
            setEditorFields(target.type, target);
        }
    }

    function clearPendingSelection() {
        state.selectedType = null;
        state.selectedData = {};
        lastBridgeValue = '';
        emitTextareaValue('#watermark_selected_bridge', JSON.stringify({ type: null, ts: Date.now(), fromCanvas: true }));
        if (window.watermarkClearGallerySelectionVisual) {
            window.watermarkClearGallerySelectionVisual();
        }
    }

    function watchEditorControls() {
        var poll = setInterval(function () {
            var textEl = getTextLikeControl('#watermark_text_content_editor');
            var quickColorEl = getTextLikeControl('#watermark_shape_color');
            var editorColorEl = getTextLikeControl('#watermark_shape_color_editor');
            var quickBlurEls = getSliderControls('#watermark_shape_blur_quick');
            var quickMosaicEls = getSliderControls('#watermark_shape_mosaic_quick');
            var blurEls = getSliderControls('#watermark_shape_blur_editor');
            var mosaicEls = getSliderControls('#watermark_shape_mosaic_editor');
            var featherEls = getSliderControls('#watermark_shape_feather_editor');
            var quickModeValueEl = getTextLikeControl('#watermark_shape_mode_quick_value');
            var quickTabButtons = {
                color: document.querySelector('[aria-controls="watermark_shape_mode_quick_color_tab"]'),
                blur: document.querySelector('[aria-controls="watermark_shape_mode_quick_blur_tab"]'),
                mosaic: document.querySelector('[aria-controls="watermark_shape_mode_quick_mosaic_tab"]')
            };
            if (!textEl || !quickColorEl || !editorColorEl || !quickModeValueEl || !quickBlurEls.length || !quickMosaicEls.length || !blurEls.length || !mosaicEls.length || !featherEls.length) {
                return;
            }
            clearInterval(poll);
            textEl.addEventListener('input', syncTextControl);
            quickColorEl.addEventListener('input', function () { syncShapeControls('quick'); });
            editorColorEl.addEventListener('input', function () { syncShapeControls('editor'); });
            bindInputElements(quickBlurEls, function () { syncShapeControls('quick'); });
            bindInputElements(quickMosaicEls, function () { syncShapeControls('quick'); });
            bindInputElements(blurEls, function () { syncShapeControls('editor'); });
            bindInputElements(mosaicEls, function () { syncShapeControls('editor'); });
            bindInputElements(featherEls, function () { syncShapeControls('editor'); });
            quickModeValueEl.addEventListener('input', function () {
                syncShapeControls('quick');
            });
            Object.keys(quickTabButtons).forEach(function (mode) {
                if (quickTabButtons[mode]) {
                    quickTabButtons[mode].addEventListener('click', function () {
                        if (state.suppressEditorControlSync) {
                            return;
                        }
                        setShapeModeValue(mode);
                        if (state.selectedType === 'shape' && state.activeIndex < 0) {
                            window.setTimeout(function () {
                                syncShapeControls('quick');
                            }, 0);
                        }
                    });
                }
            });
            syncEditorTargetState();
        }, 300);
    }

    function updateSelectedSlidersFromWatermark(index) {
        if (index < 0 || index >= state.watermarks.length) {
            return;
        }
        var wm = state.watermarks[index];
        state.size = wm.size || 100;
        state.rotation = wm.rotation || 0;
        state.opacity = wm.opacity || 1;
        state.suppressSliderWatermarkSync = true;
        try {
            updateSliderSilently('#watermark_size', state.size);
            updateSliderSilently('#watermark_rotation', state.rotation);
            updateSliderSilently('#watermark_opacity', state.opacity);
        } finally {
            state.suppressSliderWatermarkSync = false;
        }
        if (!state.isDragging) {
            syncEditorTargetState();
        }
    }

    function getLocalPoint(wm, canvasX, canvasY) {
        var center = window.WatermarkCanvasDraw.getCanvasCenter(state, wm);
        var radians = ((wm.rotation || 0) * Math.PI) / 180;
        var dx = canvasX - center.x;
        var dy = canvasY - center.y;
        return {
            x: dx * Math.cos(-radians) - dy * Math.sin(-radians),
            y: dx * Math.sin(-radians) + dy * Math.cos(-radians),
        };
    }

    function cloneWatermark(wm) {
        return JSON.parse(JSON.stringify(wm || {}));
    }

    function normalizeRotation(rotation) {
        var value = rotation % 360;
        return value < 0 ? value + 360 : value;
    }

    function rotateLocalOffset(localX, localY, radians) {
        return {
            x: localX * Math.cos(radians) - localY * Math.sin(radians),
            y: localX * Math.sin(radians) + localY * Math.cos(radians),
        };
    }

    function signWithFallback(value, fallback) {
        if (value > 0) {
            return 1;
        }
        if (value < 0) {
            return -1;
        }
        return fallback < 0 ? -1 : 1;
    }

    function startPan(event) {
        state.dragMode = 'pan';
        state.dragStartClientX = event.clientX;
        state.dragStartClientY = event.clientY;
        state.dragStartPanX = state.panX;
        state.dragStartPanY = state.panY;
        state.pendingDeselect = false;
    }

    function stopDirectRotateDrag() {
        if (state.rotationMoveHandler) {
            window.removeEventListener('mousemove', state.rotationMoveHandler, true);
            state.rotationMoveHandler = null;
        }
        if (state.rotationUpHandler) {
            window.removeEventListener('mouseup', state.rotationUpHandler, true);
            state.rotationUpHandler = null;
        }
        state.rotationDragActive = false;
        state.dragRotationOffset = 0;
    }

    function startDirectRotateDrag() {
        stopDirectRotateDrag();
        state.rotationDragActive = true;
        state.rotationMoveHandler = function (event) {
            if (!state.canvas || state.activeIndex < 0) {
                return;
            }
            event.preventDefault();
            var coords = getCanvasCoords(event);
            state.mouseX = coords.x;
            state.mouseY = coords.y;
            state.hasDragged = true;
            rotateExisting(coords.x, coords.y);
            queueActiveWatermarkSync('existing_rotate');
            updateSelectedSlidersFromWatermark(state.activeIndex);
            scheduleRedraw();
            updateCursor();
        };
        state.rotationUpHandler = function () {
            stopDirectRotateDrag();
            state.isDragging = false;
            state.dragMode = 'none';
            state.dragHandle = null;
            state.dragStartWatermark = null;
            flushPendingWatermarkSync();
            queuePreviewResolutionRefresh(0, true);
            redraw();
            updateCursor();
        };
        window.addEventListener('mousemove', state.rotationMoveHandler, true);
        window.addEventListener('mouseup', state.rotationUpHandler, true);
    }

    function isCanvasEvent(event) {
        return !!(state.canvas && event && event.target === state.canvas);
    }

    function cursorForHandle(handle) {
        if (handle === 'n' || handle === 's') {
            return 'ns-resize';
        }
        if (handle === 'e' || handle === 'w') {
            return 'ew-resize';
        }
        if (handle === 'nw' || handle === 'se') {
            return 'nwse-resize';
        }
        if (handle === 'ne' || handle === 'sw') {
            return 'nesw-resize';
        }
        if (handle === 'rotate') {
            return 'grab';
        }
        return 'move';
    }

    function updateCursor() {
        if (!state.canvas) {
            return;
        }
        if (state.isDragging) {
            if (state.dragMode === 'pan' || state.dragMode === 'add-or-pan' || state.dragMode === 'move-existing' || state.dragMode === 'rotate-existing') {
                state.canvas.style.cursor = 'grabbing';
                return;
            }
            if (state.dragMode === 'resize-existing') {
                state.canvas.style.cursor = cursorForHandle(state.dragHandle);
                return;
            }
            state.canvas.style.cursor = 'crosshair';
            return;
        }
        if (state.spacePressed) {
            state.canvas.style.cursor = 'grab';
            return;
        }
        if (state.selectedType) {
            state.canvas.style.cursor = 'crosshair';
            return;
        }
        if (state.activeIndex >= 0 && state.activeIndex < state.watermarks.length) {
            var handle = window.WatermarkCanvasHit.hitHandle(state.ctx, state, state.watermarks[state.activeIndex], state.mouseX, state.mouseY);
            if (handle) {
                state.canvas.style.cursor = cursorForHandle(handle);
                return;
            }
        }
        var hoverIndex = window.WatermarkCanvasHit.findTopWatermark(state.ctx, state, state.mouseX, state.mouseY);
        state.canvas.style.cursor = hoverIndex >= 0 ? 'move' : 'default';
    }


    function onMouseDown(event) {
        if (!state.canvasReady || event.button !== 0) {
            return;
        }
        event.preventDefault();
        var coords = getCanvasCoords(event);
        var hitIndex = window.WatermarkCanvasHit.findTopWatermark(state.ctx, state, coords.x, coords.y);
        state.mouseX = coords.x;
        state.mouseY = coords.y;
        state.isDragging = true;
        state.hasDragged = false;
        state.dragStartX = coords.x;
        state.dragStartY = coords.y;
        state.dragStartClientX = event.clientX;
        state.dragStartClientY = event.clientY;
        state.dragStartPanX = state.panX;
        state.dragStartPanY = state.panY;
        state.dragStartWatermark = null;
        state.dragHandle = null;
        state.pendingDeselect = false;

        if (state.spacePressed) {
            startPan(event);
            updateCursor();
            return;
        }

        if (state.activeIndex >= 0 && state.activeIndex < state.watermarks.length) {
            var activeHandle = window.WatermarkCanvasHit.hitHandle(state.ctx, state, state.watermarks[state.activeIndex], coords.x, coords.y);
            if (activeHandle) {
                state.dragHandle = activeHandle;
                state.dragStartWatermark = cloneWatermark(state.watermarks[state.activeIndex]);
                if (activeHandle === 'rotate') {
                    state.dragStartRotation = state.dragStartWatermark.rotation || 0;
                    state.dragMode = 'rotate-existing';
                                startDirectRotateDrag();
                    state.dragRotationOffset = normalizeRotation(state.dragStartRotation - getPointerRotation(state.dragStartWatermark, coords.x, coords.y));
                } else {
                    state.dragMode = 'resize-existing';
                            }
                updateCursor();
                return;
            }
        }

        if (hitIndex >= 0) {
            if (state.selectedType) {
                clearPendingSelection();
            }
            state.activeIndex = hitIndex;
            state.dragStartWatermark = cloneWatermark(state.watermarks[hitIndex]);
            state.dragMode = 'move-existing';
                updateSelectedSlidersFromWatermark(hitIndex);
            syncEditorTargetState();
            redraw();
            updateCursor();
            return;
        }

        if (state.selectedType === 'shape') {
            state.dragMode = 'shape-create';
                var start = clampCanvasPoint(coords.x, coords.y);
            state.shapeDraft = {
                type: 'shape',
                shape: state.selectedData.shape || 'rectangle',
                color: state.selectedData.color || '#FFFFFF',
                fill_mode: state.selectedData.fill_mode || 'color',
                blur_size: state.selectedData.blur_size || 32,
                mosaic_size: state.selectedData.mosaic_size || 18,
                feather: state.selectedData.feather || 8,
                startX: start.x,
                startY: start.y,
                endX: start.x,
                endY: start.y,
            };
            redraw();
            return;
        }

        if (state.selectedType === 'image' || state.selectedType === 'text') {
            state.dragMode = 'add-or-pan';
            updateCursor();
            return;
        }

        state.dragMode = 'pan-or-deselect';
        state.pendingDeselect = true;
        redraw();
        updateCursor();
    }
    function onMouseMove(event) {
        if (state.rotationDragActive) {
            return;
        }
        if (!state.canvas) {
            return;
        }
        if (!state.isDragging && !isCanvasEvent(event)) {
            return;
        }
        var coords = getCanvasCoords(event);
        state.mouseX = coords.x;
        state.mouseY = coords.y;

        if (!state.isDragging) {
            updateCursor();
            scheduleRedraw();
            return;
        }

        var moveDxClient = event.clientX - state.dragStartClientX;
        var moveDyClient = event.clientY - state.dragStartClientY;
        var moveDistance = Math.sqrt(moveDxClient * moveDxClient + moveDyClient * moveDyClient);
        if (moveDistance > 3) {
            state.hasDragged = true;
        }

        if (state.dragMode === 'pan-or-deselect') {
            if (!state.hasDragged) {
                scheduleRedraw();
                updateCursor();
                return;
            }
            startPan(event);
        }

        if (state.dragMode === 'pan' || state.dragMode === 'add-or-pan') {
            if (state.dragMode === 'add-or-pan' && !state.hasDragged) {
                updateCursor();
                return;
            }
            state.panX = state.dragStartPanX + moveDxClient;
            state.panY = state.dragStartPanY + moveDyClient;
            applyZoomPan();
            updateCursor();
            return;
        }

        if (state.dragMode === 'shape-create') {
            updateShapeDraft(coords.x, coords.y);
            scheduleRedraw();
            return;
        }

        if (state.dragMode === 'move-existing') {
            var moved = cloneWatermark(state.dragStartWatermark);
            moved.x = clampRatio(moved.x + (coords.x - state.dragStartX) / state.letterbox.renderW);
            moved.y = clampRatio(moved.y + (coords.y - state.dragStartY) / state.letterbox.renderH);
            state.watermarks[state.activeIndex] = moved;
            queueActiveWatermarkSync('update_existing');
            scheduleRedraw();
            return;
        }

        if (state.dragMode === 'resize-existing') {
            resizeExisting(coords.x, coords.y, event.shiftKey);
            queueActiveWatermarkSync('existing_resize');
            updateSelectedSlidersFromWatermark(state.activeIndex);
            scheduleRedraw();
            updateCursor();
            return;
        }

        if (state.dragMode === 'rotate-existing') {
            rotateExisting(coords.x, coords.y);
            queueActiveWatermarkSync('existing_rotate');
            scheduleRedraw();
            updateCursor();
            return;
        }

        scheduleRedraw();
        updateCursor();
    }

    function updateShapeDraft(canvasX, canvasY) {
        if (!state.shapeDraft) {
            return;
        }
        var draft = state.shapeDraft;
        var point = clampCanvasPoint(canvasX, canvasY);
        draft.color = state.selectedData.color || draft.color || '#FFFFFF';
        if (draft.shape === 'square' || draft.shape === 'circle') {
            var dx = point.x - draft.startX;
            var dy = point.y - draft.startY;
            var side = Math.min(Math.abs(dx), Math.abs(dy));
            if (side < 1) {
                draft.endX = point.x;
                draft.endY = point.y;
                return;
            }
            var candidateEndX = draft.startX + side * signWithFallback(dx, 1);
            var candidateEndY = draft.startY + side * signWithFallback(dy, 1);
            var clampedEnd = clampCanvasPoint(candidateEndX, candidateEndY);
            if (clampedEnd.x !== candidateEndX || clampedEnd.y !== candidateEndY) {
                draft.endX = point.x;
                draft.endY = point.y;
            } else {
                draft.endX = candidateEndX;
                draft.endY = candidateEndY;
            }
        } else {
            draft.endX = point.x;
            draft.endY = point.y;
        }
    }

        function getHandleConfig(handle, halfW, halfH) {
        switch (handle) {
        case 'nw':
            return { anchorX: halfW, anchorY: halfH, dirX: -1, dirY: -1, isCorner: true };
        case 'ne':
            return { anchorX: -halfW, anchorY: halfH, dirX: 1, dirY: -1, isCorner: true };
        case 'se':
            return { anchorX: -halfW, anchorY: -halfH, dirX: 1, dirY: 1, isCorner: true };
        case 'sw':
            return { anchorX: halfW, anchorY: -halfH, dirX: -1, dirY: 1, isCorner: true };
        case 'n':
            return { anchorX: 0, anchorY: halfH, dirX: 0, dirY: -1, axis: 'y' };
        case 'e':
            return { anchorX: -halfW, anchorY: 0, dirX: 1, dirY: 0, axis: 'x' };
        case 's':
            return { anchorX: 0, anchorY: -halfH, dirX: 0, dirY: 1, axis: 'y' };
        case 'w':
            return { anchorX: halfW, anchorY: 0, dirX: -1, dirY: 0, axis: 'x' };
        default:
            return null;
        }
    }

    function computeFreeResizeBounds(handle, halfW, halfH, localX, localY, minSize) {
        var config = getHandleConfig(handle, halfW, halfH);
        if (!config) {
            return null;
        }
        var width = Math.max(minSize, halfW * 2);
        var height = Math.max(minSize, halfH * 2);
        var centerX = 0;
        var centerY = 0;
        if (config.isCorner) {
            width = Math.max(minSize, (localX - config.anchorX) * config.dirX);
            height = Math.max(minSize, (localY - config.anchorY) * config.dirY);
            centerX = config.anchorX + width * config.dirX / 2;
            centerY = config.anchorY + height * config.dirY / 2;
        } else if (config.axis === 'x') {
            width = Math.max(minSize, (localX - config.anchorX) * config.dirX);
            centerX = config.anchorX + width * config.dirX / 2;
        } else {
            height = Math.max(minSize, (localY - config.anchorY) * config.dirY);
            centerY = config.anchorY + height * config.dirY / 2;
        }
        return {
            width: width,
            height: height,
            centerX: centerX,
            centerY: centerY,
        };
    }

    function computeEdgeResizeBounds(handle, halfW, halfH, localX, localY, minSize, preserveAspect) {
        var config = getHandleConfig(handle, halfW, halfH);
        if (!config || config.isCorner) {
            return computeFreeResizeBounds(handle, halfW, halfH, localX, localY, minSize);
        }
        var originalWidth = Math.max(minSize, halfW * 2);
        var originalHeight = Math.max(minSize, halfH * 2);
        var width = originalWidth;
        var height = originalHeight;
        var centerX = 0;
        var centerY = 0;

        if (config.axis === 'x') {
            width = Math.max(minSize, (localX - config.anchorX) * config.dirX);
            centerX = config.anchorX + width * config.dirX / 2;
            if (preserveAspect) {
                var scaleX = width / originalWidth;
                height = Math.max(minSize, originalHeight * scaleX);
            }
        } else {
            height = Math.max(minSize, (localY - config.anchorY) * config.dirY);
            centerY = config.anchorY + height * config.dirY / 2;
            if (preserveAspect) {
                var scaleY = height / originalHeight;
                width = Math.max(minSize, originalWidth * scaleY);
            }
        }

        return {
            width: width,
            height: height,
            centerX: centerX,
            centerY: centerY,
        };
    }

    function computeCornerResizeBounds(handle, halfW, halfH, localX, localY, minSize, preserveAspect) {
        var config = getHandleConfig(handle, halfW, halfH);
        var originalWidth = Math.max(minSize, halfW * 2);
        var originalHeight = Math.max(minSize, halfH * 2);
        var width = Math.max(minSize, (localX - config.anchorX) * config.dirX);
        var height = Math.max(minSize, (localY - config.anchorY) * config.dirY);
        if (preserveAspect) {
            var scale = Math.max(width / originalWidth, height / originalHeight);
            width = Math.max(minSize, originalWidth * scale);
            height = Math.max(minSize, originalHeight * scale);
        }
        return {
            width: width,
            height: height,
            centerX: config.anchorX + width * config.dirX / 2,
            centerY: config.anchorY + height * config.dirY / 2,
        };
    }

    function resizeExisting(canvasX, canvasY, freeAspect) {
        if (state.activeIndex < 0 || !state.dragStartWatermark) {
            return;
        }
        var original = state.dragStartWatermark;
        var metrics = window.WatermarkCanvasDraw.getMetrics(state.ctx, state, original);
        var local = getLocalPoint(original, canvasX, canvasY);
        var handle = state.dragHandle || '';
        var isCorner = handle.length === 2;
        var minCanvasSize = 12;
        var preserveAspect = original.type === 'shape' ? !!freeAspect : !freeAspect;
        var bounds = isCorner
            ? computeCornerResizeBounds(handle, metrics.halfW, metrics.halfH, local.x, local.y, minCanvasSize, preserveAspect)
            : computeEdgeResizeBounds(handle, metrics.halfW, metrics.halfH, local.x, local.y, minCanvasSize, preserveAspect);
        if (!bounds) {
            return;
        }
        var radians = ((original.rotation || 0) * Math.PI) / 180;
        var centerOffset = rotateLocalOffset(bounds.centerX, bounds.centerY, radians);
        var centerCanvas = {
            x: metrics.center.x + centerOffset.x,
            y: metrics.center.y + centerOffset.y,
        };
        var ratio = canvasToRatio(centerCanvas.x, centerCanvas.y);
        var updated = cloneWatermark(original);
        updated.x = ratio.x;
        updated.y = ratio.y;
        if (original.type === 'shape') {
            var shapePixels = imagePixelDelta(bounds.width, bounds.height);
            updated.shape_w = Math.max(4, Math.abs(shapePixels.x));
            updated.shape_h = Math.max(4, Math.abs(shapePixels.y));
            updated.size = Math.max(1, Math.min(updated.shape_w, updated.shape_h));
        } else {
            var pixels = imagePixelDelta(bounds.width, bounds.height);
            updated.draw_w = Math.max(4, Math.abs(pixels.x));
            updated.draw_h = Math.max(4, Math.abs(pixels.y));
            updated.size = Math.max(1, Math.min(updated.draw_w, updated.draw_h));
        }
        state.watermarks[state.activeIndex] = updated;
    }

    function rotateExisting(canvasX, canvasY) {
        if (state.activeIndex < 0 || !state.dragStartWatermark) {
            return;
        }
        var original = state.dragStartWatermark;
        var angle = normalizeRotation(getPointerRotation(original, canvasX, canvasY) + state.dragRotationOffset);
        if (realCtrlPressed) {
            angle = Math.round(angle / 15) * 15;
        }
        state.rotation = normalizeRotation(angle);
        state.watermarks[state.activeIndex].rotation = state.rotation;
        updateSliderSilently('#watermark_rotation', state.rotation);
    }
    function onMouseUp(event) {
        if (state.rotationDragActive) {
            return;
        }
        if (!state.canvas) {
            return;
        }
        if (!state.isDragging && !isCanvasEvent(event)) {
            return;
        }
        var coords = event ? getCanvasCoords(event) : { x: state.mouseX, y: state.mouseY };
        state.mouseX = coords.x;
        state.mouseY = coords.y;
        var lastMode = state.dragMode;
        var shouldAdd = lastMode === 'add-or-pan' && !state.hasDragged;
        var shouldCommitShape = lastMode === 'shape-create';
        var shouldDeselect = state.pendingDeselect && !state.hasDragged && !state.selectedType;

        state.isDragging = false;
        state.dragMode = 'none';
        state.dragHandle = null;
        state.dragStartWatermark = null;
        state.pendingDeselect = false;
        flushPendingWatermarkSync();
        queuePreviewResolutionRefresh(0, true);

        if (shouldAdd) {
            addSelectedWatermark(coords.x, coords.y);
        }
        if (shouldCommitShape) {
            commitShapeDraft();
        }
        if (shouldDeselect) {
            state.activeIndex = -1;
        }
        state.shapeDraft = null;
        syncEditorTargetState();
        redraw();
        updateCursor();
    }

    function addSelectedWatermark(canvasX, canvasY) {
        if (!state.selectedType) {
            return;
        }
        var ratio = canvasToRatio(canvasX, canvasY);
        var wm = {
            type: state.selectedType,
            x: ratio.x,
            y: ratio.y,
            size: state.size,
            rotation: state.rotation,
            opacity: state.opacity,
            img_width: state.imgEl ? state.imgEl.naturalWidth : 0,
            img_height: state.imgEl ? state.imgEl.naturalHeight : 0,
        };
        if (state.selectedType === 'image') {
            wm.path = state.selectedData.path || '';
            if (wm.path) {
                preloadWatermarkImage(wm.path);
            }
        } else if (state.selectedType === 'text') {
            wm.text = state.selectedData.text || 'watermark';
            wm.color = state.selectedData.color || '#FFFFFF';
            wm.font_size = state.selectedData.font_size || 48;
        } else if (state.selectedType === 'shape') {
            applyShapeValues(wm, state.selectedData);
        }
        state.watermarks.push(wm);
        var addPayload = { x: ratio.x, y: ratio.y, imgWidth: wm.img_width, imgHeight: wm.img_height };
        if (state.selectedType === 'shape') {
            addPayload.fillMode = wm.fill_mode || state.selectedData.fill_mode || 'color';
            addPayload.color = wm.color || state.selectedData.color || '#FFFFFF';
            addPayload.blurSize = wm.blur_size == null ? (state.selectedData.blur_size || 32) : wm.blur_size;
            addPayload.mosaicSize = wm.mosaic_size == null ? (state.selectedData.mosaic_size || 18) : wm.mosaic_size;
            addPayload.feather = wm.feather == null ? (state.selectedData.feather || 8) : wm.feather;
        }
        emitAddWatermark(addPayload);
    }

    function commitShapeDraft() {
        var draft = state.shapeDraft;
        if (!draft) {
            return;
        }
        var start = clampCanvasPoint(draft.startX, draft.startY);
        var end = clampCanvasPoint(draft.endX, draft.endY);
        var width = Math.abs(end.x - start.x);
        var height = Math.abs(end.y - start.y);
        if (width < 6 || height < 6) {
            return;
        }
        var centerX = (start.x + end.x) / 2;
        var centerY = (start.y + end.y) / 2;
        var ratio = canvasToRatio(centerX, centerY);
        var shapeSize = imagePixelDelta(width, height);
        var shapeW = Math.max(4, Math.abs(shapeSize.x));
        var shapeH = Math.max(4, Math.abs(shapeSize.y));
        var shapeWatermark = {
            type: 'shape',
            shape: draft.shape,
            color: state.selectedData.color || draft.color || '#FFFFFF',
            x: ratio.x,
            y: ratio.y,
            size: Math.min(shapeW, shapeH),
            shape_w: shapeW,
            shape_h: shapeH,
            rotation: state.rotation,
            opacity: state.opacity,
            img_width: state.imgEl ? state.imgEl.naturalWidth : 0,
            img_height: state.imgEl ? state.imgEl.naturalHeight : 0,
        };
        applyShapeValues(shapeWatermark, state.selectedData);
        state.watermarks.push(shapeWatermark);
        emitAddWatermark({
            x: ratio.x,
            y: ratio.y,
            imgWidth: state.imgEl ? state.imgEl.naturalWidth : 0,
            imgHeight: state.imgEl ? state.imgEl.naturalHeight : 0,
            shapeW: shapeW,
            shapeH: shapeH,
            fillMode: shapeWatermark.fill_mode || 'color',
            color: shapeWatermark.color || '#FFFFFF',
            blurSize: shapeWatermark.blur_size == null ? 32 : shapeWatermark.blur_size,
            mosaicSize: shapeWatermark.mosaic_size == null ? 18 : shapeWatermark.mosaic_size,
            feather: shapeWatermark.feather == null ? 8 : shapeWatermark.feather
        });
    }

    function onMouseLeave() {
        if (!state.isDragging) {
            state.isHovering = false;
            redraw();
            updateCursor();
        }
    }

    function onDblClick(event) {
        event.preventDefault();
        resetZoomPan();
        applyZoomPan();
        queuePreviewResolutionRefresh(0, true);
        updateCursor();
    }

    function onWheel(event) {
        if (!state.canvas) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        var isPinchGesture = event.ctrlKey && (!realCtrlPressed || Math.abs(event.deltaY) < 50);
        var isRealCtrl = event.ctrlKey && !isPinchGesture;
        if (isRealCtrl) {
            state.size = Math.max(1, Math.min(2000, state.size + (event.deltaY > 0 ? -20 : 20)));
            updateSlider('#watermark_size', state.size);
            redraw();
            return;
        }
        if (event.shiftKey) {
            state.rotation = normalizeRotation(state.rotation + (event.deltaY > 0 ? -5 : 5));
            updateSlider('#watermark_rotation', state.rotation);
            redraw();
            return;
        }
        if (event.altKey) {
            state.opacity = Math.max(0.05, Math.min(1, +(state.opacity + (event.deltaY > 0 ? -0.05 : 0.05)).toFixed(2)));
            updateSlider('#watermark_opacity', state.opacity);
            redraw();
            return;
        }
        var parent = state.canvas.parentElement;
        if (!parent || !parent.parentElement) {
            return;
        }
        var rect = parent.parentElement.getBoundingClientRect();
        var mouseX = event.clientX - rect.left;
        var mouseY = event.clientY - rect.top;
        var factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
        var nextZoom = Math.max(0.1, Math.min(10, state.zoom * factor));
        var ratio = nextZoom / state.zoom;
        state.panX = mouseX - (mouseX - state.panX) * ratio;
        state.panY = mouseY - (mouseY - state.panY) * ratio;
        state.zoom = nextZoom;
        applyZoomPan();
        queuePreviewResolutionRefresh(140, true);
    }

        function getPointerRotation(watermark, canvasX, canvasY) {
        var center = window.WatermarkCanvasDraw.getCanvasCenter(state, watermark);
        var angle = Math.atan2(canvasY - center.y, canvasX - center.x) * 180 / Math.PI;
        return normalizeRotation(angle + 90);
    }
    function createPreviewWatermark() {
        if (!state.selectedType || state.selectedType === 'shape' || !state.isHovering || state.dragMode === 'pan' || state.dragMode === 'add-or-pan') {
            return null;
        }
        var ratio = canvasToRatio(state.mouseX, state.mouseY);
        var preview = {
            type: state.selectedType,
            x: ratio.x,
            y: ratio.y,
            size: state.size,
            rotation: state.rotation,
            opacity: Math.max(0.15, Math.min(0.8, state.opacity)),
            img_width: state.imgEl ? state.imgEl.naturalWidth : 0,
            img_height: state.imgEl ? state.imgEl.naturalHeight : 0,
        };
        if (state.selectedType === 'image') {
            preview.path = state.selectedData.path || '';
        } else {
            preview.text = state.selectedData.text || 'watermark';
            preview.color = state.selectedData.color || '#FFFFFF';
            preview.font_size = state.selectedData.font_size || 48;
        }
        return preview;
    }

    function redraw() {
        if (state.redrawFrameId) {
            window.cancelAnimationFrame(state.redrawFrameId);
            state.redrawFrameId = 0;
        }
        state.redrawQueued = false;
        if (!state.canvas || !state.ctx) {
            return;
        }
        var ctx = state.ctx;
        ctx.clearRect(0, 0, state.canvasLogicalWidth || state.canvas.width, state.canvasLogicalHeight || state.canvas.height);
        state.watermarks.forEach(function (wm) {
            window.WatermarkCanvasDraw.drawWatermark(ctx, state, wm);
        });
        var preview = createPreviewWatermark();
        if (preview) {
            window.WatermarkCanvasDraw.drawWatermark(ctx, state, preview, { alpha: preview.opacity, previewOutline: true });
        }
        if (state.shapeDraft) {
            window.WatermarkCanvasDraw.drawShapeDraft(ctx, state);
        }
        if (state.activeIndex >= 0 && !state.selectedType && state.activeIndex < state.watermarks.length) {
            window.WatermarkCanvasDraw.drawSelection(ctx, state, state.watermarks[state.activeIndex]);
        }
    }

    window.watermarkUndo = function () {
        if (state.watermarks.length) {
            state.watermarks.pop();
            if (state.activeIndex >= state.watermarks.length) {
                state.activeIndex = state.watermarks.length - 1;
            }
            syncEditorTargetState();
            redraw();
        }
    };

    function deleteSelectedWatermark() {
        if (state.activeIndex < 0 || state.activeIndex >= state.watermarks.length) {
            return false;
        }
        var removeIndex = state.activeIndex;
        state.watermarks.splice(removeIndex, 1);
        state.activeIndex = removeIndex < state.watermarks.length ? removeIndex : state.watermarks.length - 1;
        emitEditEvent({ action: 'delete_existing', index: removeIndex });
        syncEditorTargetState();
        redraw();
        updateCursor();
        return true;
    }

    window.watermarkDeleteSelected = deleteSelectedWatermark;

    window.watermarkResetBridgeValue = function () {
        lastBridgeValue = '';
    };

    window.watermarkClearAll = function () {
        state.watermarks = [];
        state.activeIndex = -1;
        state.shapeDraft = null;
        syncEditorTargetState();
        redraw();
    };

    window.watermarkRemoveCanvas = function () {
        removeCanvas();
    };

    if (window.onUiLoaded) {
        window.onUiLoaded(init);
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    if (window.onUiUpdate) {
        window.onUiUpdate(init);
    }
})();
