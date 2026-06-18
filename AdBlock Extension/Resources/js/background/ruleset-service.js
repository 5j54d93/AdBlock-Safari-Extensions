// AdBlock ruleset service. This module owns Safari DNR ruleset activation,
// dynamic regex rules, and per-site DNR allow rules derived from protection
// levels.

import {
    localRead, localWrite,
} from '../shared/ext.js';

import {
    runtimeSettings,
} from '../shared/settings-store.js';
import { adblockErr, adblockLog } from '../shared/logger.js';

import { dnr } from '../shared/ext-compat.js';
import { fetchJSON } from '../shared/fetch.js';

/******************************************************************************/

const SPECIAL_RULES_REALM = 5000000;
const TRUSTED_DIRECTIVE_BASE_RULE_ID = 8000000;
const TRUSTED_DIRECTIVE_PRIORITY = 2000000;

/******************************************************************************/

function getRulesetDetails() {
    if ( getRulesetDetails.rulesetDetailsPromise !== undefined ) {
        return getRulesetDetails.rulesetDetailsPromise;
    }
    getRulesetDetails.rulesetDetailsPromise =
        fetchJSON('/rulesets/ruleset-details').then(entries => {
            const rulesMap = new Map(entries.map(entry => [ entry.id, entry ]));
            return rulesMap;
        });
    return getRulesetDetails.rulesetDetailsPromise;
}

/******************************************************************************/

async function pruneInvalidRegexRules(realm, rulesIn, rejected = []) {
    const validateRegex = regex => {
        return dnr.isRegexSupported({ regex, isCaseSensitive: false }).then(result => {
            pruneInvalidRegexRules.validated.set(regex, result?.reason || true);
            if ( result.isSupported ) { return true; }
            rejected.push({ regex, reason: result?.reason });
            return false;
        });
    };

    // Validate regex-based rules
    const toCheck = [];
    for ( const rule of rulesIn ) {
        if ( rule.condition?.regexFilter === undefined ) {
            toCheck.push(true);
            continue;
        }
        const { regexFilter } = rule.condition;
        const reason = pruneInvalidRegexRules.validated.get(regexFilter);
        if ( reason !== undefined ) {
            toCheck.push(reason === true);
            if ( reason === true  ) { continue; }
            rejected.push({ regex: regexFilter, reason });
            continue;
        }
        toCheck.push(validateRegex(regexFilter));
    }

    // Collate results
    const isValid = await Promise.all(toCheck);

    if ( rejected.length !== 0 ) {
        adblockLog(`${realm} realm: rejected regexes:\n`,
            rejected.map(e => `${e.regex} → ${e.reason}`).join('\n')
        );
    }

    return rulesIn.filter((v, i) => isValid[i]);
}
pruneInvalidRegexRules.validated = new Map();

/******************************************************************************/

async function getDynamicRegexRuleCount() {
    const rules = await dnr.getDynamicRules();
    const regexRules = rules.filter(a => Boolean(a.condition?.regexFilter));
    return regexRules.length;
}

/******************************************************************************/

async function updateRegexRules(currentRules, addRules, removeRuleIds) {
    // Remove existing regex-related block rules
    for ( const rule of currentRules ) {
        if ( rule.id === 0 ) { continue; }
        if ( rule.id >= SPECIAL_RULES_REALM ) { continue; }
        if ( rule.condition.regexFilter === undefined ) { continue; }
        removeRuleIds.push(rule.id);
    }

    const rulesetDetails = await getEnabledRulesetsDetails();

    // Fetch regexes for all enabled rulesets
    const toFetch = [];
    for ( const details of rulesetDetails ) {
        if ( details.rules.regex === 0 ) { continue; }
        toFetch.push(fetchJSON(`/rulesets/regex/${details.id}`));
    }
    const regexRulesets = await Promise.all(toFetch);

    // Collate all regexes rules
    const allRules = [];
    for ( const rules of regexRulesets ) {
        if ( Array.isArray(rules) === false ) { continue; }
        for ( const rule of rules ) {
            allRules.push(rule);
        }
    }
    if ( allRules.length === 0 ) { return; }

    const validRules = await pruneInvalidRegexRules('regexes', allRules);
    if ( validRules.length === 0 ) { return; }

    adblockLog(`Add ${validRules.length} DNR regex rules`);
    addRules.push(...validRules);
}

/******************************************************************************/

