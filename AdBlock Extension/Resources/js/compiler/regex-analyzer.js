/*******************************************************************************

    AdBlock

    Small regular-expression parser used by the filter compiler to determine
    Safari-compatible regex support and extract literal tokens.

*/

/******************************************************************************/

export function isRE2(reStr) {
    let ast;
    try {
        ast = parseRegex(reStr);
    } catch {
        return false;
    }
    return astHasLookaround(ast) === false;
}

export function tokenizableStrFromRegex(reStr) {
    return literalTokenString(parseRegex(reStr));
}

export function literalStrFromRegex(reStr) {
    let literals = tokenizableStrFromRegex(reStr)
        .split(/[\x00\x01]+/)
        .sort((a, b) => b.length - a.length);
    if ( literals.length > 1 ) {
        literals = literals.filter(a => (/^(\.?com|\.?net|www\.?)$/).test(a) === false);
    }
    return literals[0] || '';
}

export function toHeaderPattern(reStr) {
    try {
        return headerPatternFromNode(parseRegex(reStr), 0);
    } catch {
    }
}

/******************************************************************************/

const NODE_SEQUENCE = 1;
const NODE_ALTERNATION = 2;
const NODE_GROUP = 4;
const NODE_CHARCLASS = 8;
const NODE_QUANTIFIER = 16;
const NODE_SPECIAL = 128;
const NODE_LITERAL = 1024;
const NODE_COMMENT = 2048;

const tokenBoundary = '\x00';
const tokenWildcard = '\x01';
const optionalBoundary = '\x02';
const optionalWildcard = '\x03';
const reCharCodeClass = /[%0-9A-Za-z]/;
const reQuantifier = /^\{(\d+)(?:,(\d*)?)?\}/;

/******************************************************************************/

class RegexParser {
    constructor(raw) {
        this.raw = String(raw);
        this.i = 0;
    }

    parse() {
        const ast = this.parseAlternation();
        if ( this.i !== this.raw.length ) {
            throw new Error('Unexpected regex token');
        }
        return ast;
    }

    parseAlternation(stop = '') {
        const branches = [];
        for (;;) {
            branches.push(this.parseSequence(stop));
            if ( this.raw[this.i] !== '|' ) { break; }
            this.i += 1;
        }
        if ( branches.length === 1 ) { return branches[0]; }
        return { type: NODE_ALTERNATION, val: branches, flags: {} };
    }

    parseSequence(stop = '') {
        const nodes = [];
        while ( this.i < this.raw.length ) {
            const c = this.raw[this.i];
            if ( c === '|' || c === stop ) { break; }
            nodes.push(this.parseTerm());
        }
        return { type: NODE_SEQUENCE, val: nodes, flags: {} };
    }

    parseTerm() {
        const atom = this.parseAtom();
        const quantifier = this.readQuantifier(atom);
        return quantifier || atom;
    }

    parseAtom() {
        const c = this.raw[this.i];
        if ( c === undefined ) {
            throw new Error('Unexpected end of regex');
        }
        switch ( c ) {
        case '(':
            return this.parseGroup();
        case '[':
            return this.parseCharClass();
        case '\\':
            return this.parseEscape(false);
        case '^':
        case '$':
        case '.':
            this.i += 1;
            return { type: NODE_SPECIAL, val: c, flags: {} };
        case ')':
        case ']':
        case '}':
            throw new Error('Unmatched bracket');
        case '*':
        case '+':
        case '?':
            throw new Error('Nothing to repeat');
        default:
            break;
        }

        const beg = this.i;
        while ( this.i < this.raw.length ) {
            const ch = this.raw[this.i];
            if ( ch === '\\' || ch === '(' || ch === '[' ||
                 ch === ')' || ch === ']' || ch === '}' ||
                 ch === '^' || ch === '$' || ch === '.' ||
                 ch === '*' || ch === '+' || ch === '?' ||
                 ch === '|' ) {
                break;
            }
            if ( ch === '{' && this.quantifierAt(this.i) ) { break; }
            if ( this.i !== beg && this.quantifierAt(this.i + 1) ) { break; }
            this.i += 1;
            if ( this.quantifierAt(this.i) ) { break; }
        }
        if ( this.i === beg ) {
            this.i += 1;
        }
        return { type: NODE_LITERAL, val: this.raw.slice(beg, this.i), flags: {} };
    }

