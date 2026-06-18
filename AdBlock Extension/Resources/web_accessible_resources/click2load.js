/*******************************************************************************

    AdBlock

    Click-to-load placeholder for redirected embedded content.

*/

/******************************************************************************/

const qs$ = selector => document.querySelector(selector);

function firstValue(params, names) {
    for ( const name of names ) {
        const value = params.get(name);
        if ( typeof value === 'string' && value.trim() !== '' ) {
            return value.trim();
        }
    }
    return '';
}

function toURL(value) {
    if ( value === '' ) { return undefined; }
    try {
        const url = new URL(value);
        if ( url.protocol === 'http:' || url.protocol === 'https:' ) {
            return url;
        }
    } catch {
    }
    return undefined;
}

function displayNameFor(url, alias = '') {
    if ( alias !== '' ) {
        const aliasURL = toURL(alias);
        return aliasURL?.hostname || alias;
    }
    return url?.hostname || '來源網址無法取得';
}

function init() {
    const params = new URLSearchParams(location.search);
    const targetURL = toURL(firstValue(params, [ 'url', 'target', 'src' ]));
    const alias = firstValue(params, [ 'aliasURL', 'alias' ]);
    const clickToLoad = qs$('#clickToLoad');
    const frameURL = qs$('#frameURL span');
    const openFrame = qs$('#openFrame');

    if ( frameURL !== null ) {
        frameURL.textContent = displayNameFor(targetURL, alias);
    }

    if ( targetURL === undefined ) {
        if ( clickToLoad !== null ) {
            clickToLoad.textContent = '無法載入';
            clickToLoad.disabled = true;
        }
        return;
    }

    if ( clickToLoad !== null ) {
        clickToLoad.disabled = false;
        clickToLoad.addEventListener('click', event => {
            if ( event.isTrusted !== true ) { return; }
            location.replace(targetURL.href);
        });
    }

    if ( openFrame !== null ) {
        openFrame.href = targetURL.href;
        openFrame.hidden = false;
    }
}

/******************************************************************************/

init();
