/*******************************************************************************

    AdBlock

    Registers runtime content scripts for cosmetic filtering and scriptlets.

*/

import * as hostnames from '../shared/utils.js';

import {
    browser,
    localKeys,
    localRemove,
    localWrite,
    sessionKeys,
    sessionRead,
    sessionRemove,
    sessionWrite,
    webextFlavor,
} from '../shared/ext.js';

import { adblockErr, adblockLog } from '../shared/logger.js';
import { fetchJSON } from '../shared/fetch.js';
import { getEnabledRulesetsDetails } from './ruleset-service.js';
import { getFilteringModeDetails } from './filtering-mode-service.js';
import { registerCustomFilters } from './filter-manager.js';
import { registerPreventPopup } from './prevent-popup.js';
import { registerToolbarIconToggler } from './action.js';

/******************************************************************************/

const detailCache = new Map();
const CONTENT_SCRIPT_REGISTRATION_VERSION = 29;
const CONTENT_SCRIPT_REGISTRATION_VERSION_KEY = 'scripting.manager.registration.version';
const CSS_CACHE_PREFIX = 'cache.css.';
const CSS_SPECIFIC_PREFIX = 'css.specific.';
const LEGACY_CSS_PROCEDURAL_PREFIX = 'css.procedural.';
const FACEBOOK_HOSTNAME = 'facebook.com';
const INSTAGRAM_HOSTNAME = 'instagram.com';
const YAHOO_HOSTNAME = 'yahoo.com';
const YOUTUBE_HOSTNAME = 'youtube.com';
const SKIP_SAFARI_BROAD_CONTENT_SCRIPTS = webextFlavor === 'safari';
const SAFARI_BROAD_CONTENT_SCRIPT_ALLOW_IDS = new Set([
    'css-generic-all',
    'early-ad-hiding',
]);
const SCRIPTLET_COMPATIBILITY_EXCLUDED_HOSTNAMES = [
    'facebook.com',
];
const SCRIPTLET_COMPATIBILITY_EXCLUDE_MATCHES = hostnames.matchesFromHostnames(
    SCRIPTLET_COMPATIBILITY_EXCLUDED_HOSTNAMES
);

/******************************************************************************/

async function getMetadata(name, path) {
    let promise = detailCache.get(name);
    if ( promise !== undefined ) { return promise; }

    promise = fetchJSON(path).then(entries => new Map(entries || []));
    detailCache.set(name, promise);
    return promise;
}

function getScriptletDetails() {
    return getMetadata('scriptlet', '/rulesets/scriptlet-details');
}

function getGenericDetails() {
    return getMetadata('generic', '/rulesets/generic-details');
}

function normalizeMatches(matches) {
    if ( matches.length <= 1 ) { return; }
    if (
        matches.includes('<all_urls>') === false &&
        matches.includes('*://*/*') === false
    ) {
        return;
    }
    matches.length = 0;
    matches.push('<all_urls>');
}

function hasBroadMatches(matches = []) {
    return matches.includes('<all_urls>') || matches.includes('*://*/*');
}

function isExplicitHostname(hostname) {
    return typeof hostname === 'string' &&
        hostname !== '' &&
        hostname !== '*' &&
        hostname !== 'all-urls' &&
        hostname.includes('*') === false;
}

function safariExplicitHostnames(hostnameIters) {
    const hostnameSet = new Set(
        Array.from(hostnameIters).filter(isExplicitHostname)
    );

    // Ancestor hostnames cover descendants in extension match patterns.
    return Array.from(hostnameSet).filter(hostname =>
        hostnames.isDescendantHostnameOfIter(hostname, hostnameSet) === false
    );
}

function safariExplicitMatches(hostnameIters) {
    return hostnames.matchesFromHostnames(safariExplicitHostnames(hostnameIters));
}

