/*******************************************************************************

    AdBlock — Safari static DNR ruleset patcher

    This is a Safari-only extension, so we bake the WebKit/Safari DNR fixes
    directly into the shipped static rulesets (rulesets/main/*.json) instead of
    keeping the Chromium form + a runtime patch layer.

    The transforms are ported from uBlock Origin Lite's Safari build step
    (platform/mv3/safari/patch-ruleset.js) which encodes known WebKit DNR
    incompatibilities. WebKit compiles each static ruleset strictly, so an
    unsupported construct can drop a rule (or worse) — these fixes keep the
    rulesets actually effective on Safari.

    Run ONCE on freshly generated (Chromium-form) rulesets:
        node tools/patch-rulesets-for-safari.mjs
    Re-running on already-patched files would duplicate issue-434 rules, so
    re-apply only after regenerating the rulesets from upstream.

*******************************************************************************/

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const clone = globalThis.structuredClone ?? (v => JSON.parse(JSON.stringify(v)));

const here = path.dirname(fileURLToPath(import.meta.url));
const resourcesDir = path.join(here, '..', 'AdBlock Extension', 'Resources');
const mainDir = path.join(resourcesDir, 'rulesets', 'main');
const detailsPath = path.join(resourcesDir, 'rulesets', 'ruleset-details.json');

/******************************************************************************/

// WebKit rejects these conditions/actions; drop the rules outright.
function discardUnsupportedRules(ruleset) {
    const isValidRule = rule => {
        const { action, condition } = rule;
        if ( action.type === 'modifyHeaders' ) { return false; }
        if ( Array.isArray(condition.topDomains) ) { return false; }
        if ( Array.isArray(condition.excludedTopDomains) ) { return false; }
        if ( Array.isArray(condition.responseHeaders) ) { return false; }
        if ( Array.isArray(condition.requestHeaders) ) { return false; }
        return true;
    };
    return ruleset.filter(isValidRule);
}

// https://github.com/uBlockOrigin/uBOL-home/issues/434
// WebKit does not match a trailing `^` the same way; add a `|`-anchored twin
// for rules whose pattern (past the domain anchor) carries path/query syntax.
function patchForIssue434(ruleset) {
    const out = [];
    for ( const rule of ruleset ) {
        out.push(rule);
        const { condition } = rule;
        let { urlFilter } = condition;
        if ( Boolean(urlFilter?.endsWith('^')) === false ) { continue; }
        urlFilter = urlFilter.slice(0, -1);
        const match = /^(.*?\/\/|\|\|)/.exec(urlFilter);
        const pattern = match ? urlFilter.slice(match[0].length) : urlFilter;
        if ( /[^\w.%*-]/.test(pattern) === false ) { continue; }
        const extra = clone(rule);
        extra.condition.urlFilter = `${urlFilter}|`;
        out.push(extra);
    }
    return out;
}

// https://github.com/uBlockOrigin/uBOL-home/issues/539
function patchForIssue539(ruleset) {
    for ( const rule of ruleset ) {
        const { condition } = rule;
        if ( Array.isArray(condition.requestDomains) === false ) { continue; }
        if ( Array.isArray(condition.initiatorDomains) ) { continue; }
        if ( Array.isArray(condition.excludedRequestDomains) ) {
            if ( Array.isArray(condition.excludedInitiatorDomains) ) { continue; }
        }
        if ( Array.isArray(condition.resourceTypes) === false ) { continue; }
        if ( condition.resourceTypes.length !== 1 ) { continue; }
        if ( condition.resourceTypes.includes('main_frame') === false ) { continue; }
        if ( condition.regexFilter === undefined ) { continue; }
        condition.initiatorDomains = condition.requestDomains;
        delete condition.requestDomains;
        if ( Array.isArray(condition.excludedRequestDomains) ) {
            condition.excludedInitiatorDomains = condition.excludedRequestDomains;
            delete condition.excludedRequestDomains;
        }
    }
    return ruleset;
}

// https://github.com/uBlockOrigin/uBOL-home/issues/476 / 608
// WebKit rejects removeParams on main_frame/image resource types; strip those,
// and drop the rule if nothing remains.
function patchRemoveParams(ruleset) {
    const isRemoveParamsRule = rule =>
        Array.isArray(rule.action.redirect?.transform?.queryTransform?.removeParams);
    const patchResourceTypes = rule => {
        const { resourceTypes } = rule.condition;
        if ( resourceTypes?.length ) {
            rule.condition.resourceTypes =
                resourceTypes.filter(a => a !== 'main_frame' && a !== 'image');
            return rule.condition.resourceTypes.length !== 0;
        }
        return true;
    };
    const out = [];
    for ( const rule of ruleset ) {
        if ( isRemoveParamsRule(rule) && patchResourceTypes(rule) !== true ) {
            continue;
        }
        out.push(rule);
    }
    return out;
}

