/*******************************************************************************

    AdBlock

    Background service worker for ruleset, settings, and message routing.

*/

import * as scrmgr from './scripting-manager.js';

import {
    MODE_NONE,
    MODE_BASIC,
    MODE_COMPLETE,
    MODE_OPTIMAL,
    getDefaultFilteringMode,
    getFilteringMode,
    getFilteringModeDetails,
    setDefaultFilteringMode,
    setFilteringModeDetails,
    syncWithBrowserPermissions,
} from './filtering-mode-service.js';

import {
    injectCustomFilters,
    registerCustomFilterScripts,
    replaceAllCustomFilters,
} from './filter-manager.js';

import {
    broadcastMessage,
    hostnameFromMatch,
} from '../shared/utils.js';

import {
    browser,
    localRead, localRemove, localWrite,
    runtime,
    sessionAccessLevel,
    sessionKeys,
    sessionRead,
    sessionWrite,
    supportsUserScripts,
    webextFlavor,
} from '../shared/ext.js';

import {
    loadRuntimeSettings,
    runtimeState,
    runtimeSettings,
    saveRuntimeSettings,
} from '../shared/settings-store.js';

import {
    enableRulesets,
    needsDynamicRulesUpdate,
    patchDefaultRulesets,
    updateDynamicRules,
    updateSessionRules,
} from './ruleset-service.js';

import {
    adblockErr,
    adblockLog,
} from '../shared/logger.js';

import {
    hasBroadHostPermissions,
} from '../shared/ext-utils.js';

import { dnr } from '../shared/ext-compat.js';
import { setPopupBlockMode } from './prevent-popup.js';
import { toggleToolbarIcon } from './action.js';

/******************************************************************************/

const canShowBlockedCount = typeof dnr.setExtensionActionOptions === 'function';
const { registerContentScripts } = scrmgr;
const MAC_APP_SETTINGS_ALARM = 'sync-mac-app-settings';
const MAC_APP_NATIVE_HOSTS = [
    'com.Ricky.AdBlock',
    'com.Ricky.AdBlock.Extension',
];

/******************************************************************************/

async function disableToolbarBadgeCount() {
    const changed = runtimeSettings.showBlockedCount !== false;
    runtimeSettings.showBlockedCount = false;

    if ( canShowBlockedCount ) {
        try {
            await dnr.setExtensionActionOptions({
                displayActionCountAsBadgeText: false,
            });
        } catch(reason) {
            adblockErr(`disableToolbarBadgeCount/${reason}`);
        }
    }

    const action = browser.action || browser.browserAction;
    if ( typeof action?.setBadgeText === 'function' ) {
        try {
            await action.setBadgeText({ text: '' });
        } catch {
        }
    }

    return changed;
}

/******************************************************************************/

function getCurrentVersion() {
    return runtime.getManifest().version;
}

function uniqueStringArray(value) {
    if ( Array.isArray(value) === false ) { return; }
    const out = [];
    const seen = new Set();
    for ( const entry of value ) {
        if ( typeof entry !== 'string' ) { continue; }
        const trimmed = entry.trim();
        if ( trimmed === '' ) { continue; }
        if ( seen.has(trimmed) ) { continue; }
        seen.add(trimmed);
        out.push(trimmed);
    }
    return out;
}

function sameStringArray(a = [], b = []) {
    if ( a.length !== b.length ) { return false; }
    for ( let i = 0; i < a.length; i++ ) {
        if ( a[i] !== b[i] ) { return false; }
    }
    return true;
}

function filteringModeFromName(name) {
    switch ( name ) {
    case 'none':
        return MODE_NONE;
    case 'basic':
        return MODE_BASIC;
    case 'optimal':
        return MODE_OPTIMAL;
    case 'complete':
        return MODE_COMPLETE;
    default:
        return undefined;
    }
}

function isEnabledFilteringMode(mode) {
    return mode === MODE_BASIC ||
        mode === MODE_OPTIMAL ||
        mode === MODE_COMPLETE;
}

function reusableEnabledFilteringMode(mode) {
    return isEnabledFilteringMode(mode) ? mode : MODE_COMPLETE;
}

function protectionStateFromMode(mode) {
    return {
        ok: true,
        enabled: mode !== MODE_NONE,
        defaultFilteringMode: mode,
    };
}

async function getProtectionState() {
    const mode = await getDefaultFilteringMode();
    if ( isEnabledFilteringMode(mode) &&
        runtimeSettings.lastEnabledFilteringMode !== mode ) {
        runtimeSettings.lastEnabledFilteringMode = mode;
        await saveRuntimeSettings();
    }
    return protectionStateFromMode(mode);
}

async function setProtectionEnabled(enabled) {
    if ( typeof enabled !== 'boolean' ) {
        return {
            ok: false,
            error: 'invalid-enabled',
        };
    }

    const beforeMode = await getDefaultFilteringMode();
    const targetMode = enabled
        ? reusableEnabledFilteringMode(runtimeSettings.lastEnabledFilteringMode)
        : MODE_NONE;

    let settingsChanged = false;
    if ( isEnabledFilteringMode(beforeMode) &&
        runtimeSettings.lastEnabledFilteringMode !== beforeMode ) {
        runtimeSettings.lastEnabledFilteringMode = beforeMode;
        settingsChanged = true;
    }

    const afterMode = await setDefaultFilteringMode(targetMode);
    if ( isEnabledFilteringMode(afterMode) &&
        runtimeSettings.lastEnabledFilteringMode !== afterMode ) {
        runtimeSettings.lastEnabledFilteringMode = afterMode;
        settingsChanged = true;
    }

    await registerDeclarativeAssets();
    if ( settingsChanged ) {
        await saveRuntimeSettings();
    }
    broadcastMessage({
        defaultFilteringMode: afterMode,
        hasOmnipotence: await hasBroadHostPermissions(),
    });
    return protectionStateFromMode(afterMode);
}