function addContentScript(context, directive) {
    if (
        SKIP_SAFARI_BROAD_CONTENT_SCRIPTS &&
        hasBroadMatches(directive.matches) &&
        SAFARI_BROAD_CONTENT_SCRIPT_ALLOW_IDS.has(directive.id) === false
    ) {
        return false;
    }

    context.toAdd.push(directive);
    return true;
}

async function resetCSSCache() {
    const keys = await sessionKeys() || [];
    return sessionRemove(keys.filter(key => key.startsWith(CSS_CACHE_PREFIX)));
}

/******************************************************************************/

function addGenericCosmeticScripts(context, genericDetails) {
    const { filteringModeDetails, rulesetsDetails, toAdd } = context;
    const excludedByFilter = [];
    const includedByFilter = [];
    const js = [
        '/js/content-scripts/css-api.js',
        '/js/content-scripts/isolated-api.js',
    ];

    for ( const details of rulesetsDetails ) {
        const generic = genericDetails.get(details.id);
        if ( generic?.unhide ) {
            excludedByFilter.push(...generic.unhide);
        }
        if ( generic?.hide ) {
            includedByFilter.push(...generic.hide);
        }
        if ( (details.css?.generic || 0) !== 0 ) {
            js.push(`/rulesets/scripting/generic/${details.id}.js`);
        }
    }

    if ( js.length === 2 ) { return; }
    js.push('/js/content-scripts/css-generic.js');

    const { none, basic, optimal, complete } = filteringModeDetails;
    const includedByMode = complete;
    const excludedByMode = [ ...none, ...basic, ...optimal ];

    if ( complete.has('all-urls') === false ) {
        const matches = [
            ...hostnames.matchesFromHostnames(
                hostnames.subtractHostnameIters(includedByMode, excludedByFilter)
            ),
            ...hostnames.matchesFromHostnames(
                hostnames.intersectHostnameIters(includedByMode, includedByFilter)
            ),
        ];
        if ( matches.length === 0 ) { return; }
        addContentScript(context, {
            id: 'css-generic-some',
            js,
            allFrames: true,
            matches,
            runAt: 'document_idle',
        });
        return;
    }

    const excludeMatches = [
        ...hostnames.matchesFromHostnames(excludedByMode),
        ...hostnames.matchesFromHostnames(excludedByFilter),
    ];
    const allDirective = {
        id: 'css-generic-all',
        js,
        allFrames: true,
        matches: [ '<all_urls>' ],
        runAt: 'document_idle',
    };
    if ( excludeMatches.length !== 0 ) {
        allDirective.excludeMatches = excludeMatches;
    }
    addContentScript(context, allDirective);

    const targetedMatches = [
        ...hostnames.matchesFromHostnames(
            hostnames.subtractHostnameIters(includedByFilter, excludedByMode)
        ),
    ];
    if ( targetedMatches.length === 0 ) { return; }
    const targetedDirective = {
        id: 'css-generic-some',
        js,
        allFrames: true,
        matches: targetedMatches,
        runAt: 'document_idle',
    };
    addContentScript(context, targetedDirective);
}

