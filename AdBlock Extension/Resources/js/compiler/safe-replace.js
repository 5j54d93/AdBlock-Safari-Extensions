/*******************************************************************************

    AdBlock

    Bounded template replacement helper.

*/

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function safeReplace(text, pattern, replacement, count = 1) {
    const regex = typeof pattern === 'string'
        ? new RegExp(escapeRegExp(pattern))
        : pattern;

    let out = String(text);
    let remaining = count;

    while ( remaining !== 0 ) {
        const match = regex.exec(out);
        if ( match === null ) { break; }

        out = `${out.slice(0, match.index)}${replacement}${out.slice(match.index + match[0].length)}`;
        if ( remaining > 0 ) {
            remaining -= 1;
        }
    }

    return out;
}
