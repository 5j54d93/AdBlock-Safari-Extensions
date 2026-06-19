/*******************************************************************************

    AdBlock

    Collapses first-party ad layout shells left behind after network blocking.

*/

(function adblockAdSlotCollapser() {

'use strict';

if ( self.adblockAdSlotCollapser === true ) { return; }
self.adblockAdSlotCollapser = true;

/******************************************************************************/

const COLLAPSED_ATTR = 'data-adblock-collapsed-slot';

const YAHOO_HOST_RE = /(^|\.)yahoo\.com$/i;
const YAHOO_MARKER_SELECTOR = [
    '.lead-ad-wrapper',
    '[id$="-AdWrapper-Proxy"]',
    '[id^="default"][id$="-sizer"]',
    '[id^="defaultdest"]',
].join(',');

const YAHOO_CSS = `
.lead-ad-wrapper {
    display: none !important;
    min-height: 0 !important;
    height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
}
`;

/******************************************************************************/

function insertStyle(css) {
    if ( typeof css !== 'string' || css.trim() === '' ) { return; }

    try {
        chrome.runtime.sendMessage({
            what: 'insertCSS',
            css,
        }).catch(( ) => {});
    } catch {
    }

    const append = ( ) => {
        const parent = document.head || document.documentElement;
        if ( parent === null ) { return false; }

        const style = document.createElement('style');
        style.textContent = css;
        parent.append(style);
        return true;
    };

    if ( append() ) { return; }
    document.addEventListener('DOMContentLoaded', append, { once: true });
}

function collapseElement(element) {
    if ( element instanceof Element === false ) { return; }
    if ( element.hasAttribute(COLLAPSED_ATTR) ) { return; }

    element.setAttribute(COLLAPSED_ATTR, '');
    element.style.setProperty('display', 'none', 'important');
    element.style.setProperty('min-height', '0', 'important');
    element.style.setProperty('height', '0', 'important');
    element.style.setProperty('margin', '0', 'important');
    element.style.setProperty('padding', '0', 'important');
    element.style.setProperty('overflow', 'hidden', 'important');
}

function yahooCollapseRoot(element) {
    return element.closest('.lead-ad-wrapper') ||
        element.closest('[id$="-AdWrapper-Proxy"]') ||
        element;
}

function collapseYahooSlots(root = document) {
    if ( root instanceof Element && root.matches(YAHOO_MARKER_SELECTOR) ) {
        collapseElement(yahooCollapseRoot(root));
    }

    const scope = root instanceof Document || root instanceof Element
        ? root
        : document;

    for ( const marker of scope.querySelectorAll(YAHOO_MARKER_SELECTOR) ) {
        collapseElement(yahooCollapseRoot(marker));
    }
}

function observeYahooSlots() {
    let pending = false;

    const schedule = ( ) => {
        if ( pending ) { return; }
        pending = true;
        requestAnimationFrame(( ) => {
            pending = false;
            collapseYahooSlots();
        });
    };

    const observer = new MutationObserver(mutations => {
        for ( const mutation of mutations ) {
            if ( mutation.type === 'childList' && mutation.addedNodes.length !== 0 ) {
                schedule();
                return;
            }
            if ( mutation.type === 'attributes' ) {
                schedule();
                return;
            }
        }
    });

    const target = document.documentElement || document;
    observer.observe(target, {
        attributeFilter: [ 'class', 'id' ],
        attributes: true,
        childList: true,
        subtree: true,
    });
}

/******************************************************************************/

if ( YAHOO_HOST_RE.test(document.location.hostname) ) {
    insertStyle(YAHOO_CSS);
    collapseYahooSlots();
    observeYahooSlots();
}

/******************************************************************************/

})();

void 0;
