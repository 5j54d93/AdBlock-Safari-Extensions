/*******************************************************************************

    AdBlock

    Minimal parser for the selector and CSS fragments accepted by AdBlock's
    advanced element filtering compiler. It intentionally implements only the
    structures consumed by ExtSelectorCompiler instead of bundling a full CSS
    parser.

*/

class CSSFilterParseError extends Error {
    constructor(message, source, index = 0) {
        super(message);
        this.name = 'CSSFilterParseError';
        this.source = String(source);
        this.index = Math.max(0, Math.min(index, this.source.length));
    }

    sourceFragment() {
        const pointer = `${' '.repeat(this.index)}^`;
        return `${this.source}\n${pointer}`;
    }
}

const reIdentStart = /[A-Za-z_\-\u0080-\uFFFF]/;
const reIdentPart = /[A-Za-z0-9_\-\u0080-\uFFFF]/;
const rePropertyName = /^-?[A-Za-z_][\w-]*$/;

const selectorArgumentPseudos = new Set([
    '-abp-has',
    'has',
    'host-context',
    'if',
    'if-not',
    'is',
    'not',
    'shadow',
    'slotted',
    'where',
]);

/******************************************************************************/

function part(type, details = {}, args) {
    const out = { data: { type, ...details } };
    if ( args !== undefined ) {
        out.args = args;
    }
    return out;
}

function isWhitespace(c) {
    return c === 0x20 || c === 0x09 || c === 0x0A ||
        c === 0x0C || c === 0x0D;
}

function isIdentifierStartChar(ch) {
    return ch !== undefined && reIdentStart.test(ch);
}

function isIdentifierPartChar(ch) {
    return ch !== undefined && reIdentPart.test(ch);
}

function skipWhitespace(raw, i) {
    while ( i < raw.length && isWhitespace(raw.charCodeAt(i)) ) {
        i += 1;
    }
    return i;
}

function isStopChar(ch) {
    return ch === undefined ||
        ch === '#' || ch === '.' || ch === '[' || ch === ']' ||
        ch === ':' || ch === '>' || ch === '+' || ch === '~' ||
        ch === ',' || ch === '(' || ch === ')';
}

function readIdentifier(raw, i, { allowStar = false } = {}) {
    const beg = i;
    if ( allowStar && raw[i] === '*' ) {
        return { value: '*', end: i + 1 };
    }
    if ( raw[i] === '\\' && i + 1 < raw.length ) {
        i += 2;
    } else if ( isIdentifierStartChar(raw[i]) === false ) {
        return { value: '', end: beg };
    } else {
        i += 1;
    }
    while ( i < raw.length ) {
        const ch = raw[i];
        if ( ch === '\\' && i + 1 < raw.length ) {
            i += 2;
            continue;
        }
        if ( isIdentifierPartChar(ch) || ch === '|' || ch === '*' ) {
            i += 1;
            continue;
        }
        break;
    }
    return { value: raw.slice(beg, i), end: i };
}

function findBalancedEnd(raw, i, open, close) {
    let depth = 0;
    for ( ; i < raw.length; i++ ) {
        const ch = raw[i];
        if ( ch === '\\' ) {
            i += 1;
            continue;
        }
        if ( ch === '"' || ch === "'" ) {
            i = findStringEnd(raw, i);
            continue;
        }
        if ( ch === open ) {
            depth += 1;
            continue;
        }
        if ( ch === close ) {
            depth -= 1;
            if ( depth === 0 ) { return i; }
        }
    }
    throw new CSSFilterParseError(`Missing '${close}'`, raw, raw.length);
}

function findStringEnd(raw, i) {
    const quote = raw[i];
    i += 1;
    for ( ; i < raw.length; i++ ) {
        const ch = raw[i];
        if ( ch === '\\' ) {
            i += 1;
            continue;
        }
        if ( ch === quote ) { return i; }
    }
    throw new CSSFilterParseError(`Missing '${quote}'`, raw, raw.length);
}

