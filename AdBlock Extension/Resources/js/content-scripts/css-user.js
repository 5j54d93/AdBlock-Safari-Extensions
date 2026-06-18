/*******************************************************************************

    AdBlock

    Applies user-created cosmetic filters to the current page.

*/

(async function applyUserCSSFilters() {
    if ( self.customFilters ) { return; }
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
                scriptName: 'css-user',
                url: document.location.href,
            }).catch(( ) => {});
        } catch {
        }
    }

    if ( isGoogleSearchPage() ) {
        reportGoogleSearchSkip();
        return;
    }

    async function activate() {
        const pageURL = new URL(document.baseURI);
        const details = await chrome.runtime.sendMessage({
            what: 'injectCustomFilters',
            hostname: pageURL.hostname,
        }).catch(( ) => undefined);

        self.customFilters = details;
        if ( details instanceof Object === false ) { return; }

        if ( details.plainSelectors?.length ) {
            self.cssAPI?.insert(`${details.plainSelectors.join(',\n')}{display:none!important;}`);
        }

        if ( details.proceduralSelectors?.length ) {
            if ( self.ProceduralFiltererAPI === undefined ) {
                self.ProceduralFiltererAPI = chrome.runtime.sendMessage({
                    what: 'injectCSSProceduralAPI',
                }).catch(( ) => undefined);
            }

            await self.ProceduralFiltererAPI;
            if ( typeof self.ProceduralFiltererAPI !== 'function' ) { return; }

            self.customProceduralFiltererAPI = new self.ProceduralFiltererAPI();
            const selectors = details.proceduralSelectors
                .map(selector => {
                    try {
                        return JSON.parse(selector);
                    } catch {
                        return undefined;
                    }
                })
                .filter(Boolean);

            const declarative = selectors.filter(selector => selector.cssable);
            const procedural = selectors.filter(selector => selector.cssable !== true);
            if ( declarative.length ) {
                self.customProceduralFiltererAPI.addDeclaratives(declarative);
            }
            if ( procedural.length ) {
                self.customProceduralFiltererAPI.addProcedurals(procedural);
            }
        }
    }

    async function start() {
        self.cssUserPendingOp ??= Promise.resolve();
        self.cssUserPendingOp = self.cssUserPendingOp.then(activate, activate);
        await self.cssUserPendingOp;
        if ( self.customFilters ) {
            self.removeEventListener('pagereveal', start);
        }
    }

    await start();
    if ( self.customFilters ) { return; }
    self.addEventListener('pagereveal', start);
})();
