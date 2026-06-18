/*******************************************************************************

    AdBlock

    Small argument-list parser used by filter and scriptlet helpers.

*/

export class ArglistParser {
    constructor(separatorChar = ',', mustQuote = false) {
        this.separatorChar = separatorChar;
        this.separatorCode = separatorChar.charCodeAt(0);
        this.mustQuote = mustQuote;
        this.argBeg = 0;
        this.argEnd = 0;
        this.quoteBeg = 0;
        this.quoteEnd = 0;
        this.separatorBeg = 0;
        this.separatorEnd = 0;
        this.failed = false;
        this.transform = false;
    }

    nextArg(pattern, beg = 0) {
        const len = pattern.length;
        let i = Math.max(0, beg);

        while ( i < len && /\s/.test(pattern[i]) ) { i += 1; }

        this.argBeg = i;
        this.quoteBeg = i;
        this.quoteEnd = i;
        this.failed = false;
        this.transform = false;

        let quote = '';
        if ( pattern[i] === '"' || pattern[i] === "'" || pattern[i] === '`' ) {
            quote = pattern[i];
            this.quoteBeg = i;
            i += 1;
            this.argBeg = i;
        } else if ( this.mustQuote ) {
            this.failed = true;
        }

        let escaped = false;
        while ( i < len ) {
            const ch = pattern[i];
            if ( escaped ) {
                escaped = false;
                i += 1;
                continue;
            }
            if ( ch === '\\' ) {
                escaped = true;
                i += 1;
                continue;
            }
            if ( quote !== '' ) {
                if ( ch === quote ) {
                    this.argEnd = i;
                    this.quoteEnd = i + 1;
                    i += 1;
                    break;
                }
                i += 1;
                continue;
            }
            if ( ch.charCodeAt(0) === this.separatorCode ) {
                break;
            }
            i += 1;
        }

        if ( quote !== '' && this.quoteEnd === this.quoteBeg ) {
            this.failed = true;
            this.argEnd = i;
            this.quoteEnd = i;
        } else if ( quote === '' ) {
            this.argEnd = i;
            while ( this.argEnd > this.argBeg && /\s/.test(pattern[this.argEnd - 1]) ) {
                this.argEnd -= 1;
            }
            this.quoteEnd = this.argEnd;
        }

        while ( i < len && /\s/.test(pattern[i]) ) { i += 1; }
        this.separatorBeg = i;
        this.separatorEnd = i;
        if ( i < len && pattern.charCodeAt(i) === this.separatorCode ) {
            this.separatorEnd = i + 1;
        }

        return this;
    }

    normalizeArg(value, extraEscapedChar = '') {
        if ( typeof value !== 'string' ) { return ''; }

        let out = '';
        let escaped = false;
        for ( const ch of value ) {
            if ( escaped ) {
                if ( ch === 'n' ) {
                    out += '\n';
                } else if ( ch === 'r' ) {
                    out += '\r';
                } else if ( ch === 't' ) {
                    out += '\t';
                } else if (
                    ch === '\\' ||
                    ch === '"' ||
                    ch === "'" ||
                    ch === '`' ||
                    ch === this.separatorChar ||
                    ch === extraEscapedChar
                ) {
                    out += ch;
                } else {
                    out += `\\${ch}`;
                }
                escaped = false;
                continue;
            }
            if ( ch === '\\' ) {
                escaped = true;
                this.transform = true;
                continue;
            }
            out += ch;
        }
        if ( escaped ) {
            out += '\\';
        }
        return out;
    }
}
