/*******************************************************************************

    AdBlock

    Removes YouTube ad renderers from page data before the app can render them.

*/

(function adblockYouTubeAdPrune() {

'use strict';

if ( self.__adblockYouTubeAdPrune === true ) { return; }
try {
    Object.defineProperty(self, '__adblockYouTubeAdPrune', { value: true });
} catch {
    self.__adblockYouTubeAdPrune = true;
}

if (
    location.hostname !== 'youtube.com' &&
    location.hostname.endsWith('.youtube.com') === false
) {
    return;
}

/******************************************************************************/

const YOUTUBEI_PATH_PATTERN = /^\/youtubei\/v1\/(?:browse|next|player|search|reel|guide|updated_metadata|reel_watch_sequence)/;
const AD_TEXT_MARKERS = [
    '"adSlotRenderer"',
    '"inFeedAdLayoutRenderer"',
    '"displayAdRenderer"',
    '"promotedSparklesWebRenderer"',
    '"promotedVideoRenderer"',
    '"feedAdMetadata',
    '"adBadge',
    '"adPlacements"',
    '"adSlots"',
    '"playerAds"',
    '"adBreakHeartbeatParams"',
    '"adClientParams"',
];
const AD_RENDERER_KEYS = new Set([
    'adSlotRenderer',
    'inFeedAdLayoutRenderer',
    'displayAdRenderer',
    'promotedSparklesWebRenderer',
    'promotedVideoRenderer',
    'carouselAdRenderer',
    'companionAdRenderer',
    'mastheadAdRenderer',
    'playerLegacyDesktopWatchAdsRenderer',
    'feedAdMetadataRenderer',
    'feedAdMetadataViewModel',
    'adBadgeRenderer',
    'adBadgeViewModel',
    'adSurveyRenderer',
]);
const AD_DATA_KEYS = new Set([
    'adBreakHeartbeatParams',
    'adClientParams',
    'adEngagementPanels',
    'adImpressionEndpoint',
    'adPlacements',
    'adParams',
    'adSafetyReason',
    'adSignalsInfo',
    'adSlots',
    'adTrackingParams',
    'adVideoId',
    'playerAds',
]);
const INITIAL_DATA_NAMES = [
    'ytInitialData',
    'ytInitialPlayerResponse',
    'ytInitialReelWatchSequenceResponse',
];

/******************************************************************************/

function isObject(value) {
    return value !== null && typeof value === 'object';
}

function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

function hasAnyKey(object, keys) {
    if ( isObject(object) === false ) { return false; }
    for ( const key of keys ) {
        if ( hasOwn(object, key) ) { return true; }
    }
    return false;
}

function directAdContent(item) {
    if ( isObject(item) === false ) { return; }
    if ( hasAnyKey(item, AD_RENDERER_KEYS) ) { return item; }

    const richItemContent = item.richItemRenderer?.content;
    if ( hasAnyKey(richItemContent, AD_RENDERER_KEYS) ) { return richItemContent; }

    const richSectionContent = item.richSectionRenderer?.content;
    if ( hasAnyKey(richSectionContent, AD_RENDERER_KEYS) ) { return richSectionContent; }

    const sectionContents = item.itemSectionRenderer?.contents;
    if (
        Array.isArray(sectionContents) &&
        sectionContents.length !== 0 &&
        sectionContents.every(entry => hasAnyKey(entry, AD_RENDERER_KEYS))
    ) {
        return item.itemSectionRenderer;
    }
}

function isAdListItem(item) {
    if ( directAdContent(item) !== undefined ) { return true; }

    const reelEndpoint = item?.command?.reelWatchEndpoint;
    if ( reelEndpoint?.adClientParams?.isAd === true ) { return true; }

    return false;
}

function isEmptyAdShell(item) {
    if ( isObject(item) === false ) { return false; }

    const richItem = item.richItemRenderer;
    if ( isObject(richItem) && isObject(richItem.content) === false ) {
        return true;
    }

    const richSection = item.richSectionRenderer;
    if ( isObject(richSection) && isObject(richSection.content) === false ) {
        return true;
    }

    return false;
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

                if ( isEmptyAdShell(item) ) {
                    node.splice(index, 1);
                    changed = true;
                }
            }
            return;
        }

        for ( const key of Object.keys(node) ) {
            if ( AD_RENDERER_KEYS.has(key) || AD_DATA_KEYS.has(key) ) {
                delete node[key];
                changed = true;
                continue;
            }
            visit(node[key]);
        }
    };

    visit(root);
    return changed;
}

function textMayContainAds(text) {
    if ( typeof text !== 'string' ) { return false; }
    return AD_TEXT_MARKERS.some(marker => text.includes(marker));
}

function responseTextFromJson(text, parser = JSON.parse) {
    if ( textMayContainAds(text) === false ) {
        return { changed: false, text };
    }

    let data;
    try {
        data = parser(text);
    } catch {
        return { changed: false, text };
    }

    const pruned = pruneJson(data);

    try {
        const nextText = JSON.stringify(data);
        return {
            changed: pruned || nextText !== text,
            text: nextText,
            value: data,
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
        parsed.hostname !== 'youtube.com' &&
        parsed.hostname.endsWith('.youtube.com') === false
    ) {
        return false;
    }

    return YOUTUBEI_PATH_PATTERN.test(parsed.pathname) ||
        parsed.searchParams.get('pbj') === '1';
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

function installInitialDataPruner(name) {
    let value = self[name];
    if ( isObject(value) ) {
        pruneJson(value);
    }

    try {
        Object.defineProperty(self, name, {
            configurable: true,
            enumerable: true,
            get() {
                return value;
            },
            set(next) {
                if ( isObject(next) ) {
                    pruneJson(next);
                }
                value = next;
            },
        });
    } catch {
    }
}

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
            thisArg.__adblockYouTubeURL = String(args[1] || '');
            return Reflect.apply(target, thisArg, args);
        },
    });

    proto.send = new Proxy(originalSend, {
        apply(target, thisArg, args) {
            if ( shouldInspectURL(thisArg.__adblockYouTubeURL) ) {
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

for ( const name of INITIAL_DATA_NAMES ) {
    installInitialDataPruner(name);
}
installJsonParsePruner();
installFetchPruner();
installXhrPruner();

/******************************************************************************/

})();

void 0;
