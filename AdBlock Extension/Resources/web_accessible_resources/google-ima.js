/*******************************************************************************

    AdBlock

    Compatibility shim for redirected Google Interactive Media Ads scripts.

*/

(function adblockGoogleImaShim() {

'use strict';

if ( window.google?.ima?.VERSION ) { return; }

const VERSION = '3.0.0';
const ima = {};

function noop() {}

function nextFrame(callback) {
    if ( self.requestAnimationFrame instanceof Function ) {
        self.requestAnimationFrame(callback);
        return;
    }
    setTimeout(callback, 0);
}

function callSafely(callback, thisArg, ...args) {
    if ( callback instanceof Function === false ) { return; }
    try {
        callback.apply(thisArg, args);
    } catch {
    }
}

class EventDispatcher {
    constructor() {
        this.listeners = new Map();
    }

    addEventListener(types, listener, _capture, context) {
        if ( listener instanceof Function === false ) { return; }
        const list = Array.isArray(types) ? types : [ types ];
        for ( const type of list ) {
            if ( this.listeners.has(type) === false ) {
                this.listeners.set(type, new Map());
            }
            this.listeners.get(type).set(listener, {
                context: context || this,
                listener,
            });
        }
    }

    removeEventListener(types, listener) {
        const list = Array.isArray(types) ? types : [ types ];
        for ( const type of list ) {
            this.listeners.get(type)?.delete(listener);
        }
    }

    dispatch(event) {
        const entries = Array.from(this.listeners.get(event.type)?.values() || []);
        for ( const entry of entries ) {
            callSafely(entry.listener, entry.context, event);
        }
    }
}

class AdDisplayContainer {
    constructor(containerElement, videoElement, clickTrackingElement) {
        this.containerElement = containerElement || null;
        this.videoElement = videoElement || null;
        this.clickTrackingElement = clickTrackingElement || null;

        if ( this.containerElement?.appendChild instanceof Function ) {
            const node = document.createElement('div');
            node.style.setProperty('display', 'none', 'important');
            node.style.setProperty('visibility', 'hidden', 'important');
            this.containerElement.appendChild(node);
            this.placeholder = node;
        }
    }

    destroy() {
        this.placeholder?.remove?.();
        this.placeholder = null;
    }

    initialize() {}
}

class ImaSdkSettings {
    constructor() {
        this.cookiesEnabled = true;
        this.disableCustomPlayback = false;
        this.featureFlags = {};
        this.locale = '';
        this.numRedirects = 0;
        this.playerType = '';
        this.playerVersion = '';
        this.ppid = '';
    }

    getCompanionBackfill() {}
    getDisableCustomPlaybackForIOS10Plus() { return this.disableCustomPlayback; }
    getDisableFlashAds() {}
    getFeatureFlags() { return this.featureFlags; }
    getLocale() { return this.locale; }
    getNumRedirects() { return this.numRedirects; }
    getPlayerType() { return this.playerType; }
    getPlayerVersion() { return this.playerVersion; }
    getPpid() { return this.ppid; }
    isCookiesEnabled() { return this.cookiesEnabled; }
    setAutoPlayAdBreaks() {}
    setCompanionBackfill() {}
    setCookiesEnabled(value) { this.cookiesEnabled = Boolean(value); }
    setDisableCustomPlaybackForIOS10Plus(value) { this.disableCustomPlayback = Boolean(value); }
    setDisableFlashAds() {}
    setFeatureFlags(value) { this.featureFlags = value || {}; }
    setLocale(value) { this.locale = String(value || ''); }
    setNumRedirects(value) { this.numRedirects = Number(value) || 0; }
    setPlayerType(value) { this.playerType = String(value || ''); }
    setPlayerVersion(value) { this.playerVersion = String(value || ''); }
    setPpid(value) { this.ppid = String(value || ''); }
    setSessionId() {}
    setVpaidAllowed() {}
    setVpaidMode() {}
}

ImaSdkSettings.CompanionBackfillMode = {
    ALWAYS: 'always',
    ON_MASTER_AD: 'on_master_ad',
};
ImaSdkSettings.VpaidMode = {
    DISABLED: 0,
    ENABLED: 1,
    INSECURE: 2,
};

class AdsRequest {
    constructor() {
        this.adWillAutoPlay = false;
        this.adWillPlayMuted = false;
        this.continuousPlayback = false;
    }

    setAdWillAutoPlay(value) { this.adWillAutoPlay = Boolean(value); }
    setAdWillPlayMuted(value) { this.adWillPlayMuted = Boolean(value); }
    setContinuousPlayback(value) { this.continuousPlayback = Boolean(value); }
}

class AdsRenderingSettings {
    constructor() {
        this.enablePreloading = false;
    }
}

class AdPodInfo {
    getAdPosition() { return 1; }
    getIsBumper() { return false; }
    getMaxDuration() { return -1; }
    getPodIndex() { return 1; }
    getTimeOffset() { return 0; }
    getTotalAds() { return 1; }
}

class UniversalAdIdInfo {
    getAdIdRegistry() { return ''; }
    getAdIdValue() { return ''; }
}

class CompanionAd {
    getAdSlotId() { return ''; }
    getContent() { return ''; }
    getContentType() { return ''; }
    getHeight() { return 1; }
    getWidth() { return 1; }
}

class Ad {
    constructor() {
        this.podInfo = new AdPodInfo();
    }

    getAdId() { return ''; }
    getAdPodInfo() { return this.podInfo; }
    getAdSystem() { return ''; }
    getAdvertiserName() { return ''; }
    getApiFramework() { return null; }
    getCompanionAds() { return []; }
    getContentType() { return ''; }
    getCreativeAdId() { return ''; }
    getCreativeId() { return ''; }
    getDealId() { return ''; }
    getDescription() { return ''; }
    getDuration() { return 0; }
    getHeight() { return 0; }
    getMediaUrl() { return null; }
    getMinSuggestedDuration() { return -1; }
    getSkipTimeOffset() { return -1; }
    getSurveyUrl() { return null; }
    getTitle() { return ''; }
    getTraffickingParameters() { return {}; }
    getTraffickingParametersString() { return ''; }
    getUiElements() { return []; }
    getUniversalAdIdRegistry() { return 'unknown'; }
    getUniversalAdIds() { return [ new UniversalAdIdInfo() ]; }
    getUniversalAdIdValue() { return 'unknown'; }
    getVastMediaBitrate() { return 0; }
    getVastMediaHeight() { return 0; }
    getVastMediaWidth() { return 0; }
    getWidth() { return 0; }
    getWrapperAdIds() { return []; }
    getWrapperAdSystems() { return []; }
    getWrapperCreativeIds() { return []; }
    isLinear() { return true; }
    isSkippable() { return true; }
}

class AdError {
    constructor(type = 'adPlayError', code = 1205, vastCode = 1205, message = '', request, context) {
        this.type = type;
        this.errorCode = code;
        this.vastErrorCode = vastCode;
        this.message = message || 'Ad playback was skipped by AdBlock.';
        this.adsRequest = request;
        this.userRequestContext = context;
    }

    getErrorCode() { return this.errorCode; }
    getInnerError() { return null; }
    getMessage() { return this.message; }
    getType() { return this.type; }
    getVastErrorCode() { return this.vastErrorCode; }
    toString() { return `AdError ${this.errorCode}: ${this.message}`; }
}

AdError.ErrorCode = {
    UNKNOWN_ERROR: 900,
};
AdError.Type = {
    AD_LOAD: 'adLoadError',
    AD_PLAY: 'adPlayError',
};

class AdEvent {
    constructor(type, ad = currentAd) {
        this.type = type;
        this.ad = ad;
    }

    getAd() { return this.ad; }
    getAdData() { return {}; }
}

AdEvent.Type = {
    AD_BREAK_READY: 'adBreakReady',
    AD_BUFFERING: 'adBuffering',
    AD_CAN_PLAY: 'adCanPlay',
    AD_METADATA: 'adMetadata',
    AD_PROGRESS: 'adProgress',
    ALL_ADS_COMPLETED: 'allAdsCompleted',
    CLICK: 'click',
    COMPLETE: 'complete',
    CONTENT_PAUSE_REQUESTED: 'contentPauseRequested',
    CONTENT_RESUME_REQUESTED: 'contentResumeRequested',
    DURATION_CHANGE: 'durationChange',
    EXPANDED_CHANGED: 'expandedChanged',
    FIRST_QUARTILE: 'firstQuartile',
    IMPRESSION: 'impression',
    INTERACTION: 'interaction',
    LINEAR_CHANGE: 'linearChange',
    LINEAR_CHANGED: 'linearChanged',
    LOADED: 'loaded',
    LOG: 'log',
    MIDPOINT: 'midpoint',
    PAUSED: 'pause',
    RESUMED: 'resume',
    SKIPPABLE_STATE_CHANGED: 'skippableStateChanged',
    SKIPPED: 'skip',
    STARTED: 'start',
    THIRD_QUARTILE: 'thirdQuartile',
    USER_CLOSE: 'userClose',
    VIDEO_CLICKED: 'videoClicked',
    VIDEO_ICON_CLICKED: 'videoIconClicked',
    VIEWABLE_IMPRESSION: 'viewable_impression',
    VOLUME_CHANGED: 'volumeChange',
    VOLUME_MUTED: 'mute',
};

class AdErrorEvent {
    constructor(error, context) {
        this.type = AdErrorEvent.Type.AD_ERROR;
        this.error = error;
        this.userRequestContext = context;
    }

    getError() { return this.error; }
    getUserRequestContext() {
        return this.userRequestContext || this.error?.userRequestContext || {};
    }
}

AdErrorEvent.Type = {
    AD_ERROR: 'adError',
};

class AdsManager extends EventDispatcher {
    constructor() {
        super();
        this.volume = 1;
        this.preloadingEnabled = false;
    }

    collapse() {}
    configureAdsManager() {}
    destroy() { this.listeners.clear(); }
    discardAdBreak() {}
    expand() {}
    focus() {}
    getAdSkippableState() { return false; }
    getCuePoints() { return [ 0 ]; }
    getCurrentAd() { return currentAd; }
    getCurrentAdCuePoints() { return []; }
    getRemainingTime() { return 0; }
    getVolume() { return this.volume; }
    init() {
        if ( this.preloadingEnabled ) {
            this.dispatch(new AdEvent(AdEvent.Type.LOADED));
        }
    }
    isCustomClickTrackingUsed() { return false; }
    isCustomPlaybackUsed() { return false; }
    pause() {}
    requestNextAdBreak() {}
    resize() {}
    resume() {}
    setVolume(value) { this.volume = Number(value) || 0; }
    skip() {}
    start() {
        nextFrame(() => {
            for ( const type of [
                AdEvent.Type.LOADED,
                AdEvent.Type.CONTENT_PAUSE_REQUESTED,
                AdEvent.Type.STARTED,
                AdEvent.Type.IMPRESSION,
                AdEvent.Type.FIRST_QUARTILE,
                AdEvent.Type.MIDPOINT,
                AdEvent.Type.THIRD_QUARTILE,
                AdEvent.Type.COMPLETE,
                AdEvent.Type.ALL_ADS_COMPLETED,
                AdEvent.Type.CONTENT_RESUME_REQUESTED,
            ] ) {
                this.dispatch(new AdEvent(type));
            }
        });
    }
    stop() {}
    updateAdsRenderingSettings() {}
}

class AdsManagerLoadedEvent {
    constructor(type, request, context) {
        this.type = type;
        this.adsRequest = request;
        this.userRequestContext = context;
    }

    getAdsManager(_contentPlayback, settings) {
        if ( settings?.enablePreloading ) {
            sharedAdsManager.preloadingEnabled = true;
        }
        return sharedAdsManager;
    }

    getUserRequestContext() {
        return this.userRequestContext || {};
    }
}

AdsManagerLoadedEvent.Type = {
    ADS_MANAGER_LOADED: 'adsManagerLoaded',
};

class AdsLoader extends EventDispatcher {
    constructor() {
        super();
        this.settings = new ImaSdkSettings();
    }

    contentComplete() {}
    destroy() { this.listeners.clear(); }
    getSettings() { return this.settings; }
    getVersion() { return VERSION; }
    requestAds(request, context) {
        nextFrame(() => {
            this.dispatch(new AdsManagerLoadedEvent(
                AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
                request,
                context
            ));
        });

        nextFrame(() => {
            const error = new AdError(
                AdError.Type.AD_PLAY,
                1205,
                1205,
                'Ad playback was skipped by AdBlock.',
                request,
                context
            );
            this.dispatch(new AdErrorEvent(error, context));
        });
    }
}

class CompanionAdSelectionSettings {}
CompanionAdSelectionSettings.CreativeType = {
    ALL: 'All',
    FLASH: 'Flash',
    IMAGE: 'Image',
};
CompanionAdSelectionSettings.ResourceType = {
    ALL: 'All',
    HTML: 'Html',
    IFRAME: 'IFrame',
    STATIC: 'Static',
};
CompanionAdSelectionSettings.SizeCriteria = {
    IGNORE: 'IgnoreSize',
    SELECT_EXACT_MATCH: 'SelectExactMatch',
    SELECT_NEAR_MATCH: 'SelectNearMatch',
};

class CustomContentLoadedEvent {}
CustomContentLoadedEvent.Type = {
    CUSTOM_CONTENT_LOADED: 'deprecated-event',
};

class AdCuePoints {
    getCuePoints() { return []; }
}

class AdProgressData {}

const currentAd = new Ad();
const sharedAdsManager = new AdsManager();

Object.assign(ima, {
    AdCuePoints,
    AdDisplayContainer,
    AdError,
    AdErrorEvent,
    AdEvent,
    AdPodInfo,
    AdProgressData,
    AdsLoader,
    AdsManager: sharedAdsManager,
    AdsManagerLoadedEvent,
    AdsRenderingSettings,
    AdsRequest,
    CompanionAd,
    CompanionAdSelectionSettings,
    CustomContentLoadedEvent,
    gptProxyInstance: {},
    ImaSdkSettings,
    OmidAccessMode: {
        DOMAIN: 'domain',
        FULL: 'full',
        LIMITED: 'limited',
    },
    OmidVerificationVendor: {
        1: 'OTHER',
        2: 'GOOGLE',
        GOOGLE: 2,
        OTHER: 1,
    },
    settings: new ImaSdkSettings(),
    UiElements: {
        AD_ATTRIBUTION: 'adAttribution',
        COUNTDOWN: 'countdown',
    },
    UniversalAdIdInfo,
    VERSION,
    ViewMode: {
        FULLSCREEN: 'fullscreen',
        NORMAL: 'normal',
    },
});

window.google = window.google || {};
window.google.ima = ima;

})();
