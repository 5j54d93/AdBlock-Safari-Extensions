/*******************************************************************************

    AdBlock

    Builds compact hostname-indexed cosmetic filter data.

*/

import { hostnameCompare, isHnRegexOrPath } from './make-utils.js';
import { literalStrFromRegex } from './regex-analyzer.js';

/******************************************************************************/

function selectorListKey(selectorIndexes) {
    return JSON.stringify(Array.from(selectorIndexes).sort((a, b) => a - b))
        .slice(1, -1);
}

function selectorListIndex(selectorIndexes, lists) {
    const key = selectorListKey(selectorIndexes);
    if ( lists.has(key) === false ) {
        lists.set(key, lists.size);
    }
    return lists.get(key);
}

/******************************************************************************/

export function makeCosmeticScripts(rulesetId, selectorDetails) {
    if ( selectorDetails instanceof Map === false || selectorDetails.size === 0 ) {
        return;
    }

    const selectors = new Map();
    const hostnames = new Map();
    const regexesOrPaths = new Map();
    let hasEntities = false;

    const selectorIndex = selector => {
        if ( selectors.has(selector) === false ) {
            selectors.set(selector, selectors.size);
        }
        return selectors.get(selector);
    };

    const addHostnameSelector = (hostname, index) => {
        const target = isHnRegexOrPath(hostname) ? regexesOrPaths : hostnames;
        if ( target.has(hostname) === false ) {
            target.set(hostname, new Set());
        }
        target.get(hostname).add(index);
        hasEntities ||= hostname.endsWith('.*');
    };

    for ( const [ selector, details ] of selectorDetails ) {
        if ( details?.rejected === true ) { continue; }

        const index = selectorIndex(selector);

        for ( const hostname of details.matches || [] ) {
            addHostnameSelector(hostname, index);
        }
        for ( const hostname of details.excludeMatches || [] ) {
            addHostnameSelector(hostname, ~index);
        }
    }

    const selectorLists = new Map();
    for ( const [ hostname, indexes ] of hostnames ) {
        hostnames.set(hostname, selectorListIndex(indexes, selectorLists));
    }
    for ( const [ pattern, indexes ] of regexesOrPaths ) {
        regexesOrPaths.set(pattern, selectorListIndex(indexes, selectorLists));
    }

    const sortedHostnames = Array.from(hostnames.keys()).sort(hostnameCompare);
    const regexes = Array.from(regexesOrPaths)
        .filter(([ pattern ]) => pattern.startsWith('/') && pattern.endsWith('/'))
        .flatMap(([ pattern, listIndex ]) => {
            const source = pattern.slice(1, -1);
            return [ literalStrFromRegex(source).slice(0, 8), source, listIndex ];
        });

    const data = {
        selectors: Array.from(selectors.keys()),
        selectorLists: Array.from(selectorLists.keys()),
        selectorListRefs: sortedHostnames.map(hostname => hostnames.get(hostname)),
        hostnames: sortedHostnames,
        hasEntities,
        regexes,
    };

    return {
        selectorCount: selectors.size,
        hostnameCount: sortedHostnames.length,
        regexCount: regexesOrPaths.size,
        json: JSON.stringify(data),
    };
}
