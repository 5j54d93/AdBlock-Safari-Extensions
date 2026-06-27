/*******************************************************************************

    AdBlock

    Early cleanup for Google ad placeholders and offerwall surfaces that can be
    created before the full cosmetic-filter engine has finished loading.

*/

(function adblockEarlyAdCleanup() {

'use strict';

const AD_SELECTORS = [
    'ins.adsbygoogle',
    '.adsbygoogle:not(.adsbygoogle-noablate)',
    '.adsbygoogle-placeholder',
    '.google-auto-placed',
    '[id^="aswift_"]',
    '[id^="google_ads_iframe_"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="googleads.g.doubleclick.net"]',
    'iframe[src*="doubleclick.net"]',
];

const OFFERWALL_SELECTORS = [
    'iframe[name^="googlefc"]',
    'iframe[src*="fundingchoicesmessages.google.com"]',
    '.fc-dialog-container',
    '.fc-dialog-overlay',
    '.fc-consent-root',
    '.fc-whitelist-root',
    '[id^="googlefc"]',
    '[class*="fc-dialog"]',
    '[class*="fc-offerwall"]',
    '[class*="fc-reward"]',
];

const OFFERWALL_TEXT_PATTERN = new RegExp([
    '\\u89e3\\u9396\\u66f4\\u591a\\u5167\\u5bb9',
    '\\u89c0\\u770b\\u7c21\\u77ed\\u5ee3\\u544a',
    '\\u7e7c\\u7e8c\\u95b1\\u8b80',
    'unlock more content',
    'watch a short ad',
    'site-?wide access',
    'rewarded ad',
    'ad\\s*blocker',
    'adblocker',
    '\\u5ee3\\u544a\\u6514\\u622a\\u5668',
    '\\u7981\\u6b62\\u4f7f\\u7528\\u5ee3\\u544a\\u6514\\u622a\\u5668',
].join('|'), 'i');

const YOUTUBE_HOSTNAME_PATTERN = /(^|\.)youtube\.com$/;
const YOUTUBE_DOCUMENT_SHELLS = new Set([
    'ytd-app',
    'ytm-app',
]);
const HIDDEN_STYLE_PROPERTIES = [
    'display',
    'visibility',
    'pointer-events',
    'block-size',
    'inline-size',
    'min-block-size',
    'min-inline-size',
    'margin',
    'padding',
    'border',
    'overflow',
];
const YOUTUBE_PLAY_RESUME_MS = 3000;
const YOUTUBE_PLAY_RESUME_INTERVAL_MS = 250;

const OBSERVE_MS = 60000;
const startedAt = Date.now();

let observer;
let scheduled = false;
let cleanupTimer;
let pendingReportCount = 0;
let reportTimer;
let youtubePlaybackResumeTimer;
let youtubePlaybackResumeUntil = 0;

/******************************************************************************/

function isYouTubePage() {
    return YOUTUBE_HOSTNAME_PATTERN.test(self.location.hostname);
}

function isYouTubeDocumentShell(node) {
    return node instanceof Element &&
        isYouTubePage() &&
        YOUTUBE_DOCUMENT_SHELLS.has(node.localName);
}

function restoreEarlyHiddenElement(node) {
    if ( node instanceof HTMLElement === false ) { return; }
    if ( node.dataset.adblockEarlyHidden !== 'true' ) { return; }

    delete node.dataset.adblockEarlyHidden;
    for ( const property of HIDDEN_STYLE_PROPERTIES ) {
        node.style.removeProperty(property);
    }
}

function restoreDocumentShells() {
    if ( isYouTubePage() === false ) { return; }

    for ( const selector of YOUTUBE_DOCUMENT_SHELLS ) {
        for ( const node of document.querySelectorAll(
            `${selector}[data-adblock-early-hidden="true"]`
        ) ) {
            restoreEarlyHiddenElement(node);
        }
    }
}

function isPlayingMedia(node) {
    return node instanceof HTMLMediaElement &&
        node.paused === false &&
        node.ended === false &&
        node.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
}

function hasPlayingYouTubeMedia() {
    for ( const node of document.querySelectorAll('video,audio') ) {
        if ( isPlayingMedia(node) ) { return true; }
    }
    return false;
}

function attemptYouTubePlaybackResume() {
    if ( isYouTubePage() === false ) { return; }

    const player = document.getElementById('movie_player');
    try {
        if ( typeof player?.playVideo === 'function' ) {
            player.playVideo();
        }
    } catch {
    }

    for ( const node of document.querySelectorAll('video') ) {
        if ( node instanceof HTMLMediaElement === false ) { continue; }
        if ( node.paused === false || node.ended ) { continue; }
        if ( node.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ) { continue; }

        try {
            const promise = node.play();
            if ( promise?.catch instanceof Function ) {
                promise.catch(() => {});
            }
        } catch {
        }
    }
}

function stopYouTubePlaybackResume() {
    if ( youtubePlaybackResumeTimer === undefined ) { return; }
    self.clearInterval(youtubePlaybackResumeTimer);
    youtubePlaybackResumeTimer = undefined;
}

function tickYouTubePlaybackResume() {
    if ( hasPlayingYouTubeMedia() || Date.now() > youtubePlaybackResumeUntil ) {
        stopYouTubePlaybackResume();
        return;
    }
    attemptYouTubePlaybackResume();
}

function requestYouTubePlaybackResume() {
    if ( isYouTubePage() === false ) { return; }

    youtubePlaybackResumeUntil = Math.max(
        youtubePlaybackResumeUntil,
        Date.now() + YOUTUBE_PLAY_RESUME_MS
    );
    attemptYouTubePlaybackResume();

    if ( youtubePlaybackResumeTimer !== undefined ) { return; }
    youtubePlaybackResumeTimer = self.setInterval(
        tickYouTubePlaybackResume,
        YOUTUBE_PLAY_RESUME_INTERVAL_MS
    );
}

function reportActivity(count, label = '頁面廣告元素') {
    if ( count <= 0 ) { return; }
    pendingReportCount += count;
    if ( reportTimer !== undefined ) { return; }

    reportTimer = self.setTimeout(() => {
        const total = pendingReportCount;
        pendingReportCount = 0;
        reportTimer = undefined;
        try {
            chrome.runtime?.sendMessage({
                what: 'recordContentScriptActivity',
                source: 'early-ad-cleanup',
                label,
                hostname: self.location.hostname,
                count: total,
            });
        } catch {
        }
    }, 80);
}

/******************************************************************************/

function hideElement(node) {
    if ( node instanceof Element === false ) { return false; }
    if ( node.localName === 'html' || node.localName === 'body' ) { return false; }
    if ( isYouTubeDocumentShell(node) ) {
        restoreEarlyHiddenElement(node);
        return false;
    }
    if ( node.dataset.adblockEarlyHidden === 'true' ) { return false; }
    node.dataset.adblockEarlyHidden = 'true';

    const { style } = node;
    style.setProperty('display', 'none', 'important');
    style.setProperty('visibility', 'hidden', 'important');
    style.setProperty('pointer-events', 'none', 'important');
    style.setProperty('block-size', '0', 'important');
    style.setProperty('inline-size', '0', 'important');
    style.setProperty('min-block-size', '0', 'important');
    style.setProperty('min-inline-size', '0', 'important');
    style.setProperty('margin', '0', 'important');
    style.setProperty('padding', '0', 'important');
    style.setProperty('border', '0', 'important');
    style.setProperty('overflow', 'hidden', 'important');
    return true;
}

function hideSelectorMatches(selectors) {
    const matchedNodes = [];
    for ( const selector of selectors ) {
        for ( const node of document.querySelectorAll(selector) ) {
            if ( hideElement(node) ) {
                matchedNodes.push(node);
            }
        }
    }
    return matchedNodes;
}

function unlockPageInteraction() {
    for ( const node of [ document.documentElement, document.body ] ) {
        if ( node instanceof HTMLElement === false ) { continue; }
        if ( node.dataset.adblockEarlyHidden === 'true' ) { continue; }
        node.removeAttribute('inert');
        node.style.setProperty('overflow', 'auto', 'important');
        node.style.setProperty('pointer-events', 'auto', 'important');
    }

    if ( document.body instanceof HTMLElement === false ) { return; }
    for ( const node of document.body.children ) {
        if ( node instanceof HTMLElement === false ) { continue; }
        if ( node.dataset.adblockEarlyHidden === 'true' ) { continue; }
        node.removeAttribute('inert');
        node.style.setProperty('pointer-events', 'auto', 'important');
    }

    for ( const node of document.querySelectorAll('[inert]') ) {
        if ( node instanceof HTMLElement === false ) { continue; }
        if ( node.closest('[data-adblock-early-hidden="true"]') !== null ) { continue; }
        node.removeAttribute('inert');
    }
}

function parsedZIndex(node) {
    const value = Number.parseInt(self.getComputedStyle(node).zIndex, 10);
    return Number.isFinite(value) ? value : 0;
}

function elementRect(node) {
    try {
        return node.getBoundingClientRect();
    } catch {
        return { width: 0, height: 0 };
    }
}

function isOverlayCandidate(node) {
    if ( node instanceof Element === false ) { return false; }
    if ( isYouTubeDocumentShell(node) ) { return false; }
    if ( node.parentElement === document.body ) { return true; }
    if ( node.getAttribute('role') === 'dialog' ) { return true; }
    if ( node.getAttribute('aria-modal') === 'true' ) { return true; }

    const style = self.getComputedStyle(node);
    const zIndex = parsedZIndex(node);
    return style.position === 'fixed' || zIndex >= 1000;
}

function isViewportBlocker(node) {
    if ( node instanceof Element === false ) { return false; }
    if ( node.dataset.adblockEarlyHidden === 'true' ) { return false; }

    const style = self.getComputedStyle(node);
    if ( style.display === 'none' || style.visibility === 'hidden' ) { return false; }
    if ( style.position !== 'fixed' && style.position !== 'sticky' ) { return false; }

    const rect = elementRect(node);
    if ( rect.width < self.innerWidth * 0.7 ) { return false; }
    if ( rect.height < self.innerHeight * 0.7 ) { return false; }

    return parsedZIndex(node) >= 10 ||
        style.pointerEvents !== 'none' ||
        style.backgroundColor.startsWith('rgba');
}

function closestOverlayRoot(node) {
    let current = node instanceof Element ? node : undefined;
    let fallback = current;

    while (
        current instanceof Element &&
        current !== document.body &&
        current !== document.documentElement
    ) {
        if ( isViewportBlocker(current) ) { return current; }
        if ( isOverlayCandidate(current) ) {
            fallback = current;
        }
        current = current.parentElement;
    }

    return fallback;
}

function hideOverlayCluster(node) {
    let hiddenCount = 0;
    const root = closestOverlayRoot(node);
    if ( root instanceof Element ) {
        hiddenCount += hideElement(root) ? 1 : 0;
    }

    for ( const candidate of document.querySelectorAll([
        'body > div',
        'body > iframe',
        '[role="dialog"]',
        '[aria-modal="true"]',
        'tp-yt-iron-overlay-backdrop',
        'tp-yt-paper-dialog',
        'div[style*="position: fixed"]',
        'div[style*="position:fixed"]',
        'div[style*="z-index"]',
    ].join(',')) ) {
        if ( candidate === root ) { continue; }
        if ( isViewportBlocker(candidate) ) {
            hiddenCount += hideElement(candidate) ? 1 : 0;
        }
    }
    return hiddenCount;
}

function hideOfferwallTextCandidates() {
    if ( document.body instanceof HTMLElement === false ) { return 0; }

    const candidates = document.querySelectorAll([
        'body > div',
        'body > iframe',
        '[role="dialog"]',
        '[aria-modal="true"]',
        'div[style*="z-index"]',
    ].join(','));

    let hiddenCount = 0;
    for ( const node of candidates ) {
        if ( isOverlayCandidate(node) === false ) { continue; }
        if ( OFFERWALL_TEXT_PATTERN.test(node.textContent || '') === false ) { continue; }
        hiddenCount += hideOverlayCluster(node);
    }
    return hiddenCount;
}

function cleanup() {
    restoreDocumentShells();

    let hiddenCount = hideSelectorMatches(AD_SELECTORS).length;

    const offerwallNodes = hideSelectorMatches(OFFERWALL_SELECTORS);
    for ( const node of offerwallNodes ) {
        hiddenCount += hideOverlayCluster(node);
    }
    hiddenCount += offerwallNodes.length;

    const textOfferwallCount = hideOfferwallTextCandidates();
    hiddenCount += textOfferwallCount;

    if (
        offerwallNodes.length !== 0 ||
        textOfferwallCount !== 0
    ) {
        unlockPageInteraction();
        requestYouTubePlaybackResume();
    }
    reportActivity(hiddenCount);

    if ( Date.now() - startedAt > OBSERVE_MS ) {
        if ( cleanupTimer !== undefined ) {
            self.clearInterval(cleanupTimer);
            cleanupTimer = undefined;
        }
        observer?.disconnect();
        observer = undefined;
    }
}

function scheduleCleanup() {
    if ( scheduled ) { return; }
    scheduled = true;
    self.requestAnimationFrame(( ) => {
        scheduled = false;
        cleanup();
    });
}

function start() {
    cleanup();
    cleanupTimer = self.setInterval(cleanup, 250);
    observer = new MutationObserver(scheduleCleanup);
    observer.observe(document.documentElement, {
        attributeFilter: [ 'class', 'id', 'name', 'src', 'style' ],
        attributes: true,
        childList: true,
        subtree: true,
    });
}

if ( document.documentElement !== null ) {
    start();
} else {
    document.addEventListener('DOMContentLoaded', start, { once: true });
}

/******************************************************************************/

})();

void 0;
