/*******************************************************************************

    AdBlock

    Diagnostic snapshot helpers for extension pages.

*/

import {
    runtime,
} from './ext.js';

import {
    RECENT_MATCH_WINDOW_MS,
} from './blocking-stats.js';

/******************************************************************************/

export async function getDiagnosticSnapshot({
    tabId,
    minTimeStamp = Date.now() - RECENT_MATCH_WINDOW_MS,
} = {}) {
    const message = {
        what: 'getDiagnosticSnapshot',
        minTimeStamp,
    };
    if ( Number.isInteger(tabId) ) {
        message.tabId = tabId;
    }

    const result = await runtime.sendMessage(message);
    if ( result?.ok !== true ) {
        throw new Error(result?.error || 'Diagnostic snapshot is unavailable');
    }
    return result;
}

