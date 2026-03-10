(function () {
    'use strict';

    var lastValue = '';

    function triggerBrowserDownload(filePath) {
        if (!filePath) {
            return;
        }
        var normalizedPath = String(filePath).trim();
        if (!normalizedPath) {
            return;
        }
        var fileName = normalizedPath.split(/[\\/]/).pop() || 'download';
        var link = document.createElement('a');
        link.href = encodeURI('/file=' + normalizedPath.replace(/\\/g, '/'));
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        window.setTimeout(function () {
            link.remove();
        }, 0);
    }

    function bindBridge(element) {
        function clearValue() {
            element.value = '';
            element.dispatchEvent(new Event('input', { bubbles: true }));
        }

        function readValue() {
            var nextValue = element.value || '';
            if (!nextValue || nextValue === lastValue) {
                lastValue = nextValue;
                return;
            }
            lastValue = nextValue;
            triggerBrowserDownload(nextValue);
            window.setTimeout(clearValue, 0);
        }

        var observer = new MutationObserver(readValue);
        observer.observe(element, { attributes: true, childList: true, characterData: true });
        element.addEventListener('input', readValue);
        readValue();
    }

    function init() {
        var poll = window.setInterval(function () {
            var bridge = document.querySelector('#watermark_download_path_bridge textarea')
                || document.querySelector('#watermark_download_path_bridge input');
            if (!bridge) {
                return;
            }
            window.clearInterval(poll);
            bindBridge(bridge);
        }, 300);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
