/*******************************************************************************

    AdBlock

    Storage, injection, and registration for user-created site filters.

*/

import {
    browser,
    localKeys,
    localRead,
    localRemove,
    localWrite,
    runtime,
    supportsUserScripts,
    webextFlavor,
} from '../shared/ext.js';

import {
    intersectHostnameIters,
    matchesFromHostnames,
    subtractHostnameIters,
    withoutGoogleSearchHostnames,
} from '../shared/utils.js';

import {
    adblockErr,
    adblockLog,
} from '../shared/logger.js';

import { getFilteringModeDetails } from './filtering-mode-service.js';

/******************************************************************************/

const SITE_KEY_PREFIX = 'site.';
const USER_SCRIPT_ISOLATED_ID = 'user.isolated';
const USER_SCRIPT_MAIN_ID = 'user.main';
const GOOGLE_SEARCH_GUARD = '/js/content-scripts/google-search-guard.js';
const GOOGLE_SEARCH_EXCLUDE_MATCHES = [
    '*://google.com/*',
    '*://www.google.com/*',
    '*://*.google.com/*',
    '*://google.com.tw/*',
    '*://www.google.com.tw/*',
    '*://*.google.com.tw/*',
];
const SKIP_SAFARI_BROAD_CONTENT_SCRIPTS = webextFlavor === 'safari';

const isProceduralSelector = selector => selector.startsWith('{');
const isScriptletSelector = selector => selector.startsWith('+js');
const isPlainCSSSelector = selector =>
    isProceduralSelector(selector) === false &&
    isScriptletSelector(selector) === false;

let storageQueue = Promise.resolve();

/******************************************************************************/

function hasBroadMatches(matches = []) {
    return matches.includes('<all_urls>') || matches.includes('*://*/*');
}

function shouldSkipBroadContentScript(directive) {
    if (
        SKIP_SAFARI_BROAD_CONTENT_SCRIPTS === false ||
        hasBroadMatches(directive.matches) === false
    ) {
        return false;
    }

    return true;
}

/******************************************************************************/

function siteKeyFromHostname(hostname) {
    return `${SITE_KEY_PREFIX}${hostname}`;
}

function hostnameFromSiteKey(key) {
    return key.slice(SITE_KEY_PREFIX.length);
}

function uniqueStrings(values) {
    if ( Array.isArray(values) === false ) { return []; }

    const out = [];
    const seen = new Set();
    for ( const value of values ) {
        if ( typeof value !== 'string' || value === '' ) { continue; }
        if ( seen.has(value) ) { continue; }
        seen.add(value);
        out.push(value);
    }
    return out;
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolve_, reject_) => {
        resolve = resolve_;
        reject = reject_;
    });
    return { promise, resolve, reject };
}

function queueStorageOperation(operation) {
    const next = storageQueue.then(operation, operation);
    storageQueue = next.catch(( ) => {});
    return next;
}

function hostnameLineage(hostname) {
    const out = [];
    let current = typeof hostname === 'string' ? hostname : '';
    while ( current !== '' ) {
        out.push(current);
        const dot = current.indexOf('.');
        if ( dot === -1 ) { break; }
        current = current.slice(dot + 1);
    }
    return out;
}

async function storageKeys() {
    return queueStorageOperation(( ) => localKeys());
}

async function readStorage(key) {
    return queueStorageOperation(( ) => localRead(key));
}

async function writeStorage(key, value) {
    return queueStorageOperation(( ) => localWrite(key, value));
}

async function removeStorage(key) {
    return queueStorageOperation(( ) => localRemove(key));
}

async function readSelectorsForKey(key) {
    return uniqueStrings(await readStorage(key));
}

async function customFilterKeys() {
    const keys = await storageKeys() || [];
    return keys
        .filter(key => key.startsWith(SITE_KEY_PREFIX))
        .sort();
}

/******************************************************************************/

export async function customFiltersFromHostname(hostname) {
    const selectors = [];
    for ( const current of hostnameLineage(hostname) ) {
        selectors.push(...await readSelectorsForKey(siteKeyFromHostname(current)));
    }
    return Array.from(new Set(selectors)).sort();
}

async function getAllCustomFilters() {
    const keys = await customFilterKeys();
    const entries = [];
    for ( const key of keys ) {
        const selectors = await readSelectorsForKey(key);
        entries.push([ hostnameFromSiteKey(key), selectors ]);
    }
    return entries;
}

