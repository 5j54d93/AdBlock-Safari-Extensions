/*******************************************************************************

    AdBlock

    Thin WebExtension helpers shared by the extension runtime and pages.

*/

import { webext } from './ext-compat.js';

/******************************************************************************/

export const browser = webext;
export const runtime = browser.runtime;

export const webextFlavor = (() => {
    const extensionURL = runtime.getURL('');
    if ( extensionURL.startsWith('safari-web-extension:') ) { return 'safari'; }
    if ( extensionURL.startsWith('moz-extension:') ) { return 'firefox'; }
    return 'chromium';
})();

const isObject = value => typeof value === 'object' && value !== null;

export const supportsUserScripts = (() => {
    if ( browser.offscreen === undefined ) { return false; }
    try {
        browser.userScripts.getScripts();
        return true;
    } catch {
    }
    return false;
})();

/******************************************************************************/

export function sendMessage(message) {
    return runtime.sendMessage(message).catch(reason => {
        console.log(reason);
    });
}

/******************************************************************************/

async function storageRead(area, key) {
    if ( isObject(area) === false ) { return; }
    try {
        const values = await area.get(key);
        if ( isObject(values) === false ) { return; }
        return values[key] ?? undefined;
    } catch {
    }
}

async function storageWrite(area, key, value) {
    if ( isObject(area) === false ) { return; }
    return area.set({ [key]: value });
}

async function storageRemove(area, keys) {
    if ( isObject(area) === false ) { return; }
    return area.remove(keys);
}

async function storageKeys(area) {
    if ( isObject(area) === false ) { return; }
    if ( typeof area.getKeys === 'function' ) {
        return area.getKeys();
    }
    const values = await area.get(null);
    if ( isObject(values) === false ) { return; }
    return Object.keys(values);
}

/******************************************************************************/

export function localRead(key) {
    return storageRead(browser.storage?.local, key);
}

export function localWrite(key, value) {
    return storageWrite(browser.storage?.local, key, value);
}

export function localRemove(keys) {
    return storageRemove(browser.storage?.local, keys);
}

export function localKeys() {
    return storageKeys(browser.storage?.local);
}

export function sessionRead(key) {
    return storageRead(browser.storage?.session, key);
}

export function sessionWrite(key, value) {
    return storageWrite(browser.storage?.session, key, value);
}

export function sessionRemove(keys) {
    return storageRemove(browser.storage?.session, keys);
}

export function sessionKeys() {
    return storageKeys(browser.storage?.session);
}

export function sessionAccessLevel(level) {
    try {
        browser.storage?.session?.setAccessLevel(level);
    } catch {
    }
}
