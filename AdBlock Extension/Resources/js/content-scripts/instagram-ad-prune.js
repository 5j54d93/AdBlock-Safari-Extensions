/*******************************************************************************

    AdBlock

    Removes Instagram ad entries from feed and stories data before rendering.

*/

(function adblockInstagramAdPrune() {

'use strict';

if ( self.__adblockInstagramAdPrune === true ) { return; }
try {
    Object.defineProperty(self, '__adblockInstagramAdPrune', { value: true });
} catch {
    self.__adblockInstagramAdPrune = true;
}

if (
    location.hostname !== 'instagram.com' &&
    location.hostname.endsWith('.instagram.com') === false
) {
    return;
}

/******************************************************************************/

const GRAPHQL_PATH_PATTERN = /^\/(?:api\/graphql|api\/graphqlbatch|graphql)(?:\/|$)/;
const API_PATH_PATTERN = /^\/api\/v1\/(?:feed|media|stories|clips|discover)(?:\/|$)/;
const AD_TEXT_MARKERS = [
    '"ad":{"ad_id"',
    '"ad_id":"',
    '"ad_id":',
    '"is_ad":true',
    '"is_sponsored":true',
    '"reel_type":"ad"',
    '"sponsored_data"',
    '"stories_netego"',
    '"bloks_netego"',
    '"ad4ad_in_webfeed"',
];
const AD_PAYLOAD_KEYS = new Set([
    'ad',
    'sponsored_data',
    'sponsoredData',
    'stories_netego',
    'bloks_netego',
    'ad4ad_in_webfeed',
    'ad_info',
    'adInfo',
    'ad_metadata',
    'adMetadata',
]);
const AD_ID_KEYS = new Set([
    'ad_id',
    'adId',
]);

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
    if ( node.reel_type === 'ad' || node.reel_type === 'netego_reel' ) { return true; }

    const typename = String(node.__typename || '');
    return /\b(?:Ad|Ads|Sponsored|Netego)\b/.test(typename);
}

function isAdListItem(item) {
    if ( isObject(item) === false ) { return false; }
    return hasAdPayload(item) ||
        hasAdPayload(item.node) ||
        hasAdPayload(item.media) ||
        hasAdPayload(item.reel) ||
        hasAdPayload(item.story);
}

function pruneJson(root) {
    const seen = new WeakSet();
    let changed = false;

    const visit = node => {
        if ( isObject(node) === false || seen.has(node) ) { return; }
        seen.add(node);

        if ( Array.isArray(node) ) {
            for ( let index = node.length - 1; index >= 0; index -= 1 ) {
                const item = node[index];
                if ( isAdListItem(item) ) {
                    node.splice(index, 1);
                    changed = true;
                    continue;
                }
                visit(item);
            }
            return;
        }

        for ( const key of Object.keys(node) ) {
            const value = node[key];
            if (
                (AD_PAYLOAD_KEYS.has(key) || AD_ID_KEYS.has(key)) &&
                isNonEmptyAdValue(value)
            ) {
                delete node[key];
                changed = true;
                continue;
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
    const prefix = text.match(/^\s*for\s*\(\s*;\s*;\s*\)\s*;\s*/)?.[0] || '';
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
        return { changed: false, text };
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
        parsed.hostname !== 'instagram.com' &&
        parsed.hostname.endsWith('.instagram.com') === false
    ) {
        return false;
    }

    return GRAPHQL_PATH_PATTERN.test(parsed.pathname) ||
        API_PATH_PATTERN.test(parsed.pathname);
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
            thisArg.__adblockInstagramURL = String(args[1] || '');
            return Reflect.apply(target, thisArg, args);
        },
    });

    proto.send = new Proxy(originalSend, {
        apply(target, thisArg, args) {
            if ( shouldInspectURL(thisArg.__adblockInstagramURL) ) {
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

/******************************************************************************/

})();

void 0;
