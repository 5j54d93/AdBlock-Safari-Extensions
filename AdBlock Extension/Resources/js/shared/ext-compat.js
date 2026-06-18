/*******************************************************************************

    AdBlock

    Safari WebExtension compatibility helpers.

*/

import { deepEquals } from './utils.js';

/******************************************************************************/

export const webext = globalThis.browser ?? globalThis.chrome;

const nativeDNR = webext.declarativeNetRequest;
const NORMAL_REALM = 0b01;
const PRIVATE_REALM = 0b10;
const ALL_REALMS = NORMAL_REALM | PRIVATE_REALM;
const SAFARI_REALM_STORAGE_KEY = 'safari.seenRealms';

let seenRealms = 0b00;

const seenRealmsReady = webext.storage.session.get(SAFARI_REALM_STORAGE_KEY)
    .then(values => {
        seenRealms = values?.[SAFARI_REALM_STORAGE_KEY] ?? 0b00;
    })
    .catch(() => {
    });

/******************************************************************************/

async function refreshEnabledRulesetsForRealm(windowId) {
    await seenRealmsReady;

    if ( seenRealms === ALL_REALMS ) { return; }
    if ( windowId === webext.windows.WINDOW_ID_NONE ) { return; }

    const details = await webext.windows.get(windowId, {
        windowTypes: [ 'normal' ],
    });
    if ( typeof details?.incognito !== 'boolean' ) { return; }

    const realm = details.incognito ? PRIVATE_REALM : NORMAL_REALM;
    if ( (seenRealms & realm) !== 0 ) { return; }

    seenRealms |= realm;
    await webext.storage.session.set({ [SAFARI_REALM_STORAGE_KEY]: seenRealms });

    const enabledRulesetIds = await nativeDNR.getEnabledRulesets();
    if ( enabledRulesetIds.length === 0 ) { return; }

    await nativeDNR.updateEnabledRulesets({
        disableRulesetIds: enabledRulesetIds.slice(),
        enableRulesetIds: enabledRulesetIds.slice(),
    });
}

webext.windows.onFocusChanged.addListener(refreshEnabledRulesetsForRealm);

/******************************************************************************/

function callbackRules(method, ruleIds) {
    return new Promise(resolve => {
        nativeDNR[method](rules => {
            const normalizedRules = Array.isArray(rules)
                ? normalizeDNRRules(rules, ruleIds)
                : [];
            resolve(normalizedRules);
        });
    });
}

function isSupportedRule(rule) {
    if ( rule.action.responseHeaders ) { return false; }
    if ( rule.action.requestHeaders ) { return false; }

    const { condition } = rule;
    if ( condition.tabIds !== undefined ) { return false; }

    if ( removeUnsupportedResourceType(condition, 'resourceTypes') === false ) {
        return false;
    }
    removeUnsupportedResourceType(condition, 'excludedResourceTypes');

    return true;
}

function removeUnsupportedResourceType(condition, property) {
    const values = condition[property];
    if ( Array.isArray(values) === false ) { return true; }

    const index = values.indexOf('object');
    if ( index === -1 ) { return true; }

    if ( property === 'resourceTypes' && values.length === 1 ) {
        return false;
    }

    values.splice(index, 1);
    if ( values.length === 0 ) {
        delete condition[property];
    }
    return true;
}

function prepareRuleForSafari(rule) {
    const { condition } = rule;

    if ( rule.action?.redirect?.regexSubstitution && condition?.requestDomains ) {
        condition.domains = condition.requestDomains;
        delete condition.requestDomains;
        return;
    }

    if ( condition?.initiatorDomains ) {
        condition.domains = condition.initiatorDomains;
        delete condition.initiatorDomains;
    }

    if ( condition?.excludedInitiatorDomains ) {
        condition.excludedDomains = condition.excludedInitiatorDomains;
        delete condition.excludedInitiatorDomains;
    }
}

function prepareRuleUpdate(options = {}) {
    const addRules = options.addRules?.filter(isSupportedRule);
    const removeRuleIds = options.removeRuleIds;

    if ( Boolean(addRules?.length || removeRuleIds?.length) === false ) {
        return;
    }

    addRules?.forEach(prepareRuleForSafari);

    const prepared = {};
    if ( addRules?.length ) { prepared.addRules = addRules; }
    if ( removeRuleIds?.length ) { prepared.removeRuleIds = removeRuleIds; }
    return prepared;
}

