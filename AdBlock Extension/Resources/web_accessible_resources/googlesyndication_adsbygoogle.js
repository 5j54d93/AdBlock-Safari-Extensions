/*******************************************************************************

    AdBlock

    Compatibility shim for redirected Google AdSense scripts.

*/

(function adblockAdsByGoogleShim() {

'use strict';

let adCount = 1;

self.adsbygoogle = self.adsbygoogle || [];
self.adsbygoogle.loaded = true;
self.adsbygoogle.push = function push() {
    processPlaceholders();
    return self.adsbygoogle.length;
};

function setupPlaceholder(node) {
    if ( node.dataset.adStatus || node.dataset.adsbygoogleStatus ) { return; }

    const frame = document.createElement('iframe');
    frame.id = `aswift_${adCount}`;
    frame.name = frame.id;
    frame.title = '';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.setProperty('border', '0', 'important');
    frame.style.setProperty('height', '0', 'important');
    frame.style.setProperty('width', '0', 'important');
    frame.src = 'data:text/html;charset=utf-8,<!doctype html><html><head><title></title></head><body></body></html>';
    adCount += 1;

    node.dataset.adsbygoogleStatus = 'loading';
    node.dataset.adStatus = 'loading';
    node.appendChild(frame);

    frame.addEventListener('load', () => {
        node.dataset.adsbygoogleStatus = 'done';
        node.dataset.adStatus = 'filled';
        frame.dataset.loadComplete = 'true';
    }, { once: true });
}

function processPlaceholders() {
    for ( const node of document.querySelectorAll('.adsbygoogle') ) {
        setupPlaceholder(node);
    }
}

processPlaceholders();

let scheduled = false;
const observer = new MutationObserver(() => {
    if ( scheduled ) { return; }
    scheduled = true;
    requestAnimationFrame(() => {
        scheduled = false;
        processPlaceholders();
    });
});

observer.observe(document.documentElement || document, {
    attributes: true,
    attributeFilter: [ 'class' ],
    childList: true,
    subtree: true,
});

setTimeout(() => observer.disconnect(), 20000);

})();
