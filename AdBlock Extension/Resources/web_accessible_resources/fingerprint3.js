/*******************************************************************************

    AdBlock

    Compatibility shim for redirected FingerprintJS scripts.

*/

(function adblockFingerprint3Shim() {

'use strict';

function randomHex(length) {
    let out = '';
    while ( out.length < length ) {
        out += Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
    }
    return out.slice(0, length);
}

const visitorId = randomHex(32);

class FingerprintJS {
    static hashComponents() {
        return visitorId;
    }

    static load() {
        return Promise.resolve(new FingerprintJS());
    }

    get() {
        return Promise.resolve({ visitorId });
    }
}

window.FingerprintJS = FingerprintJS;

})();