async function sendNativeMessageToMacApp(message) {
    if ( typeof runtime.sendNativeMessage !== 'function' ) { return; }
    let lastReason;
    // Safari delivers to the app's handler with the single-argument form, so try
    // it first; probing host identifiers only wastes failed round-trips there.
    try {
        return await runtime.sendNativeMessage(message);
    } catch(reason) {
        lastReason = reason;
    }
    for ( const host of MAC_APP_NATIVE_HOSTS ) {
        try {
            return await runtime.sendNativeMessage(host, message);
        } catch(reason) {
            lastReason = reason;
        }
    }
    if ( lastReason !== undefined ) {
        adblockLog(`Mac App settings native message failed: ${lastReason}`);
    }
}

async function readMacAppSettings() {
    const response = await sendNativeMessageToMacApp({
        command: 'getSettings',
    });
    if ( response instanceof Object === false ) { return; }
    if ( response.ok !== true || response.hasSettings !== true ) { return; }
    const { settings } = response;
    if ( settings instanceof Object === false ) { return; }
    return settings;
}

function sameSiteFilteringHostnames(before, after) {
    for ( const key of [ 'none', 'basic', 'optimal', 'complete' ] ) {
        if ( sameStringArray(before[key] || [], after[key] || []) === false ) {
            return false;
        }
    }
    return true;
}

function customFiltersFromSettings(value) {
    if ( Array.isArray(value) === false ) { return; }

    const entries = [];
    const seenHostnames = new Set();
    for ( const entry of value ) {
        if ( entry instanceof Object === false ) { continue; }

        const hostname = typeof entry.hostname === 'string'
            ? entry.hostname.trim().toLowerCase()
            : '';
        if ( hostname === '' || seenHostnames.has(hostname) ) { continue; }

        const selectors = uniqueStringArray(entry.selectors) || [];
        if ( selectors.length === 0 ) { continue; }

        seenHostnames.add(hostname);
        entries.push({ hostname, selectors });
    }

    return entries;
}

function sameCustomFilters(before = [], after = []) {
    if ( before.length !== after.length ) { return false; }
    for ( let i = 0; i < before.length; i++ ) {
        if ( before[i].hostname !== after[i].hostname ) { return false; }
        if ( sameStringArray(before[i].selectors || [], after[i].selectors || []) === false ) {
            return false;
        }
    }
    return true;
}

async function applyMacAppCustomFilters(settings) {
    const customFilters = customFiltersFromSettings(settings.customFilters);
    if ( customFilters === undefined ) { return false; }
    if ( sameCustomFilters(runtimeSettings.macAppCustomFilters, customFilters) ) {
        return false;
    }

    await replaceAllCustomFilters(customFilters);
    await registerDeclarativeAssets();
    runtimeSettings.macAppCustomFilters = customFilters;
    return true;
}

async function applyMacAppSiteFilteringHostnames(settings) {
    const before = runtimeSettings.macAppSiteFilteringHostnames || {};
    const after = {
        none: uniqueStringArray(settings.noFilteringHostnames) || [],
        basic: uniqueStringArray(settings.basicFilteringHostnames) || [],
        optimal: uniqueStringArray(settings.optimalFilteringHostnames) || [],
        complete: uniqueStringArray(settings.completeFilteringHostnames) || [],
    };
    if ( sameSiteFilteringHostnames(before, after) ) { return false; }

    const details = await getFilteringModeDetails();
    const allPrevious = new Set([
        ...(before.none || []),
        ...(before.basic || []),
        ...(before.optimal || []),
        ...(before.complete || []),
    ]);
    const allNext = new Set([
        ...after.none,
        ...after.basic,
        ...after.optimal,
        ...after.complete,
    ]);

    for ( const hostname of new Set([ ...allPrevious, ...allNext ]) ) {
        details.none.delete(hostname);
        details.basic.delete(hostname);
        details.optimal.delete(hostname);
        details.complete.delete(hostname);
    }

    for ( const hostname of after.none ) {
        details.none.add(hostname);
    }
    for ( const hostname of after.basic ) {
        details.basic.add(hostname);
    }
    for ( const hostname of after.optimal ) {
        details.optimal.add(hostname);
    }
    for ( const hostname of after.complete ) {
        details.complete.add(hostname);
    }

    await setFilteringModeDetails(details);
    await registerDeclarativeAssets();
    runtimeSettings.macAppSiteFilteringHostnames = after;
    broadcastMessage({
        filteringModeDetails: await getFilteringModeDetails(true),
    });
    return true;
}

async function applyMacAppSettings(settings) {
    let changed = false;

    const rulesets = uniqueStringArray(settings.enabledRulesets);
    if ( rulesets && sameStringArray(rulesets, runtimeSettings.enabledRulesets) === false ) {
        const result = await enableRulesets(rulesets);
        if ( result?.error ) {
            adblockErr(`Mac App settings rulesets/${result.error}`);
        } else {
            runtimeSettings.enabledRulesets = result?.enabledRulesets || rulesets;
            await registerContentScripts();
            broadcastMessage({ enabledRulesets: runtimeSettings.enabledRulesets });
            changed = true;
        }
    }

    const defaultFilteringMode = filteringModeFromName(settings.defaultFilteringMode);
    if ( defaultFilteringMode !== undefined ) {
        const beforeLevel = await getDefaultFilteringMode();
        if ( beforeLevel !== defaultFilteringMode ) {
            const afterLevel = await setDefaultFilteringMode(defaultFilteringMode);
            if ( afterLevel !== beforeLevel ) {
                await registerDeclarativeAssets();
                broadcastMessage({
                    defaultFilteringMode: afterLevel,
                    hasOmnipotence: await hasBroadHostPermissions(),
                });
                changed = true;
            }
        }
    }

    changed = await applyMacAppSiteFilteringHostnames(settings) || changed;
    changed = await applyMacAppCustomFilters(settings) || changed;

    if ( typeof settings.autoReload === 'boolean' &&
        settings.autoReload !== runtimeSettings.autoReload ) {
        runtimeSettings.autoReload = settings.autoReload;
        broadcastMessage({ autoReload: runtimeSettings.autoReload });
        changed = true;
    }

    if ( runtimeSettings.showBlockedCount !== false ) {
        await disableToolbarBadgeCount();
        broadcastMessage({ showBlockedCount: false });
        changed = true;
    }

    if ( typeof settings.popupBlockMode === 'boolean' &&
        settings.popupBlockMode !== runtimeSettings.popupBlockMode ) {
        await setPopupBlockMode(settings.popupBlockMode);
        await registerContentScripts();
        broadcastMessage({ popupBlockMode: runtimeSettings.popupBlockMode });
        changed = true;
    }

    return changed;
}

