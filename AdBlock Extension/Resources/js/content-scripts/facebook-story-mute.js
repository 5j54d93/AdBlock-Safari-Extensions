/*******************************************************************************

    AdBlock

    Keeps Facebook Stories muted so they cannot auto-play with sound.

*/

(function adblockFacebookStoryMute() {

'use strict';

if ( self.__adblockFacebookStoryMute === true ) { return; }
try {
    Object.defineProperty(self, '__adblockFacebookStoryMute', { value: true });
} catch {
    self.__adblockFacebookStoryMute = true;
}

if (
    location.hostname !== 'facebook.com' &&
    location.hostname.endsWith('.facebook.com') === false
) {
    return;
}

/******************************************************************************/

const MEDIA_SELECTOR = 'video,audio';
const MEDIA_EVENTS = [
    'canplay',
    'loadedmetadata',
    'play',
    'playing',
    'volumechange',
];

let muteObserver;
let pendingMute = false;

/******************************************************************************/

function defer(callback) {
    return typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(callback)
        : setTimeout(callback, 0);
}

function isStoriesPage() {
    const path = location.pathname.toLowerCase();
    return path === '/stories' || path.startsWith('/stories/');
}

function isMediaElement(node) {
    return typeof HTMLMediaElement !== 'undefined' &&
        node instanceof HTMLMediaElement;
}

function muteMedia(media) {
    if ( isMediaElement(media) === false ) { return; }

    try {
        media.defaultMuted = true;
    } catch {
    }

    try {
        if ( media.muted !== true ) {
            media.muted = true;
        }
    } catch {
    }

    try {
        if ( media.volume !== 0 ) {
            media.volume = 0;
        }
    } catch {
    }
}

function muteMediaIn(root) {
    if ( isStoriesPage() === false ) { return; }

    if ( isMediaElement(root) ) {
        muteMedia(root);
    }

    if ( typeof root.querySelectorAll !== 'function' ) { return; }
    for ( const media of root.querySelectorAll(MEDIA_SELECTOR) ) {
        muteMedia(media);
    }
}

function scheduleMute(root = document) {
    if ( isStoriesPage() === false || pendingMute ) { return; }
    pendingMute = true;

    defer(() => {
        pendingMute = false;
        muteMediaIn(root);
    });
}

function handleMediaEvent(event) {
    if ( isStoriesPage() === false ) { return; }
    muteMedia(event.target);
}

function handleMutations(mutations) {
    if ( isStoriesPage() === false ) { return; }

    for ( const mutation of mutations ) {
        for ( const node of mutation.addedNodes ) {
            muteMediaIn(node);
        }
    }
}

function installMediaGuards() {
    for ( const eventName of MEDIA_EVENTS ) {
        document.addEventListener(eventName, handleMediaEvent, true);
    }
}

function installMutationObserver() {
    const root = document.documentElement || document;
    if ( root === null || typeof MutationObserver !== 'function' ) { return; }

    muteObserver = new MutationObserver(handleMutations);
    muteObserver.observe(root, {
        childList: true,
        subtree: true,
    });
}

function installNavigationGuards() {
    const onLocationChange = () => {
        scheduleMute();
    };

    for ( const name of [ 'pushState', 'replaceState' ] ) {
        const original = history[name];
        if ( typeof original !== 'function' ) { continue; }

        try {
            history[name] = new Proxy(original, {
                apply(target, thisArg, args) {
                    const out = Reflect.apply(target, thisArg, args);
                    setTimeout(onLocationChange, 0);
                    return out;
                },
            });
        } catch {
        }
    }

    addEventListener('hashchange', onLocationChange, true);
    addEventListener('popstate', onLocationChange, true);
}

/******************************************************************************/

installMediaGuards();
installMutationObserver();
installNavigationGuards();

if ( document.readyState === 'loading' ) {
    document.addEventListener('DOMContentLoaded', () => scheduleMute(), { once: true });
} else {
    scheduleMute();
}

/******************************************************************************/

})();

void 0;
