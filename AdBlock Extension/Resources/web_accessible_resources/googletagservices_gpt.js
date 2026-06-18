/*******************************************************************************

    AdBlock

    Compatibility shim for redirected Google Publisher Tag scripts.

*/

(function adblockGptShim() {

'use strict';

const noop = function adblockNoop() {};
const returnThis = function adblockReturnThis() { return this; };
const returnNull = function adblockReturnNull() { return null; };
const returnArray = function adblockReturnArray() { return []; };
const returnString = function adblockReturnString() { return ''; };

function PassbackSlot() {}
PassbackSlot.prototype.display = noop;
PassbackSlot.prototype.get = returnNull;
PassbackSlot.prototype.set = returnThis;
PassbackSlot.prototype.setClickUrl = returnThis;
PassbackSlot.prototype.setTagForChildDirectedTreatment = returnThis;
PassbackSlot.prototype.setTargeting = returnThis;
PassbackSlot.prototype.updateTargetingFromMap = returnThis;

function Slot(adUnitPath = '', size = [], id = '') {
    this.adUnitPath = adUnitPath;
    this.size = size;
    this.id = id;
}
Slot.prototype.addService = returnThis;
Slot.prototype.clearCategoryExclusions = returnThis;
Slot.prototype.clearTargeting = returnThis;
Slot.prototype.defineSizeMapping = returnThis;
Slot.prototype.get = returnNull;
Slot.prototype.getAdUnitPath = function getAdUnitPath() { return this.adUnitPath; };
Slot.prototype.getAttributeKeys = returnArray;
Slot.prototype.getCategoryExclusions = returnArray;
Slot.prototype.getDomId = function getDomId() { return this.id; };
Slot.prototype.getResponseInformation = returnNull;
Slot.prototype.getSlotElementId = function getSlotElementId() { return this.id; };
Slot.prototype.getSlotId = returnThis;
Slot.prototype.getTargeting = returnArray;
Slot.prototype.getTargetingKeys = returnArray;
Slot.prototype.set = returnThis;
Slot.prototype.setCategoryExclusion = returnThis;
Slot.prototype.setClickUrl = returnThis;
Slot.prototype.setCollapseEmptyDiv = returnThis;
Slot.prototype.setTargeting = returnThis;
Slot.prototype.updateTargetingFromMap = returnThis;

function SizeMappingBuilder() {
    this.sizes = [];
}
SizeMappingBuilder.prototype.addSize = function addSize(viewport, sizes) {
    this.sizes.push([ viewport, sizes ]);
    return this;
};
SizeMappingBuilder.prototype.build = function build() {
    return this.sizes.slice();
};

const companionAdsService = {
    addEventListener: returnThis,
    enableSyncLoading: noop,
    setRefreshUnfilledSlots: noop,
};

const contentService = {
    addEventListener: returnThis,
    setContent: noop,
};

const pubAdsService = {
    addEventListener: returnThis,
    clear: noop,
    clearCategoryExclusions: returnThis,
    clearTagForChildDirectedTreatment: returnThis,
    clearTargeting: returnThis,
    collapseEmptyDivs: noop,
    defineOutOfPagePassback: () => new PassbackSlot(),
    definePassback: () => new PassbackSlot(),
    disableInitialLoad: noop,
    display: noop,
    enableAsyncRendering: noop,
    enableLazyLoad: noop,
    enableSingleRequest: noop,
    enableSyncRendering: noop,
    enableVideoAds: noop,
    get: returnNull,
    getAttributeKeys: returnArray,
    getTargeting: returnArray,
    getTargetingKeys: returnArray,
    getSlots: returnArray,
    refresh: noop,
    removeEventListener: noop,
    set: returnThis,
    setCategoryExclusion: returnThis,
    setCentering: noop,
    setCookieOptions: returnThis,
    setForceSafeFrame: returnThis,
    setLocation: returnThis,
    setPublisherProvidedId: returnThis,
    setPrivacySettings: returnThis,
    setRequestNonPersonalizedAds: returnThis,
    setSafeFrameConfig: returnThis,
    setTagForChildDirectedTreatment: returnThis,
    setTargeting: returnThis,
    setVideoContent: returnThis,
    updateCorrelator: noop,
};

const gpt = window.googletag || {};
const queued = Array.isArray(gpt.cmd) ? gpt.cmd.slice() : [];

gpt.apiReady = true;
gpt.pubadsReady = true;
gpt.cmd = [];
gpt.cmd.push = function push(callback) {
    if ( callback instanceof Function ) {
        try { callback(); } catch {}
    }
    return gpt.cmd.length;
};
gpt.companionAds = () => companionAdsService;
gpt.content = () => contentService;
gpt.defineOutOfPageSlot = (adUnitPath, id) => new Slot(adUnitPath, [], id);
gpt.defineSlot = (adUnitPath, size, id) => new Slot(adUnitPath, size, id);
gpt.destroySlots = noop;
gpt.disablePublisherConsole = noop;
gpt.display = noop;
gpt.enableServices = noop;
gpt.getVersion = returnString;
gpt.pubads = () => pubAdsService;
gpt.setAdIframeTitle = noop;
gpt.sizeMapping = () => new SizeMappingBuilder();

window.googletag = gpt;

for ( const callback of queued ) {
    gpt.cmd.push(callback);
}

})();