async function syncMacAppSettingsFromNative() {
    try {
        const settings = await readMacAppSettings();
        if ( settings instanceof Object === false ) { return false; }
        const revision = Number(settings.revision);
        if ( Number.isFinite(revision) === false ) { return false; }
        if ( revision <= (runtimeSettings.macAppSettingsRevision || 0) ) {
            return false;
        }

        const changed = await applyMacAppSettings(settings);
        runtimeSettings.macAppSettingsRevision = revision;
        await saveRuntimeSettings();
        return changed;
    } catch(reason) {
        adblockErr(`syncMacAppSettingsFromNative/${reason}`);
        return false;
    }
}

/******************************************************************************/

let customFilterOpQueue = Promise.resolve();
const MAX_CONTENT_SCRIPT_ACTIVITY_PER_TAB = 500;
const CONTENT_SCRIPT_ACTIVITY_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_DIAGNOSTIC_EVENTS_PER_TAB = 240;
const DIAGNOSTIC_EVENTS_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const DIAGNOSTIC_STRING_MAX_LENGTH = 240;
const DIAGNOSTIC_ARRAY_MAX_ITEMS = 40;
const DIAGNOSTIC_OBJECT_MAX_KEYS = 40;
const DIAGNOSTIC_EVENTS_STORAGE_PREFIX = 'diagnostic.events.';
const contentScriptActivityByTab = new Map();
const diagnosticEventsByTab = new Map();

function queueCustomFilterOp(operation) {
    const next = customFilterOpQueue.then(operation, operation);
    customFilterOpQueue = next.catch(( ) => {});
    return next;
}

async function persistCustomFilterChange(command, request) {
    const hostname = typeof request.hostname === 'string'
        ? request.hostname.trim().toLowerCase()
        : '';
    const selector = typeof request.selector === 'string'
        ? request.selector.trim()
        : '';
    if ( hostname === '' || selector === '' ) {
        return { ok: false, reason: 'invalid-arguments' };
    }

    const message = { command, hostname, selector };
    if ( command === 'addCustomFilter' && typeof request.label === 'string' ) {
        message.label = request.label;
    }

    const response = await sendNativeMessageToMacApp(message);
    if ( response?.ok !== true ) {
        return { ok: false, reason: 'native-write-failed', detail: response };
    }

    await syncMacAppSettingsFromNative();
    return { ok: true };
}

/******************************************************************************/

