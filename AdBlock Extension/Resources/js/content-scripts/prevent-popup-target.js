/*******************************************************************************

    AdBlock

    Captures the popup page URL before popup-blocking rules run.

*/

if ( self.__adblockSkipGoogleSearch === true ) {
    self.preventPopupTarget = undefined;
} else {

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
            scriptName: 'prevent-popup-target',
            url: document.location.href,
        }).catch(( ) => {});
    } catch {
    }
}

if ( isGoogleSearchPage() ) {
    reportGoogleSearchSkip();
    self.preventPopupTarget = undefined;
} else {
    self.preventPopupTarget = document.location;
}

}