async function updateDynamicRules() {
    const currentRules = await dnr.getDynamicRules();

    // Remove potentially left-over rules from previous version
    const removeRuleIds = [];
    for ( const rule of currentRules ) {
        if ( rule.id >= SPECIAL_RULES_REALM ) { continue; }
        removeRuleIds.push(rule.id);
        rule.id = 0;
    }

    const addRules = [];
    await updateRegexRules(currentRules, addRules, removeRuleIds);
    if ( addRules.length === 0 && removeRuleIds.length === 0 ) { return; }

    const dynamicRegexCountBefore = await getDynamicRegexRuleCount();
    let dynamicRegexCountAfter = 0;
    let ruleId = 1;
    for ( const rule of addRules ) {
        if ( rule?.condition.regexFilter ) { dynamicRegexCountAfter += 1; }
        if ( rule.id >= SPECIAL_RULES_REALM ) { continue; }
        rule.id = ruleId++;
    }
    if ( dynamicRegexCountAfter !== 0 ) {
        adblockLog(`Using ${dynamicRegexCountAfter}/${dnr.MAX_NUMBER_OF_REGEX_RULES} dynamic regex-based DNR rules`);
    }
    // If we increase the number of dynamic regex rules, reset session rules to
    // reduce risk of hitting maximum regex count
    if ( dynamicRegexCountAfter > dynamicRegexCountBefore ) {
        await clearSessionRules();
    }

    const response = {};

    try {
        await dnr.updateDynamicRules({ addRules, removeRuleIds });
        if ( removeRuleIds.length !== 0 ) {
            adblockLog(`Remove ${removeRuleIds.length} dynamic DNR rules`);
        }
        if ( addRules.length !== 0 ) {
            adblockLog(`Add ${addRules.length} dynamic DNR rules`);
        }
    } catch(reason) {
        adblockErr(`updateDynamicRules/${reason}`);
        response.error = `${reason}`;
    }

    const result = await updateSessionRules();
    if ( result?.error ) {
        response.error ||= result.error;
    }

    return response;
}

/******************************************************************************/

async function updateSessionRules() {
    const currentRules = await dnr.getSessionRules();
    if ( currentRules.length === 0 ) { return; }
    const removeRuleIds = currentRules.map(rule => rule.id);
    const response = {};
    try {
        await dnr.updateSessionRules({ removeRuleIds });
        adblockLog(`Remove ${removeRuleIds.length} session DNR rules`);
    } catch(reason) {
        adblockErr(`updateSessionRules/${reason}`);
        response.error = `${reason}`;
    }
    return response;
}

async function clearSessionRules() {
    const currentRules = await dnr.getSessionRules();
    if ( currentRules.length === 0 ) { return; }
    const removeRuleIds = currentRules.map(a => a.id);
    return dnr.updateSessionRules({ removeRuleIds });
}

/******************************************************************************/

async function applyFilteringModesToDNR(modes) {
    const noneHostnames = new Set([ ...modes.none ]);
    const notNoneHostnames = new Set([ ...modes.basic, ...modes.optimal, ...modes.complete ]);
    const requestDomains = [];
    const excludedRequestDomains = [];
    const allowEverywhere = noneHostnames.has('all-urls');
    if ( allowEverywhere ) {
        excludedRequestDomains.push(...notNoneHostnames);
    } else {
        requestDomains.push(...noneHostnames);
    }
    const noneCount = allowEverywhere
        ? notNoneHostnames.size
        : noneHostnames.size;
    return dnr.setAllowAllRules(
        TRUSTED_DIRECTIVE_BASE_RULE_ID,
        requestDomains.sort(),
        excludedRequestDomains.sort(),
        allowEverywhere,
        TRUSTED_DIRECTIVE_PRIORITY
    ).then(modified => {
        if ( modified === false ) { return; }
        adblockLog(`${allowEverywhere ? 'Enabled' : 'Disabled'} DNR filtering for ${noneCount} sites`);
    });
}

/******************************************************************************/

export async function getDefaultRulesetsFromEnv() {
    const dropCountry = lang => {
        const pos = lang.indexOf('-');
        if ( pos === -1 ) { return lang; }
        return lang.slice(0, pos);
    };
    const escapeRegex = text =>
        text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const langSet = new Set();
    const languages = Array.isArray(navigator.languages) && navigator.languages.length !== 0
        ? navigator.languages
        : [ navigator.language ];

    for ( const lang of languages ) {
        if ( typeof lang !== 'string' || lang === '' ) { continue; }
        langSet.add(dropCountry(lang));
    }
    const reTargetLang = langSet.size !== 0
        ? new RegExp(`\\b(${Array.from(langSet).map(escapeRegex).join('|')})\\b`)
        : null;

    const reMobile = /\bMobile\b/.test(navigator.userAgent)
        ? /\bmobile\b/
        : null

    const rulesetDetails = await getRulesetDetails();
    const out = [];
    for ( const ruleset of rulesetDetails.values() ) {
        const { id, enabled } = ruleset;
        if ( enabled ) {
            out.push(id);
            continue;
        }
        if ( typeof ruleset.lang === 'string' ) {
            if ( reTargetLang?.test(ruleset.lang) ) {
                out.push(id);
                continue;
            }
        }
        if ( typeof ruleset.tags === 'string' ) {
            if ( reMobile?.test(ruleset.tags) ) {
                out.push(id);
                continue;
            }
        }
    }

    return out;
}