function hostnameFromURL(url = '') {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

function normalizeContentScriptText(value, fallback = '') {
    return typeof value === 'string'
        ? value.trim().slice(0, 120)
        : fallback;
}

function pruneContentScriptActivity(tabId, minTimeStamp = Date.now() - CONTENT_SCRIPT_ACTIVITY_MAX_AGE_MS) {
    const events = contentScriptActivityByTab.get(tabId);
    if ( Array.isArray(events) === false ) { return []; }

    const pruned = events
        .filter(event => event.timeStamp >= minTimeStamp)
        .slice(-MAX_CONTENT_SCRIPT_ACTIVITY_PER_TAB);

    if ( pruned.length === 0 ) {
        contentScriptActivityByTab.delete(tabId);
        return [];
    }

    if ( pruned.length !== events.length ) {
        contentScriptActivityByTab.set(tabId, pruned);
    }

    return pruned;
}

function recordContentScriptActivity(request, sender) {
    const tabId = sender?.tab?.id;
    if ( Number.isInteger(tabId) === false ) {
        return { ok: false, reason: 'missing-tab-id' };
    }

    const count = Math.max(0, Math.min(1000, Number.parseInt(request.count || 0, 10)));
    if ( count === 0 ) {
        return { ok: false, reason: 'empty-count' };
    }

    const event = {
        count,
        frameId: Number.isInteger(sender?.frameId) ? sender.frameId : undefined,
        hostname: normalizeContentScriptText(
            request.hostname,
            hostnameFromURL(sender?.url || sender?.tab?.url || '')
        ).toLowerCase(),
        label: normalizeContentScriptText(request.label, '頁面內容'),
        source: normalizeContentScriptText(request.source, 'content-script'),
        timeStamp: Date.now(),
    };

    const events = pruneContentScriptActivity(tabId);
    events.push(event);
    contentScriptActivityByTab.set(
        tabId,
        events.slice(-MAX_CONTENT_SCRIPT_ACTIVITY_PER_TAB)
    );

    return { ok: true };
}

function getContentScriptActivity(request) {
    const minTimeStamp = Number.isFinite(Number(request.minTimeStamp))
        ? Number(request.minTimeStamp)
        : Date.now() - (30 * 60 * 1000);
    const tabId = Number.parseInt(request.tabId, 10);

    const activities = Number.isInteger(tabId)
        ? pruneContentScriptActivity(tabId, minTimeStamp)
        : Array.from(contentScriptActivityByTab)
            .flatMap(([ id ]) => pruneContentScriptActivity(id, minTimeStamp));

    return {
        activities: activities.filter(event => event.timeStamp >= minTimeStamp),
        capturedAt: Date.now(),
        minTimeStamp,
        ok: true,
    };
}

function diagnosticEventsStorageKey(tabId) {
    return `${DIAGNOSTIC_EVENTS_STORAGE_PREFIX}${tabId}`;
}

function diagnosticEventKey(event) {
    return [
        event.timeStamp,
        event.frameId,
        event.source,
        event.eventName,
    ].join('|');
}

async function readStoredDiagnosticEvents(tabId) {
    const stored = await sessionRead(diagnosticEventsStorageKey(tabId));
    return Array.isArray(stored) ? stored : [];
}

async function pruneDiagnosticEvents(tabId, minTimeStamp = Date.now() - DIAGNOSTIC_EVENTS_MAX_AGE_MS) {
    const memoryEvents = diagnosticEventsByTab.get(tabId);
    const events = [
        ...(Array.isArray(memoryEvents) ? memoryEvents : []),
        ...await readStoredDiagnosticEvents(tabId),
    ];
    if ( events.length === 0 ) { return []; }

    const seen = new Set();
    const pruned = events
        .filter(event => event.timeStamp >= minTimeStamp)
        .sort((a, b) => (a.timeStamp || 0) - (b.timeStamp || 0))
        .filter(event => {
            const key = diagnosticEventKey(event);
            if ( seen.has(key) ) { return false; }
            seen.add(key);
            return true;
        })
        .slice(-MAX_DIAGNOSTIC_EVENTS_PER_TAB);

    if ( pruned.length === 0 ) {
        diagnosticEventsByTab.delete(tabId);
        await sessionWrite(diagnosticEventsStorageKey(tabId), []);
        return [];
    }

    diagnosticEventsByTab.set(tabId, pruned);
    await sessionWrite(diagnosticEventsStorageKey(tabId), pruned);

    return pruned;
}

function sanitizeDiagnosticValue(value, depth = 0) {
    if ( value === null || value === undefined ) { return value; }
    if ( typeof value === 'boolean' ) { return value; }
    if ( typeof value === 'number' ) {
        return Number.isFinite(value) ? value : undefined;
    }
    if ( typeof value === 'string' ) {
        return value.slice(0, DIAGNOSTIC_STRING_MAX_LENGTH);
    }
    if ( depth >= 3 ) { return '[truncated]'; }
    if ( Array.isArray(value) ) {
        return value
            .slice(0, DIAGNOSTIC_ARRAY_MAX_ITEMS)
            .map(item => sanitizeDiagnosticValue(item, depth + 1))
            .filter(item => item !== undefined);
    }
    if ( value instanceof Object === false ) { return; }

    const out = {};
    for ( const [ key, item ] of Object.entries(value).slice(0, DIAGNOSTIC_OBJECT_MAX_KEYS) ) {
        const safeKey = String(key).slice(0, 80);
        const safeValue = sanitizeDiagnosticValue(item, depth + 1);
        if ( safeValue !== undefined ) {
            out[safeKey] = safeValue;
        }
    }
    return out;
}

async function recordDiagnosticEvent(request, sender) {
    const tabId = sender?.tab?.id;
    if ( Number.isInteger(tabId) === false ) {
        return { ok: false, reason: 'missing-tab-id' };
    }

    const eventName = normalizeContentScriptText(
        request.eventName || request.event || request.name,
        'event'
    );
    if ( eventName === '' ) {
        return { ok: false, reason: 'missing-event-name' };
    }

    const event = {
        details: sanitizeDiagnosticValue(request.details || request.data || {}),
        eventName,
        frameId: Number.isInteger(sender?.frameId) ? sender.frameId : undefined,
        hostname: normalizeContentScriptText(
            request.hostname,
            hostnameFromURL(sender?.url || sender?.tab?.url || '')
        ).toLowerCase(),
        source: normalizeContentScriptText(request.source, 'content-script'),
        timeStamp: Date.now(),
    };

    const events = await pruneDiagnosticEvents(tabId);
    events.push(event);
    const nextEvents = events.slice(-MAX_DIAGNOSTIC_EVENTS_PER_TAB);
    diagnosticEventsByTab.set(tabId, nextEvents);
    await sessionWrite(diagnosticEventsStorageKey(tabId), nextEvents);

    return { ok: true };
}

async function getDiagnosticEvents(request) {
    const minTimeStamp = Number.isFinite(Number(request.minTimeStamp))
        ? Number(request.minTimeStamp)
        : Date.now() - (30 * 60 * 1000);
    const tabId = Number.parseInt(request.tabId, 10);

    let events;
    if ( Number.isInteger(tabId) ) {
        events = await pruneDiagnosticEvents(tabId, minTimeStamp);
    } else {
        const keys = await sessionKeys() || [];
        const tabIds = new Set([
            ...Array.from(diagnosticEventsByTab.keys()),
            ...keys
                .filter(key => key.startsWith(DIAGNOSTIC_EVENTS_STORAGE_PREFIX))
                .map(key => Number.parseInt(key.slice(DIAGNOSTIC_EVENTS_STORAGE_PREFIX.length), 10))
                .filter(Number.isInteger),
        ]);
        events = (await Promise.all(
            Array.from(tabIds, id => pruneDiagnosticEvents(id, minTimeStamp))
        )).flat();
    }

    return {
        capturedAt: Date.now(),
        events: events.filter(event => event.timeStamp >= minTimeStamp),
        minTimeStamp,
        ok: true,
    };
}

function summarizeURLForDiagnostics(value) {
    if ( typeof value !== 'string' || value === '' ) { return; }
    try {
        const url = new URL(value);
        return {
            hostname: url.hostname,
            origin: url.origin,
            pathname: url.pathname,
            protocol: url.protocol,
        };
    } catch {
    }
}

function normalizeDiagnosticMatch(info) {
    if ( info instanceof Object === false ) { return; }
    const rule = info.rule instanceof Object ? info.rule : {};
    const ruleId = Number(rule.ruleId ?? rule.id ?? info.ruleId);
    const timeStamp = Number(info.timeStamp ?? info.timestamp ?? Date.now());
    const tabId = Number(info.tabId);
    const rulesetId = String(rule.rulesetId ?? info.rulesetId ?? '').trim();

    return {
        request: summarizeURLForDiagnostics(info.request?.url || info.url || ''),
        ruleId: Number.isFinite(ruleId) ? ruleId : undefined,
        rulesetId: rulesetId || '__unknown__',
        tabId: Number.isFinite(tabId) ? tabId : undefined,
        timeStamp: Number.isFinite(timeStamp) ? timeStamp : Date.now(),
    };
}

async function callOptionalExtensionAPI(target, method, ...args) {
    if ( typeof target?.[method] !== 'function' ) {
        throw new Error(`${method} is unavailable`);
    }

    let maybePromise;
    try {
        maybePromise = target[method](...args);
    } catch {
        maybePromise = undefined;
    }

    if ( typeof maybePromise?.then === 'function' ) {
        return maybePromise;
    }
    if ( maybePromise !== undefined ) {
        return maybePromise;
    }

    return new Promise((resolve, reject) => {
        try {
            target[method](...args, result => {
                const lastError = browser.runtime?.lastError;
                if ( lastError ) {
                    reject(new Error(lastError.message));
                    return;
                }
                resolve(result);
            });
        } catch(reason) {
            reject(reason);
        }
    });
}

async function getDNRDiagnosticState(tabId, minTimeStamp) {
    const api = browser.declarativeNetRequest;
    const filter = { minTimeStamp };
    if ( Number.isInteger(tabId) ) {
        filter.tabId = tabId;
    }

    const out = {
        available: false,
        capturedAt: Date.now(),
        dynamicRules: [],
        dynamicRuleCount: undefined,
        enabledRulesets: [],
        error: '',
        matches: [],
        minTimeStamp,
        sessionRuleCount: undefined,
    };

    try {
        const result = await callOptionalExtensionAPI(api, 'getMatchedRules', filter);
        const infos = Array.isArray(result?.rulesMatchedInfo)
            ? result.rulesMatchedInfo
            : Array.isArray(result)
                ? result
                : [];
        out.available = true;
        out.matches = infos.map(normalizeDiagnosticMatch).filter(Boolean);
    } catch(reason) {
        out.error = reason?.message || String(reason || 'unknown error');
    }

    try {
        const enabled = await callOptionalExtensionAPI(api, 'getEnabledRulesets');
        out.enabledRulesets = Array.isArray(enabled) ? enabled : [];
    } catch {
    }

    try {
        const dynamicRules = await callOptionalExtensionAPI(api, 'getDynamicRules');
        out.dynamicRuleCount = Array.isArray(dynamicRules) ? dynamicRules.length : undefined;
        out.dynamicRules = Array.isArray(dynamicRules)
            ? dynamicRules
                .filter(rule => {
                    const condition = rule.condition || {};
                    const text = `${condition.urlFilter || ''} ${condition.regexFilter || ''}`;
                    return /youtube|googlevideo|doubleclick|pagead|googlesyndication|googleads/i.test(text);
                })
                .slice(0, 120)
                .map(rule => ({
                    actionType: rule.action?.type,
                    condition: {
                        initiatorDomains: rule.condition?.initiatorDomains,
                        regexFilter: rule.condition?.regexFilter,
                        requestDomains: rule.condition?.requestDomains,
                        requestMethods: rule.condition?.requestMethods,
                        resourceTypes: rule.condition?.resourceTypes,
                        urlFilter: rule.condition?.urlFilter,
                    },
                    id: rule.id,
                    priority: rule.priority,
                }))
            : [];
    } catch {
    }

    try {
        const sessionRules = await callOptionalExtensionAPI(api, 'getSessionRules');
        out.sessionRuleCount = Array.isArray(sessionRules) ? sessionRules.length : undefined;
    } catch {
    }

    return out;
}

function collectPageDiagnosticSnapshot() {
    const isObject = value => value !== null && typeof value === 'object';
    const safe = (fn, fallback) => {
        try {
            return fn();
        } catch {
            return fallback;
        }
    };
    const trimText = value => typeof value === 'string'
        ? value.trim().replace(/\s+/g, ' ').slice(0, 180)
        : '';
    const count = selector => safe(() => document.querySelectorAll(selector).length, 0);
    const classText = element => {
        const className = element?.className;
        if ( typeof className === 'string' ) { return trimText(className); }
        if ( typeof className?.baseVal === 'string' ) { return trimText(className.baseVal); }
        return '';
    };
    const elementSummary = element => safe(() => {
        if ( element instanceof Element === false ) { return; }
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
            ariaLabel: trimText(element.getAttribute('aria-label') || ''),
            classes: classText(element),
            hidden: element.hidden === true,
            id: trimText(element.id || ''),
            rect: {
                height: Math.round(rect.height),
                width: Math.round(rect.width),
                x: Math.round(rect.x),
                y: Math.round(rect.y),
            },
            role: trimText(element.getAttribute('role') || ''),
            style: {
                display: style.display,
                pointerEvents: style.pointerEvents,
                position: style.position,
                visibility: style.visibility,
                zIndex: style.zIndex,
            },
            tag: element.localName,
            text: trimText(element.innerText || element.textContent || ''),
        };
    }, undefined);
    const elementSummaries = selector => safe(() => Array.from(document.querySelectorAll(selector))
        .slice(0, 8)
        .map(elementSummary)
        .filter(Boolean), []);
    const urlSummary = url => {
        try {
            const parsed = new URL(url, location.href);
            return {
                hostname: parsed.hostname,
                pathname: parsed.pathname,
                protocol: parsed.protocol,
            };
        } catch {
            return;
        }
    };
    const querySummary = parsed => {
        const keys = [
            'alr',
            'c',
            'ctier',
            'expire',
            'mime',
            'oad',
            'rn',
            'source',
        ];
        const out = {};
        for ( const key of keys ) {
            const value = parsed.searchParams.get(key);
            if ( value !== null && value !== '' ) {
                out[key] = value.slice(0, 80);
            }
        }
        return Object.keys(out).length === 0 ? undefined : out;
    };
    const importantResource = entry => {
        let parsed;
        try {
            parsed = new URL(entry.name, location.href);
        } catch {
            return;
        }
        const url = urlSummary(entry.name);
        if ( url === undefined ) { return; }
        const importantHost = /(?:^|\.)youtube\.com$|(?:^|\.)googlevideo\.com$|(?:^|\.)doubleclick\.net$|(?:^|\.)googleadservices\.com$|(?:^|\.)googlesyndication\.com$/.test(url.hostname);
        const importantPath = /\/youtubei\/v1\/|\/api\/stats\/ads|\/pagead\/|\/generate_204|\/videoplayback/.test(url.pathname);
        if ( importantHost === false && importantPath === false ) { return; }
        return {
            duration: Math.round(Number(entry.duration || 0)),
            hostname: url.hostname,
            initiatorType: entry.initiatorType || '',
            pathname: url.pathname,
            query: querySummary(parsed),
            transferSize: Number.isFinite(entry.transferSize) ? entry.transferSize : undefined,
        };
    };

    const player = safe(() => document.querySelector('#movie_player'), null);
    const playerResponse = safe(() => player?.getPlayerResponse?.(), undefined);
    const playabilityStatus = isObject(playerResponse?.playabilityStatus)
        ? playerResponse.playabilityStatus
        : undefined;
    const stats = safe(() => player?.getStatsForNerds?.(), undefined);
    const adState = safe(() => player?.getAdState?.(), undefined);
    const simpleAdState = [ 'boolean', 'number', 'string' ].includes(typeof adState)
        ? adState
        : undefined;
    const videos = safe(() => Array.from(document.querySelectorAll('video'))
        .slice(0, 4)
        .map(video => ({
            currentSrc: urlSummary(video.currentSrc || video.src || ''),
            duration: Number.isFinite(video.duration) ? Math.round(video.duration) : undefined,
            muted: video.muted === true,
            paused: video.paused === true,
            readyState: video.readyState,
        })), []);
    const resources = safe(() => performance.getEntriesByType('resource')
        .map(importantResource)
        .filter(Boolean)
        .slice(-120), []);

    return {
        capturedAt: Date.now(),
        document: {
            hidden: document.hidden === true,
            readyState: document.readyState,
            title: trimText(document.title),
            url: urlSummary(location.href),
        },
        resources,
        youtube: {
            adState: simpleAdState,
            appEarlyHidden: safe(() => document.querySelector('ytd-app')?.dataset?.adblockEarlyHidden === 'true', false),
            dom: {
                antiBlockTextMatches: safe(() => {
                    const text = document.body?.innerText || '';
                    const matches = text.match(/廣告攔截器|ad blocker|Ad blockers violate|YouTube 服務條款/gi);
                    return Array.isArray(matches) ? Array.from(new Set(matches)).slice(0, 6) : [];
                }, []),
                earlyHiddenCount: count('[data-adblock-early-hidden="true"]'),
                earlyHiddenNodes: elementSummaries('[data-adblock-early-hidden="true"]'),
                openedBackdropCount: count('tp-yt-iron-overlay-backdrop[opened], yt-iron-overlay-backdrop[opened]'),
                openedDialogCount: count('tp-yt-paper-dialog[opened], yt-dialog-view-model[opened], ytd-popup-container tp-yt-paper-dialog'),
                playabilityErrorCount: count('yt-playability-error-supported-renderers, ytd-player-error-message-renderer'),
                playabilityErrorNodes: elementSummaries('yt-playability-error-supported-renderers, ytd-player-error-message-renderer'),
                promotedRendererCount: count('ytd-promoted-video-renderer, ytd-display-ad-renderer, ytd-rich-item-renderer ytd-ad-slot-renderer, ytd-ad-slot-renderer'),
            },
            playerState: safe(() => player?.getPlayerState?.(), undefined),
            playability: playabilityStatus === undefined
                ? undefined
                : {
                    reason: trimText(playabilityStatus.reason),
                    status: trimText(playabilityStatus.status),
                    subreason: trimText(playabilityStatus.subreason?.runs?.[0]?.text || playabilityStatus.subreason),
                },
            stats: isObject(stats)
                ? {
                    adformat: trimText(stats.adformat),
                    debugVideoId: trimText(stats.debug_videoId),
                    playerState: trimText(stats.playerState),
                    videoId: trimText(stats.video_id),
                }
                : undefined,
            videos,
        },
    };
}

