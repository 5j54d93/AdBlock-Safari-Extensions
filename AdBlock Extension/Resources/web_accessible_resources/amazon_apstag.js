/*******************************************************************************

    AdBlock

    Compatibility shim for redirected Amazon apstag scripts.

*/

(function adblockAmazonApstagShim() {

'use strict';

const queue = Array.isArray(window.apstag?._Q) ? window.apstag._Q : [];

function fetchBids(_config, callback) {
    if ( callback instanceof Function ) {
        setTimeout(() => {
            try { callback([]); } catch {}
        }, 1);
    }
}

function processEntry(entry) {
    const prefix = Array.isArray(entry) ? entry[0] : entry;
    const args = Array.isArray(entry) ? entry[1] : undefined;
    if ( prefix === 'f' ) {
        fetchBids(...Array.from(args || []));
    }
}

const apstag = {
    _Q: queue,
    fetchBids,
    init() {},
    setDisplayBids() {},
    targetingKeys() {
        return [];
    },
};

queue.push = function push(...entries) {
    if ( typeof entries[0] === 'string' ) {
        try { processEntry([ entries[0], entries[1] ]); } catch {}
        return queue.length;
    }
    for ( const entry of entries ) {
        try { processEntry(entry); } catch {}
    }
    return queue.length;
};

window.apstag = apstag;

for ( const entry of queue.slice() ) {
    processEntry(entry);
}

})();
