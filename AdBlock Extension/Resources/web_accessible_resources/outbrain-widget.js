/*******************************************************************************

    AdBlock

    Compatibility shim for redirected Outbrain widget scripts.

*/

(function adblockOutbrainShim() {

'use strict';

const noop = function adblockNoop() {};
const obr = window.OBR || {};

const methods = [
    'callClick',
    'callLoadMore',
    'callRecs',
    'callUserZapping',
    'callWhatIs',
    'cancelRecommendation',
    'cancelRecs',
    'closeCard',
    'closeModal',
    'closeTbx',
    'errorInjectionHandler',
    'getCountOfRecs',
    'getStat',
    'imageError',
    'manualVideoClicked',
    'onOdbReturn',
    'onVideoClick',
    'pagerLoad',
    'recClicked',
    'refreshSpecificWidget',
    'renderSpaWidgets',
    'refreshWidget',
    'reloadWidget',
    'researchWidget',
    'returnedError',
    'returnedHtmlData',
    'returnedIrdData',
    'returnedJsonData',
    'scrollLoad',
    'showDescription',
    'showRecInIframe',
    'userZappingMessage',
    'zappingFormAction',
];

obr.extern = obr.extern || {};
obr.extern.video = obr.extern.video || {};
obr.extern.video.getVideoRecs = noop;
obr.extern.video.videoClicked = noop;

for ( const method of methods ) {
    obr.extern[method] = noop;
}

window.OBR = obr;

})();