async function getPageDiagnosticState(tabId) {
    if ( Number.isInteger(tabId) === false || browser.scripting === undefined ) {
        return { available: false, error: 'missing-tab-id-or-scripting' };
    }

    const run = options => browser.scripting.executeScript({
        target: { tabId, frameIds: [ 0 ] },
        func: collectPageDiagnosticSnapshot,
        ...options,
    });

    try {
        const result = await run({ world: 'MAIN' });
        return {
            available: true,
            world: 'MAIN',
            ...(result?.[0]?.result || {}),
        };
    } catch(reason) {
        try {
            const result = await run({});
            return {
                available: true,
                world: 'ISOLATED',
                ...(result?.[0]?.result || {}),
            };
        } catch(fallbackReason) {
            return {
                available: false,
                error: fallbackReason?.message || reason?.message || String(fallbackReason || reason),
            };
        }
    }
}

async function getTabDiagnosticInfo(tabId) {
    if ( Number.isInteger(tabId) === false ) {
        return { id: undefined };
    }
    try {
        const tab = await browser.tabs.get(tabId);
        const url = summarizeURLForDiagnostics(tab?.url || '');
        return {
            active: tab?.active === true,
            id: tabId,
            status: tab?.status || '',
            title: normalizeContentScriptText(tab?.title, ''),
            url,
        };
    } catch(reason) {
        return {
            error: reason?.message || String(reason || 'unknown error'),
            id: tabId,
        };
    }
}

