/*******************************************************************************

    AdBlock

    Compatibility shim for redirected Google Analytics analytics.js scripts.

*/

(function adblockAnalyticsShim() {

'use strict';

function Tracker() {}

Tracker.prototype.get = function get() {};
Tracker.prototype.set = function set() {};
Tracker.prototype.send = function send() {};

const previousName = window.GoogleAnalyticsObject || 'ga';
const previousQueue = window[previousName];

function runCallback(callback, value) {
    if ( callback instanceof Function ) {
        try { callback(value); } catch {}
    }
}

function ga(...args) {
    if ( args.length === 0 ) { return; }

    const last = args[args.length - 1];
    if ( last instanceof Function ) {
        runCallback(last, ga.create());
        return;
    }

    if ( last && typeof last === 'object' && last.hitCallback instanceof Function ) {
        runCallback(last.hitCallback);
        return;
    }

    const index = args.indexOf('hitCallback');
    if ( index !== -1 ) {
        runCallback(args[index + 1]);
    }
}

ga.create = function create() {
    return new Tracker();
};
ga.getByName = function getByName() {
    return new Tracker();
};
ga.getAll = function getAll() {
    return [ new Tracker() ];
};
ga.remove = function remove() {};
ga.loaded = true;

window[previousName] = ga;

const dataLayer = window.dataLayer;
if ( dataLayer && typeof dataLayer === 'object' ) {
    if ( dataLayer.hide && dataLayer.hide.end instanceof Function ) {
        runCallback(dataLayer.hide.end);
        dataLayer.hide.end = function end() {};
    }

    if ( dataLayer.push instanceof Function ) {
        const originalPush = dataLayer.push;
        const runEventCallback = item => {
            if ( item && typeof item === 'object' && item.eventCallback instanceof Function ) {
                setTimeout(() => runCallback(item.eventCallback), 1);
                item.eventCallback = function eventCallback() {};
            }
        };
        dataLayer.push = new Proxy(originalPush, {
            apply(target, thisArg, args) {
                runEventCallback(args[0]);
                return Reflect.apply(target, thisArg, args);
            },
        });
        if ( Array.isArray(dataLayer) ) {
            for ( const item of dataLayer.slice() ) {
                runEventCallback(item);
            }
        }
    }
}

if ( previousQueue instanceof Function && Array.isArray(previousQueue.q) ) {
    const queued = previousQueue.q.slice();
    previousQueue.q.length = 0;
    for ( const entry of queued ) {
        ga(...entry);
    }
}

})();
