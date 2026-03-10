(function () {
    'use strict';

    var galleryMeta = { images: [], texts: [] };
    var metaInputEl = null;
    var metaObserver = null;
    var shapeTypes = ['rectangle', 'square', 'ellipse', 'circle'];
    var shapeLabels = {
        rectangle: '\u957f\u65b9\u5f62',
        square: '\u6b63\u65b9\u5f62',
        ellipse: '\u692d\u5706\u5f62',
        circle: '\u5706\u5f62'
    };
    var manualSelection = null;

    function emitTextareaValue(selector, value) {
        var element = document.querySelector(selector + ' textarea');
        if (!element) {
            return;
        }
        var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function setTextControlValue(selector, value) {
        var element = document.querySelector(selector + ' textarea') || document.querySelector(selector + ' input');
        if (!element) {
            return;
        }
        var prototype = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        var setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
        setter.call(element, value || '');
        element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function getInputValue(selector, fallback) {
        var element = document.querySelector(selector + ' input[type="text"]')
            || document.querySelector(selector + ' textarea')
            || document.querySelector(selector + ' input[type="number"]')
            || document.querySelector(selector + ' input');
        if (!element || element.value == null || element.value === '') {
            return fallback;
        }
        return element.value;
    }
    function getNumericValue(selector, fallback) {
        var value = parseFloat(getInputValue(selector, fallback));
        return isNaN(value) ? fallback : value;
    }

    function getShapeSettings() {
        return {
            color: getInputValue('#watermark_shape_color', '#FFFFFF'),
            fill_mode: getInputValue('#watermark_shape_mode_quick_value', 'color'),
            blur_size: getNumericValue('#watermark_shape_blur_quick', 32),
            mosaic_size: getNumericValue('#watermark_shape_mosaic_quick', 18),
            feather: getNumericValue('#watermark_shape_feather_editor', 8)
        };
    }

    function updateStatus(text) {
        setTextControlValue('#watermark_status', text);
    }

    function galleryCount(rootId) {
        if (rootId === 'watermark_img_gallery') {
            return galleryMeta.images.length;
        }
        if (rootId === 'watermark_txt_gallery') {
            return galleryMeta.texts.length;
        }
        if (rootId === 'watermark_shape_gallery') {
            return shapeTypes.length;
        }
        return 0;
    }

    function getGalleryRoots() {
        return ['#watermark_img_gallery', '#watermark_txt_gallery', '#watermark_shape_gallery'];
    }

    function getCandidateItems(root) {
        if (!root) {
            return [];
        }
        var selectors = ['.thumbnail-item', '[data-testid="gallery-item"]', '[role="button"]', 'button'];
        for (var i = 0; i < selectors.length; i += 1) {
            var items = Array.from(root.querySelectorAll(selectors[i])).filter(function (element) {
                return element.offsetParent !== null;
            });
            if (items.length) {
                return items;
            }
        }
        return [];
    }

    function assignGalleryIndices() {
        getGalleryRoots().forEach(function (selector) {
            var root = document.querySelector(selector);
            if (!root) {
                return;
            }
            var expectedCount = galleryCount(root.id);
            var items = getCandidateItems(root);
            items.forEach(function (item, index) {
                if (index < expectedCount) {
                    item.dataset.watermarkGalleryIndex = String(index);
                    item.dataset.watermarkGalleryRoot = root.id;
                } else {
                    delete item.dataset.watermarkGalleryIndex;
                    delete item.dataset.watermarkGalleryRoot;
                }
            });
        });
    }

    function clearVisualSelection(rootSelector) {
        var root = document.querySelector(rootSelector);
        if (!root) {
            return;
        }
        root.querySelectorAll('[aria-selected="true"]').forEach(function (element) {
            element.setAttribute('aria-selected', 'false');
        });
        root.querySelectorAll('.selected').forEach(function (element) {
            element.classList.remove('selected');
        });
        root.querySelectorAll('[data-manual-selected="true"]').forEach(function (element) {
            element.dataset.manualSelected = 'false';
        });
        var orangeTokens = ['!ring-2', '!ring-orange-500', '!border-orange-500', 'ring-2', 'ring-orange-500', 'border-orange-500', 'border-2', 'selected'];
        root.querySelectorAll('*').forEach(function (element) {
            orangeTokens.forEach(function (token) {
                if (element.classList && element.classList.contains(token)) {
                    element.classList.remove(token);
                }
            });
            if (element.dataset && element.dataset.selected) {
                delete element.dataset.selected;
            }
        });
    }

    function clearInternalSelection(rootSelector) {
        var root = document.querySelector(rootSelector);
        if (!root) {
            return;
        }
        ['selectedIndex', 'selected_index', 'value'].forEach(function (key) {
            if (key in root) {
                try {
                    root[key] = null;
                } catch (error) {
                }
            }
        });
    }

    function clearAllGalleryState() {
        getGalleryRoots().forEach(function (selector) {
            clearInternalSelection(selector);
            clearVisualSelection(selector);
        });
        manualSelection = null;
        if (window.watermarkResetBridgeValue) {
            window.watermarkResetBridgeValue();
        }
    }

    function markSelection(rootId, index) {
        clearAllGalleryState();
        manualSelection = { rootId: rootId, index: index };
        applyManualSelection();
    }

    function applyManualSelection() {
        assignGalleryIndices();
        if (!manualSelection) {
            return;
        }
        var root = document.getElementById(manualSelection.rootId);
        if (!root) {
            return;
        }
        var item = root.querySelector('[data-watermark-gallery-index="' + manualSelection.index + '"]');
        if (!item) {
            return;
        }
        item.setAttribute('aria-selected', 'true');
        item.classList.add('selected');
        item.dataset.manualSelected = 'true';
    }

    function bindMetaInput(element) {
        if (!element || metaInputEl === element) {
            return;
        }
        if (metaObserver) {
            metaObserver.disconnect();
        }
        metaInputEl = element;
        metaObserver = new MutationObserver(function () {
            readMeta(element);
        });
        metaObserver.observe(element, { attributes: true, childList: true, characterData: true });
        element.addEventListener('input', function () {
            readMeta(element);
        });
        readMeta(element);
    }

    function readMeta(element) {
        var value = element && element.value ? element.value : '';
        if (!value) {
            galleryMeta = { images: [], texts: [] };
            assignGalleryIndices();
            applyManualSelection();
            return;
        }
        try {
            galleryMeta = JSON.parse(value);
        } catch (error) {
            galleryMeta = { images: [], texts: [] };
        }
        assignGalleryIndices();
        applyManualSelection();
    }

    function watchMeta() {
        setInterval(function () {
            var current = document.querySelector('#watermark_gallery_meta textarea');
            if (current) {
                bindMetaInput(current);
            }
            assignGalleryIndices();
            applyManualSelection();
        }, 250);
    }

    function emitSelection(payload) {
        if (window.watermarkResetBridgeValue) {
            window.watermarkResetBridgeValue();
        }
        emitTextareaValue('#watermark_selected_bridge', JSON.stringify(payload));
    }

    function selectionStatus(rootId, index, payload) {
        if (rootId === 'watermark_img_gallery') {
            return payload && payload.path ? '\u5df2\u9009\u62e9\u56fe\u7247\u6c34\u5370\uff1a' + ((galleryMeta.images[index] && galleryMeta.images[index].name) || '') : '';
        }
        if (rootId === 'watermark_txt_gallery') {
            return payload ? '\u5df2\u9009\u62e9\u6587\u5b57\u6c34\u5370\uff1a' + (payload.text || '') : '';
        }
        return payload ? '\u5df2\u9009\u62e9\u5f62\u72b6\u6c34\u5370\uff1a' + (shapeLabels[payload.shape] || payload.shape || '') : '';
    }

    function selectionPayload(rootId, index) {
        if (rootId === 'watermark_img_gallery') {
            var imageMeta = galleryMeta.images[index];
            if (imageMeta && imageMeta.path) {
                return { type: 'image', path: imageMeta.path, ts: Date.now(), manual: true };
            }
            return null;
        }
        if (rootId === 'watermark_txt_gallery') {
            var textMeta = galleryMeta.texts[index];
            if (textMeta) {
                return {
                    type: 'text',
                    text: textMeta.text || '',
                    font_size: textMeta.font_size || 48,
                    color: textMeta.color || '#FFFFFF',
                    opacity: textMeta.opacity == null ? 1 : textMeta.opacity,
                    ts: Date.now(),
                    manual: true
                };
            }
            return null;
        }
        var shapeType = shapeTypes[index];
        if (shapeType) {
            var settings = getShapeSettings();
            return {
                type: 'shape',
                shape: shapeType,
                color: settings.color,
                fill_mode: settings.fill_mode,
                blur_size: settings.blur_size,
                mosaic_size: settings.mosaic_size,
                feather: settings.feather,
                ts: Date.now(),
                manual: true
            };
        }
        return null;
    }

                function findIndexedItem(root, target) {
        var current = target;
        while (current && current !== root) {
            if (current.dataset && current.dataset.watermarkGalleryIndex != null) {
                return current;
            }
            current = current.parentElement;
        }
        return null;
    }

    function onGalleryClick(event) {
        var root = event.target.closest('#watermark_img_gallery, #watermark_txt_gallery, #watermark_shape_gallery');
        if (!root) {
            return;
        }
        assignGalleryIndices();
        var item = findIndexedItem(root, event.target);
        if (!item) {
            return;
        }
        var index = parseInt(item.dataset.watermarkGalleryIndex || '-1', 10);
        if (index < 0) {
            return;
        }
        var payload = selectionPayload(root.id, index);
        if (!payload) {
            return;
        }
        markSelection(root.id, index);
        updateStatus(selectionStatus(root.id, index, payload));
        emitSelection(payload);
        event.stopPropagation();
    }

    document.addEventListener('click', onGalleryClick, true);
    watchMeta();

    window.watermarkClearGallerySelectionVisual = function () {
        clearAllGalleryState();
        updateStatus('\u5df2\u53d6\u6d88\u5de6\u4fa7\u6c34\u5370\u9009\u62e9');
        emitSelection({ type: null, ts: Date.now(), manual: true, cleared: true });
        window.setTimeout(function () {
            clearAllGalleryState();
        }, 40);
        window.setTimeout(function () {
            clearAllGalleryState();
        }, 180);
    };
})();
