/*******************************************************************************

    AdBlock

    User-script template for compiled +js filters.

*/

// ruleset: $rulesetId$

(function adblockCompiledScriptlets() {

'use strict';

/******************************************************************************/

self.$scriptletCode$

const scriptletFunctions = self.$scriptletFunctions$;
const scriptletArgs = self.$scriptletArgs$;
const scriptletArglists = self.$scriptletArglists$;
const scriptletArglistRefs = self.$scriptletArglistRefs$;
const scriptletHostnames = self.$scriptletHostnames$;
const scriptletFromRegexes = self.$scriptletFromRegexes$;
const hasEntities = self.$hasEntities$;
const hasAncestors = self.$hasAncestors$;
const hasRegexes = self.$hasRegexes$;

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
    const parts = String(hostname || '').split('.');
    const out = [];
    for ( let index = 0; index < parts.length; index += 1 ) {
        out.push(parts.slice(index).join('.'));
    }
    return out.filter(Boolean);
}

function entityLineage(hostname) {
    const parts = String(hostname || '').split('.');
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

function compareHostnames(a, b) {
    if ( a.length !== b.length ) { return a.length - b.length; }
    if ( a === b ) { return 0; }
    return a < b ? -1 : 1;
}

function findHostnameIndex(hostname, end) {
    let left = 0;
    let right = end;
    while ( left < right ) {
        const mid = (left + right) >>> 1;
        const order = compareHostnames(hostname, scriptletHostnames[mid]);
        if ( order === 0 ) { return mid; }
        if ( order < 0 ) {
            right = mid;
        } else {
            left = mid + 1;
        }
    }
    return ~left;
}

function pageEntries() {
    const origins = [ document.location.origin ];
    if ( document.location.ancestorOrigins ) {
        origins.push(...document.location.ancestorOrigins);
    }

    return origins.map((origin, index) => {
        const hostname = hostnameFromOrigin(origin);
        if ( hostname === '' ) { return undefined; }
        return {
            index,
            hns: hostnameLineage(hostname),
            ens: hasEntities ? entityLineage(hostname) : [],
        };
    }).filter(Boolean);
}

function addRefsForHostnames(out, hostnames, suffix = '') {
    let end = scriptletHostnames.length;
    for ( const hostname of hostnames ) {
        const index = findHostnameIndex(`${hostname}${suffix}`, end);
        if ( index >= 0 ) {
            out.add(index);
            end = index + 1;
        } else {
            end = ~index;
        }
    }
}

function addTodoFromHostRefs(todo, hostRefIndexes) {
    const refs = scriptletArglistRefs.split(';');
    for ( const index of hostRefIndexes ) {
        const raw = refs[index];
        if ( raw === undefined || raw === '' ) { continue; }
        for ( const ref of JSON.parse(`[${raw}]`) ) {
            todo.add(ref);
        }
    }
}

function addTodoFromRegexes(todo, entry) {
    if ( hasRegexes === false ) { return; }

    for ( let index = 0; index < scriptletFromRegexes.length; index += 3 ) {
        const needle = scriptletFromRegexes[index];
        const source = scriptletFromRegexes[index + 1];
        const refs = scriptletFromRegexes[index + 2];

        if ( entry.hns.every(hostname => hostname.includes(needle) === false) ) {
            continue;
        }

        let regex;
        try {
            regex = new RegExp(source);
        } catch {
            continue;
        }

        if ( entry.hns.some(hostname => regex.test(hostname)) === false ) {
            continue;
        }

        for ( const ref of JSON.parse(`[${refs}]`) ) {
            todo.add(ref);
        }
    }
}

/******************************************************************************/

const entries = pageEntries();
if ( entries.length === 0 ) { return; }

const hostRefIndexes = new Set();
if ( scriptletHostnames.length !== 0 ) {
    const wildcardIndex = findHostnameIndex('*', scriptletHostnames.length);
    if ( wildcardIndex >= 0 ) {
        hostRefIndexes.add(wildcardIndex);
    }

    addRefsForHostnames(hostRefIndexes, entries[0].hns);
    if ( hasEntities ) {
        addRefsForHostnames(hostRefIndexes, entries[0].ens);
    }
    if ( hasAncestors ) {
        for ( const entry of entries ) {
            if ( entry.index === 0 ) { continue; }
            addRefsForHostnames(hostRefIndexes, entry.hns, '>>');
            if ( hasEntities ) {
                addRefsForHostnames(hostRefIndexes, entry.ens, '>>');
            }
        }
    }
}

const todo = new Set();
addTodoFromHostRefs(todo, hostRefIndexes);
addTodoFromRegexes(todo, entries[0]);

if ( todo.size === 0 ) { return; }

const arglists = scriptletArglists.split(';');
for ( const ref of todo ) {
    if ( ref < 0 || todo.has(~ref) ) { continue; }

    const arglist = JSON.parse(`[${arglists[ref]}]`);
    const fn = scriptletFunctions[arglist[0]];
    if ( fn instanceof Function === false ) { continue; }

    try {
        fn(...arglist.slice(1).map(index => scriptletArgs[index]));
    } catch {
    }
}

/******************************************************************************/

})();

void 0;
