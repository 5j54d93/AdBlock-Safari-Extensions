/*******************************************************************************

    AdBlock

    Shared page-context helpers for content scripts.

*/

(function adblockIsolatedAPI(existingAPI) {

'use strict';

if ( existingAPI instanceof Object ) { return; }
if ( self.__adblockSkipGoogleSearch === true ) { return; }

/******************************************************************************/

function isGoogleSearchPage() {
    const { hostname, pathname, search } = document.location;
    const normalizedHostname = String(hostname || '').toLowerCase();
    const isGoogle =
        normalizedHostname === 'google.com' ||
        /(^|\.)google\.[a-z.]+$/.test(normalizedHostname);

    if ( isGoogle === false ) { return false; }
    if ( pathname === '/search' || pathname === '/webhp' ) { return true; }
    return pathname === '/' && /(?:^|[?&])q=/.test(search);
}

function reportGoogleSearchSkip() {
    try {
        chrome.runtime.sendMessage({
            what: 'googleSearchContentScriptSkipped',
            scriptName: 'isolated-api',
            url: document.location.href,
        }).catch(( ) => {});
    } catch {
    }
}

if ( isGoogleSearchPage() ) {
    reportGoogleSearchSkip();
    return;
}

/******************************************************************************/

function hostnameFromOrigin(origin) {
    try {
        return new URL(origin).hostname;
    } catch {
        const schemePos = String(origin).indexOf('://');
        const withoutScheme = schemePos === -1
            ? String(origin)
            : String(origin).slice(schemePos + 3);
        return withoutScheme.split('/')[0].split(':')[0];
    }
}

function hostnameLineage(hostname) {
    const out = [];
    let current = String(hostname || '').toLowerCase();

    while ( current !== '' ) {
        out.push(current);
        const dot = current.indexOf('.');
        if ( dot === -1 ) { break; }
        current = current.slice(dot + 1);
    }

    return out;
}

function entityLineage(hostname) {
    const parts = String(hostname || '').toLowerCase().split('.');
    const out = [];

    for ( let start = 0; start < parts.length - 1; start += 1 ) {
        for ( let end = parts.length - 1; end > start; end -= 1 ) {
            out.push(`${parts.slice(start, end).join('.')}.*`);
        }
    }

    out.sort((a, b) => {
        if ( a.length !== b.length ) { return b.length - a.length; }
        return a < b ? -1 : 1;
    });
    return out;
}

function compareByCompiledOrder(a, b) {
    if ( a.length !== b.length ) {
        return a.length - b.length;
    }
    if ( a === b ) { return 0; }
    return a < b ? -1 : 1;
}

/******************************************************************************/

self.isolatedAPI = {
    contexts: {
        entries: [],

        compute() {
            const origins = [ document.location.origin ];
            if ( document.location.ancestorOrigins ) {
                origins.push(...document.location.ancestorOrigins);
            }

            this.entries = origins
                .map((origin, index) => {
                    const hostname = hostnameFromOrigin(origin);
                    if ( hostname === '' ) { return undefined; }
                    return {
                        index,
                        hns: hostnameLineage(hostname),
                        ens: undefined,
                    };
                })
                .filter(Boolean);
        },

        get current() {
            if ( this.entries.length === 0 ) { this.compute(); }
            return this.entries[0] || {
                hns: hostnameLineage(document.location.hostname),
            };
        },

        get top() {
            if ( this.entries.length === 0 ) { this.compute(); }
            return this.entries.at(-1) || this.current;
        },

        get topHostname() {
            return this.top.hns[0] || document.location.hostname || '';
        },

        get hostnames() {
            return this.current.hns;
        },

        get entities() {
            const current = this.current;
            current.ens ??= entityLineage(current.hns[0]);
            return current.ens;
        },
    },

    binarySearch(haystack, needle, start = 0) {
        let left = Math.max(start, 0);
        let right = haystack.length;
        let mid = left;

        while ( left < right ) {
            mid = (left + right) >>> 1;
            const order = compareByCompiledOrder(needle, haystack[mid]);
            if ( order === 0 ) { return mid; }
            if ( order < 0 ) {
                right = mid;
            } else {
                left = mid + 1;
            }
        }

        return ~left;
    },
};

/******************************************************************************/

})(self.isolatedAPI);

void 0;
