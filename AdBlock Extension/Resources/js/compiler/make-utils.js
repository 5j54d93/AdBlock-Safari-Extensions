/*******************************************************************************

    AdBlock

    Shared helpers for offscreen filter compilation.

*/

export function hostnameCompare(a, b) {
    if ( a.length !== b.length ) {
        return a.length - b.length;
    }
    if ( a === b ) { return 0; }
    return a < b ? -1 : 1;
}

export function isHnRegexOrPath(hostname) {
    return String(hostname || '').includes('/');
}