async function getDiagnosticSnapshot(request) {
    const tabId = Number.parseInt(request.tabId, 10);
    const minTimeStamp = Number.isFinite(Number(request.minTimeStamp))
        ? Number(request.minTimeStamp)
        : Date.now() - (30 * 60 * 1000);
    const tab = await getTabDiagnosticInfo(tabId);
    const hostname = tab.url?.hostname || '';

    const [
        registeredContentScripts,
        dnrState,
        activityState,
        eventState,
        pageState,
        defaultFilteringMode,
        tabFilteringMode,
        hasOmnipotence,
    ] = await Promise.all([
        scrmgr.getRegisteredContentScripts().catch(reason => ({
            error: reason?.message || String(reason || 'unknown error'),
        })),
        getDNRDiagnosticState(Number.isInteger(tabId) ? tabId : undefined, minTimeStamp),
        getContentScriptActivity({ tabId, minTimeStamp }),
        getDiagnosticEvents({ tabId, minTimeStamp }),
        getPageDiagnosticState(tabId),
        getDefaultFilteringMode().catch(() => undefined),
        hostname !== '' ? getFilteringMode(hostname).catch(() => undefined) : undefined,
        hasBroadHostPermissions().catch(() => undefined),
    ]);

    return {
        capturedAt: Date.now(),
        contentScripts: {
            activities: activityState.activities,
            diagnosticEvents: eventState.events,
            registered: registeredContentScripts,
        },
        dnr: dnrState,
        extension: {
            hasBroadHostPermissions: hasOmnipotence,
            runtimeSettings: {
                popupBlockMode: runtimeSettings.popupBlockMode,
                showBlockedCount: runtimeSettings.showBlockedCount,
            },
            version: getCurrentVersion(),
            webextFlavor,
        },
        filtering: {
            defaultMode: defaultFilteringMode,
            tabMode: tabFilteringMode,
        },
        minTimeStamp,
        ok: true,
        page: pageState,
        tab,
    };
}

