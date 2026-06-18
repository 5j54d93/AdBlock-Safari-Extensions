/*******************************************************************************

    AdBlock

    Extension utility helpers.

*/

import {
    browser,
    runtime,
} from './ext.js';

/******************************************************************************/

export async function hasBroadHostPermissions() {
    try {
        const permissions = await browser.permissions.getAll();
        const origins = permissions?.origins || [];
        return origins.includes('<all_urls>') || origins.includes('*://*/*');
    } catch {
        return false;
    }
}

export async function gotoURL(url, type) {
    const pageURL = new URL(url, runtime.getURL('/'));
    const tabs = await browser.tabs.query({
        url: pageURL.href,
        windowType: type === 'popup' ? 'popup' : 'normal',
    });

    if ( Array.isArray(tabs) && tabs.length !== 0 ) {
        const { id, windowId } = tabs[0];
        await browser.windows.update(windowId, { focused: true });
        return browser.tabs.update(id, { active: true });
    }

    if ( type === 'popup' ) {
        return browser.windows.create({
            type: 'popup',
            url: pageURL.href,
        });
    }

    return browser.tabs.create({
        active: true,
        url: pageURL.href,
    });
}