    parseGroup() {
        this.i += 1;
        const flags = {};

        if ( this.raw[this.i] === '?' ) {
            const next = this.raw[this.i + 1];
            const next2 = this.raw[this.i + 2];
            if ( next === '#' ) {
                this.i += 2;
                const end = this.raw.indexOf(')', this.i);
                if ( end === -1 ) { throw new Error('Unmatched comment group'); }
                this.i = end + 1;
                return { type: NODE_COMMENT, val: '', flags: {} };
            }
            if ( next === ':' ) {
                this.i += 2;
            } else if ( next === '=' ) {
                flags.LookAhead = 1;
                this.i += 2;
            } else if ( next === '!' ) {
                flags.NegativeLookAhead = 1;
                this.i += 2;
            } else if ( next === '<' && next2 === '=' ) {
                flags.LookBehind = 1;
                this.i += 3;
            } else if ( next === '<' && next2 === '!' ) {
                flags.NegativeLookBehind = 1;
                this.i += 3;
            } else if ( next === '<' ) {
                this.i += 2;
                const end = this.raw.indexOf('>', this.i);
                if ( end === -1 ) { throw new Error('Unmatched named group'); }
                this.i = end + 1;
            } else {
                this.i += 1;
            }
        }

        const val = this.parseAlternation(')');
        if ( this.raw[this.i] !== ')' ) {
            throw new Error('Unmatched group');
        }
        this.i += 1;
        return { type: NODE_GROUP, val, flags };
    }

    parseCharClass() {
        this.i += 1;
        const flags = {};
        const val = [];
        if ( this.raw[this.i] === '^' ) {
            flags.NegativeMatch = 1;
            this.i += 1;
        }
        if ( this.raw[this.i] === ']' ) {
            val.push({ kind: 'literal', value: ']' });
            this.i += 1;
        }
        while ( this.i < this.raw.length ) {
            if ( this.raw[this.i] === ']' ) {
                this.i += 1;
                return { type: NODE_CHARCLASS, val, flags };
            }
            const first = this.parseCharClassUnit();
            if (
                this.raw[this.i] === '-' &&
                this.raw[this.i + 1] !== ']' &&
                this.raw[this.i + 1] !== undefined
            ) {
                this.i += 1;
                this.parseCharClassUnit();
                val.push({ kind: 'range' });
            } else {
                val.push(first);
            }
        }
        throw new Error('Unmatched character class');
    }

    parseCharClassUnit() {
        if ( this.raw[this.i] === '\\' ) {
            return this.parseEscape(true);
        }
        const value = this.raw[this.i];
        if ( value === undefined ) {
            throw new Error('Unexpected end of character class');
        }
        this.i += 1;
        return { kind: 'literal', value };
    }