export async function injectCustomFilters(tabId, frameId, hostname) {
    const selectors = await customFiltersFromHostname(hostname);
    if ( selectors.length === 0 ) { return; }

    const plainSelectors = selectors.filter(isPlainCSSSelector);
    const proceduralSelectors = selectors.filter(isProceduralSelector);
    const injections = [];

    if ( plainSelectors.length !== 0 ) {
        injections.push(
            browser.scripting.insertCSS({
                css: `${plainSelectors.join(',\n')}{display:none!important;}`,
                origin: 'USER',
                target: { tabId, frameIds: [ frameId ] },
            }).catch(reason => {
                adblockErr(`injectCustomFilters/insertCSS/${reason}`);
            })
        );
    }

    if ( proceduralSelectors.length !== 0 ) {
        injections.push(
            browser.scripting.executeScript({
                files: [
                    GOOGLE_SEARCH_GUARD,
                    '/js/content-scripts/css-api.js',
                    '/js/content-scripts/css-procedural-api.js',
                ],
                target: { tabId, frameIds: [ frameId ] },
                injectImmediately: true,
            }).catch(reason => {
                adblockErr(`injectCustomFilters/executeScript/${reason}`);
            })
        );
    }

    await Promise.all(injections);
    return { plainSelectors, proceduralSelectors };
}

/******************************************************************************/

function getHostnamesEligibleForCustomCSS(customFilters, filteringModeDetails) {
    const { none } = filteringModeDetails;
    let hostnames = Array.from(customFilters.keys());
    let excludeHostnames = [];

    if ( none.has('all-urls') ) {
        const { basic, optimal, complete } = filteringModeDetails;
        hostnames = intersectHostnameIters(hostnames, [
            ...basic,
            ...optimal,
            ...complete,
        ]);
    } else if ( none.size !== 0 ) {
        hostnames = Array.from(subtractHostnameIters(hostnames, none));
        excludeHostnames = Array.from(none);
    }

    hostnames = withoutGoogleSearchHostnames(
        hostnames.filter(hostname =>
            customFilters.get(hostname)
                .some(selector =>
                    isPlainCSSSelector(selector) ||
                    isProceduralSelector(selector)
                )
        )
    );

    return { hostnames, excludeHostnames };
}

export async function registerCustomFilters(context) {
    const customFilters = new Map(await getAllCustomFilters());
    if ( customFilters.size === 0 ) { return; }

    const {
        hostnames,
        excludeHostnames,
    } = getHostnamesEligibleForCustomCSS(
        customFilters,
        context.filteringModeDetails
    );

    if ( hostnames.length === 0 ) { return; }

    const directive = {
        id: 'css-user',
        js: [
            GOOGLE_SEARCH_GUARD,
            '/js/content-scripts/css-user.js',
        ],
        matches: matchesFromHostnames(hostnames),
        allFrames: true,
        matchOriginAsFallback: true,
        runAt: 'document_start',
    };

    if ( excludeHostnames.length !== 0 ) {
        directive.excludeMatches = matchesFromHostnames(excludeHostnames);
    }
    directive.excludeMatches = Array.from(new Set([
        ...GOOGLE_SEARCH_EXCLUDE_MATCHES,
        ...(directive.excludeMatches || []),
    ]));

    if ( shouldSkipBroadContentScript(directive) ) { return; }
    context.toAdd.push(directive);
}

/******************************************************************************/

export async function replaceAllCustomFilters(entries) {
    const keys = await customFilterKeys();
    await Promise.all(keys.map(key => removeStorage(key)));

    const writes = [];
    for ( const entry of entries ) {
        if ( entry instanceof Object === false ) { continue; }
        const { hostname } = entry;
        if ( typeof hostname !== 'string' || hostname === '' ) { continue; }

        const selectors = uniqueStrings(entry.selectors).sort();
        if ( selectors.length === 0 ) { continue; }

        writes.push(writeStorage(siteKeyFromHostname(hostname), selectors));
    }

    await Promise.all(writes);
    return true;
}

/******************************************************************************/

export async function registerCustomFilterScripts() {
    if ( supportsUserScripts !== true ) { return false; }

    registerCustomFilterScripts.pendingOp =
        registerCustomFilterScripts.pendingOp.then(
            registerUserScriptFilters,
            registerUserScriptFilters
        );

    return registerCustomFilterScripts.pendingOp;
}
registerCustomFilterScripts.pendingOp = Promise.resolve();

