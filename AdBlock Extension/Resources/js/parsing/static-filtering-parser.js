/*******************************************************************************

    AdBlock

    Focused static-filter parser for AdBlock's runtime custom-filter needs.

*/

import { ArglistParser } from './arglist-parser.js';

/******************************************************************************/

export const NODE_TYPE_EXT_PATTERN_COSMETIC = 1;
export const NODE_TYPE_EXT_PATTERN_SCRIPTLET = 2;

export const AST_TYPE_NONE = 0;
export const AST_TYPE_NETWORK = 1;
export const AST_TYPE_EXTENDED = 2;

export const AST_ERROR_NONE = 0;
export const AST_ERROR_PATTERN = 1;

export const proceduralOperatorTokens = new Map();
export const removableHTTPHeaders = new Set();
export const preparserIfTokens = new Set([ 'ext_adblock' ]);
export const nodeTypeFromOptionName = new Map();
export const nodeNameFromNodeType = new Map();
export const netOptionTokenDescriptors = new Map();
export const utils = {
    preparser: {
        evaluate() {
            return true;
        },
    },
};

/******************************************************************************/

function splitFilterDomains(text) {
    if ( text === '' ) { return [ '*' ]; }
    return text
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
}

function parseArgumentList(text) {
    const parser = new ArglistParser(',');
    const args = [];
    let pos = 0;

    while ( pos <= text.length ) {
        parser.nextArg(text, pos);
        const raw = text.slice(parser.argBeg, parser.argEnd);
        args.push(parser.normalizeArg(raw));
        if ( parser.separatorEnd <= parser.separatorBeg ) { break; }
        pos = parser.separatorEnd;
    }

    return args.map(arg => arg.trim());
}

function markerFromLine(line) {
    const markers = [ '#@#', '##', '#$#', '#%#' ];
    let selected;
    let selectedPos = -1;

    for ( const marker of markers ) {
        const pos = line.indexOf(marker);
        if ( pos === -1 ) { continue; }
        if ( selectedPos === -1 || pos < selectedPos ) {
            selected = marker;
            selectedPos = pos;
        }
    }

    return selected === undefined
        ? undefined
        : { marker: selected, pos: selectedPos };
}

function cssSelectorIsUsable(selector) {
    if ( selector === '' ) { return false; }
    if ( selector.startsWith('{') ) {
        try {
            JSON.parse(selector);
            return true;
        } catch {
            return false;
        }
    }
    if ( typeof globalThis.CSS?.supports === 'function' ) {
        try {
            return globalThis.CSS.supports('selector(*)') &&
                globalThis.CSS.supports(`selector(${selector})`);
        } catch {
        }
    }
    if ( typeof globalThis.document?.querySelector === 'function' ) {
        try {
            globalThis.document.createDocumentFragment().querySelector(selector);
            return true;
        } catch {
            return false;
        }
    }
    return true;
}

function netPatternFromRaw(raw) {
    if ( raw.startsWith('@@') ) {
        return raw.slice(2);
    }
    return raw;
}

/******************************************************************************/

export class ExtSelectorCompiler {
    compile(selector, out = {}) {
        const trimmed = String(selector || '').trim();
        if ( cssSelectorIsUsable(trimmed) === false ) { return false; }
        out.compiled = trimmed;
        out.raw = trimmed;
        return true;
    }
}

export class AstFilterParser {
    constructor(options = {}) {
        this.options = options;
        this.selectorCompiler = new ExtSelectorCompiler(options);
        this.scriptletArgListParser = new ArglistParser(',');
        this.result = {};
        this.parse('');
    }

    parse(raw) {
        this.raw = String(raw || '').trim();
        this.error = AST_ERROR_NONE;
        this.type = AST_TYPE_NONE;
        this.exception = false;
        this.extDomains = [ '*' ];
        this.extPattern = '';
        this.scriptletArgs = [];
        this.netPattern = '';
        this.netOptions = new Map();
        this.result = {};

        if ( this.raw === '' || this.raw.startsWith('!') || this.raw.startsWith('[') ) {
            return;
        }

        const marker = markerFromLine(this.raw);
        if ( marker !== undefined ) {
            this.parseExtended(marker);
            return;
        }

        this.parseNetwork();
    }