async function addSpecificCosmeticScripts(context) {
    const { filteringModeDetails, rulesetsDetails, toAdd } = context;
    const keys = await localKeys() || [];

    await Promise.all([
        localRemove(keys.filter(key => key.startsWith(CSS_SPECIFIC_PREFIX))),
        localRemove(keys.filter(key => key.startsWith(LEGACY_CSS_PROCEDURAL_PREFIX))),
    ]);

    const rulesetIds = rulesetsDetails
        .filter(details => (details.css?.specific ?? 0) !== 0)
        .map(details => details.id);

    if ( rulesetIds.length === 0 ) { return; }

    const { none, basic, optimal, complete } = filteringModeDetails;
    const matches = hostnames.matchesFromHostnames(
        [ ...optimal, ...complete ]
    );
    if ( matches.length === 0 ) { return; }

    const rulesetData = await Promise.all(rulesetIds.map(id =>
        fetchJSON(`/rulesets/scripting/specific/${id}`).then(async data => {
            await localWrite(`${CSS_SPECIFIC_PREFIX}${id}`, data);
            return data;
        })
    ));

    normalizeMatches(matches);
    if (
        SKIP_SAFARI_BROAD_CONTENT_SCRIPTS &&
        hasBroadMatches(matches)
    ) {
        matches.length = 0;
        matches.push(...safariExplicitMatches(rulesetData.flatMap(data =>
            Array.isArray(data?.hostnames) ? data.hostnames : []
        )));
    }
    if ( matches.length === 0 ) { return; }

    const js = [
        '/js/content-scripts/css-api.js',
        '/js/content-scripts/isolated-api.js',
        ...rulesetIds.map(id => `/rulesets/scripting/specific/${id}.js`),
    ];
    if ( webextFlavor === 'safari' ) {
        js.push('/js/content-scripts/css-procedural-api.js');
    }
    js.push('/js/content-scripts/css-specific.js');

    const excludeMatches = [];
    if ( none.has('all-urls') === false && basic.has('all-urls') === false ) {
        excludeMatches.push(
            ...hostnames.matchesFromHostnames(none),
            ...hostnames.matchesFromHostnames(basic)
        );
    }

    const directive = {
        id: 'css-specific',
        js,
        matches,
        allFrames: true,
        runAt: 'document_start',
    };
    if ( excludeMatches.length !== 0 ) {
        directive.excludeMatches = excludeMatches;
    }
    addContentScript(context, directive);
}

function addScriptletScripts(context, scriptletDetails) {
    const { filteringModeDetails, rulesetsDetails, toAdd } = context;
    const hasBroadPermission =
        filteringModeDetails.optimal.has('all-urls') ||
        filteringModeDetails.complete.has('all-urls');

    const excludedByMode = [
        ...hostnames.matchesFromHostnames(filteringModeDetails.none),
        ...hostnames.matchesFromHostnames(filteringModeDetails.basic),
    ];
    const explicitlyAllowed = [
        ...filteringModeDetails.optimal,
        ...filteringModeDetails.complete,
    ];

    for ( const { id: rulesetId } of rulesetsDetails ) {
        const worlds = scriptletDetails.get(rulesetId);
        if ( worlds === undefined ) { continue; }

        for ( const world of Object.keys(worlds) ) {
            const rulesetHostnames = worlds[world];
            let targetHostnames = [];
            const excludeMatches = [];

            if ( hasBroadPermission ) {
                targetHostnames = hostnames.subtractHostnameIters(
                    rulesetHostnames,
                    SCRIPTLET_COMPATIBILITY_EXCLUDED_HOSTNAMES
                );
                excludeMatches.push(
                    ...excludedByMode,
                    ...SCRIPTLET_COMPATIBILITY_EXCLUDE_MATCHES
                );
            } else if ( explicitlyAllowed.length !== 0 ) {
                targetHostnames = rulesetHostnames.includes('*')
                    ? explicitlyAllowed
                    : hostnames.intersectHostnameIters(
                        rulesetHostnames,
                        explicitlyAllowed
                    );
                targetHostnames = hostnames.subtractHostnameIters(
                    targetHostnames,
                    SCRIPTLET_COMPATIBILITY_EXCLUDED_HOSTNAMES
                );
            }

            if ( targetHostnames.length === 0 ) { continue; }
            targetHostnames = SKIP_SAFARI_BROAD_CONTENT_SCRIPTS
                ? safariExplicitHostnames(targetHostnames)
                : targetHostnames;
            if ( targetHostnames.length === 0 ) { continue; }

            const matches = [
                ...hostnames.matchesFromHostnames(targetHostnames),
            ];
            normalizeMatches(matches);

            const directive = {
                id: `${rulesetId}.${world.toLowerCase()}`,
                js: [
                    '/js/content-scripts/scriptlet-runtime.js',
                    `/rulesets/scripting/scriptlet/${world.toLowerCase()}/${rulesetId}.js`,
                ],
                matches,
                allFrames: true,
                matchOriginAsFallback: true,
                runAt: 'document_start',
                world,
            };
            if ( excludeMatches.length !== 0 ) {
                directive.excludeMatches = excludeMatches;
            }
            addContentScript(context, directive);
        }
    }
}