/******************************************************************************/

async function patchDefaultRulesets() {
    const [
        oldDefaultIds = [],
        newDefaultIds,
    ] = await Promise.all([
        localRead('defaultRulesetIds'),
        getDefaultRulesetsFromEnv(),
    ]);
    const toAdd = [];
    const toRemove = [];
    for ( const id of newDefaultIds ) {
        if ( oldDefaultIds.includes(id) ) { continue; }
        toAdd.push(id);
    }
    for ( const id of oldDefaultIds ) {
        if ( newDefaultIds.includes(id) ) { continue; }
        toRemove.push(id);
    }
    localWrite('defaultRulesetIds', newDefaultIds);
    if ( toAdd.length === 0 && toRemove.length === 0 ) { return; }
    const enabledRulesets = new Set(runtimeSettings.enabledRulesets);
    toAdd.forEach(id => enabledRulesets.add(id));
    toRemove.forEach(id => enabledRulesets.delete(id));
    const patchedRulesets = Array.from(enabledRulesets);
    adblockLog(`Patched rulesets: ${runtimeSettings.enabledRulesets} => ${patchedRulesets}`);
    runtimeSettings.enabledRulesets = patchedRulesets;
}

/******************************************************************************/

async function enableRulesets(ids) {
    const afterIds = new Set(ids);
    const [
        beforeIds,
        rulesetDetails,
    ] = await Promise.all([
        dnr.getEnabledRulesets().then(ids => new Set(ids)),
        getRulesetDetails(),
    ]);

    const enableRulesetSet = new Set();
    const disableRulesetSet = new Set();
    for ( const id of afterIds ) {
        if ( beforeIds.has(id) ) { continue; }
        enableRulesetSet.add(id);
    }
    for ( const id of beforeIds ) {
        if ( afterIds.has(id) ) { continue; }
        disableRulesetSet.add(id);
    }

    // Be sure the rulesets to enable/disable do exist in the current version,
    // otherwise the API throws.
    for ( const id of enableRulesetSet ) {
        if ( rulesetDetails.has(id) ) { continue; }
        enableRulesetSet.delete(id);
    }
    for ( const id of disableRulesetSet ) {
        if ( rulesetDetails.has(id) ) { continue; }
        disableRulesetSet.delete(id);
    }

    if ( enableRulesetSet.size === 0 && disableRulesetSet.size === 0 ) { return; }

    const enableRulesetIds = Array.from(enableRulesetSet);
    const disableRulesetIds = Array.from(disableRulesetSet);

    if ( enableRulesetIds.length !== 0 ) {
        adblockLog(`Enable rulesets: ${enableRulesetIds}`);
    }
    if ( disableRulesetIds.length !== 0 ) {
        adblockLog(`Disable ruleset: ${disableRulesetIds}`);
    }

    const response = {};

    await dnr.updateEnabledRulesets({
        enableRulesetIds,
        disableRulesetIds,
    }).catch(reason => {
        adblockErr(`updateEnabledRulesets/${reason}`);
        response.error = `${reason}`;
    });

    const result = await updateDynamicRules();
    if ( result?.error ) {
        response.error ||= result.error;
    }

    await dnr.getEnabledRulesets().then(enabledRulesets => {
        adblockLog(`Enabled rulesets: ${enabledRulesets}`);
        response.enabledRulesets = enabledRulesets;
        return dnr.getAvailableStaticRuleCount();
    }).then(count => {
        adblockLog(`Available static rule count: ${count}`);
        response.staticRuleCount = count;
    }).catch(reason => {
        adblockErr(`getEnabledRulesets/${reason}`);
    });

    return response;
}

/******************************************************************************/

async function getEnabledRulesetsDetails() {
    const [
        ids,
        rulesetDetails,
    ] = await Promise.all([
        dnr.getEnabledRulesets(),
        getRulesetDetails(),
    ]);
    const out = [];
    for ( const id of ids ) {
        const ruleset = rulesetDetails.get(id);
        if ( ruleset === undefined ) { continue; }
        out.push(ruleset);
    }
    return out;
}

/******************************************************************************/

export {
    enableRulesets,
    applyFilteringModesToDNR,
    getEnabledRulesetsDetails,
    getRulesetDetails,
    patchDefaultRulesets,
    updateDynamicRules,
    updateSessionRules,
};
