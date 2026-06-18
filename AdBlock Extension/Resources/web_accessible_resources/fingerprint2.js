/*******************************************************************************

    AdBlock

    Compatibility shim for redirected Fingerprint2 scripts.

*/

(function adblockFingerprint2Shim() {

'use strict';

function randomHex(length) {
    let out = '';
    while ( out.length < length ) {
        out += Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
    }
    return out.slice(0, length);
}

const visitorId = randomHex(32);

function Fingerprint2() {}

Fingerprint2.get = function get(options, callback) {
    const done = callback instanceof Function ? callback : options;
    if ( done instanceof Function ) {
        setTimeout(() => done([]), 1);
    }
};
Fingerprint2.getPromise = function getPromise() {
    return Promise.resolve([]);
};
Fingerprint2.getV18 = function getV18() {
    return visitorId;
};
Fingerprint2.x64hash128 = function x64hash128() {
    return visitorId;
};
Fingerprint2.prototype.get = function get(options, callback) {
    const done = callback instanceof Function ? callback : options;
    if ( done instanceof Function ) {
        setTimeout(() => done(visitorId, []), 1);
    }
};

self.Fingerprint2 = Fingerprint2;
self.Fingerprint = Fingerprint2;

})();