// WebKit handles requestDomains poorly for simple anchored patterns; fold each
// domain into an explicit urlFilter instead.
function patchRequestDomains(ruleset) {
    const canMerge = rule => {
        const { condition } = rule;
        if ( Array.isArray(condition.requestDomains) === false ) { return false; }
        if ( condition.regexFilter ) { return false; }
        const { urlFilter } = condition;
        if ( urlFilter === undefined ) { return true; }
        if ( urlFilter.startsWith('^') ) { return true; }
        if ( urlFilter.startsWith('/') ) { return true; }
        if ( urlFilter.startsWith('?') ) { return true; }
        if ( urlFilter.startsWith('=') ) { return true; }
        return false;
    };
    const merge = (domain, urlFilter) => {
        if ( urlFilter === undefined ) { return `||${domain}/`; }
        if ( urlFilter.startsWith('^') ) { return `||${domain}/*${urlFilter}`; }
        if ( urlFilter.startsWith('/') ) { return `||${domain}*${urlFilter}`; }
        if ( urlFilter.startsWith('?') ) { return `||${domain}/*${urlFilter}`; }
        if ( urlFilter.startsWith('=') ) { return `||${domain}/*${urlFilter}`; }
        return urlFilter;
    };
    const out = [];
    for ( const rule of ruleset ) {
        if ( canMerge(rule) === false ) {
            out.push(rule);
            continue;
        }
        const { requestDomains, urlFilter } = rule.condition;
        delete rule.condition.requestDomains;
        for ( const domain of requestDomains ) {
            const copy = clone(rule);
            copy.condition.urlFilter = merge(domain, urlFilter);
            out.push(copy);
        }
    }
    return out;
}

// Safari/WebKit DNR uses the legacy `domains` / `excludedDomains` condition keys
// for the initiator (page) domain, NOT MV3's `initiatorDomains` /
// `excludedInitiatorDomains`. Dynamic rules are converted at runtime by the
// extension's prepareRuleForSafari shim, but static rulesets are loaded straight
// from JSON and never converted — so WebKit rejects every initiatorDomains rule
// and fails the whole content rule list. Bake the same conversion into the static
// rulesets so they actually compile and apply on Safari.
function convertDomainKeysForSafari(ruleset) {
    for ( const rule of ruleset ) {
        const condition = rule.condition;
        if ( condition === undefined ) { continue; }
        if ( Array.isArray(condition.initiatorDomains) ) {
            condition.domains = condition.initiatorDomains;
            delete condition.initiatorDomains;
        }
        if ( Array.isArray(condition.excludedInitiatorDomains) ) {
            condition.excludedDomains = condition.excludedInitiatorDomains;
            delete condition.excludedInitiatorDomains;
        }
    }
    return ruleset;
}

function patchRuleset(ruleset) {
    ruleset = discardUnsupportedRules(ruleset);
    ruleset = patchForIssue434(ruleset);
    ruleset = patchForIssue539(ruleset);
    ruleset = patchRemoveParams(ruleset);
    ruleset = patchRequestDomains(ruleset);
    ruleset = convertDomainKeysForSafari(ruleset);
    // WebKit/Chromium both require unique ids within a ruleset, and the patches
    // above clone rules (duplicating ids), so renumber sequentially.
    ruleset.forEach((rule, i) => { rule.id = i + 1; });
    return ruleset;
}

function serializeRuleset(ruleset) {
    return `[\n${ruleset.map(rule => JSON.stringify(rule)).join(',\n')}\n]\n`;
}

/******************************************************************************/

async function main() {
    const entries = (await fs.readdir(mainDir))
        .filter(name => name.endsWith('.json'))
        .sort();

    const newPlainCounts = new Map();

    for ( const name of entries ) {
        const id = name.slice(0, -'.json'.length);
        const filePath = path.join(mainDir, name);
        const before = JSON.parse(await fs.readFile(filePath, 'utf8'));
        const after = patchRuleset(before);
        await fs.writeFile(filePath, serializeRuleset(after));
        newPlainCounts.set(id, after.length);
        const delta = after.length - before.length;
        const sign = delta >= 0 ? '+' : '';
        console.log(`${id.padEnd(22)} ${String(before.length).padStart(7)} -> ${String(after.length).padStart(7)} (${sign}${delta})`);
    }

    // Update plain/total counts in ruleset-details.json
    const details = JSON.parse(await fs.readFile(detailsPath, 'utf8'));
    let updated = 0;
    for ( const entry of details ) {
        const plain = newPlainCounts.get(entry.id);
        if ( plain === undefined ) { continue; }
        if ( entry.rules === undefined ) { continue; }
        const regex = entry.rules.regex || 0;
        entry.rules.plain = plain;
        entry.rules.total = plain + regex;
        updated += 1;
    }
    await fs.writeFile(detailsPath, `${JSON.stringify(details, null, 2)}\n`);
    console.log(`\nUpdated ruleset-details.json for ${updated} rulesets.`);
}

main().catch(reason => {
    console.error(reason);
    process.exit(1);
});
