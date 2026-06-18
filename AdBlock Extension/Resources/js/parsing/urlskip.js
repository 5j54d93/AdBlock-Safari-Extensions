/*******************************************************************************

    AdBlock

    URL extraction helper for redirect-style filter scriptlets.

*/

function safeBase64Decode(value) {
    try {
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        return atob(normalized);
    } catch {
        return value;
    }
}

function valueFromURL(url, token) {
    if ( token === '' ) { return url.href; }
    if ( token.startsWith('?') ) {
        return url.searchParams.get(token.slice(1)) || '';
    }
    if ( token.startsWith('#') ) {
        const params = new URLSearchParams(url.hash.slice(1));
        return params.get(token.slice(1)) || '';
    }
    if ( token.startsWith('/') && token.endsWith('/') ) {
        const re = new RegExp(token.slice(1, -1));
        const match = re.exec(url.href);
        return match?.[1] || match?.[0] || '';
    }
    return token;
}

export function urlSkip(inputURL, blocked, steps = '') {
    let current;
    try {
        current = new URL(inputURL);
    } catch {
        return;
    }

    let allowBlocked = false;
    let output = current.href;
    const tokens = String(steps || '').split(/\s+/).filter(Boolean);

    for ( const token of tokens ) {
        if ( token === '-blocked' ) {
            allowBlocked = true;
            continue;
        }
        if ( token === '-base64' ) {
            output = safeBase64Decode(output);
            continue;
        }
        if ( token === '+https' && output.startsWith('//') ) {
            output = `https:${output}`;
            continue;
        }
        output = valueFromURL(current, token);
        try {
            current = new URL(output, current.href);
            output = current.href;
        } catch {
        }
    }

    if ( blocked === true && allowBlocked !== true ) { return; }
    try {
        return new URL(output, current.href).href;
    } catch {
        return;
    }
}