/******************************************************************************/

function yahooFilteringMatches(filteringModeDetails) {
    const activeModes = [
        ...filteringModeDetails.optimal,
        ...filteringModeDetails.complete,
    ];

    if (
        filteringModeDetails.optimal.has('all-urls') ||
        filteringModeDetails.complete.has('all-urls') ||
        activeModes.includes(YAHOO_HOSTNAME)
    ) {
        return [ hostnames.matchFromHostname(YAHOO_HOSTNAME) ];
    }

    return hostnames.matchesFromHostnames(
        activeModes.filter(hostname =>
            hostname === YAHOO_HOSTNAME ||
            hostname.endsWith(`.${YAHOO_HOSTNAME}`)
        )
    );
}

function addAdSlotCollapser(context) {
    const { filteringModeDetails, toAdd } = context;
    const matches = yahooFilteringMatches(filteringModeDetails);
    if ( matches.length === 0 ) { return; }

    const excludeMatches = hostnames.matchesFromHostnames([
        ...filteringModeDetails.none,
        ...filteringModeDetails.basic,
    ].filter(hostname =>
        hostname === 'all-urls' ||
        hostname === YAHOO_HOSTNAME ||
        hostname.endsWith(`.${YAHOO_HOSTNAME}`)
    ));

    const directive = {
        id: 'ad-slot-collapser',
        js: [
            '/js/content-scripts/ad-slot-collapser.js',
        ],
        matches,
        runAt: 'document_start',
    };
    if ( excludeMatches.length !== 0 ) {
        directive.excludeMatches = excludeMatches;
    }

    addContentScript(context, directive);
}

/******************************************************************************/

function facebookFilteringMatches(filteringModeDetails) {
    const activeModes = [
        ...filteringModeDetails.optimal,
        ...filteringModeDetails.complete,
    ];

    if (
        filteringModeDetails.optimal.has('all-urls') ||
        filteringModeDetails.complete.has('all-urls') ||
        activeModes.includes(FACEBOOK_HOSTNAME)
    ) {
        return [ hostnames.matchFromHostname(FACEBOOK_HOSTNAME) ];
    }

    return hostnames.matchesFromHostnames(
        activeModes.filter(hostname =>
            hostname === FACEBOOK_HOSTNAME ||
            hostname.endsWith(`.${FACEBOOK_HOSTNAME}`)
        )
    );
}

function addFacebookStoryMute(context) {
    const { filteringModeDetails } = context;
    const matches = facebookFilteringMatches(filteringModeDetails);
    if ( matches.length === 0 ) { return; }

    const excludeMatches = hostnames.matchesFromHostnames([
        ...filteringModeDetails.none,
        ...filteringModeDetails.basic,
    ].filter(hostname =>
        hostname === 'all-urls' ||
        hostname === FACEBOOK_HOSTNAME ||
        hostname.endsWith(`.${FACEBOOK_HOSTNAME}`)
    ));

    const directive = {
        id: 'facebook-story-mute',
        js: [
            '/js/content-scripts/facebook-story-mute.js',
        ],
        matches,
        runAt: 'document_start',
        world: 'MAIN',
    };
    if ( excludeMatches.length !== 0 ) {
        directive.excludeMatches = excludeMatches;
    }

    addContentScript(context, directive);
}

/******************************************************************************/

