// 水印画布交互脚本 - 通过 #watermark_selected_bridge 与 Python 端同步选中状态
(function () {
    'use strict';

    let state = {
        canvas: null,
        ctx: null,
        editorEl: null,
        imgEl: null,
        isHovering: false,
        mouseX: 0,
        mouseY: 0,
        // 从 bridge textbox 同步的选中水印信息
        selectedType: null,
        selectedData: {},
        // 前端已添加水印的预览列表 (仅用于 canvas 绘制)
        watermarks: [],
        size: 100,
        rotation: 0,
        canvasReady: false,
    };

    // ============ 初始化 ============
    function init() {
        console.log('[Watermark] Initializing...');

        const poll = setInterval(() => {
            const editorWrap = document.querySelector('#watermark_editor');
            if (!editorWrap) return;

            clearInterval(poll);
            state.editorEl = editorWrap;

            // 开始监听 bridge textbox（不依赖图片是否存在）
            watchBridge();
            // 开始监听滑块
            watchSliders();
            // 开始监听图片出现
            watchForImage();

            console.log('[Watermark] Watcher started');
        }, 500);
    }

    // ============ Bridge: 监听 Python→JS 的选中信息 ============
    function watchBridge() {
        const poll = setInterval(() => {
            const bridgeEl = document.querySelector('#watermark_selected_bridge textarea');
            if (!bridgeEl) return;

            clearInterval(poll);

            // 监听值变化
            const observer = new MutationObserver(() => readBridge(bridgeEl));
            observer.observe(bridgeEl, { attributes: true, childList: true, characterData: true });

            // 也监听 input 事件 (Gradio 更新值时触发)
            bridgeEl.addEventListener('input', () => readBridge(bridgeEl));

            // 轮询兜底（有些 Gradio 版本不触发 mutation）
            setInterval(() => readBridge(bridgeEl), 500);

            console.log('[Watermark] Bridge connected');
        }, 300);
    }

    let lastBridgeValue = '';

    function readBridge(el) {
        const val = el.value || '';
        if (val === lastBridgeValue || !val) return;
        lastBridgeValue = val;

        try {
            const data = JSON.parse(val);
            state.selectedType = data.type || null;
            state.selectedData = data;
            console.log('[Watermark] Selection updated from bridge:', data.type, data);
        } catch (e) {
            // ignore parse errors
        }
    }

    // ============ 监听图片出现并创建 Canvas ============
    function watchForImage() {
        const editorWrap = state.editorEl;

        function trySetupCanvas() {
            // 查找 Gradio Image 组件内部的 img 标签
            const imgEl = editorWrap.querySelector('img');
            if (!imgEl || !imgEl.src || imgEl.src === '') return;
            if (state.canvasReady && state.imgEl === imgEl) return;

            // 新的图片元素出现
            state.imgEl = imgEl;

            // 移除旧 canvas
            const oldCanvas = document.querySelector('#watermark-overlay-canvas');
            if (oldCanvas) oldCanvas.remove();

            state.canvasReady = false;

            // 等一帧让图片布局完成
            requestAnimationFrame(() => {
                setupCanvas();
            });
        }

        // 使用 MutationObserver 监听 DOM 变化
        const observer = new MutationObserver(() => {
            trySetupCanvas();
        });
        observer.observe(editorWrap, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

        // 也用轮询作为兜底
        setInterval(trySetupCanvas, 1000);

        // 立即尝试一次
        trySetupCanvas();
    }

    // ============ Canvas 覆盖层 ============
    function setupCanvas() {
        const imgEl = state.imgEl;
        if (!imgEl) return;

        // 找合适的容器：需要是图片的直接包裹容器
        const container = imgEl.closest('.image-container')
            || imgEl.closest('[data-testid="image"]')
            || imgEl.parentElement;
        if (!container) return;

        const canvas = document.createElement('canvas');
        canvas.id = 'watermark-overlay-canvas';

        // 获取图片相对于容器的位置
        const containerRect = container.getBoundingClientRect();
        const imgRect = imgEl.getBoundingClientRect();

        const offsetTop = imgRect.top - containerRect.top;
        const offsetLeft = imgRect.left - containerRect.left;

        canvas.style.cssText = `
            position: absolute;
            top: ${offsetTop}px;
            left: ${offsetLeft}px;
            width: ${imgRect.width}px;
            height: ${imgRect.height}px;
            z-index: 100;
            pointer-events: auto;
            cursor: crosshair;
        `;

        canvas.width = imgRect.width;
        canvas.height = imgRect.height;

        // 确保容器是 positioned
        const containerStyle = window.getComputedStyle(container);
        if (containerStyle.position === 'static') {
            container.style.position = 'relative';
        }

        container.appendChild(canvas);

        state.canvas = canvas;
        state.ctx = canvas.getContext('2d');
        state.canvasReady = true;

        // 事件
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseleave', onMouseLeave);
        canvas.addEventListener('mouseenter', () => { state.isHovering = true; });
        canvas.addEventListener('click', onClick);
        canvas.addEventListener('wheel', onWheel, { passive: false });

        // 窗口大小变化时重建
        if (state._resizeObserver) {
            state._resizeObserver.disconnect();
        }
        state._resizeObserver = new ResizeObserver(() => {
            syncCanvasSize();
        });
        state._resizeObserver.observe(imgEl);

        console.log('[Watermark] Canvas ready', imgRect.width, 'x', imgRect.height);
        redraw();
    }

    function syncCanvasSize() {
        if (!state.canvas || !state.imgEl) return;

        const container = state.canvas.parentElement;
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const imgRect = state.imgEl.getBoundingClientRect();

        if (imgRect.width === 0 || imgRect.height === 0) return;

        const offsetTop = imgRect.top - containerRect.top;
        const offsetLeft = imgRect.left - containerRect.left;

        state.canvas.style.top = offsetTop + 'px';
        state.canvas.style.left = offsetLeft + 'px';
        state.canvas.style.width = imgRect.width + 'px';
        state.canvas.style.height = imgRect.height + 'px';
        state.canvas.width = imgRect.width;
        state.canvas.height = imgRect.height;

        redraw();
    }

    // ============ 滑块监听 ============
    function watchSliders() {
        const poll = setInterval(() => {
            const sizeEl = document.querySelector('#watermark_size input[type="range"]')
                || document.querySelector('#watermark_size input[type="number"]');
            const rotEl = document.querySelector('#watermark_rotation input[type="range"]')
                || document.querySelector('#watermark_rotation input[type="number"]');

            if (sizeEl && rotEl) {
                clearInterval(poll);
                sizeEl.addEventListener('input', (e) => { state.size = parseFloat(e.target.value); redraw(); });
                rotEl.addEventListener('input', (e) => { state.rotation = parseFloat(e.target.value); redraw(); });
                state.size = parseFloat(sizeEl.value) || 100;
                state.rotation = parseFloat(rotEl.value) || 0;
                console.log('[Watermark] Sliders connected');
            }
        }, 500);
    }

    // ============ 鼠标事件 ============
    function onMouseMove(e) {
        state.isHovering = true;
        const rect = state.canvas.getBoundingClientRect();
        state.mouseX = e.clientX - rect.left;
        state.mouseY = e.clientY - rect.top;
        redraw();
    }

    function onMouseLeave() {
        state.isHovering = false;
        redraw();
    }

    function onClick(e) {
        if (!state.selectedType) {
            console.log('[Watermark] No watermark selected - please select from gallery first');
            return;
        }

        const rect = state.canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        // 转为比例 (0~1)
        const xRatio = cx / rect.width;
        const yRatio = cy / rect.height;

        // 添加到前端预览列表
        state.watermarks.push({
            type: state.selectedType,
            data: { ...state.selectedData },
            x: cx,
            y: cy,
            xRatio: xRatio,
            yRatio: yRatio,
            size: state.size,
            rotation: state.rotation,
        });

        redraw();

        // 传递坐标到 Python (通过隐藏 Textbox)
        const coordsEl = document.querySelector('#watermark_click_coords textarea');
        if (coordsEl) {
            // 每次必须设不同的值让 Gradio .change 事件触发
            const value = JSON.stringify({ x: xRatio, y: yRatio, ts: Date.now() });
            // 使用 nativeInputValueSetter 确保 Gradio 检测到变化
            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype, 'value'
            ).set;
            nativeSetter.call(coordsEl, value);
            coordsEl.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            console.warn('[Watermark] Cannot find #watermark_click_coords textarea');
        }

        console.log('[Watermark] Click at', xRatio.toFixed(3), yRatio.toFixed(3));
    }

    function onWheel(e) {
        e.preventDefault();
        if (e.ctrlKey) {
            const delta = e.deltaY > 0 ? -5 : 5;
            state.rotation = (state.rotation + delta + 360) % 360;
            updateSlider('#watermark_rotation', state.rotation);
        } else {
            const delta = e.deltaY > 0 ? -10 : 10;
            state.size = Math.max(10, Math.min(500, state.size + delta));
            updateSlider('#watermark_size', state.size);
        }
        redraw();
    }

    function updateSlider(selector, value) {
        const rangeEl = document.querySelector(selector + ' input[type="range"]');
        const numEl = document.querySelector(selector + ' input[type="number"]');
        [rangeEl, numEl].forEach(el => {
            if (el) {
                const nativeSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value'
                ).set;
                nativeSetter.call(el, value);
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    }

    // ============ 绘制 ============
    function redraw() {
        const ctx = state.ctx;
        const canvas = state.canvas;
        if (!ctx || !canvas) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 已添加的水印
        state.watermarks.forEach((wm) => {
            drawWatermarkPreview(ctx, wm, 0.8);
        });

        // 鼠标跟随预览
        if (state.isHovering && state.selectedType) {
            drawWatermarkPreview(ctx, {
                type: state.selectedType,
                data: state.selectedData,
                x: state.mouseX,
                y: state.mouseY,
                size: state.size,
                rotation: state.rotation,
            }, 0.4);
        }
    }

    function drawWatermarkPreview(ctx, wm, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(wm.x, wm.y);
        ctx.rotate((wm.rotation * Math.PI) / 180);

        if (wm.type === 'text') {
            const fontSize = Math.max(8, (wm.data.font_size || 48) * wm.size / 100 * 0.5);
            ctx.font = `bold ${fontSize}px Arial, sans-serif`;
            ctx.fillStyle = wm.data.color || '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // 描边使文字更易见
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.lineWidth = Math.max(1, fontSize / 15);
            const text = wm.data.text || '水印';
            ctx.strokeText(text, 0, 0);
            ctx.fillText(text, 0, 0);
        } else if (wm.type === 'image') {
            const s = Math.max(20, wm.size * 0.5);

            // 加载并绘制实际水印图片
            if (wm.data.path && !wm._imgAttempted) {
                wm._imgAttempted = true;
                const img = new window.Image();
                img.onload = () => {
                    wm._img = img;
                    redraw();
                };
                // WebUI 可以通过 /file= 路由访问本地文件
                img.src = '/file=' + wm.data.path;
            }

            if (wm._img) {
                const scale = wm.size / 100;
                const w = wm._img.width * scale * 0.4;
                const h = wm._img.height * scale * 0.4;
                ctx.drawImage(wm._img, -w / 2, -h / 2, w, h);
            } else {
                // 图片未加载时用占位框
                ctx.strokeStyle = '#00ff88';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.strokeRect(-s / 2, -s / 2, s, s);
                ctx.setLineDash([]);
                ctx.fillStyle = '#00ff88';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('[图片]', 0, 0);
            }
        }

        ctx.restore();
    }

    // ============ 撤销 / 清除 (JS 端预览) ============
    window.watermarkUndo = function () {
        if (state.watermarks.length > 0) {
            state.watermarks.pop();
            redraw();
        }
    };

    window.watermarkClearAll = function () {
        state.watermarks = [];
        redraw();
    };

    // ============ 获取上次生成的图片 ============
    window.watermarkFetchLastImage = function () {
        const selectors = [
            '#txt2img_gallery img[data-testid="detailed-image"]',
            '#img2img_gallery img[data-testid="detailed-image"]',
            '#txt2img_gallery .gallery-item img',
            '#img2img_gallery .gallery-item img',
            '#txt2img_gallery .thumbnails img',
            '#img2img_gallery .thumbnails img',
            '#txt2img_gallery .grid-wrap img',
            '#img2img_gallery .grid-wrap img',
            '#txt2img_gallery .preview img',
            '#img2img_gallery .preview img',
            '#txt2img_gallery img',
            '#img2img_gallery img',
        ];

        let imgSrc = null;
        for (const sel of selectors) {
            const imgs = document.querySelectorAll(sel);
            if (imgs.length > 0 && imgs[0].src) {
                imgSrc = imgs[0].src;
                break;
            }
        }

        if (!imgSrc) {
            alert('未找到生成的图片。请先在 txt2img 或 img2img 中生成图片。');
            return null;
        }

        if (imgSrc.startsWith('data:')) {
            return imgSrc;
        }

        return new Promise((resolve) => {
            const tmp = new window.Image();
            tmp.crossOrigin = 'anonymous';
            tmp.onload = function () {
                const c = document.createElement('canvas');
                c.width = tmp.naturalWidth;
                c.height = tmp.naturalHeight;
                c.getContext('2d').drawImage(tmp, 0, 0);
                resolve(c.toDataURL('image/png'));
            };
            tmp.onerror = function () {
                alert('获取图片失败，可能存在跨域限制。');
                resolve(null);
            };
            tmp.src = imgSrc;
        });
    };

    // ============ 启动 ============
    if (typeof onUiLoaded === 'function') {
        onUiLoaded(init);
    } else if (typeof onUiUpdate === 'function') {
        // onUiUpdate 会被多次调用，用标志防重入
        let started = false;
        onUiUpdate(() => {
            if (!started) {
                started = true;
                init();
            }
        });
    } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1500));
        if (document.readyState !== 'loading') {
            setTimeout(init, 1500);
        }
    }

    console.log('[Watermark] Script loaded');
})();
