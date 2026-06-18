/*******************************************************************************

    AdBlock

    Per-tab toolbar icon toggle bridge.

*/

if ( self.__adblockSkipGoogleSearch !== true ) {

function isGoogleSearchPage() {
    const { hostname, pathname, search } = document.location;
    const normalizedHostname = String(hostname || '').toLowerCase();
    const isGoogle =
        normalizedHostname === 'google.com' ||
        /(^|\.)google\.[a-z.]+$/.test(normalizedHostname);

    if ( isGoogle === false ) { return false; }
    if ( pathname === '/search' || pathname === '/webhp' ) { return true; }
    return pathname === '/' && /(?:^|[?&])q=/.test(search);
}

function reportGoogleSearchSkip() {
    try {
        chrome.runtime.sendMessage({
            what: 'googleSearchContentScriptSkipped',
            scriptName: 'toolbar-icon',
            url: document.location.href,
        }).catch(( ) => {});
    } catch {
    }
}

if ( isGoogleSearchPage() ) {
    reportGoogleSearchSkip();
} else {
    chrome.runtime.sendMessage({
        what: 'toggleToolbarIcon',
    }).catch(( ) => {});
}

}
