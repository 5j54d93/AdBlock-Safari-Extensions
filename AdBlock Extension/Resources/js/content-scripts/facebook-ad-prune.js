/*******************************************************************************

    AdBlock

    Removes Facebook sponsored side-feed entries before the app can render them.

*/

(function adblockFacebookAdPrune() {

'use strict';

if ( self.__adblockFacebookAdPrune === true ) { return; }
try {
    Object.defineProperty(self, '__adblockFacebookAdPrune', { value: true });
} catch {
    self.__adblockFacebookAdPrune = true;
}

if (
    location.hostname !== 'facebook.com' &&
    location.hostname.endsWith('.facebook.com') === false
) {
    return;
}

/******************************************************************************/

const GRAPHQL_PATH_PATTERN = /^\/(?:api\/graphql|api\/graphqlbatch|ajax\/relay\/|graphql)(?:\/|$)/;
const TEXT_PREFIX_PATTERN = /^\s*for\s*\(\s*;\s*;\s*\)\s*;\s*/;
const AD_TEXT_MARKERS = [
    'CometRightSideHeaderCardsQuery',
    'CometRightSideHeaderCardsQueryRelayPreloader',
    '"side_feed"',
    '"sideFeed"',
];
const AD_PAYLOAD_KEYS = new Set([
    'ad',
    'ad_data',
    'adData',
    'ad_info',
    'adInfo',
    'ad_metadata',
    'adMetadata',
    'ad_creative',
    'adCreative',
    'ad_delivery',
    'adDelivery',
    'sponsored_data',
    'sponsoredData',
    'sponsored_context',
    'sponsoredContext',
    'sponsored_label',
    'sponsoredLabel',
    'sponsor',
]);
const AD_ID_KEYS = new Set([
    'ad_id',
    'adId',
    'adID',
    'adgroup_id',
    'adgroupId',
    'campaign_id',
    'campaignId',
]);
const SPONSORED_TEXT_VALUES = new Set([
    'Sponsored',
    '贊助',
    '廣告商',
]);
const DOM_OBSERVE_MS = 60000;

let domObserver;
let domCleanupTimer;
let domCleanupQueued = false;
const domStartedAt = Date.now();
let pendingReportCount = 0;
let reportTimer;

/******************************************************************************/

function reportActivity(count, label = 'Facebook 贊助內容') {
    if ( count <= 0 ) { return; }
    pendingReportCount += count;
    if ( reportTimer !== undefined ) { return; }

    reportTimer = setTimeout(() => {
        const total = pendingReportCount;
        pendingReportCount = 0;
        reportTimer = undefined;
        const message = {
            source: 'facebook-ad-prune',
            label,
            hostname: location.hostname,
            count: total,
        };
        try {
            if ( chrome.runtime?.sendMessage instanceof Function ) {
                chrome.runtime.sendMessage({
                    what: 'recordContentScriptActivity',
                    ...message,
                });
                return;
            }
        } catch {
        }
        try {
            self.postMessage({
                __adblockContentScriptActivity: true,
                ...message,
            }, '*');
        } catch {
        }
    }, 80);
}

/******************************************************************************/

function isObject(value) {
    return value !== null && typeof value === 'object';
}

function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

function isNonEmptyAdValue(value) {
    if ( value === null || value === undefined || value === false ) { return false; }
    if ( typeof value === 'string' ) { return value !== ''; }
    if ( typeof value === 'number' ) { return Number.isFinite(value); }
    if ( Array.isArray(value) ) { return value.length !== 0; }
    return typeof value === 'object';
}

function hasAdPayload(node) {
    if ( isObject(node) === false ) { return false; }

    for ( const key of AD_ID_KEYS ) {
        if ( hasOwn(node, key) && isNonEmptyAdValue(node[key]) ) {
            return true;
        }
    }

    for ( const key of AD_PAYLOAD_KEYS ) {
        if ( hasOwn(node, key) && isNonEmptyAdValue(node[key]) ) {
            return true;
        }
    }

    if ( node.is_ad === true || node.is_sponsored === true ) { return true; }

    const typename = String(node.__typename || '');
    return /(?:^|[A-Z_])(?:Ad|Ads|Sponsored|Sponsor)(?=[A-Z_]|$)/.test(typename) ||
        /\b(?:ad|ads|sponsored|sponsor)\b/i.test(typename.replace(/_/g, ' '));
}

function hasSponsoredString(node) {
    const seen = new WeakSet();
    let sponsoredText = false;
    let adLink = false;
    let adMenu = false;

    const visit = value => {
        if ( sponsoredText && (adLink || adMenu) ) { return; }

        if ( typeof value === 'string' ) {
            const trimmed = value.replace(/\u200b/g, '').trim();
            if (
                SPONSORED_TEXT_VALUES.has(trimmed) ||
                /贊助內容|sponsored content/i.test(trimmed)
            ) {
                sponsoredText = true;
            }
            if (
                value.includes('l.facebook.com/l.php') ||
                value.includes('fbclid=') ||
                value === 'rhcad2'
            ) {
                adLink = true;
            }
            if ( /開啟.+贊助內容的功能表|sponsored.+menu/i.test(value) ) {
                adMenu = true;
            }
            return;
        }

        if ( isObject(value) === false || seen.has(value) ) { return; }
        seen.add(value);

        if ( Array.isArray(value) ) {
            for ( const item of value ) { visit(item); }
            return;
        }

        for ( const [ key, child ] of Object.entries(value) ) {
            if ( key === 'attributionsrc' || key === 'attributionSrc' ) {
                adLink = true;
            }
            visit(child);
        }
    };

    visit(node);
    return sponsoredText && (adLink || adMenu);
}

function isSponsoredSideFeedItem(item) {
    if ( isObject(item) === false ) { return false; }

    return hasAdPayload(item) ||
        hasAdPayload(item.node) ||
        hasAdPayload(item.story) ||
        hasAdPayload(item.ad) ||
        hasSponsoredString(item);
}

/******************************************************************************/

function isElement(value) {
    return typeof Element !== 'undefined' && value instanceof Element;
}

function defer(callback) {
    return typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(callback)
        : setTimeout(callback, 0);
}

function hasSponsoredLabelText(node) {
    const text = (node.textContent || '').replace(/\u200b/g, '').trim();
    return /(^|\s)(?:Sponsored|贊助|廣告商)(\s|$)|贊助內容|sponsored content/i.test(text);
}

function hasAdLinkElement(node) {
    if ( isElement(node) === false ) { return false; }
    return node.matches([
        'a[attributionsrc]',
        'a[target="rhcad2"]',
        'a[href*="fbclid="]',
        'a[href*="l.facebook.com/l.php"]',
        'img[src*="/v/t45.1600-4/"]',
        '[aria-label*="贊助內容"]',
        '[aria-label*="sponsored"]',
    ].join(','));
}

function containsAdLinkElement(node) {
    if ( isElement(node) === false ) { return false; }
    if ( hasAdLinkElement(node) ) { return true; }
    return node.querySelector([
        'a[attributionsrc]',
        'a[target="rhcad2"]',
        'a[href*="fbclid="]',
        'a[href*="l.facebook.com/l.php"]',
        'img[src*="/v/t45.1600-4/"]',
        '[aria-label*="贊助內容"]',
        '[aria-label*="sponsored"]',
    ].join(',')) !== null;
}

function closestSponsoredCardRoot(node) {
    if ( isElement(node) === false ) { return; }

    const dynamicRoot = node.closest('[data-visualcompletion="ignore-dynamic"]');
    if ( dynamicRoot instanceof Element ) { return dynamicRoot; }

    let current = node;
    for ( let depth = 0; depth < 6 && current instanceof Element; depth += 1 ) {
        if (
            current.parentElement instanceof Element &&
            current.parentElement.children.length > 1
        ) {
            return current;
        }
        current = current.parentElement;
    }
}

function isSponsoredSection(node) {
    return isElement(node) &&
        hasSponsoredLabelText(node) &&
        containsAdLinkElement(node);
}

function removeElement(node) {
    if ( isElement(node) === false ) { return false; }
    if ( node.localName === 'html' || node.localName === 'body' ) { return false; }
    node.remove();
    reportActivity(1, 'Facebook 贊助卡片');
    return true;
}

function pruneSponsoredDom(root = document) {
    if ( isElement(root) === false && root !== document ) { return false; }

    let changed = false;
    const sections = [];

    if ( isSponsoredSection(root) ) {
        sections.push(root);
    }

    if ( typeof root.querySelectorAll === 'function' ) {
        sections.push(...root.querySelectorAll([
            '[data-visualcompletion="ignore-late-mutation"]',
            '[data-visualcompletion="ignore-dynamic"]',
        ].join(',')));
    }

    for ( const section of sections ) {
        if ( isSponsoredSection(section) ) {
            changed = removeElement(section) || changed;
        }
    }

    if ( typeof root.querySelectorAll !== 'function' ) { return changed; }

    for ( const link of root.querySelectorAll([
        'a[attributionsrc]',
        'a[target="rhcad2"]',
        'a[href*="fbclid="]',
        'a[href*="l.facebook.com/l.php"]',
        'img[src*="/v/t45.1600-4/"]',
        '[aria-label*="贊助內容"]',
        '[aria-label*="sponsored"]',
    ].join(',')) ) {
        const cardRoot = closestSponsoredCardRoot(link);
        if (
            cardRoot instanceof Element &&
            isSponsoredSection(cardRoot)
        ) {
            changed = removeElement(cardRoot) || changed;
        }
    }

    return changed;
}

function scheduleDomPrune(root = document) {
    if ( domCleanupQueued ) { return; }
    domCleanupQueued = true;

    defer(() => {
        domCleanupQueued = false;
        pruneSponsoredDom(root);
    });
}

function installDomPruner() {
    if ( typeof MutationObserver !== 'function' ) { return; }

    const root = document.documentElement || document;
    domObserver = new MutationObserver(mutations => {
        if ( Date.now() - domStartedAt > DOM_OBSERVE_MS ) {
            domObserver.disconnect();
            return;
        }

        for ( const mutation of mutations ) {
            for ( const node of mutation.addedNodes ) {
                if ( pruneSponsoredDom(node) ) { continue; }
                scheduleDomPrune();
            }
        }
    });
    domObserver.observe(root, {
        childList: true,
        subtree: true,
    });

    domCleanupTimer = setInterval(() => {
        if ( Date.now() - domStartedAt > DOM_OBSERVE_MS ) {
            clearInterval(domCleanupTimer);
            domObserver.disconnect();
            return;
        }
        pruneSponsoredDom();
    }, 1000);

    if ( document.readyState === 'loading' ) {
        document.addEventListener('DOMContentLoaded', () => pruneSponsoredDom(), { once: true });
    } else {
        pruneSponsoredDom();
    }
}

/******************************************************************************/

function pruneSideFeed(sideFeed) {
    if ( isObject(sideFeed) === false ) { return false; }

    let changed = false;
    let removedCount = 0;
    for ( const key of [ 'nodes', 'edges' ] ) {
        const items = sideFeed[key];
        if ( Array.isArray(items) === false ) { continue; }

        for ( let index = items.length - 1; index >= 0; index -= 1 ) {
            const item = items[index];
            const target = key === 'edges' && isObject(item?.node) ? item.node : item;
            if ( isSponsoredSideFeedItem(target) ) {
                items.splice(index, 1);
                changed = true;
                removedCount += 1;
            }
        }
    }

    reportActivity(removedCount);
    return changed;
}

function pruneJson(root) {
    const seen = new WeakSet();
    let changed = false;

    const visit = node => {
        if ( isObject(node) === false || seen.has(node) ) { return; }
        seen.add(node);

        if ( Array.isArray(node) ) {
            for ( const item of node ) { visit(item); }
            return;
        }

        for ( const [ key, value ] of Object.entries(node) ) {
            if ( key === 'side_feed' || key === 'sideFeed' ) {
                changed = pruneSideFeed(value) || changed;
            }
            visit(value);
        }
    };

    visit(root);
    return changed;
}

function textMayContainAds(text) {
    if ( typeof text !== 'string' ) { return false; }
    return AD_TEXT_MARKERS.some(marker => text.includes(marker));
}

function parseJSONText(text, parser = JSON.parse) {
    const prefix = text.match(TEXT_PREFIX_PATTERN)?.[0] || '';
    const body = prefix === '' ? text : text.slice(prefix.length);
    return {
        prefix,
        value: parser(body),
    };
}

function responseTextFromJson(text, parser = JSON.parse) {
    if ( textMayContainAds(text) === false ) {
        return { changed: false, text };
    }

    let parsed;
    try {
        parsed = parseJSONText(text, parser);
    } catch {
        return responseTextFromJsonLines(text, parser);
    }

    const pruned = pruneJson(parsed.value);

    try {
        const nextText = `${parsed.prefix}${JSON.stringify(parsed.value)}`;
        return {
            changed: pruned || nextText !== text,
            text: nextText,
            value: parsed.value,
        };
    } catch {
        return { changed: false, text };
    }
}

function responseTextFromJsonLines(text, parser = JSON.parse) {
    const lines = text.split(/\r?\n/);
    let changed = false;

    const nextLines = lines.map(line => {
        if ( textMayContainAds(line) === false ) { return line; }

        let parsed;
        try {
            parsed = parseJSONText(line, parser);
        } catch {
            return line;
        }

        const pruned = pruneJson(parsed.value);
        let nextLine;
        try {
            nextLine = `${parsed.prefix}${JSON.stringify(parsed.value)}`;
        } catch {
            return line;
        }

        if ( pruned || nextLine !== line ) {
            changed = true;
        }
        return nextLine;
    });

    return changed
        ? { changed, text: nextLines.join('\n') }
        : { changed: false, text };
}

function requestURL(input) {
    return typeof input === 'string'
        ? input
        : input?.url || '';
}

function shouldInspectURL(url) {
    let parsed;
    try {
        parsed = new URL(String(url || ''), location.href);
    } catch {
        return false;
    }

    if (
        parsed.hostname !== 'facebook.com' &&
        parsed.hostname.endsWith('.facebook.com') === false
    ) {
        return false;
    }

    return GRAPHQL_PATH_PATTERN.test(parsed.pathname);
}

function responseWithText(response, text) {
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

/******************************************************************************/

function installJsonParsePruner() {
    if ( typeof JSON.parse !== 'function' ) { return; }

    const original = JSON.parse;
    JSON.parse = new Proxy(original, {
        apply(target, thisArg, args) {
            const out = Reflect.apply(target, thisArg, args);
            if ( textMayContainAds(args[0]) ) {
                pruneJson(out);
            }
            return out;
        },
    });
}

function installFetchPruner() {
    if ( typeof self.fetch !== 'function' ) { return; }

    const original = self.fetch;
    self.fetch = new Proxy(original, {
        async apply(target, thisArg, args) {
            const response = await Reflect.apply(target, thisArg, args);
            if ( shouldInspectURL(requestURL(args[0])) === false ) {
                return response;
            }

            let text;
            try {
                text = await response.clone().text();
            } catch {
                return response;
            }

            const result = responseTextFromJson(text);
            return result.changed
                ? responseWithText(response, result.text)
                : response;
        },
    });
}

function installXhrPruner() {
    if ( self.XMLHttpRequest === undefined ) { return; }

    const proto = self.XMLHttpRequest.prototype;
    if ( typeof proto.open !== 'function' || typeof proto.send !== 'function' ) {
        return;
    }

    const originalOpen = proto.open;
    const originalSend = proto.send;

    proto.open = new Proxy(originalOpen, {
        apply(target, thisArg, args) {
            thisArg.__adblockFacebookURL = String(args[1] || '');
            return Reflect.apply(target, thisArg, args);
        },
    });

    proto.send = new Proxy(originalSend, {
        apply(target, thisArg, args) {
            if ( shouldInspectURL(thisArg.__adblockFacebookURL) ) {
                thisArg.addEventListener('readystatechange', () => {
                    if ( thisArg.readyState !== 4 ) { return; }
                    if ( thisArg.responseType === 'json' ) {
                        if ( isObject(thisArg.response) ) {
                            pruneJson(thisArg.response);
                        }
                        return;
                    }
                    if ( thisArg.responseType !== '' && thisArg.responseType !== 'text' ) { return; }

                    let text;
                    try {
                        text = thisArg.responseText;
                    } catch {
                        return;
                    }

                    const result = responseTextFromJson(text);
                    if ( result.changed === false ) { return; }

                    try {
                        Object.defineProperty(thisArg, 'responseText', {
                            configurable: true,
                            value: result.text,
                        });
                        Object.defineProperty(thisArg, 'response', {
                            configurable: true,
                            value: result.text,
                        });
                    } catch {
                    }
                });
            }

            return Reflect.apply(target, thisArg, args);
        },
    });
}

/******************************************************************************/

installJsonParsePruner();
installFetchPruner();
installXhrPruner();
installDomPruner();

/******************************************************************************/

})();

void 0;