async function registerUserScriptFilters() {
    const compiled = await compileUserScriptFilters();
    const toAdd = (await directivesFromCompiledScriptlets(compiled)).filter(Boolean);

    await unregisterCurrentUserScripts();

    if ( toAdd.length === 0 ) { return false; }

    await browser.userScripts.register(toAdd);
    adblockLog(`Registered userscript ${toAdd.map(script => script.id)}`);
    return true;
}

async function compileUserScriptFilters() {
    const lines = [];

    for ( const [ hostname, selectors ] of await getAllCustomFilters() ) {
        for ( const selector of selectors ) {
            if ( isScriptletSelector(selector) === false ) { continue; }
            lines.push(`${hostname}##${selector}`);
        }
    }

    const text = lines.join('\n').trim();
    if ( text === '' ) { return {}; }

    return await compileRawFiltersWithOffscreenDocument(text) || {};
}

async function userScriptMatches() {
    const filteringModeDetails = await getFilteringModeDetails();
    const { none, basic, optimal, complete } = filteringModeDetails;
    const activeHostnames = [ ...basic, ...optimal, ...complete ];
    const hostnames = none.has('all-urls') ? activeHostnames : [];
    const excludedHostnames = none.has('all-urls') === false ? [ ...none ] : [];

    const matches = hostnames.length !== 0
        ? matchesFromHostnames(hostnames)
        : [ '<all_urls>' ];
    const excludeMatches = excludedHostnames.length !== 0
        ? matchesFromHostnames(excludedHostnames)
        : [];

    return {
        matches,
        excludeMatches: Array.from(new Set([
            ...GOOGLE_SEARCH_EXCLUDE_MATCHES,
            ...excludeMatches,
        ])),
    };
}

function userScriptDirective(id, world, sourceBlocks) {
    return userScriptMatches().then(({ matches, excludeMatches }) => {
        const directive = {
            id,
            world,
            allFrames: true,
            js: [ { code: sourceBlocks.join('\n\n') } ],
            runAt: 'document_start',
            matches: matches.slice(),
        };

        if ( excludeMatches.length !== 0 ) {
            directive.excludeMatches = excludeMatches.slice();
        }

        if ( shouldSkipBroadContentScript(directive) ) {
            return;
        }

        return directive;
    });
}

async function directivesFromCompiledScriptlets(compiled) {
    const directives = [];

    if ( compiled.ISOLATED?.length ) {
        directives.push(await userScriptDirective(
            USER_SCRIPT_ISOLATED_ID,
            'USER_SCRIPT',
            compiled.ISOLATED
        ));
    }

    if ( compiled.MAIN?.length ) {
        directives.push(await userScriptDirective(
            USER_SCRIPT_MAIN_ID,
            'MAIN',
            compiled.MAIN
        ));
    }

    return directives;
}

async function unregisterCurrentUserScripts() {
    const existing = await browser.userScripts.getScripts();
    if ( existing.length === 0 ) { return; }

    await browser.userScripts.unregister();
    adblockLog(`Unregistered userscript ${existing.map(script => script.id)}`);
}

async function compileRawFiltersWithOffscreenDocument(text) {
    if ( browser.offscreen === undefined ) { return {}; }

    const compiled = deferred();
    const timeout = deferred();
    const timeoutId = self.setTimeout(( ) => timeout.resolve(), 2000);

    const handler = (request, sender, callback) => {
        if ( request instanceof Object === false ) { return; }

        switch ( request.what ) {
        case 'getRawFilters':
            callback(text);
            break;
        case 'compiledRawFilters':
            compiled.resolve(request);
            break;
        default:
            break;
        }
    };

    let documentCreated = false;
    runtime.onMessage.addListener(handler);

    try {
        await browser.offscreen.createDocument({
            url: '/js/compiler/compile-filters.html',
            reasons: [ 'WORKERS' ],
            justification: 'Compile custom filters from the extension service worker',
        });
        documentCreated = true;
        return await Promise.race([ compiled.promise, timeout.promise ]);
    } catch(reason) {
        adblockErr(`compileRawFilters/createOffscreen/${reason}`);
        return {};
    } finally {
        self.clearTimeout(timeoutId);
        runtime.onMessage.removeListener(handler);
        if ( documentCreated ) {
            await browser.offscreen.closeDocument().catch(reason => {
                adblockErr(`compileRawFilters/closeOffscreen/${reason}`);
            });
        }
    }
}
