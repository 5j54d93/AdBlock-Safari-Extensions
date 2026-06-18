/*******************************************************************************

    AdBlock

    Small JSONPath evaluator for scriptlet JSON editing helpers.

*/

function parseValue(raw) {
    if ( raw === undefined ) { return undefined; }
    const text = raw.trim();
    if ( text === '' ) { return ''; }
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function tokenizePath(query) {
    const tokens = [];
    let i = query.startsWith('$') ? 1 : 0;

    while ( i < query.length ) {
        if ( query.startsWith('..', i) ) {
            i += 2;
            const match = /^[A-Za-z0-9_$*-]+/.exec(query.slice(i));
            if ( match === null ) { return; }
            tokens.push({ type: 'recursive', key: match[0] });
            i += match[0].length;
            continue;
        }

        if ( query[i] === '.' ) {
            i += 1;
            const match = /^[A-Za-z0-9_$*-]+/.exec(query.slice(i));
            if ( match === null ) { return; }
            const key = match[0];
            tokens.push(key === '*'
                ? { type: 'wildcard' }
                : { type: 'key', key }
            );
            i += key.length;
            continue;
        }

        if ( query[i] === '[' ) {
            const end = query.indexOf(']', i + 1);
            if ( end === -1 ) { return; }
            const inner = query.slice(i + 1, end).trim();
            if ( inner === '*' ) {
                tokens.push({ type: 'wildcard' });
            } else if ( /^-?\d+$/.test(inner) ) {
                tokens.push({ type: 'key', key: Number(inner) });
            } else {
                tokens.push({
                    type: 'key',
                    key: inner.replace(/^['"]|['"]$/g, ''),
                });
            }
            i = end + 1;
            continue;
        }

        return;
    }

    return tokens;
}

function descendantsWithKey(root, key, out) {
    if ( root instanceof Object === false ) { return; }

    for ( const [ childKey, childValue ] of Object.entries(root) ) {
        if ( key === '*' || childKey === key ) {
            out.push({ owner: root, key: childKey });
        }
        descendantsWithKey(childValue, key, out);
    }
}

function childEntries(owner, token) {
    if ( owner instanceof Object === false ) { return []; }

    if ( token.type === 'wildcard' ) {
        return Object.keys(owner).map(key => ({ owner, key }));
    }

    if ( token.type === 'recursive' ) {
        const out = [];
        descendantsWithKey(owner, token.key, out);
        return out;
    }

    if ( Object.prototype.hasOwnProperty.call(owner, token.key) === false ) {
        return [];
    }
    return [ { owner, key: token.key } ];
}

function resolveTargets(root, tokens) {
    if ( tokens.length === 0 ) { return []; }

    let current = [ { owner: { root }, key: 'root' } ];
    for ( const token of tokens ) {
        const next = [];
        for ( const entry of current ) {
            next.push(...childEntries(entry.owner[entry.key], token));
        }
        current = next;
        if ( current.length === 0 ) { break; }
    }
    return current;
}

/******************************************************************************/

export class JSONPath {
    static create(query) {
        return new JSONPath(query);
    }

    static toJSON(obj, stringify = JSON.stringify, ...args) {
        return stringify(obj, null, ...args);
    }

    constructor(query = '') {
        this.query = String(query || '').trim();
        this.valid = true;
        this.value = undefined;

        const assignment = this.query.indexOf('=');
        let path = this.query;
        if ( assignment !== -1 ) {
            path = this.query.slice(0, assignment).trim();
            this.value = parseValue(this.query.slice(assignment + 1));
        }

        this.tokens = tokenizePath(path);
        if ( this.tokens === undefined ) {
            this.valid = false;
            this.tokens = [];
        }
    }

    apply(obj) {
        if ( this.valid === false || obj instanceof Object === false ) { return; }

        const targets = resolveTargets(obj, this.tokens);
        if ( targets.length === 0 ) { return; }

        for ( const { owner, key } of targets ) {
            if ( this.value === undefined ) {
                if ( Array.isArray(owner) ) {
                    owner.splice(Number(key), 1);
                } else {
                    delete owner[key];
                }
            } else {
                owner[key] = this.value;
            }
        }

        return obj;
    }

    values(obj) {
        if ( this.valid === false || obj instanceof Object === false ) { return []; }
        return resolveTargets(obj, this.tokens).map(({ owner, key }) => owner[key]);
    }
}
