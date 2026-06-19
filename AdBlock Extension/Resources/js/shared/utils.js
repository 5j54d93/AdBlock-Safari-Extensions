/*******************************************************************************

    AdBlock

    Runtime utilities for hostname matching, extension match patterns, and
    compact value comparisons.

*/

export function parsedURLromOrigin(origin) {
    try {
        return new URL(origin);
    } catch {
    }
}

export function toBroaderHostname(hostname) {
    if ( hostname === '*' ) { return ''; }
    const dot = hostname.indexOf('.');
    return dot === -1 ? '*' : hostname.slice(dot + 1);
}

export function isDescendantHostname(hostname, ancestor) {
    if ( ancestor === 'all-urls' || ancestor === '*' ) { return true; }
    if ( hostname === ancestor ) { return false; }
    return hostname.endsWith(`.${ancestor}`);
}

export function isDescendantHostnameOfIter(hostname, ancestors) {
    const ancestorSet = ancestors instanceof Set
        ? ancestors
        : new Set(ancestors);

    if ( ancestorSet.has('all-urls') || ancestorSet.has('*') ) { return true; }

    let current = hostname;
    for (;;) {
        const dot = current.indexOf('.');
        if ( dot === -1 ) { return false; }
        current = current.slice(dot + 1);
        if ( ancestorSet.has(current) ) { return true; }
    }
}

export function intersectHostnameIters(hostnames, ancestors) {
    const ancestorSet = ancestors instanceof Set
        ? ancestors
        : new Set(ancestors);

    if ( ancestorSet.has('all-urls') || ancestorSet.has('*') ) {
        return Array.from(hostnames);
    }

    return Array.from(hostnames).filter(hostname =>
        ancestorSet.has(hostname) ||
        isDescendantHostnameOfIter(hostname, ancestorSet)
    );
}

export function subtractHostnameIters(hostnames, ancestors) {
    const ancestorSet = ancestors instanceof Set
        ? ancestors
        : new Set(ancestors);

    if ( ancestorSet.has('all-urls') || ancestorSet.has('*') ) { return []; }

    return Array.from(hostnames).filter(hostname =>
        ancestorSet.has(hostname) === false &&
        isDescendantHostnameOfIter(hostname, ancestorSet) === false
    );
}

export function matchFromHostname(hostname) {
    return hostname === '*' || hostname === 'all-urls'
        ? '<all_urls>'
        : `*://*.${hostname}/*`;
}

export function matchesFromHostnames(hostnames) {
    return Array.from(hostnames, matchFromHostname);
}

export function hostnameFromMatch(match) {
    if ( match === '<all_urls>' || match === '*://*/*' ) {
        return 'all-urls';
    }
    return /^[^:]+:\/\/(?:\*\.)?([^/]+)\/\*/.exec(match)?.[1] ?? '';
}

export function hostnamesFromMatches(matches) {
    return Array.from(matches, hostnameFromMatch)
        .filter(hostname => hostname !== '');
}

/******************************************************************************/

export function deepEquals(left, right) {
    if ( Object.is(left, right) ) { return true; }
    if ( typeof left !== 'object' || typeof right !== 'object' ) { return false; }
    if ( left === null || right === null ) { return false; }

    if ( Array.isArray(left) || Array.isArray(right) ) {
        if ( Array.isArray(left) === false || Array.isArray(right) === false ) {
            return false;
        }
        if ( left.length !== right.length ) { return false; }
        return left.every((value, index) =>
            deepEquals(value, right[index])
        );
    }

    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if ( leftKeys.length !== rightKeys.length ) { return false; }

    return leftKeys.every(key =>
        Object.hasOwn(right, key) &&
        deepEquals(left[key], right[key])
    );
}

export function broadcastMessage(message) {
    new BroadcastChannel('AdBlock').postMessage(message);
}

export function strArrayEq(left = [], right = [], sort = true) {
    if ( left.length !== right.length ) { return false; }

    const a = sort ? left.slice().sort() : left;
    const b = sort ? right.slice().sort() : right;

    return a.every((value, index) => value === b[index]);
}
