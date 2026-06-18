/*******************************************************************************

    AdBlock

    Shared guard for Google Search compatibility.

*/

(function adblockGoogleSearchGuard() {

'use strict';

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

if ( self.__adblockSkipGoogleSearch === true ) { return; }
self.__adblockSkipGoogleSearch = isGoogleSearchPage();

})();
