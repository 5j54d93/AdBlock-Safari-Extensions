/*******************************************************************************

    AdBlock

    Compatibility shim for redirected Amazon ad scripts.

*/

(function adblockAmazonAdsShim() {

'use strict';

if ( window.amznads?.__adblockShim === true ) { return; }

const noop = function adblockNoop() {};
const emptyArray = () => [];
const emptyObject = () => ({});
const emptyString = () => '';
const falseValue = () => false;

function callbackWithEmptyResult(...args) {
    const callback = args.find(arg => arg instanceof Function);
    if ( callback ) {
        setTimeout(() => {
            try { callback([]); } catch {}
        }, 1);
    }
    return [];
}

window.amznads = {
    __adblockShim: true,
    appendScriptTag: noop,
    appendTargetingToAdServerUrl(url) { return url || ''; },
    appendTargetingToQueryString(query) { return query || ''; },
    clearTargetingFromGPTAsync: noop,
    doAllTasks: callbackWithEmptyResult,
    doGetAdsAsync: callbackWithEmptyResult,
    doTask: callbackWithEmptyResult,
    detectIframeAndGetURL: emptyString,
    getAds: emptyArray,
    getAdsAsync: callbackWithEmptyResult,
    getAdForSlot: emptyObject,
    getAdsCallback: callbackWithEmptyResult,
    getDisplayAds: emptyArray,
    getDisplayAdsAsync: callbackWithEmptyResult,
    getDisplayAdsCallback: callbackWithEmptyResult,
    getKeys: emptyArray,
    getReferrerURL: emptyString,
    getScriptSource: emptyString,
    getTargeting: emptyObject,
    getTokens: emptyArray,
    getValidMilliseconds: () => 0,
    getVideoAds: emptyArray,
    getVideoAdsAsync: callbackWithEmptyResult,
    getVideoAdsCallback: callbackWithEmptyResult,
    handleCallBack: callbackWithEmptyResult,
    hasAds: falseValue,
    renderAd: noop,
    saveAds: noop,
    setTargeting: noop,
    setTargetingForGPTAsync: noop,
    setTargetingForGPTSync: noop,
    tryGetAdsAsync: callbackWithEmptyResult,
    updateAds: noop,
};

window.amzn_ads = window.amzn_ads || noop;
window.aax_write = window.aax_write || noop;
window.aax_render_ad = window.aax_render_ad || noop;

})();