/******************************************************************************/

async function reloadTab(tabId, url = '') {
    return new Promise(resolve => {
        self.setTimeout(( ) => {
            if ( url !== '' ) {
                browser.tabs.update(tabId, { url });
            } else {
                browser.tabs.reload(tabId);
            }
            resolve();
        }, 437);
    });
}

// When a new host permission is granted through the browser
async function onPermissionGrantedThruBrowser(origins) {
    const modified = await syncWithBrowserPermissions();
    if ( modified === false ) { return; }
    await registerContentScripts();
    if ( runtimeSettings.autoReload !== true ) { return; }
    if ( origins.length !== 1 ) { return; }
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs?.[0]?.id;
    if ( typeof tabId !== 'number' || tabId === -1 ) { return; }
    const results = await browser.scripting.executeScript({
        target: { tabId, frameIds: [ 0 ] },
        func: ( ) => document.location.hostname,
    }).catch(( ) => {
    });
    const tabHostname = results?.[0]?.result;
    if ( typeof tabHostname !== 'string' ) { return; }
    const hostname = hostnameFromMatch(origins[0]);
    if ( tabHostname.endsWith(hostname) === false ) { return; }
    const pos = tabHostname.length - hostname.length;
    if ( pos !== 0 && tabHostname.charAt(pos-1) !== '.' ) { return; }
    await reloadTab(tabId);
}

async function onPermissionsAdded(permissions) {
    const { origins = [] } = permissions;
    return onPermissionGrantedThruBrowser(origins);
}

async function onPermissionsRemoved() {
    const modified = await syncWithBrowserPermissions();
    if ( modified === false ) { return false; }
    registerContentScripts();
    return true;
}

async function onPermissionsChanged(op, permissions) {
    await isFullyInitialized;
    const { pending } = onPermissionsChanged;
    await Promise.all(pending);
    const promise = op === 'removed'
        ? onPermissionsRemoved()
        : onPermissionsAdded(permissions);
    pending.push(promise);
}
onPermissionsChanged.pending = [];

/******************************************************************************/

async function registerDeclarativeAssets(
    contentScripts = true,
    userScripts = true
) {
    await Promise.all([
        userScripts ? registerCustomFilterScripts() : false,
        contentScripts ? registerContentScripts() : false,
    ]);
}

/******************************************************************************/

function enterElementRemoverMode(tabId) {
    if ( Number.isInteger(tabId) === false ) { return false; }
    if ( browser.scripting === undefined ) { return false; }
    return browser.scripting.executeScript({
        files: [ 'js/content-scripts/element-remover.js' ],
        target: { tabId },
        injectImmediately: true,
    }).then(( ) => true).catch(reason => {
        adblockErr(`enterElementRemoverMode/${reason}`);
        return false;
    });
}

function leaveElementRemoverMode(tabId) {
    if ( Number.isInteger(tabId) === false ) { return false; }
    if ( browser.scripting === undefined ) { return false; }
    return browser.scripting.executeScript({
        target: { tabId },
        injectImmediately: true,
        func: ( ) => {
            globalThis.adblockElementRemover?.stop?.();
            globalThis.adblockOverlay?.stop?.();
            return true;
        },
    }).then(( ) => true).catch(reason => {
        adblockErr(`leaveElementRemoverMode/${reason}`);
        return false;
    });
}

/******************************************************************************/

async function onMessage(request, sender) {

    const tabId = sender?.tab?.id ?? false;
    const frameId = tabId && (sender?.frameId ?? false);

    // Does not require extension to be fully initialized

    // Does not require a trusted origin.

    switch ( request.what ) {

    case 'recordContentScriptActivity':
        return recordContentScriptActivity(request, sender);

    case 'getContentScriptActivity':
        return getContentScriptActivity(request);

    case 'recordDiagnosticEvent':
        return recordDiagnosticEvent(request, sender);

    case 'getDiagnosticSnapshot':
        await isFullyInitialized;
        if ( await scrmgr.needsContentScriptRegistration() ) {
            await registerContentScripts();
        }
        return getDiagnosticSnapshot(request);

    case 'insertCSS':
        if ( frameId === false ) { return false; }
        // https://bugs.webkit.org/show_bug.cgi?id=262491
        if ( frameId !== 0 && webextFlavor === 'safari' ) { return; }
        return browser.scripting.insertCSS({
            css: request.css,
            origin: 'USER',
            target: { tabId, frameIds: [ frameId ] },
        }).catch(reason => {
            adblockErr(`insertCSS/${reason}`);
        });

    case 'removeCSS':
        if ( frameId === false ) { return false; }
        // https://bugs.webkit.org/show_bug.cgi?id=262491
        if ( frameId !== 0 && webextFlavor === 'safari' ) { return; }
        return browser.scripting.removeCSS({
            css: request.css,
            origin: 'USER',
            target: { tabId, frameIds: [ frameId ] },
        }).catch(reason => {
            adblockErr(`removeCSS/${reason}`);
        });

    case 'injectCSSProceduralAPI':
        return browser.scripting.executeScript({
            files: [ '/js/content-scripts/css-procedural-api.js' ],
            target: { tabId, frameIds: [ frameId ] },
            injectImmediately: true,
        }).catch(reason => {
            adblockErr(`executeScript/${reason}`);
        });

    default:
        break;
    }

    // Requires extension to be fully initialized

    await isFullyInitialized;

    // Does not require a trusted origin.

    switch ( request.what ) {

    case 'getProtectionState':
        return getProtectionState();

    case 'setProtectionEnabled':
        return setProtectionEnabled(request.enabled);

    case 'toggleToolbarIcon': {
        if ( tabId ) {
            toggleToolbarIcon(tabId);
        }
        return;
    }

    case 'enter-element-remover-mode':
        return enterElementRemoverMode(request.tabId);

    case 'leave-element-remover-mode':
        return leaveElementRemoverMode(request.tabId);

    case 'injectCustomFilters':
        if ( frameId === false ) { return; }
        return injectCustomFilters(tabId, frameId, request.hostname);

    case 'saveCustomFilter':
        return queueCustomFilterOp(( ) =>
            persistCustomFilterChange('addCustomFilter', request)
        );

    case 'removeCustomFilter':
        return queueCustomFilterOp(( ) =>
            persistCustomFilterChange('removeCustomFilter', request)
        );

    default:
        break;
    }

}

