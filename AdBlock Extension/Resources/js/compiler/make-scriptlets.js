/*******************************************************************************

    AdBlock

    Compiles user-created +js filters into executable user-script blocks.

*/

import { hostnameCompare, isHnRegexOrPath } from './make-utils.js';
import { builtinScriptlets } from '../scriptlets/scriptlets.js';
import { literalStrFromRegex } from './regex-analyzer.js';
import { safeReplace } from './safe-replace.js';

/******************************************************************************/

function emptyWorld() {
    return {
        scriptletFunctions: new Map(),
        functionCode: new Map(),
        args: new Map(),
        arglists: new Map(),
        hostnames: new Map(),
        regexesOrPaths: new Map(),
        matches: new Set(),
        hasEntities: false,
        hasAncestors: false,
    };
}

const resources = new Map();
const aliases = new Map();
let worlds = {
    ISOLATED: emptyWorld(),
    MAIN: emptyWorld(),
};

/******************************************************************************/

export function reset() {
    worlds = {
        ISOLATED: emptyWorld(),
        MAIN: emptyWorld(),
    };
}

function normalizeScriptletName(name) {
    let normalized = String(name || '');
    if ( normalized.endsWith('.js') === false ) {
        normalized = `${normalized}.js`;
    }
    return aliases.get(normalized) || normalized;
}

function argIndex(world, value) {
    if ( world.args.has(value) === false ) {
        world.args.set(value, world.args.size);
    }
    return world.args.get(value);
}

function arglistIndex(world, indexes) {
    const key = JSON.stringify(indexes).slice(1, -1);
    if ( world.arglists.has(key) === false ) {
        world.arglists.set(key, world.arglists.size);
    }
    return world.arglists.get(key);
}

function addHostnameReference(world, hostname, arglistRef) {
    if ( world.hostnames.has(hostname) === false ) {
        world.hostnames.set(hostname, new Set());
    }
    world.hostnames.get(hostname).add(arglistRef);
    world.hasEntities ||= hostname.endsWith('.*') || hostname.endsWith('.*>>');
    world.hasAncestors ||= hostname.endsWith('>>');
}

function addPatternReference(world, pattern, arglistRef) {
    if ( world.regexesOrPaths.has(pattern) === false ) {
        world.regexesOrPaths.set(pattern, new Set());
    }
    world.regexesOrPaths.get(pattern).add(arglistRef);
}

/******************************************************************************/

export function compile(rulesetId, details) {
    const name = normalizeScriptletName(details.args?.[0]);
    const resource = resources.get(name);
    if ( resource === undefined ) { return; }
    if ( resource.requiresTrust === true && details.trustedSource !== true ) {
        return;
    }

    const world = worlds[resource.world];
    if ( world.scriptletFunctions.has(resource.fn.name) === false ) {
        world.scriptletFunctions.set(resource.fn.name, world.scriptletFunctions.size);
        world.functionCode.set(resource.fn.name, resource.fn.toString());
    }

    const argIndexes = [
        world.scriptletFunctions.get(resource.fn.name),
        ...details.args.slice(1).map(arg => argIndex(world, arg)),
    ];
    const ref = arglistIndex(world, argIndexes);

    const matches = details.matches?.length ? details.matches : [ '*' ];
    for ( const hostname of matches ) {
        if ( isHnRegexOrPath(hostname) ) {
            world.matches.clear();
            world.matches.add('*');
            addPatternReference(world, hostname, ref);
        } else {
            if ( hostname.endsWith('.*') || hostname.endsWith('>>') ) {
                world.matches.clear();
                world.matches.add('*');
            } else if ( world.matches.has('*') === false ) {
                world.matches.add(hostname);
            }
            addHostnameReference(world, hostname, ref);
        }
    }

    for ( const hostname of details.excludeMatches || [] ) {
        if ( isHnRegexOrPath(hostname) ) {
            addPatternReference(world, hostname, ~ref);
        } else {
            addHostnameReference(world, hostname, ~ref);
        }
    }
}

function refsToText(refs) {
    return JSON.stringify(Array.from(refs).sort((a, b) => a - b)).slice(1, -1);
}

function compiledRegexRefs(world) {
    return Array.from(world.regexesOrPaths)
        .filter(([ pattern ]) => pattern.startsWith('/') && pattern.endsWith('/'))
        .flatMap(([ pattern, refs ]) => {
            const source = pattern.slice(1, -1);
            return [
                literalStrFromRegex(source).slice(0, 8),
                source,
                refsToText(refs),
            ];
        });
}

function compileWorld(rulesetId, worldName, template) {
    const world = worlds[worldName];
    if ( world.scriptletFunctions.size === 0 ) { return; }

    const hostEntries = Array.from(world.hostnames)
        .sort((a, b) => hostnameCompare(a[0], b[0]));
    const regexRefs = compiledRegexRefs(world);

    let content = template;
    content = safeReplace(content, 'self.$hasEntities$', JSON.stringify(world.hasEntities));
    content = safeReplace(content, 'self.$hasAncestors$', JSON.stringify(world.hasAncestors));
    content = safeReplace(content, 'self.$hasRegexes$', JSON.stringify(regexRefs.length !== 0));
    content = safeReplace(content, 'self.$scriptletFromRegexes$', JSON.stringify(regexRefs));
    content = safeReplace(content, 'self.$scriptletHostnames$', JSON.stringify(hostEntries.map(([ hostname ]) => hostname)));
    content = safeReplace(content, 'self.$scriptletArglistRefs$', JSON.stringify(hostEntries.map(([, refs ]) => refsToText(refs)).join(';')));
    content = safeReplace(content, 'self.$scriptletArglists$', JSON.stringify(Array.from(world.arglists.keys()).join(';')));
    content = safeReplace(content, 'self.$scriptletArgs$', JSON.stringify(Array.from(world.args.keys())));
    content = safeReplace(content, 'self.$scriptletFunctions$', `[${Array.from(world.scriptletFunctions.keys()).join(',')}]`);
    content = safeReplace(content, 'self.$scriptletCode$', Array.from(world.functionCode.values()).join('\n\n'));
    content = safeReplace(content, /\$rulesetId\$/, rulesetId, 0);

    return {
        code: content,
        hostnames: Array.from(world.matches).sort(),
    };
}

export function commit(rulesetId, template) {
    const out = {};

    for ( const worldName of Object.keys(worlds) ) {
        const compiled = compileWorld(rulesetId, worldName, template);
        if ( compiled !== undefined ) {
            out[worldName] = compiled;
        }
    }

    return out;
}

function init() {
    for ( const scriptlet of builtinScriptlets ) {
        resources.set(scriptlet.name, {
            fn: scriptlet.fn,
            world: scriptlet.world || 'MAIN',
            requiresTrust: scriptlet.requiresTrust === true,
        });

        for ( const alias of scriptlet.aliases || [] ) {
            aliases.set(normalizeScriptletName(alias), scriptlet.name);
        }
    }
}

init();
