// 水印画布交互脚本
(function() {
    'use strict';

    // 全局状态
    let watermarkState = {
        selectedWatermark: null,
        watermarkSize: 100,
        watermarkRotation: 0,
        isPreviewMode: false,
        previewPosition: { x: 0, y: 0 },
        watermarks: [],  // 已添加的水印列表
        canvas: null,
        ctx: null,
        baseImage: null
    };

    // 初始化函数
    function initWatermarkCanvas() {
        console.log("Initializing Watermark Canvas...");

        // 等待 Gradio 加载完成
        const checkInterval = setInterval(() => {
            const editor = document.querySelector('#watermark_editor img');
            const sizeSlider = document.querySelector('#watermark_size input');
            const rotationSlider = document.querySelector('#watermark_rotation input');

            if (editor && sizeSlider && rotationSlider) {
                clearInterval(checkInterval);
                setupEventListeners(editor, sizeSlider, rotationSlider);
            }
        }, 500);
    }

    // 设置事件监听器
    function setupEventListeners(editor, sizeSlider, rotationSlider) {
        console.log("Setting up event listeners...");

        // 创建 Canvas 覆盖层
        const canvas = createCanvasOverlay(editor);
        watermarkState.canvas = canvas;
        watermarkState.ctx = canvas.getContext('2d');

        // 监听大小滑块变化
        sizeSlider.addEventListener('input', (e) => {
            watermarkState.watermarkSize = parseInt(e.target.value);
            redrawCanvas();
        });

        // 监听旋转滑块变化
        rotationSlider.addEventListener('input', (e) => {
            watermarkState.watermarkRotation = parseInt(e.target.value);
            redrawCanvas();
        });

        // 鼠标移动事件 - 水印跟随
        canvas.addEventListener('mousemove', handleMouseMove);

        // 鼠标点击事件 - 添加水印
        canvas.addEventListener('click', handleClick);

        // 鼠标滚轮事件 - 调整大小和旋转
        canvas.addEventListener('wheel', handleWheel);

        // 鼠标进入/离开事件
        canvas.addEventListener('mouseenter', () => {
            watermarkState.isPreviewMode = true;
        });

        canvas.addEventListener('mouseleave', () => {
            watermarkState.isPreviewMode = false;
            redrawCanvas();
        });

        // 监听图片变化
        const observer = new MutationObserver(() => {
            updateBaseImage(editor);
        });

        observer.observe(editor, {
            attributes: true,
            attributeFilter: ['src']
        });

        updateBaseImage(editor);
    }

    // 创建 Canvas 覆盖层
    function createCanvasOverlay(imageElement) {
        const container = imageElement.parentElement;
        const canvas = document.createElement('canvas');

        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'auto';
        canvas.style.cursor = 'crosshair';
        canvas.style.zIndex = '10';

        // 设置 Canvas 尺寸
        const rect = imageElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        container.style.position = 'relative';
        container.appendChild(canvas);

        return canvas;
    }

    // 更新基础图像
    function updateBaseImage(imageElement) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            watermarkState.baseImage = img;
            redrawCanvas();
        };
        img.src = imageElement.src;
    }

    // 处理鼠标移动
    function handleMouseMove(e) {
        if (!watermarkState.isPreviewMode) return;

        const rect = watermarkState.canvas.getBoundingClientRect();
        watermarkState.previewPosition = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        redrawCanvas();
    }

    // 处理点击事件 - 添加水印
    function handleClick(e) {
        if (!watermarkState.selectedWatermark) {
            console.log("No watermark selected");
            return;
        }

        const rect = watermarkState.canvas.getBoundingClientRect();
        const position = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        // 添加水印到列表
        watermarkState.watermarks.push({
            watermark: watermarkState.selectedWatermark,
            position: position,
            size: watermarkState.watermarkSize,
            rotation: watermarkState.watermarkRotation
        });

        redrawCanvas();
        console.log("Watermark added at", position);
    }

    // 处理滚轮事件
    function handleWheel(e) {
        e.preventDefault();

        if (e.ctrlKey) {
            // Ctrl + 滚轮：调整旋转
            const delta = e.deltaY > 0 ? -15 : 15;
            watermarkState.watermarkRotation = (watermarkState.watermarkRotation + delta + 360) % 360;

            // 更新滑块
            const rotationSlider = document.querySelector('#watermark_rotation input');
            if (rotationSlider) {
                rotationSlider.value = watermarkState.watermarkRotation;
                rotationSlider.dispatchEvent(new Event('input'));
            }
        } else {
            // 滚轮：调整大小
            const delta = e.deltaY > 0 ? -10 : 10;
            watermarkState.watermarkSize = Math.max(10, Math.min(500, watermarkState.watermarkSize + delta));

            // 更新滑块
            const sizeSlider = document.querySelector('#watermark_size input');
            if (sizeSlider) {
                sizeSlider.value = watermarkState.watermarkSize;
                sizeSlider.dispatchEvent(new Event('input'));
            }
        }

        redrawCanvas();
    }

    // 重绘 Canvas
    function redrawCanvas() {
        const ctx = watermarkState.ctx;
        const canvas = watermarkState.canvas;

        if (!ctx || !canvas) return;

        // 清空画布
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 绘制已添加的水印
        watermarkState.watermarks.forEach(item => {
            drawWatermark(ctx, item.watermark, item.position, item.size, item.rotation);
        });

        // 绘制预览水印（跟随鼠标）
        if (watermarkState.isPreviewMode && watermarkState.selectedWatermark) {
            ctx.save();
            ctx.globalAlpha = 0.5;  // 预览时半透明
            drawWatermark(
                ctx,
                watermarkState.selectedWatermark,
                watermarkState.previewPosition,
                watermarkState.watermarkSize,
                watermarkState.watermarkRotation
            );
            ctx.restore();
        }
    }

    // 绘制水印
    function drawWatermark(ctx, watermark, position, size, rotation) {
        ctx.save();

        // 移动到水印位置
        ctx.translate(position.x, position.y);

        // 旋转
        ctx.rotate((rotation * Math.PI) / 180);

        // 绘制水印（这里简化为矩形，实际应该绘制文字或图片）
        if (watermark.type === 'text') {
            ctx.font = `${size / 2}px Arial`;
            ctx.fillStyle = watermark.color || '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(watermark.text || '水印', 0, 0);
        } else {
            // 图片水印
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fillRect(-size / 2, -size / 2, size, size);
        }

        ctx.restore();
    }

    // 设置选中的水印
    window.setSelectedWatermark = function(watermark) {
        watermarkState.selectedWatermark = watermark;
        console.log("Watermark selected:", watermark);
    };

    // 撤销最后一个水印
    window.undoLastWatermark = function() {
        if (watermarkState.watermarks.length > 0) {
            watermarkState.watermarks.pop();
            redrawCanvas();
            return true;
        }
        return false;
    };

    // 清除所有水印
    window.clearAllWatermarks = function() {
        watermarkState.watermarks = [];
        redrawCanvas();
    };

    // 获取合成后的图片
    window.getWatermarkedImage = function() {
        if (!watermarkState.baseImage) return null;

        // 创建临时 Canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = watermarkState.baseImage.width;
        tempCanvas.height = watermarkState.baseImage.height;
        const tempCtx = tempCanvas.getContext('2d');

        // 绘制基础图像
        tempCtx.drawImage(watermarkState.baseImage, 0, 0);

        // 绘制所有水印
        watermarkState.watermarks.forEach(item => {
            drawWatermark(tempCtx, item.watermark, item.position, item.size, item.rotation);
        });

        return tempCanvas.toDataURL('image/png');
    };

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWatermarkCanvas);
    } else {
        initWatermarkCanvas();
    }

    console.log("Watermark Canvas script loaded");
})();
