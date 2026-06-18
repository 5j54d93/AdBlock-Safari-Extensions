/*******************************************************************************

    AdBlock

    Offscreen compiler for user-created raw filters.

*/

import * as makeScriptlet from './make-scriptlets.js';
import * as sfp from '../parsing/static-filtering-parser.js';

import {
    minimizeRules,
    minimizeRuleset,
    parseNetworkFilter,
    validateRules,
} from '../parsing/ubo-parser.js';

import { makeCosmeticScripts } from './make-cosmetic-filters.js';
import { safeReplace } from './safe-replace.js';

/******************************************************************************/

const parser = new sfp.AstFilterParser({
    localSource: true,
    trustedSource: true,
});

const cosmeticFilters = new Map();
const scriptletFilters = new Map();
const networkRules = [];

/******************************************************************************/

function domainDetails(parser) {
    return Array.from(parser.getExtFilterDomainIterator())
        .filter(entry => entry.bad !== true);
}

function sanitizedCosmeticSelector(compiled) {
    if ( compiled.startsWith('{') === false ) { return compiled; }
    const parsed = JSON.parse(compiled);
    delete parsed.raw;
    return JSON.stringify(parsed);
}

function compileScriptletFilter(parser) {
    if ( parser.hasOptions() === false || parser.isException() ) { return; }

    const args = parser.getScriptletArgs();
    const key = JSON.stringify(args);
    const details = scriptletFilters.get(key) || {
        args,
        trustedSource: true,
        matches: [],
        excludeMatches: [],
    };

    for ( const { hn, not } of domainDetails(parser) ) {
        if ( not ) {
            details.excludeMatches.push(hn);
        } else if ( hn === '*' ) {
            details.matches = [ '*' ];
        } else if ( details.matches.includes('*') === false ) {
            details.matches.push(hn);
        }
    }

    scriptletFilters.set(key, details);
}

function compileCosmeticFilter(parser) {
    const { compiled, exception } = parser.result;
    if ( compiled === undefined ) { return; }

    const selector = sanitizedCosmeticSelector(compiled);
    const details = cosmeticFilters.get(selector) || {
        matches: [],
        excludeMatches: [],
    };

    for ( const { hn, not } of domainDetails(parser) ) {
        if ( not && exception ) { continue; }
        if ( not || exception ) {
            details.excludeMatches.push(hn);
        } else if ( hn === '*' ) {
            details.matches = [ '*' ];
        } else if ( details.matches.includes('*') === false ) {
            details.matches.push(hn);
        }
    }

    if ( details.matches.length === 0 && details.excludeMatches.length === 0 ) {
        return;
    }

    cosmeticFilters.set(selector, details);
}

function compileNetworkFilter(parser) {
    const rule = parseNetworkFilter(parser);
    if ( rule !== undefined ) {
        networkRules.push(rule);
    }
}

async function compileScriptlets(message) {
    if ( scriptletFilters.size === 0 ) { return; }

    for ( const details of scriptletFilters.values() ) {
        makeScriptlet.compile('sandbox', details);
    }

    const template = await fetch('./scriptlet.template.js')
        .then(response => response.text());
    const compiled = makeScriptlet.commit('sandbox', template);

    if ( compiled.ISOLATED ) {
        message.ISOLATED = [ compiled.ISOLATED.code ];
    }
    if ( compiled.MAIN ) {
        message.MAIN = [ compiled.MAIN.code ];
    }
}

async function compileCosmetics(message) {
    if ( cosmeticFilters.size === 0 ) { return; }

    const result = makeCosmeticScripts('sandbox', cosmeticFilters);
    if ( result === undefined ) { return; }

    const [
        cssAPI,
        isolatedAPI,
        proceduralAPI,
        template,
    ] = await Promise.all([
        fetch('../content-scripts/css-api.js').then(response => response.text()),
        fetch('../content-scripts/isolated-api.js').then(response => response.text()),
        fetch('../content-scripts/css-procedural-api.js').then(response => response.text()),
        fetch('./css-sandbox.template.js').then(response => response.text()),
    ]);

    const sandbox = safeReplace(template, 'self.$cssSpecificData$', result.json);
    message.ISOLATED ??= [];
    message.ISOLATED.push([
        cssAPI,
        isolatedAPI,
        proceduralAPI,
        sandbox,
    ].join('\n'));
}

function compileNetworkRules(message) {
    if ( networkRules.length === 0 ) { return; }

    let rules = minimizeRuleset(networkRules);
    rules = minimizeRules(rules);
    rules = validateRules(rules);
    if ( rules.length !== 0 ) {
        message.dnrRules = rules;
    }
}

/******************************************************************************/

(async function main() {
    const text = await chrome.runtime.sendMessage({ what: 'getRawFilters' });
    if ( typeof text !== 'string' || text.trim() === '' ) { return; }

    for ( const line of text.split(/\n/).map(value => value.trim()) ) {
        parser.parse(line);
        if ( parser.hasError() ) { continue; }

        if ( parser.isScriptletFilter() ) {
            compileScriptletFilter(parser);
        } else if ( parser.isCosmeticFilter() ) {
            compileCosmeticFilter(parser);
        } else if ( parser.isNetworkFilter() ) {
            compileNetworkFilter(parser);
        }
    }

    const message = { what: 'compiledRawFilters' };
    await Promise.all([
        compileScriptlets(message),
        compileCosmetics(message),
    ]);
    compileNetworkRules(message);

    chrome.runtime.sendMessage(message);
})();
