/*******************************************************************************

    AdBlock

    Compatibility shim for redirected NitroPay ad scripts.

*/

(function adblockNitroPayShim() {

'use strict';

if ( window.nitroAds !== undefined ) { return; }

const runCallback = callback => {
    if ( callback instanceof Function ) {
        try { callback(); } catch {}
    }
};

window.nitroAds = {
    queue: [],
    createAd(_placement, options = {}) {
        runCallback(options?.onError);
        return Promise.resolve(null);
    },
    addUserToken() {},
    clearUserToken() {},
    refresh() {
        return Promise.resolve();
    },
};

})();