export function normalizeDNRRules(rules, ruleIds) {
    if ( Array.isArray(rules) === false ) { return rules; }

    const wantedRuleIds = Array.isArray(ruleIds)
        ? new Set(ruleIds)
        : undefined;
    const selectedRules = wantedRuleIds === undefined
        ? rules
        : rules.filter(rule => wantedRuleIds.has(rule.id));

    for ( const rule of selectedRules ) {
        const { condition } = rule;
        if ( Array.isArray(condition.domains) ) {
            condition.initiatorDomains = condition.domains;
            delete condition.domains;
        }
        if ( Array.isArray(condition.excludedDomains) ) {
            condition.excludedInitiatorDomains = condition.excludedDomains;
            delete condition.excludedDomains;
        }
    }

    return selectedRules;
}

/******************************************************************************/

export const dnr = {
    DYNAMIC_RULESET_ID: '_dynamic',
    MAX_NUMBER_OF_ENABLED_STATIC_RULESETS: nativeDNR.MAX_NUMBER_OF_ENABLED_STATIC_RULESETS,
    MAX_NUMBER_OF_REGEX_RULES: nativeDNR.MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES,

    async getAvailableStaticRuleCount() {
        return 150000;
    },

    getDynamicRules({ ruleIds } = {}) {
        return callbackRules('getDynamicRules', ruleIds);
    },

    getEnabledRulesets(...args) {
        return nativeDNR.getEnabledRulesets(...args);
    },

    getSessionRules({ ruleIds } = {}) {
        return callbackRules('getSessionRules', ruleIds);
    },

    isRegexSupported(...args) {
        return nativeDNR.isRegexSupported(...args);
    },

    async updateDynamicRules(options) {
        const prepared = prepareRuleUpdate(options);
        if ( prepared === undefined ) { return; }
        return nativeDNR.updateDynamicRules(prepared);
    },

    async updateEnabledRulesets(...args) {
        await nativeDNR.updateEnabledRulesets(...args);
        seenRealms = 0b00;
        await webext.storage.session.remove(SAFARI_REALM_STORAGE_KEY);
    },

    async updateSessionRules(options) {
        const prepared = prepareRuleUpdate(options);
        if ( prepared === undefined ) { return; }
        return nativeDNR.updateSessionRules(prepared);
    },

    async setAllowAllRules(id, allowed, notAllowed, reverse, priority) {
        const ruleIds = [ id, id + 1 ];
        const existingRules = await this.getDynamicRules({ ruleIds });
        const addRules = [];

        if ( reverse || allowed.length !== 0 || notAllowed.length !== 0 ) {
            const rule = {
                id,
                action: { type: 'allow' },
                condition: { urlFilter: '*' },
                priority,
            };

            if ( allowed.length !== 0 ) {
                rule.condition.initiatorDomains = allowed;
            } else if ( notAllowed.length !== 0 ) {
                rule.condition.excludedInitiatorDomains = notAllowed;
            }

            addRules.push(rule);

            const frameRule = {
                id: id + 1,
                action: { type: 'allowAllRequests' },
                condition: {
                    resourceTypes: [ 'main_frame', 'sub_frame' ],
                    urlFilter: '*',
                },
                priority,
            };

            if ( allowed.length !== 0 ) {
                frameRule.condition.initiatorDomains = allowed;
            } else if ( notAllowed.length !== 0 ) {
                frameRule.condition.excludedInitiatorDomains = notAllowed;
            }

            addRules.push(frameRule);
        }

        if ( deepEquals(addRules, existingRules) ) { return false; }

        return this.updateDynamicRules({
            addRules,
            removeRuleIds: ruleIds,
        }).then(() =>
            true
        ).catch(async () => {
            const fallbackRules = addRules.filter(rule => rule.id === id);
            const fallbackExisting = existingRules.filter(rule => rule.id === id);
            if ( deepEquals(fallbackRules, fallbackExisting) ) { return false; }
            return this.updateDynamicRules({
                addRules: fallbackRules,
                removeRuleIds: ruleIds,
            }).then(() =>
                true
            ).catch(() =>
                false
            );
        });
    },

    setExtensionActionOptions(...args) {
        return nativeDNR.setExtensionActionOptions(...args);
    },
};
