/*******************************************************************************

    AdBlock

    Minimal ABP-style filter compiler used for user-provided custom filters.

*/

import { toASCII } from '../shared/idn.js';

/******************************************************************************/

const resourceTypeMap = new Map([
    [ 'document', 'main_frame' ],
    [ 'main_frame', 'main_frame' ],
    [ 'subdocument', 'sub_frame' ],
    [ 'sub_frame', 'sub_frame' ],
    [ 'stylesheet', 'stylesheet' ],
    [ 'script', 'script' ],
    [ 'image', 'image' ],
    [ 'font', 'font' ],
    [ 'object', 'object' ],
    [ 'xmlhttprequest', 'xmlhttprequest' ],
    [ 'xhr', 'xmlhttprequest' ],
    [ 'ping', 'ping' ],
    [ 'media', 'media' ],
    [ 'websocket', 'websocket' ],
    [ 'other', 'other' ],
]);

/******************************************************************************/

function uniqueSorted(values) {
    return Array.from(new Set(values)).sort();
}

function hostnameFromPattern(pattern) {
    const match = /^\|\|([^/^*]+)\^?$/.exec(pattern);
    if ( match === null ) { return; }
    return toASCII(match[1]);
}

function urlFilterFromPattern(pattern) {
    if ( pattern.startsWith('/') && pattern.endsWith('/') ) {
        return;
    }
    return pattern
        .replace(/^\|+/, '')
        .replace(/\^/g, '*')
        .replace(/\|+$/, '');
}

function regexFilterFromPattern(pattern) {
    if ( pattern.startsWith('/') === false || pattern.endsWith('/') === false ) {
        return;
    }
    return pattern.slice(1, -1);
}

function applyNetworkOptions(rule, options = new Map()) {
    const resourceTypes = [];
    const excludedResourceTypes = [];

    for ( const { name, value, negated } of options.values() ) {
        if ( resourceTypeMap.has(name) ) {
            const target = negated ? excludedResourceTypes : resourceTypes;
            target.push(resourceTypeMap.get(name));
            continue;
        }

        if ( name === 'domain' || name === 'from' ) {
            const domains = String(value)
                .split('|')
                .map(domain => domain.trim())
                .filter(Boolean);
            const included = [];
            const excluded = [];
            for ( const domain of domains ) {
                if ( domain.startsWith('~') ) {
                    excluded.push(toASCII(domain.slice(1)));
                } else {
                    included.push(toASCII(domain));
                }
            }
            if ( included.length ) {
                rule.condition.initiatorDomains = uniqueSorted(included);
            }
            if ( excluded.length ) {
                rule.condition.excludedInitiatorDomains = uniqueSorted(excluded);
            }
        }

        if ( name === 'match-case' ) {
            rule.condition.isUrlFilterCaseSensitive = true;
        }
    }

    if ( resourceTypes.length ) {
        rule.condition.resourceTypes = uniqueSorted(resourceTypes);
    }
    if ( excludedResourceTypes.length ) {
        rule.condition.excludedResourceTypes = uniqueSorted(excludedResourceTypes);
    }
}

/******************************************************************************/

export function minimizeRuleset(rules) {
    return rules;
}

export function minimizeRules(rules) {
    return rules;
}

export function validateRules(rules) {
    return rules.filter(rule => {
        const { condition } = rule;
        if ( condition.resourceTypes && condition.excludedResourceTypes ) {
            return false;
        }
        if ( condition.regexFilter !== undefined ) {
            try {
                new RegExp(condition.regexFilter);
            } catch {
                return false;
            }
        }
        return true;
    });
}

export function parseNetworkFilter(parser) {
    if ( parser.isNetworkFilter() === false || parser.hasError() ) { return; }

    const pattern = parser.getNetPattern();
    if ( pattern === '' ) { return; }

    const rule = {
        action: { type: parser.isException() ? 'allow' : 'block' },
        condition: {},
    };

    const hostname = hostnameFromPattern(parser.netPattern || pattern);
    const regexFilter = regexFilterFromPattern(pattern);
    const urlFilter = urlFilterFromPattern(pattern);

    if ( hostname !== undefined ) {
        rule.condition.requestDomains = [ hostname ];
    } else if ( regexFilter !== undefined ) {
        rule.condition.regexFilter = regexFilter;
    } else if ( urlFilter !== undefined && urlFilter !== '' ) {
        rule.condition.urlFilter = urlFilter;
    } else {
        return;
    }

    applyNetworkOptions(rule, parser.getNetOptions?.());

    return rule;
}

export function parseFilters(text) {
    const network = [];
    const cosmetic = [];
    const scriptlet = [];

    return {
        network,
        cosmetic,
        scriptlet,
        text,
    };
}
