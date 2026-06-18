/*******************************************************************************

    AdBlock

    Closes popup windows matched by enabled popup-blocking rules.

*/

(function preventMatchedPopup() {
    if ( self.__adblockSkipGoogleSearch === true ) {
        self.preventPopupTarget = undefined;
        return;
    }

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
                scriptName: 'prevent-popup',
                url: document.location.href,
            }).catch(( ) => {});
        } catch {
        }
    }

    if ( isGoogleSearchPage() ) {
        reportGoogleSearchSkip();
        self.preventPopupTarget = undefined;
        return;
    }

    if ( self !== self.top ) { return; }

    const details = self.preventPopupDetails;
    if ( Array.isArray(details) === false ) { return; }
    self.preventPopupDetails = undefined;

    const target = self.preventPopupTarget;
    if ( target instanceof Location === false ) { return; }

    const href = target.href;
    const hostnames = target.hostname
        .split('.')
        .map((part, index, parts) => parts.slice(index).join('.'));

    function hostnameMatches(sortedHostnames = []) {
        for ( const hostname of hostnames ) {
            if ( sortedHostnames.includes(hostname) ) { return true; }
        }
        return false;
    }

    function regexMatches(regexes = []) {
        for ( let i = 0; i < regexes.length; i += 2 ) {
            const key = regexes[i] || '';
            const source = regexes[i + 1] || '';
            if ( key !== '' && href.includes(key.slice(1)) === false ) { continue; }
            try {
                if ( new RegExp(source, key.charAt(0).trimEnd()).test(href) ) {
                    return true;
                }
            } catch {
            }
        }
        return false;
    }

    function matchesGroup(group) {
        return hostnameMatches(group?.hostnames) || regexMatches(group?.regexes);
    }

    let blocked = details.some(entry => matchesGroup(entry.block));
    if ( blocked === false ) { return; }

    blocked = details.some(entry => matchesGroup(entry.allow)) === false;
    if ( blocked ) {
        self.close();
    }
})();