    parseExtended({ marker, pos }) {
        this.type = AST_TYPE_EXTENDED;
        this.exception = marker === '#@#';
        const domainPart = this.raw.slice(0, pos);
        this.extDomains = splitFilterDomains(domainPart);
        this.extPattern = this.raw.slice(pos + marker.length).trim();
        this.result.exception = this.exception;

        if ( this.isScriptletFilter() ) {
            this.scriptletArgs = this.parseScriptletArgs(this.extPattern);
            if ( this.scriptletArgs.length === 0 || this.scriptletArgs[0] === '' ) {
                this.error = AST_ERROR_PATTERN;
            }
            return;
        }

        const compiled = {};
        if ( this.selectorCompiler.compile(this.extPattern, compiled) === false ) {
            this.error = AST_ERROR_PATTERN;
            return;
        }
        this.result.compiled = compiled.compiled;
        this.result.raw = this.extPattern;
    }

    parseNetwork() {
        this.type = AST_TYPE_NETWORK;
        this.exception = this.raw.startsWith('@@');

        const raw = netPatternFromRaw(this.raw);
        const optionPos = raw.indexOf('$');
        this.netPattern = optionPos === -1 ? raw : raw.slice(0, optionPos);

        const optionText = optionPos === -1 ? '' : raw.slice(optionPos + 1);
        if ( optionText !== '' ) {
            for ( const option of optionText.split(',') ) {
                const trimmed = option.trim();
                if ( trimmed === '' ) { continue; }
                const negated = trimmed.startsWith('~');
                const clean = negated ? trimmed.slice(1) : trimmed;
                const eq = clean.indexOf('=');
                const name = eq === -1 ? clean : clean.slice(0, eq);
                const value = eq === -1 ? true : clean.slice(eq + 1);
                this.netOptions.set(name, { name, value, negated });
            }
        }
    }

    parseScriptletArgs(pattern) {
        const match = /^\+js\((.*)\)$/.exec(pattern);
        if ( match === null ) { return []; }
        return parseArgumentList(match[1]);
    }

    hasError() {
        return this.error !== AST_ERROR_NONE;
    }

    hasOptions() {
        return this.extDomains.length !== 1 || this.extDomains[0] !== '*';
    }

    isException() {
        return this.exception;
    }

    isNetworkFilter() {
        return this.type === AST_TYPE_NETWORK;
    }

    isCosmeticFilter() {
        return this.type === AST_TYPE_EXTENDED &&
            this.isScriptletFilter() === false;
    }

    isScriptletFilter() {
        return this.type === AST_TYPE_EXTENDED &&
            this.extPattern.startsWith('+js(');
    }

    isHostnamePattern() {
        return /^\|\|[A-Za-z0-9.-]+\^?$/.test(this.netPattern);
    }

    getNetPattern() {
        const match = /^\|\|([^/^*]+)\^?$/.exec(this.netPattern);
        return match ? match[1] : this.netPattern;
    }

    getNetOptions() {
        return this.netOptions;
    }

    getScriptletArgs() {
        return this.scriptletArgs.slice();
    }

    getTypeString(type) {
        if ( type === NODE_TYPE_EXT_PATTERN_SCRIPTLET ) {
            return this.scriptletArgs.join(', ');
        }
        if ( type === NODE_TYPE_EXT_PATTERN_COSMETIC ) {
            return this.extPattern;
        }
        return this.raw;
    }

    *getExtFilterDomainIterator() {
        for ( const domain of this.extDomains ) {
            const not = domain.startsWith('~');
            const hn = not ? domain.slice(1) : domain;
            const bad = hn === '' || /[/?#]/.test(hn);
            yield { hn: hn || '*', not, bad };
        }
    }
}

/******************************************************************************/

export function parseRedirectValue(value) {
    return { value };
}

export function parseQueryPruneValue(value) {
    return { value };
}

export function parseHeaderValue(value) {
    return { value };
}

export function parseReplaceByRegexValue(value) {
    return { value };
}

export function parseReplaceValue(value) {
    return { value };
}
