(function () {
    'use strict';

    function inverseRotate(pointX, pointY, centerX, centerY, radians) {
        var dx = pointX - centerX;
        var dy = pointY - centerY;
        return {
            x: dx * Math.cos(-radians) - dy * Math.sin(-radians),
            y: dx * Math.sin(-radians) + dy * Math.cos(-radians),
        };
    }

    function hitWatermark(ctx, state, wm, canvasX, canvasY) {
        var draw = window.WatermarkCanvasDraw;
        if (!draw) {
            return false;
        }
        var metrics = draw.getMetrics(ctx, state, wm);
        var local = inverseRotate(canvasX, canvasY, metrics.center.x, metrics.center.y, metrics.rotation);
        if (wm.type === 'shape' && (wm.shape === 'circle' || wm.shape === 'ellipse')) {
            var radiusX = Math.max(1, metrics.width / 2);
            var radiusY = Math.max(1, metrics.height / 2);
            var normalized = (local.x * local.x) / (radiusX * radiusX) + (local.y * local.y) / (radiusY * radiusY);
            return normalized <= 1;
        }
        return Math.abs(local.x) <= metrics.width / 2 && Math.abs(local.y) <= metrics.height / 2;
    }

    function findTopWatermark(ctx, state, canvasX, canvasY) {
        for (var index = state.watermarks.length - 1; index >= 0; index -= 1) {
            if (hitWatermark(ctx, state, state.watermarks[index], canvasX, canvasY)) {
                return index;
            }
        }
        return -1;
    }

    function hitHandle(ctx, state, wm, canvasX, canvasY) {
        var draw = window.WatermarkCanvasDraw;
        if (!draw) {
            return null;
        }
        var metrics = draw.getMetrics(ctx, state, wm);
        var hs = draw.getWatermarkHandleScale ? draw.getWatermarkHandleScale(state, metrics) : (draw.getHandleScale ? draw.getHandleScale(state) : 1);
        var keys = Object.keys(metrics.handles);
        for (var i = 0; i < keys.length; i += 1) {
            var key = keys[i];
            var handle = metrics.handles[key];
            var radius = (key === 'rotate' ? 8 : 5) * hs;
            var dx = canvasX - handle.x;
            var dy = canvasY - handle.y;
            if (dx * dx + dy * dy <= radius * radius) {
                return key;
            }
        }
        return null;
    }

    window.WatermarkCanvasHit = {
        hitWatermark: hitWatermark,
        findTopWatermark: findTopWatermark,
        hitHandle: hitHandle,
    };
})();