    parseEscape(inCharClass) {
        this.i += 1;
        const c = this.raw[this.i];
        if ( c === undefined ) {
            throw new Error('Dangling escape');
        }
        this.i += 1;

        const literal = value => inCharClass
            ? { kind: 'literal', value }
            : { type: NODE_LITERAL, val: value, flags: {} };
        const wildcard = (value = c) => inCharClass
            ? { kind: 'wildcard', value }
            : { type: NODE_SPECIAL, val: value, flags: { wildcard: 1 } };
        const boundary = value => inCharClass
            ? { kind: 'literal', value: '\b' }
            : { type: NODE_SPECIAL, val: value, flags: { MatchWordBoundary: 1 } };

        switch ( c ) {
        case 'x': {
            const hex = this.raw.slice(this.i, this.i + 2);
            if ( /^[0-9A-Fa-f]{2}$/.test(hex) ) {
                this.i += 2;
                return literal(String.fromCharCode(parseInt(hex, 16)));
            }
            return literal('x');
        }
        case 'u': {
            if ( this.raw[this.i] === '{' ) {
                const end = this.raw.indexOf('}', this.i + 1);
                if ( end !== -1 ) {
                    const hex = this.raw.slice(this.i + 1, end);
                    if ( /^[0-9A-Fa-f]+$/.test(hex) ) {
                        this.i = end + 1;
                        return literal(String.fromCodePoint(parseInt(hex, 16)));
                    }
                }
            }
            const hex = this.raw.slice(this.i, this.i + 4);
            if ( /^[0-9A-Fa-f]{4}$/.test(hex) ) {
                this.i += 4;
                return literal(String.fromCharCode(parseInt(hex, 16)));
            }
            return literal('u');
        }
        case 'c': {
            const control = this.raw[this.i];
            if ( /^[A-Za-z]$/.test(control || '') ) {
                this.i += 1;
                return literal(String.fromCharCode(control.toUpperCase().charCodeAt(0) & 0x1F));
            }
            return literal('c');
        }
        case '0':
            return literal('\0');
        case 'f':
            return literal('\f');
        case 'n':
            return literal('\n');
        case 'r':
            return literal('\r');
        case 't':
            return literal('\t');
        case 'v':
            return literal('\v');
        case 'b':
            return boundary('\\b');
        case 'B':
        case 'd':
        case 'D':
        case 's':
        case 'S':
        case 'w':
        case 'W':
        case 'p':
        case 'P':
            return wildcard(`\\${c}`);
        default:
            if ( /^[1-9]$/.test(c) ) { return wildcard(`\\${c}`); }
            return literal(c);
        }
    }

    readQuantifier(atom) {
        const c = this.raw[this.i];
        let min;
        let max;
        if ( c === '?' ) {
            min = 0;
            max = 1;
            this.i += 1;
        } else if ( c === '*' ) {
            min = 0;
            max = Infinity;
            this.i += 1;
        } else if ( c === '+' ) {
            min = 1;
            max = Infinity;
            this.i += 1;
        } else if ( c === '{' ) {
            const match = reQuantifier.exec(this.raw.slice(this.i));
            if ( match === null ) { return; }
            min = Number(match[1]);
            max = match[2] === undefined
                ? min
                : match[2] === ''
                    ? Infinity
                    : Number(match[2]);
            this.i += match[0].length;
        } else {
            return;
        }
        if ( this.raw[this.i] === '?' ) {
            this.i += 1;
        }
        return { type: NODE_QUANTIFIER, val: atom, flags: { min, max } };
    }

    quantifierAt(i) {
        const c = this.raw[i];
        if ( c === '?' || c === '*' || c === '+' ) { return true; }
        return c === '{' && reQuantifier.test(this.raw.slice(i));
    }
}

/******************************************************************************/

function parseRegex(reStr) {
    return new RegexParser(reStr).parse();
}

function astHasLookaround(node) {
    if ( node instanceof Object === false ) { return false; }
    if ( node.flags instanceof Object ) {
        if ( node.flags.LookAhead === 1 ) { return true; }
        if ( node.flags.NegativeLookAhead === 1 ) { return true; }
        if ( node.flags.LookBehind === 1 ) { return true; }
        if ( node.flags.NegativeLookBehind === 1 ) { return true; }
    }
    if ( Array.isArray(node.val) ) {
        return node.val.some(astHasLookaround);
    }
    if ( node.val instanceof Object ) {
        return astHasLookaround(node.val);
    }
    return false;
}

function literalTokenString(ast) {
    let s = tokenizableStrFromNode(ast);
    const reOptional = /[\x02\x03]+/;
    for (;;) {
        const match = reOptional.exec(s);
        if ( match === null ) { break; }
        const left = s.slice(0, match.index);
        const middle = match[0];
        const right = s.slice(match.index + middle.length);
        s = left;
        s += firstCharCodeClass(right) === 1 || firstCharCodeClass(middle) === 1
            ? tokenWildcard
            : tokenBoundary;
        s += lastCharCodeClass(left) === 1 || lastCharCodeClass(middle) === 1
            ? tokenWildcard
            : tokenBoundary;
        s += right;
    }
    return s;
}

function firstCharCodeClass(s) {
    if ( s.length === 0 ) { return 0; }
    const c = s.charCodeAt(0);
    if ( c === 1 || c === 3 ) { return 1; }
    return reCharCodeClass.test(s.charAt(0)) ? 1 : 0;
}

