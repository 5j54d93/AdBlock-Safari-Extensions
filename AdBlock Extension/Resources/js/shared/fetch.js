/*******************************************************************************

    AdBlock

    JSON fetch helper for bundled extension resources.

*/

import { adblockErr } from './logger.js';

/******************************************************************************/

export async function fetchJSON(path) {
    const resourcePath = path.endsWith('.json') ? path : `${path}.json`;
    try {
        const response = await fetch(resourcePath);
        if ( response.ok !== true ) {
            throw new Error(`${response.status} ${response.statusText}`);
        }
        return response.json();
    } catch (reason) {
        adblockErr(`fetchJSON/${resourcePath}: ${reason}`);
    }
}
