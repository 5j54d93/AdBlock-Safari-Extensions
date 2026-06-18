/*******************************************************************************

    AdBlock

    Compatibility shim for redirected PopAds scripts.

*/

(function adblockPopAdsShim() {

'use strict';

const token = `adblock-${Math.random().toString(36).slice(2)}`;
const previousOnError = window.onerror;

window.onerror = function adblockPopAdsErrorHandler(message, source, line, column, error) {
    if ( typeof message === 'string' && message.includes(token) ) {
        return true;
    }
    if ( previousOnError instanceof Function ) {
        return previousOnError.call(this, message, source, line, column, error);
    }
    return false;
};

function blockAssignment() {
    throw new ReferenceError(token);
}

try { delete window.PopAds; } catch {}
try { delete window.popns; } catch {}

Object.defineProperties(window, {
    PopAds: {
        configurable: true,
        set: blockAssignment,
    },
    popns: {
        configurable: true,
        set: blockAssignment,
    },
});

})();
