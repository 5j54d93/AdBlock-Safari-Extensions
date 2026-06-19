/*******************************************************************************

    AdBlock

    Content-script CSS insertion helper.

*/

((api) => {
    if ( api instanceof Object ) { return; }

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
