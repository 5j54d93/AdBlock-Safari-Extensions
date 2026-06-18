/*******************************************************************************

    AdBlock

    Compatibility shim for FuckAdBlock-style detection libraries.

*/

(function adblockNoFabShim() {

'use strict';

const noop = function adblockNoop() {};

function Detector() {}

Detector.prototype.check = function check() {
    return this;
};
Detector.prototype.clearEvent = function clearEvent() {
    return this;
};
Detector.prototype.emitEvent = noop;
Detector.prototype.on = function on(eventName, callback) {
    if ( eventName === undefined && callback instanceof Function ) {
        try { callback(); } catch {}
    }
    return this;
};
Detector.prototype.onDetected = function onDetected() {
    return this;
};
Detector.prototype.onNotDetected = function onNotDetected(callback) {
    if ( callback instanceof Function ) {
        try { callback(); } catch {}
    }
    return this;
};
Detector.prototype.setOption = function setOption() {
    return this;
};
Detector.prototype.options = {
    get() {},
    set() {},
};

const detector = new Detector();

function defineReadonly(name, value) {
    try {
        Object.defineProperty(window, name, {
            configurable: true,
            get() { return value; },
            set() {},
        });
    } catch {
        window[name] = value;
    }
}

defineReadonly('FuckAdBlock', Detector);
defineReadonly('BlockAdBlock', Detector);
defineReadonly('SniffAdBlock', Detector);
defineReadonly('fuckAdBlock', detector);
defineReadonly('blockAdBlock', detector);
defineReadonly('sniffAdBlock', detector);

})();
