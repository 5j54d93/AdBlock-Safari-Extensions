import {
    localRead, localWrite,
    sessionRead, sessionWrite,
} from './ext.js';

/******************************************************************************/

const SETTINGS_STORAGE_KEY = 'runtimeSettings';

export const runtimeSettings = {
    version: '',
    enabledRulesets: [],
    autoReload: true,
    showBlockedCount: false,
    popupBlockMode: true,
    lastEnabledFilteringMode: 3,
    hasBroadHostPermissions: true,
    macAppSettingsRevision: 0,
    macAppSiteFilteringHostnames: {
        none: [],
        basic: [],
        optimal: [],
        complete: [],
    },
    macAppCustomFilters: [],
};

export const runtimeState = {
    firstRun: false,
    wakeupRun: false,
};

let pendingOpPromise = Promise.resolve();

/******************************************************************************/

async function _loadRuntimeSettings() {
    const sessionData = await sessionRead(SETTINGS_STORAGE_KEY);
    if ( sessionData instanceof Object ) {
        Object.assign(runtimeSettings, sessionData);
        await sessionWrite(SETTINGS_STORAGE_KEY, runtimeSettings);
        runtimeState.wakeupRun = true;
        return;
    }
    const localData = await localRead(SETTINGS_STORAGE_KEY);
    if ( localData instanceof Object ) {
        Object.assign(runtimeSettings, localData);
        await sessionWrite(SETTINGS_STORAGE_KEY, runtimeSettings);
        return;
    }
    await Promise.all([
        sessionWrite(SETTINGS_STORAGE_KEY, runtimeSettings),
        localWrite(SETTINGS_STORAGE_KEY, runtimeSettings),
    ]);
    runtimeState.firstRun = true;
}

async function _saveRuntimeSettings() {
    return Promise.all([
        sessionWrite(SETTINGS_STORAGE_KEY, runtimeSettings),
        localWrite(SETTINGS_STORAGE_KEY, runtimeSettings),
    ]);
}

/******************************************************************************/

export function loadRuntimeSettings() {
    pendingOpPromise = pendingOpPromise.then(_loadRuntimeSettings);
    return pendingOpPromise;
}

export function saveRuntimeSettings() {
    pendingOpPromise = pendingOpPromise.then(_saveRuntimeSettings);
    return pendingOpPromise;
}