/******************************************************************************/

function onCommand(command, tab) {
    switch ( command ) {
    case 'enter-element-remover-mode':
        enterElementRemoverMode(tab.id);
        break;
    default:
        break;
    }
}

/******************************************************************************/

async function startSession() {
    const currentVersion = getCurrentVersion();
    const isNewVersion = currentVersion !== runtimeSettings.version;

    // The default rulesets may have changed, find out new ruleset to enable,
    // obsolete ruleset to remove.
    if ( isNewVersion ) {
        adblockLog(`Version change: ${runtimeSettings.version} => ${currentVersion}`);
        runtimeSettings.version = currentVersion;
        await patchDefaultRulesets();
        saveRuntimeSettings();
    }

    const rulesetsUpdated = await enableRulesets(runtimeSettings.enabledRulesets);
    const dynamicRulesUpdateNeeded = await needsDynamicRulesUpdate();
    if ( rulesetsUpdated?.error === undefined &&
        Array.isArray(rulesetsUpdated?.enabledRulesets) ) {
        runtimeSettings.enabledRulesets = rulesetsUpdated.enabledRulesets;
        saveRuntimeSettings();
    }

    // Dynamic rules are expensive to rebuild, so only refresh them on version
    // changes or when the dynamic-rule schema changes.
    if ( rulesetsUpdated === undefined || rulesetsUpdated.normalizedOnly === true ) {
        if ( isNewVersion || dynamicRulesUpdateNeeded ) {
            await updateDynamicRules();
        } else {
            updateSessionRules();
        }
    }

    // Permissions may have been removed while the extension was disabled
    const permissionsUpdated = await syncWithBrowserPermissions();

    const shouldInject = isNewVersion || permissionsUpdated;
    if ( shouldInject ) {
        await registerDeclarativeAssets(true, true);
    }

    // Cosmetic filtering-related content scripts cache fitlering data in
    // session storage.
    sessionAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });

    // Switch to basic filtering if AdBlock doesn't have broad permissions at
    // install time.
    if ( runtimeState.firstRun ) {
        const hasBroadPermissions = await hasBroadHostPermissions();
        if ( hasBroadPermissions === false ) {
            const afterLevel = await setDefaultFilteringMode(MODE_BASIC);
            if ( afterLevel === MODE_BASIC ) {
                await registerContentScripts();
                runtimeState.firstRun = false;
            }
        }
    }

}

/******************************************************************************/

async function start() {
    await loadRuntimeSettings();

    if ( await disableToolbarBadgeCount() ) {
        await saveRuntimeSettings();
    }

    if ( runtimeState.wakeupRun === false ) {
        await startSession();
    } else {
        scrmgr.onWakeupRun();
    }

    await syncMacAppSettingsFromNative();

    if ( await scrmgr.needsContentScriptRegistration() ) {
        await registerContentScripts();
    }

}

/******************************************************************************/

// Restart once after an internal startup failure; Safari can occasionally leave
// the extension worker in a bad transient state after updates or permission
// changes.

const isFullyInitialized = start().then(( ) => {
    localRemove('goodStart');
    return false;
}).catch(reason => {
    adblockErr(reason);
    if ( runtimeState.wakeupRun ) { return; }
    return localRead('goodStart').then(goodStart => {
        if ( goodStart === false ) {
            localRemove('goodStart');
            return false;
        }
        return localWrite('goodStart', false).then(( ) => true);
    });
}).then(restart => {
    if ( restart !== true ) { return; }
    runtime.reload();
});

runtime.onMessage.addListener((request, sender, callback) => {
    onMessage(request, sender).then(callback);
    return true;
});

if ( supportsUserScripts && runtime.onUserScriptMessage ) {
    browser.userScripts.configureWorld({ messaging: true });
    runtime.onUserScriptMessage.addListener((request, sender, callback) => {
        onMessage(request, sender).then(callback);
        return true;
    });
}

browser.permissions.onRemoved.addListener((...args) => {
    isFullyInitialized.then(( ) => {
        onPermissionsChanged('removed', ...args);
    });
});

browser.permissions.onAdded.addListener((...args) => {
    isFullyInitialized.then(( ) => {
        onPermissionsChanged('added', ...args);
    });
});

browser.commands.onCommand.addListener((...args) => {
    isFullyInitialized.then(( ) => {
        onCommand(...args);
    });
});

if ( browser.alarms instanceof Object ) {
    browser.alarms.create(MAC_APP_SETTINGS_ALARM, { periodInMinutes: 1 });
    browser.alarms.onAlarm.addListener(alarm => {
        if ( alarm?.name !== MAC_APP_SETTINGS_ALARM ) { return; }
        isFullyInitialized.then(( ) => {
            syncMacAppSettingsFromNative();
        });
    });
}

// Pull Mac App settings promptly when the user returns to Safari, instead of
// waiting for the next polling alarm. A no-op sync is cheap (one native read
// gated by the settings revision), and a short debounce avoids bursts.
let macAppSyncDebounceTimer;
function requestMacAppSettingsSync() {
    if ( macAppSyncDebounceTimer !== undefined ) { return; }
    macAppSyncDebounceTimer = self.setTimeout(( ) => {
        macAppSyncDebounceTimer = undefined;
        isFullyInitialized.then(( ) => {
            syncMacAppSettingsFromNative();
        });
    }, 250);
}

if ( browser.windows?.onFocusChanged instanceof Object ) {
    browser.windows.onFocusChanged.addListener(windowId => {
        if ( windowId === browser.windows.WINDOW_ID_NONE ) { return; }
        requestMacAppSettingsSync();
    });
}

if ( browser.tabs?.onActivated instanceof Object ) {
    browser.tabs.onActivated.addListener(( ) => {
        requestMacAppSettingsSync();
    });
}