function splitTopLevel(raw, separator = ',') {
    const out = [];
    let beg = 0;
    for ( let i = 0; i < raw.length; i++ ) {
        const ch = raw[i];
        if ( ch === '\\' ) {
            i += 1;
            continue;
        }
        if ( ch === '"' || ch === "'" ) {
            i = findStringEnd(raw, i);
            continue;
        }
        if ( ch === '(' ) {
            i = findBalancedEnd(raw, i, '(', ')');
            continue;
        }
        if ( ch === '[' ) {
            i = findBalancedEnd(raw, i, '[', ']');
            continue;
        }
        if ( ch === separator ) {
            out.push(raw.slice(beg, i).trim());
            beg = i + 1;
        }
    }
    out.push(raw.slice(beg).trim());
    return out;
}

function ensureBalanced(raw) {
    for ( let i = 0; i < raw.length; i++ ) {
        const ch = raw[i];
        if ( ch === '\\' ) {
            i += 1;
            continue;
        }
        if ( ch === '"' || ch === "'" ) {
            i = findStringEnd(raw, i);
            continue;
        }
        if ( ch === '(' ) {
            i = findBalancedEnd(raw, i, '(', ')');
            continue;
        }
        if ( ch === '[' ) {
            i = findBalancedEnd(raw, i, '[', ']');
        }
    }
}

/******************************************************************************/

function parseAttribute(raw, source, offset) {
    let i = skipWhitespace(raw, 0);
    const nameBeg = i;
    while ( i < raw.length ) {
        const ch = raw[i];
        if ( isWhitespace(ch.charCodeAt(0)) || ch === '=' ||
             ch === '~' || ch === '|' || ch === '^' ||
             ch === '$' || ch === '*' ) {
            break;
        }
        if ( ch === '\\' && i + 1 < raw.length ) {
            i += 2;
        } else {
            i += 1;
        }
    }

    const name = raw.slice(nameBeg, i);
    if ( name === '' ) {
        throw new CSSFilterParseError('Attribute name expected', source, offset);
    }

    i = skipWhitespace(raw, i);
    if ( i === raw.length ) {
        return part('AttributeSelector', {
            name: { name },
            matcher: null,
            value: null,
            flags: null,
        });
    }

    let matcher = raw[i] === '=' ? '=' : '';
    if ( matcher === '' && i + 1 < raw.length && raw[i + 1] === '=' ) {
        matcher = `${raw[i]}=`;
    }
    if ( /^(?:=|~=|\|=|\^=|\$=|\*=)$/.test(matcher) === false ) {
        throw new CSSFilterParseError('Attribute matcher expected', source, offset + i);
    }
    i += matcher.length;
    i = skipWhitespace(raw, i);

    let value = raw.slice(i).trim();
    let flags = null;
    const flagMatch = /^(.*?)(?:\s+([isIS]))?$/.exec(value);
    if ( flagMatch !== null ) {
        value = flagMatch[1];
        flags = flagMatch[2] ? flagMatch[2].toLowerCase() : null;
    }
    if ( value === '' ) {
        throw new CSSFilterParseError('Attribute value expected', source, offset + i);
    }

    let valueData;
    const quote = value[0];
    if (
        (quote === '"' || quote === "'") &&
        value.length >= 2 &&
        value[value.length - 1] === quote
    ) {
        valueData = { value: value.slice(1, -1) };
    } else {
        valueData = { name: value };
    }

    return part('AttributeSelector', {
        name: { name },
        matcher,
        value: valueData,
        flags,
    });
}

function parsePseudo(raw, i, out) {
    const isElement = raw[i + 1] === ':';
    const nameBeg = i + (isElement ? 2 : 1);
    const read = readIdentifier(raw, nameBeg);
    if ( read.value === '' ) {
        throw new CSSFilterParseError('Pseudo selector name expected', raw, i);
    }

    let end = read.end;
    let args;
    let rawArgs;
    if ( raw[end] === '(' ) {
        const close = findBalancedEnd(raw, end, '(', ')');
        rawArgs = raw.slice(end + 1, close);
        end = close + 1;
        const normalizedName = read.value.toLowerCase();
        if ( isElement === false && selectorArgumentPseudos.has(normalizedName) ) {
            args = parseSelectorList(rawArgs);
        }
    }

    const type = isElement ? 'PseudoElementSelector' : 'PseudoClassSelector';
    const details = { name: read.value };
    if ( args === undefined && rawArgs !== undefined ) {
        details.rawArgs = rawArgs;
    }
    out.push(part(type, details, args));
    return end;
}

