/*******************************************************************************

    AdBlock

    Small IDN helpers for hostnames used by the extension UI and filter parser.
    Encoding is delegated to the browser URL implementation; decoding handles
    ACE labels locally so we do not need to bundle a third-party IDN module.

*/

const ACE_PREFIX = 'xn--';
const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
const MAX_INT = 0x7FFFFFFF;
const MAX_CACHE_SIZE = 512;

const reDomainSeparators = /[\u3002\uFF0E\uFF61]/g;
const reACELabel = /^xn--/i;

const asciiCache = new Map();
const unicodeCache = new Map();
const urlIDNEncoder = new URL('https://adblock.invalid/');

/******************************************************************************/

function memoize(cache, key, value) {
    if ( cache.size >= MAX_CACHE_SIZE ) {
        cache.delete(cache.keys().next().value);
    }
    cache.set(key, value);
    return value;
}

function normalizeSeparators(hostname) {
    return hostname.replace(reDomainSeparators, '.');
}

function digitFromCodePoint(codePoint) {
    if ( codePoint >= 0x30 && codePoint <= 0x39 ) {
        return codePoint - 0x16;
    }
    if ( codePoint >= 0x41 && codePoint <= 0x5A ) {
        return codePoint - 0x41;
    }
    if ( codePoint >= 0x61 && codePoint <= 0x7A ) {
        return codePoint - 0x61;
    }
    return BASE;
}

function adaptBias(delta, pointCount, firstTime) {
    let adjusted = firstTime
        ? Math.floor(delta / DAMP)
        : delta >> 1;
    adjusted += Math.floor(adjusted / pointCount);

    let bias = 0;
    const threshold = ((BASE - T_MIN) * T_MAX) >> 1;
    while ( adjusted > threshold ) {
        adjusted = Math.floor(adjusted / (BASE - T_MIN));
        bias += BASE;
    }

    return bias + Math.floor(
        ((BASE - T_MIN + 1) * adjusted) / (adjusted + SKEW)
    );
}

function decodeACE(payload) {
    const output = [];
    let inputIndex = 0;
    let codePoint = INITIAL_N;
    let delta = 0;
    let bias = INITIAL_BIAS;

    const delimiterIndex = payload.lastIndexOf('-');
    if ( delimiterIndex !== -1 ) {
        for ( let i = 0; i < delimiterIndex; i++ ) {
            const value = payload.charCodeAt(i);
            if ( value >= 0x80 ) { throw new RangeError('Invalid ACE label'); }
            output.push(value);
        }
        inputIndex = delimiterIndex + 1;
    }

    while ( inputIndex < payload.length ) {
        const previousDelta = delta;
        let weight = 1;

        for ( let k = BASE; ; k += BASE ) {
            if ( inputIndex >= payload.length ) {
                throw new RangeError('Invalid ACE label');
            }

            const digit = digitFromCodePoint(payload.charCodeAt(inputIndex++));
            if ( digit >= BASE ) {
                throw new RangeError('Invalid ACE digit');
            }
            if ( digit > Math.floor((MAX_INT - delta) / weight) ) {
                throw new RangeError('ACE overflow');
            }

            delta += digit * weight;

            const threshold = k <= bias
                ? T_MIN
                : k >= bias + T_MAX
                    ? T_MAX
                    : k - bias;

            if ( digit < threshold ) { break; }

            const baseMinusThreshold = BASE - threshold;
            if ( weight > Math.floor(MAX_INT / baseMinusThreshold) ) {
                throw new RangeError('ACE overflow');
            }
            weight *= baseMinusThreshold;
        }

        const outputLength = output.length + 1;
        bias = adaptBias(delta - previousDelta, outputLength, previousDelta === 0);

        if ( Math.floor(delta / outputLength) > MAX_INT - codePoint ) {
            throw new RangeError('ACE overflow');
        }

        codePoint += Math.floor(delta / outputLength);
        delta %= outputLength;
        output.splice(delta, 0, codePoint);
        delta += 1;
    }

    return String.fromCodePoint(...output);
}

function asciiLabelFromUnicode(label) {
    if ( label === '' ) { return label; }
    urlIDNEncoder.hostname = '_';
    try {
        urlIDNEncoder.hostname = label;
    } catch {
        return label;
    }
    return urlIDNEncoder.hostname || label;
}

function unicodeLabelFromASCII(label) {
    if ( reACELabel.test(label) === false ) { return label; }

    const lowercased = label.toLowerCase();
    try {
        const decoded = decodeACE(lowercased.slice(ACE_PREFIX.length));
        return asciiLabelFromUnicode(decoded).toLowerCase() === lowercased
            ? decoded
            : label;
    } catch {
        return label;
    }
}

/******************************************************************************/

export function toASCII(hostname) {
    const input = normalizeSeparators(String(hostname));
    const cached = asciiCache.get(input);
    if ( cached !== undefined ) { return cached; }

    const labels = input.split('.');
    const ascii = labels.map(asciiLabelFromUnicode).join('.');
    return memoize(asciiCache, input, ascii);
}

export function toUnicode(hostname) {
    const input = normalizeSeparators(String(hostname));
    const cached = unicodeCache.get(input);
    if ( cached !== undefined ) { return cached; }

    const labels = input.split('.');
    const unicode = labels.map(unicodeLabelFromASCII).join('.');
    return memoize(unicodeCache, input, unicode);
}
