/*******************************************************************************

    AdBlock

    Shared runtime for generated scriptlet data.

*/

(function adblockScriptletRuntime() {

'use strict';

if ( self.adblockRunScriptlets instanceof Function ) { return; }

/******************************************************************************/

const state = self.__adblockScriptletState || {
    installedData: new Set(),
    fetchInstalled: false,
    fetchTransforms: [],
    xhrInstalled: false,
    xhrRequestTransforms: [],
    xhrResponseTransforms: [],
};
self.__adblockScriptletState = state;

const noop = function adblockNoop() {};

function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternRegex(raw, fallbackFlags = '') {
    const text = String(raw || '');
    if ( text === '' ) { return /^/; }

    const match = text.match(/^\/([\s\S]*)\/([a-z]*)$/i);
    if ( match ) {
        try {
            return new RegExp(match[1], match[2] || fallbackFlags);
        } catch {
        }
    }

    try {
        return new RegExp(escapeRegex(text), fallbackFlags);
    } catch {
        return /^/;
    }
}

function matchesPattern(value, raw) {
    let text = String(raw || '');
    let negate = false;
    if ( text.startsWith('!') ) {
        negate = true;
        text = text.slice(1);
    }
    const result = text === '' || patternRegex(text).test(String(value || ''));
    return negate ? result === false : result;
}

function parseValue(raw) {
    let text = String(raw ?? '');
    text = text.replace(/\$\{now\}/g, String(Date.now()));

    if ( text.startsWith('json:') ) {
        text = text.slice(5);
    }

    switch ( text ) {
    case 'undefined': return undefined;
    case 'null': return null;
    case 'true': return true;
    case 'false': return false;
    case 'noopFunc': return noop;
    case 'noopCallbackFunc': return function adblockNoopCallback(callback) {
        if ( callback instanceof Function ) { callback(); }
    };
    case 'trueFunc': return function adblockTrue() { return true; };
    case 'falseFunc': return function adblockFalse() { return false; };
    case 'throwFunc': return function adblockThrow() { throw new Error('AdBlock'); };
    case 'noopPromiseResolve': return function adblockResolvedPromise() { return Promise.resolve(); };
    case 'noopPromiseReject': return function adblockRejectedPromise() { return Promise.reject(); };
    case 'emptyArr':
    case '[]': return [];
    case 'emptyObj':
    case '{}': return {};
    }

    if ( /^-?\d+(?:\.\d+)?$/.test(text) ) {
        return Number(text);
    }

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function define(owner, prop, descriptor) {
    try {
        Object.defineProperty(owner, prop, {
            configurable: true,
            ...descriptor,
        });
        return true;
    } catch {
        return false;
    }
}

function pathParts(path) {
    return String(path || '')
        .replace(/^window\./, '')
        .split('.')
        .filter(Boolean);
}

function ownerAndProp(path, create = false) {
    const parts = pathParts(path);
    if ( parts.length === 0 ) { return; }

    const prop = parts.pop();
    let owner = self;

    for ( const part of parts ) {
        if ( owner == null ) { return; }
        if ( create && (owner[part] == null || typeof owner[part] !== 'object' && typeof owner[part] !== 'function') ) {
            define(owner, part, { value: {} });
        }
        owner = owner[part];
    }

    if ( owner == null ) { return; }
    return { owner, prop };
}

function methodTarget(path) {
    const details = ownerAndProp(path);
    if ( details === undefined ) { return; }
    const fn = details.owner[details.prop];
    if ( fn instanceof Function === false ) { return; }
    return { ...details, fn };
}

function requestInfo(args) {
    const input = args[0];
    const init = args[1] || {};
    const url = typeof input === 'string'
        ? input
        : input?.url || '';
    const method = init.method || input?.method || 'GET';
    const body = init.body || input?.body || '';
    return {
        input,
        init,
        url: String(url),
        method: String(method),
        body,
    };
}

function matchesRequest(info, raw = '') {
    const text = String(raw || '');
    if ( text === '' ) { return true; }

    const tokens = text.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    for ( const token of tokens ) {
        const pos = token.indexOf(':');
        if ( pos === -1 ) {
            if ( matchesPattern(info.url, token) === false ) { return false; }
            continue;
        }

        const key = token.slice(0, pos);
        const pattern = token.slice(pos + 1);
        const value = key === 'method'
            ? info.method
            : key === 'body'
                ? String(info.body || '')
                : info.url;
        if ( matchesPattern(value, pattern) === false ) { return false; }
    }
    return true;
}

function responseFromText(text, response) {
    return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}

function installFetchHook() {
    if ( state.fetchInstalled || self.fetch instanceof Function === false ) { return; }
    state.fetchInstalled = true;

    const original = self.fetch;
    self.fetch = new Proxy(original, {
        async apply(target, thisArg, args) {
            let nextArgs = args;
            const info = requestInfo(nextArgs);

            for ( const transform of state.fetchTransforms ) {
                if ( transform.phase !== 'request' ) { continue; }
                const result = transform.apply(info, nextArgs);
                if ( result?.response ) { return result.response; }
                if ( result?.args ) {
                    nextArgs = result.args;
                    Object.assign(info, requestInfo(nextArgs));
                }
            }

            let response = await Reflect.apply(target, thisArg, nextArgs);
            for ( const transform of state.fetchTransforms ) {
                if ( transform.phase !== 'response' ) { continue; }
                if ( matchesRequest(info, transform.propsToMatch) === false ) { continue; }
                try {
                    response = await transform.apply(info, response);
                } catch {
                }
            }
            return response;
        },
    });
}

function addFetchTransform(transform) {
    installFetchHook();
    state.fetchTransforms.push(transform);
}

function installXhrHook() {
    if ( state.xhrInstalled || self.XMLHttpRequest === undefined ) { return; }
    const proto = self.XMLHttpRequest.prototype;
    if ( proto.open instanceof Function === false || proto.send instanceof Function === false ) {
        return;
    }
    state.xhrInstalled = true;

    const originalOpen = proto.open;
    const originalSend = proto.send;

    proto.open = new Proxy(originalOpen, {
        apply(target, thisArg, args) {
            thisArg.__adblockXHR = {
                method: String(args[0] || 'GET'),
                url: String(args[1] || ''),
            };
            return Reflect.apply(target, thisArg, args);
        },
    });

    proto.send = new Proxy(originalSend, {
        apply(target, thisArg, args) {
            const info = thisArg.__adblockXHR || { method: 'GET', url: '' };
            info.body = args[0] || '';

            for ( const transform of state.xhrRequestTransforms ) {
                try {
                    const result = transform(info, args);
                    if ( result?.block === true ) {
                        try { thisArg.abort(); } catch {}
                        return undefined;
                    }
                    if ( result?.args ) {
                        args = result.args;
                        info.body = args[0] || '';
                    }
                } catch {
                }
            }

            thisArg.addEventListener('readystatechange', () => {
                if ( thisArg.readyState !== 4 ) { return; }
                let text;
                try {
                    text = thisArg.responseText;
                } catch {
                    return;
                }

                for ( const transform of state.xhrResponseTransforms ) {
                    if ( matchesRequest(info, transform.propsToMatch) === false ) { continue; }
                    try {
                        text = transform.apply(info, text);
                    } catch {
                    }
                }

                try {
                    define(thisArg, 'responseText', { value: text });
                    if ( typeof thisArg.response === 'string' ) {
                        define(thisArg, 'response', { value: text });
                    }
                } catch {
                }
            });

            return Reflect.apply(target, thisArg, args);
        },
    });
}

function addXhrRequestTransform(transform) {
    installXhrHook();
    state.xhrRequestTransforms.push(transform);
}

function addXhrResponseTransform(transform) {
    installXhrHook();
    state.xhrResponseTransforms.push(transform);
}

/******************************************************************************/

function hostnameFromOrigin(origin) {
    try {
        return new URL(origin).hostname;
    } catch {
        const pos = String(origin).indexOf('://');
        const tail = pos === -1 ? String(origin) : String(origin).slice(pos + 3);
        return tail.split('/')[0].split(':')[0];
    }
}

function hostnameLineage(hostname) {
    const parts = String(hostname || '').split('.');
    const out = [];
    for ( let index = 0; index < parts.length; index += 1 ) {
        out.push(parts.slice(index).join('.'));
    }
    return out.filter(Boolean);
}

function entityLineage(hostname) {
    const parts = String(hostname || '').split('.');
    const out = [];
    for ( let start = 0; start < parts.length - 1; start += 1 ) {
        for ( let end = parts.length - 1; end > start; end -= 1 ) {
            out.push(`${parts.slice(start, end).join('.')}.*`);
        }
    }
    out.sort((a, b) => -compareHostnames(a, b));
    return out;
}

function compareHostnames(a, b) {
    if ( a.length !== b.length ) { return a.length - b.length; }
    if ( a === b ) { return 0; }
    return a < b ? -1 : 1;
}

function findHostnameIndex(hostnames, hostname, end = hostnames.length) {
    let left = 0;
    let right = end;
    while ( left < right ) {
        const mid = (left + right) >>> 1;
        const order = compareHostnames(hostname, hostnames[mid]);
        if ( order === 0 ) { return mid; }
        if ( order < 0 ) {
            right = mid;
        } else {
            left = mid + 1;
        }
    }
    return ~left;
}

function pageEntries(hasEntities) {
    const origins = [ document.location.origin ];
    if ( document.location.ancestorOrigins ) {
        origins.push(...document.location.ancestorOrigins);
    }

    return origins.map((origin, index) => {
        const hostname = hostnameFromOrigin(origin);
        if ( hostname === '' ) { return; }
        return {
            index,
            hns: hostnameLineage(hostname),
            ens: hasEntities ? entityLineage(hostname) : [],
        };
    }).filter(Boolean);
}

function addRefsForHostnames(out, hostnames, wanted, suffix = '') {
    let end = hostnames.length;
    for ( const hostname of wanted ) {
        const index = findHostnameIndex(hostnames, `${hostname}${suffix}`, end);
        if ( index >= 0 ) {
            out.add(index);
            end = index + 1;
        } else {
            end = ~index;
        }
    }
}

function collectTodos(data) {
    const hostnames = data.hostnames || [];
    const hasEntities = hostnames.some(hostname => hostname.endsWith('.*') || hostname.endsWith('.*>>'));
    const hasAncestors = hostnames.some(hostname => hostname.endsWith('>>'));
    const entries = pageEntries(hasEntities);
    const out = new Set();
    if ( entries.length === 0 ) { return out; }

    const hostRefIndexes = new Set();
    if ( hostnames.length !== 0 ) {
        const wildcardIndex = findHostnameIndex(hostnames, '*');
        if ( wildcardIndex >= 0 ) { hostRefIndexes.add(wildcardIndex); }

        addRefsForHostnames(hostRefIndexes, hostnames, entries[0].hns);
        if ( hasEntities ) {
            addRefsForHostnames(hostRefIndexes, hostnames, entries[0].ens);
        }
        if ( hasAncestors ) {
            for ( const entry of entries ) {
                if ( entry.index === 0 ) { continue; }
                addRefsForHostnames(hostRefIndexes, hostnames, entry.hns, '>>');
                if ( hasEntities ) {
                    addRefsForHostnames(hostRefIndexes, hostnames, entry.ens, '>>');
                }
            }
        }
    }

    const refs = String(data.arglistRefs || '').split(';');
    for ( const index of hostRefIndexes ) {
        const raw = refs[index];
        if ( raw === undefined || raw === '' ) { continue; }
        for ( const ref of JSON.parse(`[${raw}]`) ) {
            out.add(ref);
        }
    }

    const regexes = data.regexes || [];
    for ( let index = 0; index < regexes.length; index += 3 ) {
        const needle = regexes[index];
        const source = regexes[index + 1];
        const rawRefs = regexes[index + 2];
        if ( entries[0].hns.every(hostname => hostname.includes(needle) === false) ) {
            continue;
        }
        let regex;
        try {
            regex = new RegExp(source);
        } catch {
            continue;
        }
        if ( entries[0].hns.some(hostname => regex.test(hostname)) === false ) {
            continue;
        }
        for ( const ref of JSON.parse(`[${rawRefs}]`) ) {
            out.add(ref);
        }
    }

    return out;
}

/******************************************************************************/

function setConstant(path, rawValue = 'undefined') {
    const target = ownerAndProp(path, true);
    if ( target === undefined ) { return; }
    const value = parseValue(rawValue);
    define(target.owner, target.prop, {
        get() { return value; },
        set() {},
    });
}

function abortOnPropertyRead(path) {
    const target = ownerAndProp(path, true);
    if ( target === undefined ) { return; }
    define(target.owner, target.prop, {
        get() { throw new ReferenceError('AdBlock blocked a property read'); },
        set() {},
    });
}

function abortOnPropertyWrite(path) {
    const target = ownerAndProp(path, true);
    if ( target === undefined ) { return; }
    let value = target.owner[target.prop];
    define(target.owner, target.prop, {
        get() { return value; },
        set() { throw new ReferenceError('AdBlock blocked a property write'); },
    });
}

function abortCurrentScript(path, needle = '') {
    const target = ownerAndProp(path, true);
    if ( target === undefined ) { return; }
    const regex = patternRegex(needle);
    let value = target.owner[target.prop];

    const shouldAbort = () => {
        const script = document.currentScript;
        if ( script === null ) { return false; }
        return regex.test(script.textContent || script.src || '');
    };

    define(target.owner, target.prop, {
        get() {
            if ( shouldAbort() ) { throw new ReferenceError('AdBlock aborted a matching script'); }
            return value;
        },
        set(next) {
            if ( shouldAbort() ) { throw new ReferenceError('AdBlock aborted a matching script'); }
            value = next;
        },
    });
}

function abortOnStackTrace(path, needle = '') {
    const target = ownerAndProp(path, true);
    if ( target === undefined ) { return; }
    const regex = patternRegex(needle);
    let value = target.owner[target.prop];
    const shouldAbort = () => regex.test((new Error()).stack || '');
    define(target.owner, target.prop, {
        get() {
            if ( shouldAbort() ) { throw new ReferenceError('AdBlock blocked a stack trace'); }
            return value;
        },
        set(next) {
            if ( shouldAbort() ) { throw new ReferenceError('AdBlock blocked a stack trace'); }
            value = next;
        },
    });
}

function preventTimer(api, needle = '', delay = '') {
    const original = self[api];
    if ( original instanceof Function === false ) { return; }
    const expectedDelay = String(delay);
    self[api] = new Proxy(original, {
        apply(target, thisArg, args) {
            const callbackText = String(args[0] || '');
            const delayText = args.length > 1 ? String(args[1]) : '';
            if ( matchesPattern(callbackText, needle) && (expectedDelay === '' || expectedDelay === delayText) ) {
                return 0;
            }
            return Reflect.apply(target, thisArg, args);
        },
    });
}

function adjustTimer(api, needle = '', delay = '', factor = '0.001') {
    const original = self[api];
    if ( original instanceof Function === false ) { return; }
    const expectedDelay = String(delay);
    const multiplier = Number(factor);
    self[api] = new Proxy(original, {
        apply(target, thisArg, args) {
            const callbackText = String(args[0] || '');
            const delayText = args.length > 1 ? String(args[1]) : '';
            if ( Number.isFinite(multiplier) && matchesPattern(callbackText, needle) && (expectedDelay === '' || expectedDelay === delayText) ) {
                args = Array.from(args);
                args[1] = Math.max(0, Math.floor(Number(args[1] || 0) * multiplier));
            }
            return Reflect.apply(target, thisArg, args);
        },
    });
}

function preventAddEventListener(typeNeedle = '', listenerNeedle = '') {
    const original = EventTarget.prototype.addEventListener;
    if ( original instanceof Function === false ) { return; }
    EventTarget.prototype.addEventListener = new Proxy(original, {
        apply(target, thisArg, args) {
            const type = String(args[0] || '');
            const listener = String(args[1] || '');
            if ( matchesPattern(type, typeNeedle) && matchesPattern(listener, listenerNeedle) ) {
                return undefined;
            }
            return Reflect.apply(target, thisArg, args);
        },
    });
}

function preventRequestAnimationFrame(needle = '') {
    const original = self.requestAnimationFrame;
    if ( original instanceof Function === false ) { return; }
    self.requestAnimationFrame = new Proxy(original, {
        apply(target, thisArg, args) {
            const callback = args[0];
            if ( matchesPattern(String(callback || ''), needle) ) {
                return 0;
            }
            return Reflect.apply(target, thisArg, args);
        },
    });
}

function noEvalIf(needle = '') {
    if ( self.eval instanceof Function ) {
        self.eval = new Proxy(self.eval, {
            apply(target, thisArg, args) {
                if ( matchesPattern(String(args[0] || ''), needle) ) { return undefined; }
                return Reflect.apply(target, thisArg, args);
            },
        });
    }
}

function alertBuster() {
    try { self.alert = noop; } catch {}
    try { self.confirm = () => true; } catch {}
}

function noWebrtc() {
    try { self.RTCPeerConnection = undefined; } catch {}
    try { self.webkitRTCPeerConnection = undefined; } catch {}
}

function noWindowOpenIf(needle = '') {
    const original = self.open;
    if ( original instanceof Function === false ) { return; }
    self.open = new Proxy(original, {
        apply(target, thisArg, args) {
            if ( matchesPattern(String(args[0] || ''), needle) ) {
                return null;
            }
            return Reflect.apply(target, thisArg, args);
        },
    });
}

function preventFetch(propsToMatch = '', body = '') {
    addFetchTransform({
        phase: 'request',
        apply(info) {
            if ( matchesRequest(info, propsToMatch) === false ) { return; }
            const text = body === 'emptyArr' ? '[]' : body === 'emptyObj' ? '{}' : '';
            return {
                response: new Response(text, { status: 200, statusText: 'OK' }),
            };
        },
    });
}

function preventXhr(propsToMatch = '') {
    addXhrRequestTransform(info => {
        if ( matchesRequest(info, propsToMatch) ) {
            return { block: true };
        }
    });
}

function replaceText(text, pattern, replacement = '') {
    const source = String(pattern || '');
    const match = source.match(/^\/([\s\S]*)\/([a-z]*)$/i);
    if ( match ) {
        try {
            return text.replace(new RegExp(match[1], match[2]), replacement);
        } catch {
            return text;
        }
    }
    return text.split(source).join(replacement);
}

function trustedReplaceFetchResponse(pattern = '', replacement = '', propsToMatch = '') {
    addFetchTransform({
        phase: 'response',
        propsToMatch,
        async apply(info, response) {
            const text = await response.clone().text();
            return responseFromText(replaceText(text, pattern, replacement), response);
        },
    });
}

function trustedReplaceXhrResponse(pattern = '', replacement = '', propsToMatch = '') {
    addXhrResponseTransform({
        propsToMatch,
        apply(info, text) {
            return replaceText(text, pattern, replacement);
        },
    });
}

function preventInnerHTML(needle = '') {
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if ( descriptor?.set instanceof Function === false ) { return; }
    define(Element.prototype, 'innerHTML', {
        get: descriptor.get,
        set(value) {
            if ( matchesPattern(String(value || ''), needle) ) { return; }
            return descriptor.set.call(this, value);
        },
    });
}

/******************************************************************************/

function pathTokens(path) {
    return String(path || '')
        .replace(/^\$\.?/, '')
        .replace(/^\.+/, '')
        .split('.')
        .filter(Boolean);
}

function conditionFromToken(token) {
    const match = token.match(/^\[\?\.?([^\]=~^*$]+)([*^$]?=|==)(?:"([^"]*)"|'([^']*)'|([^\]]+))\]$/);
    if ( match === null ) { return; }
    return {
        key: match[1],
        op: match[2],
        value: match[3] ?? match[4] ?? match[5] ?? '',
    };
}

function objectMatchesCondition(object, condition) {
    if ( object == null || typeof object !== 'object' ) { return false; }
    const actual = String(object[condition.key] ?? '');
    const expected = String(condition.value);
    switch ( condition.op ) {
    case '*=': return actual.includes(expected);
    case '^=': return actual.startsWith(expected);
    case '$=': return actual.endsWith(expected);
    default: return actual === expected;
    }
}

function visitJson(node, tokens, callback) {
    if ( node == null || tokens.length === 0 ) { return; }
    const [ token, ...rest ] = tokens;
    const condition = conditionFromToken(token);

    if ( condition !== undefined ) {
        if ( Array.isArray(node) ) {
            for ( let index = node.length - 1; index >= 0; index -= 1 ) {
                if ( objectMatchesCondition(node[index], condition) ) {
                    if ( rest.length === 0 ) {
                        callback(node, index);
                    } else {
                        visitJson(node[index], rest, callback);
                    }
                }
            }
        } else if ( objectMatchesCondition(node, condition) ) {
            visitJson(node, rest, callback);
        }
        return;
    }

    if ( token === '*' || token === '[]' || token === '[-]' || token === '[=]' ) {
        if ( Array.isArray(node) ) {
            for ( let index = node.length - 1; index >= 0; index -= 1 ) {
                if ( rest.length === 0 ) {
                    callback(node, index);
                } else {
                    visitJson(node[index], rest, callback);
                }
            }
        } else if ( typeof node === 'object' ) {
            for ( const key of Object.keys(node) ) {
                if ( rest.length === 0 ) {
                    callback(node, key);
                } else {
                    visitJson(node[key], rest, callback);
                }
            }
        }
        return;
    }

    if ( token === '' ) { return; }
    if ( rest.length === 0 ) {
        if ( typeof node === 'object' && token in node ) {
            callback(node, token);
        }
        return;
    }

    if ( token in Object(node) ) {
        visitJson(node[token], rest, callback);
    }
}

function deepDeleteByName(node, prop) {
    if ( node == null || typeof node !== 'object' ) { return; }
    if ( Array.isArray(node) ) {
        for ( const item of node ) { deepDeleteByName(item, prop); }
        return;
    }
    if ( Object.prototype.hasOwnProperty.call(node, prop) ) {
        delete node[prop];
    }
    for ( const value of Object.values(node) ) {
        deepDeleteByName(value, prop);
    }
}

function deleteJsonPath(root, rawPath) {
    const tokens = pathTokens(rawPath);
    if ( tokens.length === 0 ) { return; }

    if ( rawPath.startsWith('..') ) {
        const prop = tokens[tokens.length - 1].replace(/\[.*$/, '');
        if ( /^[\w$-]+$/.test(prop) ) {
            deepDeleteByName(root, prop);
            return;
        }
    }

    visitJson(root, tokens, (owner, key) => {
        if ( Array.isArray(owner) ) {
            owner.splice(Number(key), 1);
        } else {
            delete owner[key];
        }
    });
}

function setJsonPath(root, rawPath, value, merge = false) {
    if ( rawPath === '$' || rawPath === '' ) {
        if ( merge && value && typeof value === 'object' && root && typeof root === 'object' ) {
            Object.assign(root, value);
        }
        return;
    }

    const tokens = pathTokens(rawPath);
    const prop = tokens.pop();
    if ( prop === undefined ) { return; }

    const assign = (owner, key) => {
        if ( owner == null || typeof owner !== 'object' ) { return; }
        if ( merge && value && typeof value === 'object' && owner[key] && typeof owner[key] === 'object' ) {
            Object.assign(owner[key], value);
        } else {
            owner[key] = value;
        }
    };

    if ( rawPath.startsWith('..') ) {
        const visit = node => {
            if ( node == null || typeof node !== 'object' ) { return; }
            if ( Object.prototype.hasOwnProperty.call(node, prop) ) {
                assign(node, prop);
            }
            for ( const value of Object.values(node) ) { visit(value); }
        };
        visit(root);
        return;
    }

    let owner = root;
    for ( const token of tokens ) {
        if ( owner == null || typeof owner !== 'object' ) { return; }
        if ( owner[token] == null ) { owner[token] = {}; }
        owner = owner[token];
    }
    assign(owner, prop);
}

function applyJsonInstruction(root, instruction, editMode = false) {
    const parts = String(instruction || '').split(/\s+/).filter(Boolean);
    for ( const part of parts ) {
        if ( editMode ) {
            const mergePos = part.indexOf('+=');
            const setPos = mergePos === -1 ? part.indexOf('=') : -1;
            if ( mergePos !== -1 ) {
                setJsonPath(root, part.slice(0, mergePos), parseValue(part.slice(mergePos + 2)), true);
                continue;
            }
            if ( setPos !== -1 ) {
                setJsonPath(root, part.slice(0, setPos), parseValue(part.slice(setPos + 1)), false);
                continue;
            }
        }
        deleteJsonPath(root, part);
    }
}

function transformJsonText(text, instruction, editMode = false) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        return text;
    }
    applyJsonInstruction(data, instruction, editMode);
    try {
        return JSON.stringify(data);
    } catch {
        return text;
    }
}

function jsonPrune(rawPrunePaths = '') {
    const original = JSON.parse;
    JSON.parse = new Proxy(original, {
        apply(target, thisArg, args) {
            const out = Reflect.apply(target, thisArg, args);
            applyJsonInstruction(out, rawPrunePaths, false);
            return out;
        },
    });
}

function jsonEdit(rawEdit = '') {
    const original = JSON.parse;
    JSON.parse = new Proxy(original, {
        apply(target, thisArg, args) {
            const out = Reflect.apply(target, thisArg, args);
            applyJsonInstruction(out, rawEdit, true);
            return out;
        },
    });
}

function jsonPruneFetchResponse(rawPrunePaths = '', _required = '', _props = '', propsToMatch = '') {
    addFetchTransform({
        phase: 'response',
        propsToMatch: propsToMatch || _required,
        async apply(info, response) {
            const text = await response.clone().text();
            return responseFromText(transformJsonText(text, rawPrunePaths, false), response);
        },
    });
}

function jsonPruneXhrResponse(rawPrunePaths = '', _required = '', _props = '', propsToMatch = '') {
    addXhrResponseTransform({
        propsToMatch: propsToMatch || _required,
        apply(info, text) {
            return transformJsonText(text, rawPrunePaths, false);
        },
    });
}

function jsonEditFetchResponse(rawEdit = '', _props = '', propsToMatch = '') {
    addFetchTransform({
        phase: 'response',
        propsToMatch,
        async apply(info, response) {
            const text = await response.clone().text();
            return responseFromText(transformJsonText(text, rawEdit, true), response);
        },
    });
}

function jsonEditXhrResponse(rawEdit = '', _props = '', propsToMatch = '') {
    addXhrResponseTransform({
        propsToMatch,
        apply(info, text) {
            return transformJsonText(text, rawEdit, true);
        },
    });
}

function jsonEditFetchRequest(rawEdit = '', _props = '', propsToMatch = '') {
    addFetchTransform({
        phase: 'request',
        apply(info, args) {
            if ( matchesRequest(info, propsToMatch) === false || typeof info.init.body !== 'string' ) { return; }
            const init = { ...info.init, body: transformJsonText(info.init.body, rawEdit, true) };
            return { args: [ info.input, init ] };
        },
    });
}

function jsonEditXhrRequest(rawEdit = '', _props = '', propsToMatch = '') {
    addXhrRequestTransform((info, args) => {
        if ( matchesRequest(info, propsToMatch) === false || typeof args[0] !== 'string' ) { return; }
        return { args: [ transformJsonText(args[0], rawEdit, true) ] };
    });
}

function jsonlEditXhrResponse(rawEdit = '', _props = '', propsToMatch = '') {
    addXhrResponseTransform({
        propsToMatch,
        apply(info, text) {
            return String(text).split('\n').map(line =>
                line.trim() === '' ? line : transformJsonText(line, rawEdit, true)
            ).join('\n');
        },
    });
}

function evaldataPrune(rawPrunePaths = '') {
    const original = self.eval;
    if ( original instanceof Function === false ) { return; }
    self.eval = new Proxy(original, {
        apply(target, thisArg, args) {
            if ( typeof args[0] === 'string' ) {
                args = [ transformJsonText(args[0], rawPrunePaths, false), ...args.slice(1) ];
            }
            return Reflect.apply(target, thisArg, args);
        },
    });
}

function m3uPrune(pattern = '', propsToMatch = '') {
    const transform = text => {
        const regex = patternRegex(pattern, 'm');
        return String(text)
            .split('\n')
            .filter(line => regex.test(line) === false)
            .join('\n');
    };
    addFetchTransform({
        phase: 'response',
        propsToMatch,
        async apply(info, response) {
            const text = await response.clone().text();
            return responseFromText(transform(text), response);
        },
    });
    addXhrResponseTransform({ propsToMatch, apply: (info, text) => transform(text) });
}

function xmlPrune(selector = '', _unused = '', propsToMatch = '') {
    const transform = text => {
        if ( selector.startsWith('xpath(') ) {
            return text;
        }
        const tag = selector.replace(/\[.*$/, '').replace(/[^\w:-]/g, '');
        if ( tag === '' ) { return text; }
        try {
            return String(text).replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, 'g'), '');
        } catch {
            return text;
        }
    };
    addFetchTransform({
        phase: 'response',
        propsToMatch,
        async apply(info, response) {
            const text = await response.clone().text();
            return responseFromText(transform(text), response);
        },
    });
    addXhrResponseTransform({ propsToMatch, apply: (info, text) => transform(text) });
}

/******************************************************************************/

function runWhenReady(fn) {
    if ( document.readyState === 'loading' ) {
        document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
        fn();
    }
}

function observeAndRun(fn) {
    runWhenReady(fn);
    try {
        const observer = new MutationObserver(fn);
        observer.observe(document.documentElement || document, {
            childList: true,
            subtree: true,
            attributes: true,
        });
    } catch {
    }
}

function removeAttr(rawToken = '', rawSelector = '', behavior = '') {
    const tokens = String(rawToken).split(/\s*\|\s*/).filter(Boolean);
    const selector = rawSelector || `[${tokens.join('],[')}]`;
    if ( tokens.length === 0 || selector === '' ) { return; }
    observeAndRun(() => {
        for ( const node of document.querySelectorAll(selector) ) {
            for ( const token of tokens ) { node.removeAttribute(token); }
        }
    });
}

function removeClass(rawToken = '', rawSelector = '', behavior = '') {
    const tokens = String(rawToken).split(/\s*\|\s*/).filter(Boolean);
    const selector = rawSelector || tokens.map(token => `.${CSS.escape(token)}`).join(',');
    if ( tokens.length === 0 || selector === '' ) { return; }
    observeAndRun(() => {
        for ( const node of document.querySelectorAll(selector) ) {
            node.classList.remove(...tokens);
        }
    });
}

function setAttr(selector = '', attr = '', value = '') {
    if ( selector === '' || attr === '' ) { return; }
    observeAndRun(() => {
        for ( const node of document.querySelectorAll(selector) ) {
            node.setAttribute(attr, String(parseValue(value)));
        }
    });
}

function removeCookie(rawName = '') {
    const regex = patternRegex(rawName);
    for ( const cookie of document.cookie.split(/\s*;\s*/) ) {
        const pos = cookie.indexOf('=');
        const name = pos === -1 ? cookie : cookie.slice(0, pos);
        if ( regex.test(name) === false ) { continue; }
        document.cookie = `${name}=; Max-Age=-1; path=/`;
        document.cookie = `${name}=; Max-Age=-1; path=/; domain=${document.location.hostname}`;
    }
}

function setCookie(name = '', value = '') {
    if ( name === '' ) { return; }
    document.cookie = `${name}=${encodeURIComponent(String(parseValue(value)))}; path=/; SameSite=Lax`;
}

function setCookieReload(name = '', value = '') {
    setCookie(name, value);
    try { document.location.reload(); } catch {}
}

function setLocalStorageItem(key = '', value = '') {
    try { localStorage.setItem(key, String(parseValue(value))); } catch {}
}

function setSessionStorageItem(key = '', value = '') {
    try { sessionStorage.setItem(key, String(parseValue(value))); } catch {}
}

function removeNodeText(selector = '', needle = '') {
    const regex = patternRegex(needle);
    observeAndRun(() => {
        for ( const node of document.querySelectorAll(selector || 'script') ) {
            if ( regex.test(node.textContent || '') ) {
                node.textContent = '';
            }
        }
    });
}

function replaceNodeText(selector = '', needle = '', replacement = '') {
    const regex = patternRegex(needle, 'g');
    observeAndRun(() => {
        for ( const node of document.querySelectorAll(selector || 'script') ) {
            node.textContent = String(node.textContent || '').replace(regex, replacement);
        }
    });
}

function hrefSanitizer(selector = 'a[href]', source = '') {
    observeAndRun(() => {
        for ( const anchor of document.querySelectorAll(selector || 'a[href]') ) {
            try {
                const url = new URL(anchor.href, document.location.href);
                const value = source
                    ? url.searchParams.get(source)
                    : url.searchParams.get('url') || url.searchParams.get('u') || url.searchParams.get('target');
                if ( value ) { anchor.href = new URL(value, document.location.href).href; }
            } catch {
            }
        }
    });
}

function trustedClickElement(selector = '', extraMatch = '', delay = '1') {
    if ( selector === '' ) { return; }
    const ms = Math.max(0, Number(delay) || 1) * 1000;
    setTimeout(() => {
        const node = document.querySelector(selector);
        if ( node === null ) { return; }
        if ( extraMatch && matchesPattern(node.textContent || node.href || '', extraMatch) === false ) { return; }
        try { node.click(); } catch {}
    }, ms);
}

function trustedCreateHTML(selector = '', html = '') {
    if ( selector === '' || html === '' ) { return; }
    runWhenReady(() => {
        const node = document.querySelector(selector);
        if ( node !== null ) {
            node.insertAdjacentHTML('beforeend', html);
        }
    });
}

function closeWindow() {
    try { self.close(); } catch {}
}

function preventRefresh() {
    runWhenReady(() => {
        for ( const node of document.querySelectorAll('meta[http-equiv="refresh" i]') ) {
            node.remove();
        }
    });
}

function disableNewtabLinks() {
    observeAndRun(() => {
        for ( const node of document.querySelectorAll('a[target="_blank"]') ) {
            node.removeAttribute('target');
        }
    });
}

function preventCanvas() {
    const proto = typeof HTMLCanvasElement === 'function'
        ? HTMLCanvasElement.prototype
        : undefined;
    if ( proto === undefined ) { return; }
    if ( proto.toDataURL instanceof Function ) {
        proto.toDataURL = new Proxy(proto.toDataURL, {
            apply() { return 'data:,'; },
        });
    }
}

function spoofCSS(selector = '', property = '', value = '') {
    if ( selector === '' || property === '' ) { return; }
    const original = self.getComputedStyle;
    if ( original instanceof Function === false ) { return; }
    self.getComputedStyle = new Proxy(original, {
        apply(target, thisArg, args) {
            const style = Reflect.apply(target, thisArg, args);
            try {
                if ( args[0]?.matches?.(selector) ) {
                    return new Proxy(style, {
                        get(styleTarget, prop) {
                            if ( prop === property || prop === 'getPropertyValue' ) {
                                if ( prop === 'getPropertyValue' ) {
                                    return name => name === property ? value : style.getPropertyValue(name);
                                }
                                return value;
                            }
                            return styleTarget[prop];
                        },
                    });
                }
            } catch {
            }
            return style;
        },
    });
}

/******************************************************************************/

function trustedReplaceArgument(path = '', index = '0', replacement = '', conditionType = '', condition = '') {
    const target = methodTarget(path);
    if ( target === undefined ) { return; }
    const argIndex = Number(index) || 0;
    target.owner[target.prop] = new Proxy(target.fn, {
        apply(fnTarget, thisArg, args) {
            const text = args.map(arg => String(arg)).join(' ');
            if ( condition === '' || matchesPattern(text, condition) ) {
                args = Array.from(args);
                if ( String(replacement).startsWith('repl:') ) {
                    const [ from, to ] = String(replacement).slice(5).split('/').filter(Boolean);
                    args[argIndex] = String(args[argIndex] || '').replace(patternRegex(`/${from}/`), to || '');
                } else {
                    args[argIndex] = parseValue(replacement);
                }
            }
            return Reflect.apply(fnTarget, thisArg, args);
        },
    });
}

function trustedSuppressNativeMethod(path = '', argsNeedle = '', action = 'prevent') {
    const target = methodTarget(path);
    if ( target === undefined ) { return; }
    target.owner[target.prop] = new Proxy(target.fn, {
        apply(fnTarget, thisArg, args) {
            const text = JSON.stringify(args, (key, value) =>
                typeof value === 'function' ? String(value) : value
            );
            if ( matchesPattern(text, String(parseValue(argsNeedle))) ) {
                if ( action === 'abort' ) { throw new Error('AdBlock suppressed a native method'); }
                return undefined;
            }
            return Reflect.apply(fnTarget, thisArg, args);
        },
    });
}

function trustedOverrideElementMethod(path = '', selector = '') {
    const target = methodTarget(path);
    if ( target === undefined ) { return; }
    target.owner[target.prop] = new Proxy(target.fn, {
        apply(fnTarget, thisArg, args) {
            try {
                if ( thisArg?.matches?.(selector) ) { return undefined; }
            } catch {
            }
            return Reflect.apply(fnTarget, thisArg, args);
        },
    });
}

function trustedPreventDomBypass(path = '', targetProp = '') {
    const target = methodTarget(path);
    if ( target === undefined ) { return; }
    target.owner[target.prop] = new Proxy(target.fn, {
        apply(fnTarget, thisArg, args) {
            const result = Reflect.apply(fnTarget, thisArg, args);
            const elems = new Set(args.filter(arg =>
                self.HTMLElement instanceof Function &&
                arg instanceof self.HTMLElement
            ));
            if ( elems.size === 0 ) { return result; }
            for ( const elem of elems ) {
                try {
                    if ( `${elem.contentWindow}` !== '[object Window]' ) { continue; }
                    const { href } = elem.contentWindow.location;
                    if ( href !== 'about:blank' && href !== self.location.href ) {
                        continue;
                    }
                    if ( targetProp !== '' ) {
                        const parts = pathParts(targetProp);
                        const prop = parts.pop();
                        let source = self;
                        let destination = elem.contentWindow;
                        for ( const part of parts ) {
                            source = source?.[part];
                            destination = destination?.[part];
                            if ( source === undefined || destination === undefined ) { break; }
                        }
                        if ( source !== undefined && destination !== undefined ) {
                            destination[prop] = source[prop];
                        }
                    } else {
                        define(elem, 'contentWindow', { value: self });
                    }
                } catch {
                }
            }
            return result;
        },
    });
}

function trustedEditInboundObject(path = '', argIndex = '0', rawEdit = '') {
    const target = methodTarget(path);
    if ( target === undefined ) { return; }
    const index = Number(argIndex) || 0;
    target.owner[target.prop] = new Proxy(target.fn, {
        apply(fnTarget, thisArg, args) {
            if ( args[index] && typeof args[index] === 'object' ) {
                applyJsonInstruction(args[index], rawEdit, true);
            }
            return Reflect.apply(fnTarget, thisArg, args);
        },
    });
}

function trustedReplaceOutboundText(path = '', pattern = '', replacement = '') {
    const target = methodTarget(path);
    if ( target === undefined ) { return; }
    target.owner[target.prop] = new Proxy(target.fn, {
        apply(fnTarget, thisArg, args) {
            const out = Reflect.apply(fnTarget, thisArg, args);
            return typeof out === 'string' ? replaceText(out, pattern, replacement) : out;
        },
    });
}

function multiup() {
}

/******************************************************************************/

const registry = {
    abortCurrentScript,
    abortOnPropertyRead,
    abortOnPropertyWrite,
    abortOnStackTrace,
    adjustSetInterval: (...args) => adjustTimer('setInterval', ...args),
    adjustSetTimeout: (...args) => adjustTimer('setTimeout', ...args),
    alertBuster,
    closeWindow,
    disableNewtabLinks,
    evaldataPrune,
    hrefSanitizer,
    jsonEdit,
    jsonEditFetchRequest,
    jsonEditFetchResponse,
    jsonEditXhrResponse,
    jsonlEditXhrResponse,
    jsonPrune,
    jsonPruneFetchResponse,
    jsonPruneXhrResponse,
    m3uPrune,
    multiup,
    noEvalIf,
    noWebrtc,
    noWindowOpenIf,
    preventAddEventListener,
    preventCanvas,
    preventFetch,
    preventInnerHTML,
    preventRefresh,
    preventRequestAnimationFrame,
    preventSetInterval: (...args) => preventTimer('setInterval', ...args),
    preventSetTimeout: (...args) => preventTimer('setTimeout', ...args),
    preventXhr,
    removeAttr,
    removeClass,
    removeCookie,
    removeNodeText,
    replaceNodeText,
    setAttr,
    setConstant,
    setCookie,
    setCookieReload,
    setLocalStorageItem,
    setSessionStorageItem,
    spoofCSS,
    trustedClickElement,
    trustedCreateHTML,
    trustedEditInboundObject,
    trustedJsonEdit: jsonEdit,
    trustedJsonEditFetchResponse: jsonEditFetchResponse,
    trustedJsonEditXhrRequest: jsonEditXhrRequest,
    trustedJsonEditXhrResponse: jsonEditXhrResponse,
    trustedOverrideElementMethod,
    trustedPreventDomBypass,
    trustedPreventFetch: preventFetch,
    trustedPreventXhr: preventXhr,
    trustedReplaceArgument,
    trustedReplaceFetchResponse,
    trustedReplaceOutboundText,
    trustedReplaceXhrResponse,
    trustedSetAttr: setAttr,
    trustedSetConstant: setConstant,
    trustedSetCookie: setCookie,
    trustedSetCookieReload: setCookieReload,
    trustedSetLocalStorageItem: setLocalStorageItem,
    trustedSetSessionStorageItem: setSessionStorageItem,
    trustedSuppressNativeMethod,
    xmlPrune,
};

self.adblockRunScriptlets = function adblockRunScriptlets(data) {
    const key = `${data.rulesetId || ''}:${data.world || ''}`;
    if ( state.installedData.has(key) ) { return; }
    state.installedData.add(key);

    const todo = collectTodos(data);
    if ( todo.size === 0 ) { return; }

    const arglists = String(data.arglists || '').split(';');
    const args = data.args || [];
    const functions = data.functions || [];

    for ( const ref of todo ) {
        if ( ref < 0 || todo.has(~ref) ) { continue; }
        const raw = arglists[ref];
        if ( raw === undefined || raw === '' ) { continue; }

        let arglist;
        try {
            arglist = JSON.parse(`[${raw}]`);
        } catch {
            continue;
        }

        const name = functions[arglist[0]];
        const fn = registry[name];
        if ( fn instanceof Function === false ) { continue; }

        try {
            fn(...arglist.slice(1).map(index => args[index]));
        } catch {
        }
    }
};

/******************************************************************************/

})();

void 0;