function addPageActivityBridge(context, id, matches, excludeMatches) {
    const directive = {
        id: `${id}-activity-bridge`,
        js: [
            '/js/content-scripts/page-activity-bridge.js',
        ],
        matches,
        runAt: 'document_start',
    };
    if ( excludeMatches.length !== 0 ) {
        directive.excludeMatches = excludeMatches;
    }

    addContentScript(context, directive);
}

/******************************************************************************/

function addFacebookAdPruner(context) {
    const { filteringModeDetails } = context;
    const matches = facebookFilteringMatches(filteringModeDetails);
    if ( matches.length === 0 ) { return; }

    const excludeMatches = hostnames.matchesFromHostnames([
        ...filteringModeDetails.none,
        ...filteringModeDetails.basic,
    ].filter(hostname =>
        hostname === 'all-urls' ||
        hostname === FACEBOOK_HOSTNAME ||
        hostname.endsWith(`.${FACEBOOK_HOSTNAME}`)
    ));

    const directive = {
        id: 'facebook-ad-prune',
        js: [
            '/js/content-scripts/facebook-ad-prune.js',
        ],
        matches,
        runAt: 'document_start',
        world: 'MAIN',
    };
    if ( excludeMatches.length !== 0 ) {
        directive.excludeMatches = excludeMatches;
    }

    addPageActivityBridge(context, directive.id, matches, excludeMatches);
    addContentScript(context, directive);
}

/******************************************************************************/

function youtubeFilteringMatches(filteringModeDetails) {
    const activeModes = [
        ...filteringModeDetails.optimal,
        ...filteringModeDetails.complete,
    ];

    if (
        filteringModeDetails.optimal.has('all-urls') ||
        filteringModeDetails.complete.has('all-urls') ||
        activeModes.includes(YOUTUBE_HOSTNAME)
    ) {
        return [ hostnames.matchFromHostname(YOUTUBE_HOSTNAME) ];
    }

    return hostnames.matchesFromHostnames(
        activeModes.filter(hostname =>
            hostname === YOUTUBE_HOSTNAME ||
            hostname.endsWith(`.${YOUTUBE_HOSTNAME}`)
        )
    );
}

function addYouTubeAdPruner(context) {
    // youtube-ad-prune proxies fetch / XMLHttpRequest / JSON.parse in the MAIN
    // world to strip ads out of YouTube's network responses. On Safari/WebKit
    // these core-API proxies break YouTube's data loading (feed/lazy-loaded
    // thumbnails stop appearing, navigation stalls). Skip on Safari — YouTube
    // works normally, at the cost of not pruning YouTube's own ads there.
    if ( webextFlavor === 'safari' ) { return; }

    const { filteringModeDetails } = context;
    const matches = youtubeFilteringMatches(filteringModeDetails);
    if ( matches.length === 0 ) { return; }

    const excludeMatches = hostnames.matchesFromHostnames([
        ...filteringModeDetails.none,
        ...filteringModeDetails.basic,
    ].filter(hostname =>
        hostname === 'all-urls' ||
        hostname === YOUTUBE_HOSTNAME ||
        hostname.endsWith(`.${YOUTUBE_HOSTNAME}`)
    ));

    const directive = {
        id: 'youtube-ad-prune',
        js: [
            '/js/content-scripts/youtube-ad-prune.js',
        ],
        matches,
        runAt: 'document_start',
        world: 'MAIN',
    };
    if ( excludeMatches.length !== 0 ) {
        directive.excludeMatches = excludeMatches;
    }

    addPageActivityBridge(context, directive.id, matches, excludeMatches);
    addContentScript(context, directive);
}

/******************************************************************************/

