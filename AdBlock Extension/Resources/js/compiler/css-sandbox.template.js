/*******************************************************************************

    AdBlock

    Inline cosmetic-filter sandbox template for user-created raw filters.

*/

(async function adblockCssSandbox() {

'use strict';

/******************************************************************************/

const cssSpecificData = self.$cssSpecificData$;
const { isolatedAPI } = self;
const thisHostname = document.location.hostname || '';
const selectors = new Set();
const exceptions = new Set();

/******************************************************************************/

function selectorIndexesFromList(index) {
    const raw = cssSpecificData.selectorLists?.[index];
    if ( typeof raw !== 'string' ) { return []; }
    try {
        return JSON.parse(`[${raw}]`);
    } catch {
        return [];
    }
}

function addSelectorsFromList(index) {
    for ( const selectorIndex of selectorIndexesFromList(index) ) {
        if ( selectorIndex >= 0 ) {
            const selector = cssSpecificData.selectors[selectorIndex];
            if ( typeof selector !== 'string' || exceptions.has(selector) ) {
                continue;
            }
            selectors.add(selector);
        } else {
            const selector = cssSpecificData.selectors[~selectorIndex];
            if ( typeof selector !== 'string' ) { continue; }
            exceptions.add(selector);
            selectors.delete(selector);
        }
    }
}

function addSelectorsFromHostnames(candidates) {
    let start = 0;
    for ( const candidate of candidates ) {
        const index = isolatedAPI.binarySearch(cssSpecificData.hostnames, candidate, start);
        if ( index >= 0 ) {
            addSelectorsFromList(cssSpecificData.selectorListRefs[index]);
            start = index + 1;
        } else {
            start = ~index;
        }
    }
}

function addRegexSelectors() {
    const regexes = cssSpecificData.regexes || [];
    for ( let index = 0; index < regexes.length; index += 3 ) {
        if ( thisHostname.includes(regexes[index]) === false ) { continue; }

        let regex = regexes[index + 1];
        if ( typeof regex === 'string' ) {
            try {
                regex = new RegExp(regex);
                regexes[index + 1] = regex;
            } catch {
                continue;
            }
        }

        if ( regex instanceof RegExp === false ) { continue; }
        if ( regex.test(thisHostname) === false ) { continue; }

        addSelectorsFromList(regexes[index + 2]);
    }
}

/******************************************************************************/

if ( Array.isArray(cssSpecificData.hostnames) && cssSpecificData.hostnames.length !== 0 ) {
    addSelectorsFromHostnames(isolatedAPI.contexts.hostnames);
    if ( cssSpecificData.hasEntities === true ) {
        addSelectorsFromHostnames(isolatedAPI.contexts.entities);
    }
}
addRegexSelectors();

const plain = [];
const procedural = [];

for ( const selector of selectors ) {
    if ( selector.startsWith('{') ) {
        try {
            procedural.push(JSON.parse(selector));
        } catch {
        }
    } else {
        plain.push(selector);
    }
}

if ( plain.length !== 0 ) {
    self.cssAPI.insert(`${plain.join(',\n')}{display:none!important;}`);
}

if ( procedural.length !== 0 ) {
    await self.ProceduralFiltererAPI;
    const filterer = new self.ProceduralFiltererAPI();
    const declarative = procedural.filter(selector => selector.cssable);
    const active = procedural.filter(selector => selector.cssable !== true);

    if ( declarative.length !== 0 ) {
        filterer.addDeclaratives(declarative);
    }
    if ( active.length !== 0 ) {
        filterer.addProcedurals(active);
    }
}

self.isolatedAPI = undefined;
self.ProceduralFiltererAPI = undefined;

/******************************************************************************/

})();

void 0;
