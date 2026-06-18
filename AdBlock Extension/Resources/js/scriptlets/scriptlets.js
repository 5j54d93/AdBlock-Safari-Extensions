/*******************************************************************************

    AdBlock

    Built-in scriptlets for user-created +js filters.

*/

export const builtinScriptlets = [
    {
        name: 'set-constant.js',
        aliases: [ 'set.js', 'set-constant' ],
        fn: adblockSetConstant,
    },
    {
        name: 'noeval.js',
        aliases: [ 'noeval', 'silent-noeval.js', 'silent-noeval' ],
        fn: adblockNoEval,
    },
    {
        name: 'prevent-setTimeout.js',
        aliases: [
            'prevent-setTimeout',
            'prevent-settimeout.js',
            'prevent-settimeout',
            'no-setTimeout-if.js',
            'nostif.js',
        ],
        fn: adblockPreventSetTimeout,
    },
    {
        name: 'prevent-setInterval.js',
        aliases: [
            'prevent-setInterval',
            'prevent-setinterval.js',
            'prevent-setinterval',
            'no-setInterval-if.js',
            'nosif.js',
        ],
        fn: adblockPreventSetInterval,
    },
    {
        name: 'prevent-addEventListener.js',
        aliases: [
            'prevent-addEventListener',
            'prevent-addeventlistener.js',
            'prevent-addeventlistener',
            'aeld.js',
        ],
        fn: adblockPreventAddEventListener,
    },
    {
        name: 'prevent-fetch.js',
        aliases: [ 'prevent-fetch', 'no-fetch-if.js', 'no-fetch-if' ],
        fn: adblockPreventFetch,
    },
    {
        name: 'prevent-xhr.js',
        aliases: [ 'prevent-xhr', 'no-xhr-if.js', 'no-xhr-if' ],
        fn: adblockPreventXHR,
    },
    {
        name: 'abort-current-script.js',
        aliases: [ 'abort-current-script', 'acs.js', 'acs' ],
        fn: adblockAbortCurrentScript,
    },
    {
        name: 'remove-cookie.js',
        aliases: [ 'remove-cookie', 'cookie-remover.js', 'cookie-remover' ],
        fn: adblockRemoveCookie,
    },
    {
        name: 'set-cookie.js',
        aliases: [ 'set-cookie' ],
        fn: adblockSetCookie,
    },
];

/******************************************************************************/

function adblockSetConstant(path = '', rawValue = 'undefined') {
    const parseValue = value => {
        switch ( value ) {
        case 'undefined': return undefined;
        case 'null': return null;
        case 'true': return true;
        case 'false': return false;
        case 'noopFunc': return function noop() {};
        case 'trueFunc': return function trueFunc() { return true; };
        case 'falseFunc': return function falseFunc() { return false; };
        case 'emptyArr': return [];
        case 'emptyObj': return {};
        default:
            if ( /^-?\d+(?:\.\d+)?$/.test(value) ) {
                return Number(value);
            }
            return value;
        }
    };

    const parts = String(path).split('.').filter(Boolean);
    if ( parts.length === 0 ) { return; }

    const constant = parseValue(String(rawValue));
    const prop = parts.pop();
    let owner = self;

    for ( const part of parts ) {
        if ( owner[part] instanceof Object === false ) {
            try {
                Object.defineProperty(owner, part, {
                    configurable: true,
                    value: {},
                });
            } catch {
                return;
            }
        }
        owner = owner[part];
    }

    try {
        Object.defineProperty(owner, prop, {
            configurable: true,
            get() {
                return constant;
            },
            set() {
            },
        });
    } catch {
    }
}

function adblockNoEval() {
    try {
        self.eval = function adblockEvalStub() {};
    } catch {
    }
}

function adblockPreventSetTimeout(pattern = '', delay = '') {
    adblockPreventTimer('setTimeout', pattern, delay);
}

function adblockPreventSetInterval(pattern = '', delay = '') {
    adblockPreventTimer('setInterval', pattern, delay);
}

function adblockPreventTimer(apiName, pattern = '', delay = '') {
    const original = self[apiName];
    if ( original instanceof Function === false ) { return; }

    const regex = adblockPatternToRegex(pattern);
    const expectedDelay = String(delay);

    self[apiName] = new Proxy(original, {
        apply(target, thisArg, args) {
            const callbackText = String(args[0]);
            const delayText = args.length > 1 ? String(args[1]) : '';
            const matchesDelay = expectedDelay === '' || expectedDelay === delayText;
            if ( matchesDelay && regex.test(callbackText) ) {
                return 0;
            }
            return Reflect.apply(target, thisArg, args);
        },
    });
}