function addYouTubeExperimentalScriptlets(context) {
    // uBO's experimental YouTube anti-adblock scriptlet rewrites core page APIs
    // (fetch/XHR/JSON) in the MAIN world at document_start. On Safari/WebKit this
    // is incompatible and hangs YouTube's bootstrap — the page never finishes
    // loading. Skip it on Safari: YouTube loads normally, at the cost of not
    // bypassing YouTube's own anti-adblock there.
    if ( webextFlavor === 'safari' ) { return; }

    const { filteringModeDetails } = context;
    const matches = youtubeFilteringMatches(filteringModeDetails);
    if ( matches.length === 0 ) { return; }

    const excludeMatches = hostnames.matchesFromHostnames([
        ...filteringModeDetails.none,
        ...filteringModeDetails.basic,
    ].filter(hostname =>
        hostname === 'all-urls' ||
        hostname === YOUTUBE_HOSTNAME ||
        hostname.endsWith(`.${YOUTUBE_HOSTNAME}`)
    ));

    for ( const world of [ 'MAIN', 'ISOLATED' ] ) {
        const lowerWorld = world.toLowerCase();
        const directive = {
            id: `youtube-ublock-experimental.${lowerWorld}`,
            js: [
                '/js/content-scripts/scriptlet-runtime.js',
                `/rulesets/scripting/scriptlet/${lowerWorld}/ublock-experimental.js`,
            ],
            matches,
            allFrames: true,
            matchOriginAsFallback: true,
            runAt: 'document_start',
            world,
        };
        if ( excludeMatches.length !== 0 ) {
            directive.excludeMatches = excludeMatches;
        }
        addContentScript(context, directive);
    }
}

/******************************************************************************/

function instagramFilteringMatches(filteringModeDetails) {
    const activeModes = [
        ...filteringModeDetails.optimal,
        ...filteringModeDetails.complete,
    ];

    if (
        filteringModeDetails.optimal.has('all-urls') ||
        filteringModeDetails.complete.has('all-urls') ||
        activeModes.includes(INSTAGRAM_HOSTNAME)
    ) {
        return [ hostnames.matchFromHostname(INSTAGRAM_HOSTNAME) ];
    }

    return hostnames.matchesFromHostnames(
        activeModes.filter(hostname =>
            hostname === INSTAGRAM_HOSTNAME ||
            hostname.endsWith(`.${INSTAGRAM_HOSTNAME}`)
        )
    );
}

function addInstagramAdPruner(context) {
    const { filteringModeDetails } = context;
    const matches = instagramFilteringMatches(filteringModeDetails);
    if ( matches.length === 0 ) { return; }

    const excludeMatches = hostnames.matchesFromHostnames([
        ...filteringModeDetails.none,
        ...filteringModeDetails.basic,
    ].filter(hostname =>
        hostname === 'all-urls' ||
        hostname === INSTAGRAM_HOSTNAME ||
        hostname.endsWith(`.${INSTAGRAM_HOSTNAME}`)
    ));

    const directive = {
        id: 'instagram-ad-prune',
        js: [
            '/js/content-scripts/instagram-ad-prune.js',
        ],
        matches,
        runAt: 'document_start',
        world: 'MAIN',
    };
    if ( excludeMatches.length !== 0 ) {
        directive.excludeMatches = excludeMatches;
    }

    addPageActivityBridge(context, directive.id, matches, excludeMatches);
    addContentScript(context, directive);
}

/******************************************************************************/

function addEarlyAdHiding(context) {
    const { filteringModeDetails } = context;
    const { none, basic, optimal, complete } = filteringModeDetails;
    let matches = [];
    let excludeMatches = [];

    if ( complete.has('all-urls') || optimal.has('all-urls') ) {
        matches = [ '<all_urls>' ];
        excludeMatches = [
            ...hostnames.matchesFromHostnames(none),
            ...hostnames.matchesFromHostnames(basic),
        ];
    } else {
        matches = [
            ...hostnames.matchesFromHostnames(complete),
            ...hostnames.matchesFromHostnames(optimal),
        ];
    }
    if ( matches.length === 0 ) { return; }

    const directive = {
        id: 'early-ad-hiding',
        css: [
            '/styles/early-ad-hiding.css',
        ],
        js: [
            '/js/content-scripts/early-ad-cleanup.js',
        ],
        matches,
        allFrames: true,
        matchOriginAsFallback: true,
        runAt: 'document_start',
    };
    if ( excludeMatches.length !== 0 ) {
        directive.excludeMatches = excludeMatches;
    }

    addContentScript(context, directive);
}

