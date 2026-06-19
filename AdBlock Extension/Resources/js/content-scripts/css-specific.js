/*******************************************************************************

    AdBlock

    Applies hostname-specific cosmetic filters from compiled ruleset data.

*/

(async function adblockCssSpecific() {

'use strict';

const rulesetIds = Array.from(new Set(self.specificImports || []));
self.specificImports = undefined;

if ( rulesetIds.length === 0 || self.isolatedAPI === undefined ) { return; }

const { isolatedAPI } = self;
const thisHostname = document.location.hostname || '';
const topHostname = isolatedAPI.contexts.topHostname;
const cachePrefix = topHostname !== thisHostname ? `${topHostname}/` : '';
const cacheKey = `cache.css.${cachePrefix}${thisHostname}`;

/******************************************************************************/

async function sessionRead(key) {
    try {
        const data = await chrome.storage.session.get(key);
        return data?.[key];
    } catch {
        return undefined;
    }
}

function sessionWrite(key, value) {
    try {
        chrome.storage.session.set({ [key]: value });
    } catch {
    }
}

async function localRead(key) {
    try {
        const data = await chrome.storage.local.get(key);
        return data?.[key];
    } catch {
        return undefined;
    }
}

function currentCacheBucket() {
    return Math.round(Date.now() / (5 * 60 * 1000));
}

function hostnameMatches(hostname, pattern) {
    if ( pattern === 'all-urls' || pattern === '*' ) { return true; }
    if ( hostname === pattern ) { return true; }
    return hostname.endsWith(`.${pattern}`);
}

function selectorIndexesFromList(data, index) {
    const raw = data.selectorLists?.[index];
    if ( typeof raw !== 'string' ) { return []; }
    try {
        return JSON.parse(`[${raw}]`);
    } catch {
        return [];
    }
}

function addSelectorsFromList(data, index, result) {
    for ( const selectorIndex of selectorIndexesFromList(data, index) ) {
        if ( selectorIndex >= 0 ) {
            const selector = data.selectors?.[selectorIndex];
            if ( typeof selector === 'string' ) {
                result.selectors.add(selector);
            }
        } else {
            const selector = data.selectors?.[~selectorIndex];
            if ( typeof selector === 'string' ) {
                result.exceptions.add(selector);
            }
        }
    }
}

function addSelectorsForCandidates(data, candidates, result) {
    if ( Array.isArray(data.hostnames) === false ) { return; }

    let start = 0;
    for ( const candidate of candidates ) {
        const index = isolatedAPI.binarySearch(data.hostnames, candidate, start);
        if ( index >= 0 ) {
            addSelectorsFromList(data, data.selectorListRefs[index], result);
            start = index + 1;
        } else {
            start = ~index;
        }
    }
}

function addRegexSelectors(data, result) {
    if ( Array.isArray(data.regexes) === false ) { return; }

    for ( let index = 0; index < data.regexes.length; index += 3 ) {
        const hostnameNeedle = data.regexes[index];
        const regexSource = data.regexes[index + 1];
        const listIndex = data.regexes[index + 2];

        if (
            typeof hostnameNeedle === 'string' &&
            hostnameNeedle !== '' &&
            thisHostname.includes(hostnameNeedle) === false
        ) {
            continue;
        }

        let regex = regexSource;
        if ( typeof regex === 'string' ) {
            try {
                regex = new RegExp(regex);
                data.regexes[index + 1] = regex;
            } catch {
                continue;
            }
        }

        if ( regex instanceof RegExp === false ) { continue; }
        if ( regex.test(thisHostname) === false ) { continue; }

        addSelectorsFromList(data, listIndex, result);
    }
}

async function addRulesetSelectors(rulesetId, result) {
    const data = await localRead(`css.specific.${rulesetId}`);
    if ( data instanceof Object === false ) { return; }

    addSelectorsForCandidates(data, isolatedAPI.contexts.hostnames, result);
    if ( data.hasEntities === true ) {
        addSelectorsForCandidates(data, isolatedAPI.contexts.entities, result);
    }
    addRegexSelectors(data, result);
}

async function shouldSkipSite() {
    const details = await localRead('filteringModeDetails');
    const disabled = Array.isArray(details?.none) ? details.none : [];
    return disabled.some(pattern => hostnameMatches(topHostname, pattern));
}

async function buildCacheEntry() {
    const result = {
        selectors: new Set(),
        exceptions: new Set(),
    };

    await Promise.all(rulesetIds.map(id => addRulesetSelectors(id, result)));

    for ( const exception of result.exceptions ) {
        result.selectors.delete(exception);
    }

    if ( await shouldSkipSite() ) {
        result.selectors.clear();
    }

    const plainSelectors = [];
    const proceduralSelectors = [];

    for ( const selector of result.selectors ) {
        if ( selector.startsWith('{') ) {
            try {
                proceduralSelectors.push(JSON.parse(selector));
            } catch {
            }
        } else {
            plainSelectors.push(selector);
        }
    }

    return {
        t: currentCacheBucket(),
        s: plainSelectors,
        p: proceduralSelectors,
    };
}

async function ensureProceduralAPI() {
    if ( self.ProceduralFiltererAPI instanceof Function ) { return; }

    if ( self.ProceduralFiltererAPI instanceof Promise === false ) {
        self.ProceduralFiltererAPI = chrome.runtime.sendMessage({
            what: 'injectCSSProceduralAPI',
        }).catch(( ) => {});
    }

    await self.ProceduralFiltererAPI;
}

/******************************************************************************/

let cacheEntry = await sessionRead(cacheKey);
if (
    cacheEntry instanceof Object === false ||
    Array.isArray(cacheEntry.s) === false ||
    Array.isArray(cacheEntry.p) === false
) {
    cacheEntry = await buildCacheEntry();
    sessionWrite(cacheKey, cacheEntry);
}

if ( currentCacheBucket() - (cacheEntry.t || 0) > 1 ) {
    cacheEntry.t = currentCacheBucket();
    sessionWrite(cacheKey, cacheEntry);
}

if ( cacheEntry.s.length !== 0 ) {
    self.cssAPI.insert(`${cacheEntry.s.join(',\n')}{display:none!important;}`);
}

if ( cacheEntry.p.length !== 0 ) {
    await ensureProceduralAPI();
    if ( self.ProceduralFiltererAPI instanceof Function ) {
        const filterer = new self.ProceduralFiltererAPI();
        const declarative = cacheEntry.p.filter(selector => selector.cssable);
        const procedural = cacheEntry.p.filter(selector => selector.cssable !== true);
        if ( declarative.length !== 0 ) {
            filterer.addDeclaratives(declarative);
        }
        if ( procedural.length !== 0 ) {
            filterer.addProcedurals(procedural);
        }
    }
}

/******************************************************************************/

})();

void 0;