function parseSelector(raw) {
    const out = [];
    let i = 0;
    let lastWasCombinator = true;

    while ( i < raw.length ) {
        const beforeWhitespace = i;
        i = skipWhitespace(raw, i);
        if ( i > beforeWhitespace && out.length !== 0 && i < raw.length ) {
            const next = raw[i];
            if ( next !== '>' && next !== '+' && next !== '~' ) {
                if ( lastWasCombinator === false ) {
                    out.push(part('Combinator', { name: ' ' }));
                    lastWasCombinator = true;
                }
            }
        }
        if ( i >= raw.length ) { break; }

        const ch = raw[i];
        if ( ch === '>' || ch === '+' || ch === '~' ) {
            out.push(part('Combinator', { name: ch }));
            lastWasCombinator = true;
            i += 1;
            continue;
        }
        if ( ch === '#' || ch === '.' ) {
            const read = readIdentifier(raw, i + 1);
            if ( read.value === '' ) {
                throw new CSSFilterParseError('Identifier expected', raw, i + 1);
            }
            out.push(part(ch === '#' ? 'IdSelector' : 'ClassSelector', {
                name: read.value,
            }));
            lastWasCombinator = false;
            i = read.end;
            continue;
        }
        if ( ch === '[' ) {
            const close = findBalancedEnd(raw, i, '[', ']');
            out.push(parseAttribute(raw.slice(i + 1, close), raw, i + 1));
            lastWasCombinator = false;
            i = close + 1;
            continue;
        }
        if ( ch === ':' ) {
            i = parsePseudo(raw, i, out);
            lastWasCombinator = false;
            continue;
        }
        if ( ch === '*' || isIdentifierStartChar(ch) || ch === '\\' ) {
            const read = readIdentifier(raw, i, { allowStar: true });
            if ( read.value === '' || isStopChar(raw[read.end]) === false && isWhitespace(raw.charCodeAt(read.end)) === false ) {
                throw new CSSFilterParseError('Unexpected selector input', raw, i);
            }
            out.push(part('TypeSelector', { name: read.value }));
            lastWasCombinator = false;
            i = read.end;
            continue;
        }

        throw new CSSFilterParseError('Unexpected selector input', raw, i);
    }

    return out;
}

function parseSelectorList(raw) {
    const selectors = splitTopLevel(raw, ',');
    if ( selectors.some(selector => selector === '') ) {
        throw new CSSFilterParseError('Selector expected', raw);
    }

    const out = [ part('SelectorList') ];
    for ( const selector of selectors ) {
        out.push(part('Selector'));
        out.push(...parseSelector(selector));
    }
    return out;
}

/******************************************************************************/

function parseMediaQueryList(raw) {
    ensureBalanced(raw);
    const queries = splitTopLevel(raw, ',');
    if ( queries.some(query => query === '') ) {
        throw new CSSFilterParseError('Media query expected', raw);
    }
    if ( /[{};]/.test(raw) ) {
        throw new CSSFilterParseError('Invalid media query', raw);
    }
    return [
        part('MediaQueryList'),
        ...queries.map(query => part('MediaQuery', { value: query })),
    ];
}

function parseDeclarationList(raw) {
    ensureBalanced(raw);
    const declarations = splitTopLevel(raw, ';').filter(s => s !== '');
    if ( declarations.length === 0 ) {
        throw new CSSFilterParseError('Declaration expected', raw);
    }

    const out = [ part('DeclarationList') ];
    for ( const declaration of declarations ) {
        const pos = declaration.indexOf(':');
        if ( pos === -1 ) {
            throw new CSSFilterParseError('Declaration value expected', raw);
        }
        const property = declaration.slice(0, pos).trim();
        const value = declaration.slice(pos + 1).trim();
        if ( rePropertyName.test(property) === false || value === '' ) {
            throw new CSSFilterParseError('Invalid declaration', raw);
        }
        out.push(part('Declaration', {
            property,
            value: { type: 'Raw', value },
        }, [ part('Raw', { value }) ]));
    }
    return out;
}

/******************************************************************************/

export function parseCSSFilter(raw, context) {
    switch ( context ) {
    case 'selectorList':
        return parseSelectorList(String(raw));
    case 'mediaQueryList':
        return parseMediaQueryList(String(raw));
    case 'declarationList':
        return parseDeclarationList(String(raw));
    default:
        throw new CSSFilterParseError(`Unsupported parse context '${context}'`, raw);
    }
}