/******************************************************************************/

export async function registerContentScripts() {
    if ( browser.scripting === undefined ) { return false; }

    registerContentScripts.pendingOp = registerContentScripts.pendingOp.then(
        registerContentScriptsNow,
        registerContentScriptsNow
    );
    return registerContentScripts.pendingOp;
}
registerContentScripts.pendingOp = Promise.resolve();

async function registerContentScriptsNow() {
    const [
        filteringModeDetails,
        rulesetsDetails,
        scriptletDetails,
        genericDetails,
    ] = await Promise.all([
        getFilteringModeDetails(),
        getEnabledRulesetsDetails(),
        getScriptletDetails(),
        getGenericDetails(),
    ]);

    const context = {
        filteringModeDetails,
        rulesetsDetails,
        toAdd: [],
    };

    await Promise.all([
        addSpecificCosmeticScripts(context),
        registerCustomFilters(context),
        registerPreventPopup(context),
        registerToolbarIconToggler(context),
    ]);
    addEarlyAdHiding(context);
    addFacebookAdPruner(context);
    addFacebookStoryMute(context);
    addInstagramAdPruner(context);
    addYouTubeAdPruner(context);
    addYouTubeExperimentalScriptlets(context);
    addAdSlotCollapser(context);
    addGenericCosmeticScripts(context, genericDetails);
    addScriptletScripts(context, scriptletDetails);

    adblockLog('Unregistered all content scripts');
    try {
        await browser.scripting.unregisterContentScripts();
    } catch(reason) {
        adblockErr(`unregisterContentScripts/${reason}`);
    }

    if ( context.toAdd.length !== 0 ) {
        adblockLog(`Registered ${context.toAdd.map(script => script.id)} content scripts`);
        try {
            await browser.scripting.registerContentScripts(context.toAdd);
        } catch(reason) {
            adblockErr(`registerContentScripts/${reason}`);
        }
    }

    await resetCSSCache();
    await sessionWrite(CONTENT_SCRIPT_REGISTRATION_VERSION_KEY, CONTENT_SCRIPT_REGISTRATION_VERSION);
    return true;
}

export async function getRegisteredContentScripts() {
    const scripts = await browser.scripting.getRegisteredContentScripts();
    return scripts.map(script => script.id);
}

export async function needsContentScriptRegistration() {
    if ( browser.scripting === undefined ) { return false; }

    const [
        scripts,
        version,
    ] = await Promise.all([
        getRegisteredContentScripts(),
        sessionRead(CONTENT_SCRIPT_REGISTRATION_VERSION_KEY),
    ]);

    return scripts.length === 0 || version !== CONTENT_SCRIPT_REGISTRATION_VERSION;
}

export async function onWakeupRun() {
    const cleanupTime = await sessionRead('scripting.manager.cleanup.time') || 0;
    const now = Date.now();
    if ( now - cleanupTime < 15 * 60 * 1000 ) { return; }

    const maxEntries = 256;
    const keys = await sessionKeys() || [];
    const cacheKeys = keys.filter(key => key.startsWith(CSS_CACHE_PREFIX));
    if ( cacheKeys.length < maxEntries + Math.max(Math.round(maxEntries / 8), 8) ) {
        return;
    }

    const entries = await Promise.all(cacheKeys.map(async key => ({
        key,
        ...(await sessionRead(key) || {}),
    })));
    entries.sort((a, b) => (b.t || 0) - (a.t || 0));
    await sessionRemove(entries.slice(maxEntries).map(entry => entry.key));
    await sessionWrite('scripting.manager.cleanup.time', now);
}
