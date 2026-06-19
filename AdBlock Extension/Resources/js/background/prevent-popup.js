// AdBlock popup-blocking content script registration.

import { runtimeSettings, saveRuntimeSettings } from '../shared/settings-store.js';
import { webextFlavor } from '../shared/ext.js';
import { matchesFromHostnames } from '../shared/utils.js';

/******************************************************************************/

const SKIP_SAFARI_BROAD_CONTENT_SCRIPTS = webextFlavor === 'safari';

/******************************************************************************/

export async function registerPreventPopup(context) {
    if ( runtimeSettings.popupBlockMode !== true ) { return; }
    const js = [];
    for ( const { id, popups } of context.rulesetsDetails ) {
        if ( popups === undefined ) { continue; }
        js.push(`/rulesets/scripting/popup/${id}.js`);
    }
    if ( js.length === 0 ) { return; }
    js.push(
        '/js/content-scripts/prevent-popup-target.js',
        '/js/content-scripts/prevent-popup.js'
    );

    const { none, basic, optimal, complete } = context.filteringModeDetails;
    let matches = [];
    let excludeMatches = [];
    if ( complete.has('all-urls') || optimal.has('all-urls') ) {
        matches = [ '*' ];
        excludeMatches = [ ...none, ...basic ];
    } else {
        matches = [ ...complete, ...optimal ];
    }
    if ( matches.length === 0 ) { return; }

    const directive = {
        id: 'prevent-popup',
        js,
        matches: matchesFromHostnames(matches),
        excludeMatches: matchesFromHostnames(excludeMatches),
        runAt: 'document_start',
    };
    if (
        SKIP_SAFARI_BROAD_CONTENT_SCRIPTS &&
        directive.matches.includes('<all_urls>')
    ) {
        return;
    }
    context.toAdd.push(directive);
}

/******************************************************************************/

export async function setPopupBlockMode(state, force = false) {
    const newState = Boolean(state);
    if ( force === false ) {
        if ( newState === runtimeSettings.popupBlockMode ) { return; }
    }
    runtimeSettings.popupBlockMode = state;
    await saveRuntimeSettings();
}