function adblockPreventAddEventListener(typePattern = '', listenerPattern = '') {
    const original = EventTarget.prototype.addEventListener;
    if ( original instanceof Function === false ) { return; }

    const typeRegex = adblockPatternToRegex(typePattern);
    const listenerRegex = adblockPatternToRegex(listenerPattern);

    EventTarget.prototype.addEventListener = new Proxy(original, {
        apply(target, thisArg, args) {
            const type = String(args[0] || '');
            const listener = String(args[1] || '');
            if ( typeRegex.test(type) && listenerRegex.test(listener) ) {
                return undefined;
            }
            return Reflect.apply(target, thisArg, args);
        },
    });
}

function adblockPreventFetch(pattern = '') {
    if ( self.fetch instanceof Function === false ) { return; }

    const regex = adblockPatternToRegex(pattern);
    self.fetch = new Proxy(self.fetch, {
        apply(target, thisArg, args) {
            const input = args[0];
            const url = typeof input === 'string'
                ? input
                : input?.url || '';
            if ( regex.test(String(url)) ) {
                return Promise.resolve(new Response('', {
                    status: 204,
                    statusText: 'No Content',
                }));
            }
            return Reflect.apply(target, thisArg, args);
        },
    });
}

function adblockPreventXHR(pattern = '') {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    if ( originalOpen instanceof Function === false || originalSend instanceof Function === false ) {
        return;
    }

    const regex = adblockPatternToRegex(pattern);

    XMLHttpRequest.prototype.open = new Proxy(originalOpen, {
        apply(target, thisArg, args) {
            thisArg.__adblockBlocked = regex.test(String(args[1] || ''));
            return Reflect.apply(target, thisArg, args);
        },
    });

    XMLHttpRequest.prototype.send = new Proxy(originalSend, {
        apply(target, thisArg, args) {
            if ( thisArg.__adblockBlocked === true ) {
                try {
                    thisArg.abort();
                } catch {
                }
                return undefined;
            }
            return Reflect.apply(target, thisArg, args);
        },
    });
}

function adblockAbortCurrentScript(path = '', needle = '') {
    const parts = String(path).split('.').filter(Boolean);
    if ( parts.length === 0 ) { return; }

    const prop = parts.pop();
    const regex = adblockPatternToRegex(needle);
    const error = new ReferenceError('AdBlock aborted a matching script');
    let owner = self;

    for ( const part of parts ) {
        if ( owner[part] instanceof Object === false ) { return; }
        owner = owner[part];
    }

    const shouldAbort = () => {
        const script = document.currentScript;
        if ( script === null ) { return false; }
        const text = script.textContent || script.src || '';
        return regex.test(text);
    };

    let value = owner[prop];
    try {
        Object.defineProperty(owner, prop, {
            configurable: true,
            get() {
                if ( shouldAbort() ) { throw error; }
                return value;
            },
            set(next) {
                if ( shouldAbort() ) { throw error; }
                value = next;
            },
        });
    } catch {
    }
}

function adblockRemoveCookie(pattern = '') {
    const regex = adblockPatternToRegex(pattern);
    const hostParts = location.hostname.split('.');
    const domains = [ '' ];

    for ( let index = 0; index < hostParts.length - 1; index += 1 ) {
        domains.push(`; domain=${hostParts.slice(index).join('.')}`);
        domains.push(`; domain=.${hostParts.slice(index).join('.')}`);
    }

    for ( const cookie of document.cookie.split(';') ) {
        const name = cookie.split('=')[0].trim();
        if ( regex.test(name) === false ) { continue; }
        for ( const domain of domains ) {
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
        }
    }
}

function adblockSetCookie(name = '', value = '', days = '1') {
    if ( name === '' ) { return; }

    const expires = new Date();
    expires.setTime(Date.now() + (Number(days) || 1) * 86400000);
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/`;
}

function adblockPatternToRegex(pattern = '') {
    const text = String(pattern || '');
    if ( text === '' || text === '*' ) { return /[\s\S]*/; }

    const match = /^\/(.+)\/([dgimsuvy]*)$/.exec(text);
    if ( match !== null ) {
        try {
            return new RegExp(match[1], match[2]);
        } catch {
        }
    }

    return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}
