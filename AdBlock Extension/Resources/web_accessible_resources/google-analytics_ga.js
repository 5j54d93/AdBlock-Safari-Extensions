/*******************************************************************************

    AdBlock

    Compatibility shim for redirected Google Analytics ga.js scripts.

*/

(function adblockGaJsShim() {

'use strict';

const noop = function adblockNoop() {};

function maybeNavigate(url) {
    if ( typeof url !== 'string' || url === '' ) { return; }
    try { window.location.assign(url); } catch {}
}

const trackerMethods = `
    _addIgnoredOrganic _addIgnoredRef _addItem _addOrganic _addTrans
    _clearIgnoredOrganic _clearIgnoredRef _clearOrganic _cookiePathCopy
    _deleteCustomVar _getName _setAccount _getAccount _getClientInfo
    _getDetectFlash _getDetectTitle _getLocalGifPath _getServiceMode
    _getVersion _getVisitorCustomVar _initData _linkByPost _setAllowAnchor
    _setAllowHash _setAllowLinker _setCampContentKey _setCampMediumKey
    _setCampNameKey _setCampNOKey _setCampSourceKey _setCampTermKey
    _setCampaignCookieTimeout _setCampaignTrack _setClientInfo _setCookiePath
    _setCookiePersistence _setCookieTimeout _setCustomVar _setDetectFlash
    _setDetectTitle _setDomainName _setLocalGifPath _setLocalRemoteServerMode
    _setLocalServerMode _setReferrerOverride _setRemoteServerMode _setSampleRate
    _setSessionTimeout _setSiteSpeedSampleRate _setSessionCookieTimeout _setVar
    _setVisitorCookieTimeout _trackEvent _trackPageLoadTime _trackPageview
    _trackSocial _trackTiming _trackTrans _visitCode
`.trim().split(/\s+/);

const tracker = {};
for ( const method of trackerMethods ) {
    tracker[method] = noop;
}
tracker._getLinkerUrl = url => url;
tracker._link = maybeNavigate;

function Gat() {}
Gat.prototype._anonymizeIP = noop;
Gat.prototype._createTracker = noop;
Gat.prototype._forceSSL = noop;
Gat.prototype._getPlugin = noop;
Gat.prototype._getTracker = () => tracker;
Gat.prototype._getTrackerByName = () => tracker;
Gat.prototype._getTrackers = noop;
Gat.prototype.aa = noop;
Gat.prototype.ab = noop;
Gat.prototype.hb = noop;
Gat.prototype.la = noop;
Gat.prototype.oa = noop;
Gat.prototype.pa = noop;
Gat.prototype.u = noop;

function Gaq() {}
Gaq.prototype.Na = noop;
Gaq.prototype.O = noop;
Gaq.prototype.Sa = noop;
Gaq.prototype.Ta = noop;
Gaq.prototype.Va = noop;
Gaq.prototype._createAsyncTracker = noop;
Gaq.prototype._getAsyncTracker = noop;
Gaq.prototype._getPlugin = noop;
Gaq.prototype.push = function push(entry) {
    if ( entry instanceof Function ) {
        try { entry(); } catch {}
        return;
    }
    if ( Array.isArray(entry) === false ) { return; }
    if ( typeof entry[0] === 'string' && /(^|\.)_link$/.test(entry[0]) ) {
        maybeNavigate(entry[1]);
    }
    if ( entry[0] === '_set' && entry[1] === 'hitCallback' && entry[2] instanceof Function ) {
        try { entry[2](); } catch {}
    }
};

const gaq = new Gaq();
const previousQueue = window._gaq;
if ( Array.isArray(previousQueue) ) {
    while ( previousQueue.length !== 0 ) {
        gaq.push(previousQueue.shift());
    }
}

window._gat = new Gat();
window._gaq = gaq;
gaq.qf = gaq;

})();
