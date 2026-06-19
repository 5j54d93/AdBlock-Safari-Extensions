/*******************************************************************************

    AdBlock

    Per-tab toolbar icon toggle bridge.

*/

chrome.runtime.sendMessage({
    what: 'toggleToolbarIcon',
}).catch(( ) => {});
