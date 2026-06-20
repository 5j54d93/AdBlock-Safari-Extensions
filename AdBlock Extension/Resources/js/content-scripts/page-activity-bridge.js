/*******************************************************************************

    AdBlock

    Bridges page-world pruning scripts back to the extension runtime so Popup and
    report pages can include non-DNR page handling in recent activity counts.

*/

(function adblockPageActivityBridge() {

'use strict';

if ( self.__adblockPageActivityBridge === true ) { return; }
try {
    Object.defineProperty(self, '__adblockPageActivityBridge', { value: true });
} catch {
    self.__adblockPageActivityBridge = true;
}

const MESSAGE_MARKER = '__adblockContentScriptActivity';
const ALLOWED_SOURCES = new Set([
    'facebook-ad-prune',
    'instagram-ad-prune',
    'youtube-ad-prune',
]);

function forwardActivity(event) {
    if ( event.source !== self ) { return; }

    const data = event.data;
    if ( data?.[MESSAGE_MARKER] !== true ) { return; }
    if ( ALLOWED_SOURCES.has(data.source) === false ) { return; }

    const count = Number.parseInt(data.count || 0, 10);
    if ( Number.isFinite(count) === false || count <= 0 ) { return; }

    try {
        chrome.runtime?.sendMessage({
            what: 'recordContentScriptActivity',
            source: data.source,
            label: typeof data.label === 'string' ? data.label : '',
            hostname: location.hostname,
            count,
        });
    } catch {
    }
}

self.addEventListener('message', forwardActivity, true);

/******************************************************************************/

})();

void 0;
