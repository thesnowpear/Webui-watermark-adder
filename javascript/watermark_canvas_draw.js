(function () {
    'use strict';

    function getImagePxScale(state) {
        if (!state.imgEl || !state.imgEl.naturalWidth || !state.letterbox.renderW) {
            return 1;
        }
        return state.letterbox.renderW / state.imgEl.naturalWidth;
    }

    function getCanvasCenter(state, wm) {
        return {
            x: state.letterbox.offsetX + wm.x * state.letterbox.renderW,
            y: state.letterbox.offsetY + wm.y * state.letterbox.renderH,
        };
    }

    function getExplicitSize(state, wm, widthKey, heightKey) {
        var scale = getImagePxScale(state);
        if (!wm[widthKey] || !wm[heightKey]) {
            return null;
        }
        return {
            width: Math.max(2, wm[widthKey] * scale),
            height: Math.max(2, wm[heightKey] * scale),
        };
    }

    function getShapeSize(state, wm) {
        var explicitSize = getExplicitSize(state, wm, 'shape_w', 'shape_h');
        if (explicitSize) {
            return explicitSize;
        }
        var scale = getImagePxScale(state);
        var base = Math.max(2, (wm.size || 100) * scale);
        if (wm.shape === 'rectangle' || wm.shape === 'ellipse') {
            return { width: base * 1.6, height: base };
        }
        return { width: base, height: base };
    }

    function getImageSize(state, wm) {
        var explicitSize = getExplicitSize(state, wm, 'draw_w', 'draw_h');
        if (explicitSize) {
            return explicitSize;
        }
        var cached = state.imgCache[wm.path || ''];
        var scale = getImagePxScale(state);
        var size = Math.max(2, (wm.size || 100) * scale);
        if (!cached) {
            return { width: size, height: size };
        }
        var shortEdge = Math.min(cached.width, cached.height) || 1;
        var ratio = size / shortEdge;
        return {
            width: cached.width * ratio,
            height: cached.height * ratio,
        };
    }

    function getTextSize(ctx, state, wm) {
        var scale = getImagePxScale(state);
        var fontSize = Math.max(2, (wm.size || 100) * scale);
        var text = wm.text || '水印';
        ctx.save();
        ctx.font = fontSize + 'px Arial, sans-serif';
        var metrics = ctx.measureText(text);
        ctx.restore();
        var baseWidth = Math.max(10, metrics.width + 8);
        var baseHeight = Math.max(10, fontSize + 8);
        var explicitSize = getExplicitSize(state, wm, 'draw_w', 'draw_h');
        var width = explicitSize ? explicitSize.width : baseWidth;
        var height = explicitSize ? explicitSize.height : baseHeight;
        return {
            width: width,
            height: height,
            fontSize: fontSize,
            text: text,
            baseWidth: baseWidth,
            baseHeight: baseHeight,
            scaleX: width / baseWidth,
            scaleY: height / baseHeight,
        };
    }

    function rotatePoint(x, y, radians) {
        return {
            x: x * Math.cos(radians) - y * Math.sin(radians),
            y: x * Math.sin(radians) + y * Math.cos(radians),
        };
    }

    function midpoint(a, b) {
        return {
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
        };
    }

    function getHandleScale(state) {
        var base = Math.min(state.canvasLogicalWidth || 512, state.canvasLogicalHeight || 512);
        return Math.max(0.4, Math.min(1.8, base / 512));
    }

    function getWatermarkHandleScale(state, metrics) {
        var hs = getHandleScale(state);
        var wmSize = Math.min(metrics.width, metrics.height);
        if (wmSize > 0 && wmSize < 80) {
            hs = hs * Math.max(0.35, wmSize / 80);
        }
        return hs;
    }

    function getMetrics(ctx, state, wm) {
        var center = getCanvasCenter(state, wm);
        var width = 0;
        var height = 0;
        var textInfo = null;
        if (wm.type === 'text') {
            textInfo = getTextSize(ctx, state, wm);
            width = textInfo.width;
            height = textInfo.height;
        } else if (wm.type === 'image') {
            var imageSize = getImageSize(state, wm);
            width = imageSize.width;
            height = imageSize.height;
        } else if (wm.type === 'shape') {
            var shapeSize = getShapeSize(state, wm);
            width = shapeSize.width;
            height = shapeSize.height;
        }
        var radians = ((wm.rotation || 0) * Math.PI) / 180;
        var halfW = width / 2;
        var halfH = height / 2;
        var corners = [
            rotatePoint(-halfW, -halfH, radians),
            rotatePoint(halfW, -halfH, radians),
            rotatePoint(halfW, halfH, radians),
            rotatePoint(-halfW, halfH, radians),
        ].map(function (point) {
            return { x: point.x + center.x, y: point.y + center.y };
        });
        var topMid = midpoint(corners[0], corners[1]);
        var rightMid = midpoint(corners[1], corners[2]);
        var bottomMid = midpoint(corners[2], corners[3]);
        var leftMid = midpoint(corners[3], corners[0]);
        var hs = getHandleScale(state);
        var wmSize = Math.min(width, height);
        if (wmSize > 0 && wmSize < 80) {
            hs = hs * Math.max(0.35, wmSize / 80);
        }
        var outward = rotatePoint(0, -(Math.max(22 * hs, height / 2 + 24 * hs)), radians);
        var rotateHandle = {
            x: center.x + outward.x,
            y: center.y + outward.y,
        };
        return {
            center: center,
            width: width,
            height: height,
            halfW: halfW,
            halfH: halfH,
            rotation: radians,
            corners: corners,
            handles: {
                nw: corners[0],
                n: topMid,
                ne: corners[1],
                e: rightMid,
                se: corners[2],
                s: bottomMid,
                sw: corners[3],
                w: leftMid,
                rotate: rotateHandle,
            },
            rotateAnchor: topMid,
            textInfo: textInfo,
        };
    }

    function drawShapePath(ctx, shape, width, height) {
        ctx.beginPath();
        if (shape === 'circle' || shape === 'ellipse') {
            ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
        } else {
            ctx.rect(-width / 2, -height / 2, width, height);
        }
    }

    function createCanvas(width, height) {
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width));
        canvas.height = Math.max(1, Math.round(height));
        return canvas;
    }

    function createCanvasContext(width, height, pixelRatio) {
        var ratio = Math.max(1, pixelRatio || 1);
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        var ctx = canvas.getContext('2d');
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in ctx) {
            ctx.imageSmoothingQuality = 'high';
        }
        return { canvas: canvas, ctx: ctx, ratio: ratio, width: width, height: height };
    }

    function drawBaseImage(ctx, state) {
        if (!state.imgEl) {
            return false;
        }
        ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in ctx) {
            ctx.imageSmoothingQuality = 'high';
        }
        ctx.drawImage(state.imgEl, state.letterbox.offsetX, state.letterbox.offsetY, state.letterbox.renderW, state.letterbox.renderH);
        return true;
    }

    function drawMosaicImage(ctx, state, mosaicSize) {
        if (!state.imgEl) {
            return false;
        }
        var logicalWidth = state.canvasLogicalWidth || state.canvas.width;
        var logicalHeight = state.canvasLogicalHeight || state.canvas.height;
        var tempRef = createCanvasContext(logicalWidth, logicalHeight, state.canvasPixelRatio || 1);
        var temp = tempRef.canvas;
        var tempCtx = tempRef.ctx;
        var size = Math.max(2, Math.round(mosaicSize || 12));
        var smallW = Math.max(1, Math.round(state.letterbox.renderW / size));
        var smallH = Math.max(1, Math.round(state.letterbox.renderH / size));
        var tiny = createCanvas(smallW, smallH);
        var tinyCtx = tiny.getContext('2d');
        tinyCtx.drawImage(state.imgEl, 0, 0, smallW, smallH);
        tempCtx.imageSmoothingEnabled = false;
        tempCtx.drawImage(tiny, state.letterbox.offsetX, state.letterbox.offsetY, state.letterbox.renderW, state.letterbox.renderH);
        ctx.drawImage(temp, 0, 0, logicalWidth, logicalHeight);
        return true;
    }

    function getShapeMode(wm) {
        return wm.fill_mode || 'color';
    }

    function clampBounds(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function getShapeEffectPixelRatio(state) {
        return Math.max(1, state.canvasPixelRatio || 1);
    }

    function getShapeEffectBounds(state, metrics, feather, blurSize, mosaicSize) {
        var logicalWidth = state.canvasLogicalWidth || state.canvas.width;
        var logicalHeight = state.canvasLogicalHeight || state.canvas.height;
        var pad = Math.ceil(Math.max(8, feather * 2.5, blurSize * 2.5, mosaicSize * 1.5));
        var xs = metrics.corners.map(function (corner) { return corner.x; });
        var ys = metrics.corners.map(function (corner) { return corner.y; });
        var left = clampBounds(Math.floor(Math.min.apply(null, xs)) - pad, 0, logicalWidth);
        var top = clampBounds(Math.floor(Math.min.apply(null, ys)) - pad, 0, logicalHeight);
        var right = clampBounds(Math.ceil(Math.max.apply(null, xs)) + pad, 0, logicalWidth);
        var bottom = clampBounds(Math.ceil(Math.max.apply(null, ys)) + pad, 0, logicalHeight);
        return {
            left: left,
            top: top,
            width: Math.max(1, right - left),
            height: Math.max(1, bottom - top)
        };
    }

    function drawBaseImageRegion(ctx, state, bounds) {
        if (state.baseCanvas) {
            var sourceRatio = Math.max(1, state.canvasPixelRatio || 1);
            ctx.drawImage(
                state.baseCanvas,
                bounds.left * sourceRatio,
                bounds.top * sourceRatio,
                bounds.width * sourceRatio,
                bounds.height * sourceRatio,
                0,
                0,
                bounds.width,
                bounds.height
            );
            return true;
        }
        return false;
    }

    function drawMosaicRegion(ctx, state, bounds, mosaicSize) {
        if (!state.baseCanvas) {
            return false;
        }
        var sourceRatio = Math.max(1, state.canvasPixelRatio || 1);
        var size = Math.max(2, Math.round(mosaicSize || 12));
        var smallW = Math.max(1, Math.round(bounds.width / size));
        var smallH = Math.max(1, Math.round(bounds.height / size));
        var tiny = createCanvas(smallW, smallH);
        var tinyCtx = tiny.getContext('2d');
        tinyCtx.imageSmoothingEnabled = false;
        tinyCtx.drawImage(
            state.baseCanvas,
            bounds.left * sourceRatio,
            bounds.top * sourceRatio,
            bounds.width * sourceRatio,
            bounds.height * sourceRatio,
            0,
            0,
            smallW,
            smallH
        );
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tiny, 0, 0, bounds.width, bounds.height);
        return true;
    }

    function drawShapeEffect(ctx, state, wm, metrics, alpha) {
        var mode = getShapeMode(wm);
        var feather = Math.max(0, (wm.feather || 0) * getImagePxScale(state));
        var blurSize = Math.max(0.1, (wm.blur_size || 32) * getImagePxScale(state));
        var mosaicSize = Math.max(2, (wm.mosaic_size || 18) * getImagePxScale(state));
        var bounds = getShapeEffectBounds(state, metrics, feather, blurSize, mosaicSize);
        var effectRatio = getShapeEffectPixelRatio(state);
        var effectRef = createCanvasContext(bounds.width, bounds.height, effectRatio);
        var effectCanvas = effectRef.canvas;
        var effectCtx = effectRef.ctx;
        var maskRef = createCanvasContext(bounds.width, bounds.height, effectRatio);
        var maskCanvas = maskRef.canvas;
        var maskCtx = maskRef.ctx;

        if (mode === 'blur') {
            effectCtx.filter = 'blur(' + (blurSize * effectRatio).toFixed(1) + 'px)';
            if (!drawBaseImageRegion(effectCtx, state, bounds)) {
                effectCtx.fillStyle = 'rgba(255,255,255,0.35)';
                effectCtx.fillRect(0, 0, bounds.width, bounds.height);
            }
            effectCtx.filter = 'none';
        } else if (mode === 'mosaic') {
            if (!drawMosaicRegion(effectCtx, state, bounds, mosaicSize)) {
                effectCtx.fillStyle = 'rgba(255,255,255,0.35)';
                effectCtx.fillRect(0, 0, bounds.width, bounds.height);
            }
        } else {
            effectCtx.fillStyle = wm.color || '#FFFFFF';
            effectCtx.fillRect(0, 0, bounds.width, bounds.height);
        }

        var maskWidth = metrics.width;
        var maskHeight = metrics.height;
        if (feather > 0) {
            maskWidth = Math.max(2, metrics.width - feather * 2);
            maskHeight = Math.max(2, metrics.height - feather * 2);
        }

        maskCtx.save();
        maskCtx.translate(metrics.center.x - bounds.left, metrics.center.y - bounds.top);
        maskCtx.rotate(metrics.rotation);
        if (feather > 0) {
            var scaledFeather = feather * effectRatio;
            maskCtx.filter = 'blur(' + scaledFeather.toFixed(1) + 'px)';
        }
        maskCtx.fillStyle = 'rgba(255,255,255,1)';
        drawShapePath(maskCtx, wm.shape, maskWidth, maskHeight);
        maskCtx.fill();
        maskCtx.restore();
        maskCtx.filter = 'none';

        effectCtx.globalCompositeOperation = 'destination-in';
        effectCtx.drawImage(maskCanvas, 0, 0, bounds.width, bounds.height);
        effectCtx.globalCompositeOperation = 'source-over';

        ctx.save();
        ctx.globalAlpha = Math.max(0.05, alpha);
        ctx.drawImage(effectCanvas, bounds.left, bounds.top, bounds.width, bounds.height);
        ctx.restore();
    }

    function drawRotatedFrame(ctx, corners) {
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        ctx.lineTo(corners[1].x, corners[1].y);
        ctx.lineTo(corners[2].x, corners[2].y);
        ctx.lineTo(corners[3].x, corners[3].y);
        ctx.closePath();
        ctx.stroke();
    }

    function drawAlternatingShapeOutline(ctx, shape, width, height, lineWidth, dashPattern) {
        ctx.lineWidth = lineWidth;
        ctx.setLineDash(dashPattern || [6, 4]);
        ctx.strokeStyle = '#000000';
        ctx.lineDashOffset = 0;
        drawShapePath(ctx, shape, width, height);
        ctx.stroke();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineDashOffset = (dashPattern && dashPattern[0]) || 6;
        drawShapePath(ctx, shape, width, height);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
    }

    function drawShapeFeatherGuide(ctx, state, wm, metrics) {
        var featherPx = Math.max(0, (wm.feather || 0) * getImagePxScale(state));
        if (featherPx < 1) {
            return;
        }
        var inset = featherPx;
        var guideWidth = Math.max(2, metrics.width - inset * 2);
        var guideHeight = Math.max(2, metrics.height - inset * 2);
        if (guideWidth <= 2 || guideHeight <= 2) {
            return;
        }
        drawAlternatingShapeOutline(ctx, wm.shape, guideWidth, guideHeight, 0.9, [4, 4]);
    }

    function drawWatermark(ctx, state, wm, options) {
        options = options || {};
        var alpha = options.alpha == null ? wm.opacity || 1 : options.alpha;
        var metrics = getMetrics(ctx, state, wm);

        if (wm.type === 'shape') {
            drawShapeEffect(ctx, state, wm, metrics, alpha);
        } else {
            ctx.save();
            ctx.globalAlpha = Math.max(0.05, alpha);
            ctx.translate(metrics.center.x, metrics.center.y);
            ctx.rotate(metrics.rotation);

            if (wm.type === 'text') {
                ctx.scale(metrics.textInfo.scaleX || 1, metrics.textInfo.scaleY || 1);
                ctx.imageSmoothingEnabled = true;
                ctx.font = metrics.textInfo.fontSize + 'px Arial, sans-serif';
                ctx.fillStyle = wm.color || '#FFFFFF';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.strokeStyle = 'rgba(0,0,0,0.45)';
                ctx.lineWidth = Math.max(1, metrics.textInfo.fontSize / 20) / Math.max(metrics.textInfo.scaleX || 1, metrics.textInfo.scaleY || 1, 1);
                ctx.strokeText(metrics.textInfo.text, 0, 0);
                ctx.fillText(metrics.textInfo.text, 0, 0);
            } else if (wm.type === 'image') {
                var cached = state.imgCache[wm.path || ''];
                if (cached) {
                    ctx.imageSmoothingEnabled = true;
                    if ('imageSmoothingQuality' in ctx) {
                        ctx.imageSmoothingQuality = 'high';
                    }
                    ctx.drawImage(cached, -metrics.width / 2, -metrics.height / 2, metrics.width, metrics.height);
                } else {
                    ctx.strokeStyle = 'rgba(0,255,136,0.9)';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([6, 4]);
                    ctx.strokeRect(-metrics.width / 2, -metrics.height / 2, metrics.width, metrics.height);
                    ctx.setLineDash([]);
                }
            }
            ctx.restore();
        }

        if (options.previewOutline) {
            var hsP = getHandleScale(state);
            ctx.save();
            ctx.globalAlpha = 0.65;
            ctx.setLineDash([4 * hsP, 3 * hsP]);
            ctx.strokeStyle = '#00aaff';
            ctx.lineWidth = 1 * hsP;
            drawRotatedFrame(ctx, metrics.corners);
            ctx.setLineDash([]);
            ctx.restore();
        }
        return metrics;
    }

    function drawSelection(ctx, state, wm) {
        var metrics = getMetrics(ctx, state, wm);
        var shapeMode = wm.type === 'shape' ? getShapeMode(wm) : 'color';
        var hs = getWatermarkHandleScale(state, metrics);
        ctx.save();
        if (wm.type === 'shape' && (shapeMode === 'blur' || shapeMode === 'mosaic')) {
            ctx.translate(metrics.center.x, metrics.center.y);
            ctx.rotate(metrics.rotation);
            drawAlternatingShapeOutline(ctx, wm.shape, metrics.width, metrics.height, 1.1 * hs, [6 * hs, 4 * hs]);
            drawShapeFeatherGuide(ctx, state, wm, metrics);
        } else {
            ctx.strokeStyle = '#00aaff';
            ctx.fillStyle = '#ffffff';
            ctx.lineWidth = 1 * hs;
            ctx.setLineDash([6 * hs, 4 * hs]);
            drawRotatedFrame(ctx, metrics.corners);
            ctx.setLineDash([]);
        }
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = '#00aaff';
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = 0.9 * hs;
        ctx.beginPath();
        ctx.moveTo(metrics.rotateAnchor.x, metrics.rotateAnchor.y);
        ctx.lineTo(metrics.handles.rotate.x, metrics.handles.rotate.y);
        ctx.stroke();
        Object.keys(metrics.handles).forEach(function (key) {
            var handle = metrics.handles[key];
            ctx.beginPath();
            if (key === 'rotate') {
                ctx.arc(handle.x, handle.y, 5 * hs, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            } else {
                var s = 3 * hs;
                ctx.rect(handle.x - s, handle.y - s, s * 2, s * 2);
                ctx.fill();
                ctx.stroke();
            }
        });
        ctx.beginPath();
        ctx.arc(metrics.center.x, metrics.center.y, 2.2 * hs, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return metrics;
    }

    function drawShapeDraft(ctx, state) {
        var draft = state.shapeDraft;
        if (!draft) {
            return;
        }
        var centerX = (draft.startX + draft.endX) / 2;
        var centerY = (draft.startY + draft.endY) / 2;
        var width = Math.abs(draft.endX - draft.startX);
        var height = Math.abs(draft.endY - draft.startY);
        var mode = draft.fill_mode || 'color';
        if (width < 1 || height < 1) {
            return;
        }

        ctx.save();
        ctx.translate(centerX, centerY);
        if (mode === 'blur' || mode === 'mosaic') {
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 8]);
            ctx.strokeStyle = '#000000';
            ctx.lineDashOffset = 0;
            drawShapePath(ctx, draft.shape, width, height);
            ctx.stroke();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineDashOffset = 8;
            drawShapePath(ctx, draft.shape, width, height);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;
        } else {
            ctx.globalAlpha = Math.max(0.1, state.opacity || 0.5);
            ctx.fillStyle = draft.color || '#FFFFFF';
            drawShapePath(ctx, draft.shape, width, height);
            ctx.fill();
            ctx.globalAlpha = 0.95;
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#00aaff';
            drawShapePath(ctx, draft.shape, width, height);
            ctx.stroke();
        }
        ctx.restore();
    }

    window.WatermarkCanvasDraw = {
        getMetrics: getMetrics,
        getHandleScale: getHandleScale,
        getWatermarkHandleScale: getWatermarkHandleScale,
        drawWatermark: drawWatermark,
        drawSelection: drawSelection,
        drawShapeDraft: drawShapeDraft,
        getCanvasCenter: getCanvasCenter,
    };
})();
