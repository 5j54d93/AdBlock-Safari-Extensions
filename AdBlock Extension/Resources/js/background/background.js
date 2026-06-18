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

async function sendNativeMessageToMacApp(message) {
    if ( typeof runtime.sendNativeMessage !== 'function' ) { return; }
    let lastReason;
    for ( const host of MAC_APP_NATIVE_HOSTS ) {
        try {
            return await runtime.sendNativeMessage(host, message);
        } catch(reason) {
            lastReason = reason;
        }
    }
    try {
        return await runtime.sendNativeMessage(message);
    } catch(reason) {
        lastReason = reason;
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

    // We need to update the regex rules only when ruleset version changes.
    if ( rulesetsUpdated === undefined ) {
        if ( isNewVersion ) {
            updateDynamicRules();
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
