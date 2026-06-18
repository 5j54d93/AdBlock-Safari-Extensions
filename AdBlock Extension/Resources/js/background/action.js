/*******************************************************************************

    AdBlock

    Toolbar action icon state for filtering mode changes.

*/

import {
    browser,
    webextFlavor,
} from '../shared/ext.js';

import {
    matchesFromHostnames,
    withoutGoogleSearchHostnames,
} from '../shared/utils.js';

/******************************************************************************/

const ICON_ENABLED = {
    16: '/images/toolbar-icon-16.png',
    19: '/images/toolbar-icon-19.png',
    32: '/images/toolbar-icon-32.png',
    38: '/images/toolbar-icon-38.png',
    48: '/images/toolbar-icon-48.png',
    72: '/images/toolbar-icon-72.png',
};

const ICON_DISABLED = {
    16: '/images/toolbar-icon-off-16.png',
    19: '/images/toolbar-icon-off-19.png',
    32: '/images/toolbar-icon-off-32.png',
    38: '/images/toolbar-icon-off-38.png',
    48: '/images/toolbar-icon-off-48.png',
    72: '/images/toolbar-icon-off-72.png',
};

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

let reverseMode = false;

/******************************************************************************/

function actionAPI() {
    return browser.action || browser.browserAction;
}

function setToolbarIcon(tabId, enabled) {
    const action = actionAPI();
    if ( action === undefined || typeof action.setIcon !== 'function' ) { return; }

    const details = {
        path: enabled ? ICON_ENABLED : ICON_DISABLED,
    };
    if ( Number.isInteger(tabId) ) {
        details.tabId = tabId;
    }

    action.setIcon(details);
}

function hostnamesForReverseMode(filteringModeDetails) {
    const { basic, optimal, complete } = filteringModeDetails;
    return new Set([
        ...basic,
        ...optimal,
        ...complete,
    ]);
}

/******************************************************************************/

export function toggleToolbarIcon(tabId) {
    setToolbarIcon(tabId, reverseMode === true);
}

export async function registerToolbarIconToggler(context) {
    const { filteringModeDetails, toAdd } = context;
    const { none } = filteringModeDetails;

    const reverseModeAfter = none.has('all-urls');
    const hostnames = withoutGoogleSearchHostnames(reverseModeAfter
        ? hostnamesForReverseMode(filteringModeDetails)
        : new Set(none));

    if ( reverseModeAfter !== reverseMode ) {
        reverseMode = reverseModeAfter;
        setToolbarIcon(undefined, reverseMode === false);
    }

    if ( hostnames.length === 0 ) { return; }

    const directive = {
        id: 'toolbar-icon',
        js: [
            GOOGLE_SEARCH_GUARD,
            '/js/content-scripts/toolbar-icon.js',
        ],
        matches: matchesFromHostnames(hostnames),
        excludeMatches: GOOGLE_SEARCH_EXCLUDE_MATCHES,
        runAt: 'document_start',
    };
    if (
        SKIP_SAFARI_BROAD_CONTENT_SCRIPTS &&
        directive.matches.includes('<all_urls>')
    ) {
        return;
    }
    toAdd.push(directive);
}