function lastCharCodeClass(s) {
    const i = s.length - 1;
    if ( i === -1 ) { return 0; }
    const c = s.charCodeAt(i);
    if ( c === 1 || c === 3 ) { return 1; }
    return reCharCodeClass.test(s.charAt(i)) ? 1 : 0;
}

function charClassTokenString(node) {
    if ( node.flags.NegativeMatch ) { return tokenWildcard; }
    let firstChar = 0;
    let lastChar = 0;
    for ( const entry of node.val ) {
        if ( entry.kind === 'range' || entry.kind === 'wildcard' ) {
            firstChar = 1;
            lastChar = 1;
            break;
        }
        if ( entry.kind === 'literal' && firstCharCodeClass(entry.value) === 1 ) {
            firstChar = 1;
            lastChar = 1;
            break;
        }
    }
    return String.fromCharCode(firstChar, lastChar);
}

function tokenizableStrFromNode(node) {
    switch ( node.type ) {
    case NODE_SEQUENCE: {
        let s = '';
        for ( const child of node.val ) {
            s += tokenizableStrFromNode(child);
        }
        return s;
    }
    case NODE_ALTERNATION:
    case NODE_CHARCLASS: {
        if ( node.type === NODE_CHARCLASS ) {
            return charClassTokenString(node);
        }
        let firstChar = 0;
        let lastChar = 0;
        for ( const child of node.val ) {
            const s = tokenizableStrFromNode(child);
            if ( firstChar === 0 && firstCharCodeClass(s) === 1 ) {
                firstChar = 1;
            }
            if ( lastChar === 0 && lastCharCodeClass(s) === 1 ) {
                lastChar = 1;
            }
            if ( firstChar === 1 && lastChar === 1 ) { break; }
        }
        return String.fromCharCode(firstChar, lastChar);
    }
    case NODE_GROUP:
        if (
            node.flags.NegativeLookAhead === 1 ||
            node.flags.NegativeLookBehind === 1
        ) {
            return '';
        }
        return tokenizableStrFromNode(node.val);
    case NODE_QUANTIFIER: {
        if ( node.flags.max === 0 ) { return ''; }
        const s = tokenizableStrFromNode(node.val);
        const first = firstCharCodeClass(s);
        const last = lastCharCodeClass(s);
        if ( node.flags.min !== 0 ) {
            return String.fromCharCode(first, last);
        }
        return String.fromCharCode(first + 2, last + 2);
    }
    case NODE_SPECIAL:
        return node.val === '^' ||
               node.val === '$' ||
               node.flags.MatchWordBoundary === 1
            ? tokenBoundary
            : tokenWildcard;
    case NODE_LITERAL:
        if ( node.val.charCodeAt(0) >= 1 && node.val.charCodeAt(0) <= 3 ) {
            return tokenBoundary;
        }
        return node.val;
    case NODE_COMMENT:
        return '';
    default:
        break;
    }
    return tokenWildcard;
}

/******************************************************************************/

function headerPatternFromNode(node, depth = 0) {
    switch ( node.type ) {
    case NODE_SEQUENCE: {
        let s = '';
        for ( const child of node.val ) {
            const t = headerPatternFromNode(child, depth + 1);
            if ( t === undefined ) { return; }
            s += t;
        }
        if ( depth === 0 && node.val.length !== 0 ) {
            const first = node.val[0];
            if ( first.type !== NODE_SPECIAL || first.val !== '^' ) { s = `*${s}`; }
            const last = node.val.at(-1);
            if ( last.type !== NODE_SPECIAL || last.val !== '$' ) { s = `${s}*`; }
        }
        return s;
    }
    case NODE_GROUP:
        if (
            node.flags.NegativeLookAhead === 1 ||
            node.flags.NegativeLookBehind === 1
        ) {
            return;
        }
        return headerPatternFromNode(node.val, depth + 1);
    case NODE_LITERAL:
        return node.val;
    case NODE_SPECIAL:
        if ( node.val === '^' || node.val === '$' ) { return ''; }
        return;
    case NODE_COMMENT:
        return '';
    default:
        break;
    }
}
