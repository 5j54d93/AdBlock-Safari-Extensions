/*******************************************************************************

    AdBlock

    Content-script CSS insertion helper.

*/

((api) => {
    if ( api instanceof Object ) { return; }
    if ( self.__adblockSkipGoogleSearch === true ) { return; }

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
                scriptName: 'css-api',
                url: document.location.href,
            }).catch(( ) => {});
        } catch {
        }
    }

    if ( isGoogleSearchPage() ) {
        reportGoogleSearchSkip();
        return;
    }

    const insertedCSS = new Set();

    function insert(css) {
        if ( typeof css !== 'string' || css === '' ) { return; }
        insertedCSS.add(css);
        chrome.runtime.sendMessage({
            what: 'insertCSS',
            css,
        }).catch(( ) => {});
    }

    self.cssAPI = { insert };

    self.addEventListener('pagereveal', ( ) => {
        const css = Array.from(insertedCSS).join('\n');
        if ( css === '' ) { return; }
        chrome.runtime.sendMessage({
            what: 'insertCSS',
            css,
        }).catch(( ) => {});
    });
})(self.cssAPI);
