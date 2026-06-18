/*******************************************************************************

    AdBlock

    Applies generic cosmetic filters when matching ids/classes appear.

*/

(function adblockCssGeneric() {

'use strict';

/******************************************************************************/

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
            scriptName: 'css-generic',
            url: document.location.href,
        }).catch(( ) => {});
    } catch {
    }
}

const selectorMaps = self.genericSelectorMaps ?? [];
self.genericSelectorMaps = undefined;

const genericDetails = self.genericDetails ?? [];
self.genericDetails = undefined;

if ( isGoogleSearchPage() ) {
    reportGoogleSearchSkip();
    return;
}

if (
    document.documentElement === null ||
    self.cssAPI === undefined ||
    self.isolatedAPI === undefined ||
    (selectorMaps.length === 0 && genericDetails.length === 0)
) {
    return;
}

const maxNodesPerSlice = 80;
const maxSliceMs = 5;
const idleStopMs = 30000;

const seenHashes = new Set();
const pendingHashes = new Set();
const pendingNodes = [];
const pendingNodeSet = new Set();
const queuedSelectorText = [];
const exceptionSet = new Set();

let mutationObserver;
let processTimer;
let idleTimer;
let lastChange = Date.now();

/******************************************************************************/

function hashToken(type, value) {
    const text = String(value || '');
    const step = (text.length + 7) >>> 3;
    let hash = ((type << 5) + type) ^ text.length;

    for ( let index = 0; index < text.length; index += step || 1 ) {
        hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
    }

    return hash & 0xFFFF;
}

function enqueueHash(hash) {
    if ( seenHashes.has(hash) ) { return; }
    seenHashes.add(hash);
    pendingHashes.add(hash);
}

function enqueueNode(node) {
    if ( node instanceof Element === false ) { return; }
    if ( pendingNodeSet.has(node) ) { return; }
    pendingNodeSet.add(node);
    pendingNodes.push(node);
}

function scanElement(element) {
    if ( typeof element.id === 'string' && element.id.trim() !== '' ) {
        enqueueHash(hashToken(0x23, element.id.trim()));
    }

    const classText = element.getAttribute('class');
    if ( typeof classText === 'string' && classText !== '' ) {
        for ( const token of classText.split(/\s+/) ) {
            if ( token === '' ) { continue; }
            enqueueHash(hashToken(0x2E, token));
        }
    }
}

function scanNodeTree(root) {
    scanElement(root);
    for ( const element of root.querySelectorAll('[id],[class]') ) {
        scanElement(element);
    }
}

function splitSelectorGroup(text, separator = ',\n') {
    if ( typeof text !== 'string' || text === '' ) { return []; }
    return text
        .split(separator)
        .map(selector => selector.trim())
        .filter(Boolean);
}

function selectorTextWithoutExceptions() {
    const selectors = new Set();

    for ( const text of queuedSelectorText ) {
        for ( const selector of splitSelectorGroup(text)) {
            if ( exceptionSet.has(selector) === false ) {
                selectors.add(selector);
            }
        }
    }

    queuedSelectorText.length = 0;
    return Array.from(selectors).join(',\n');
}

function collectSelectorsForHashes() {
    for ( const hash of pendingHashes ) {
        for ( const selectorMap of selectorMaps ) {
            const selectorText = selectorMap.get(hash);
            if ( selectorText === undefined ) { continue; }
            selectorMap.delete(hash);
            queuedSelectorText.push(selectorText);
        }
    }
    pendingHashes.clear();
}

function applyQueuedSelectors() {
    collectSelectorsForHashes();
    const cssSelectors = selectorTextWithoutExceptions();
    if ( cssSelectors !== '' ) {
        self.cssAPI.insert(`${cssSelectors}{display:none!important;}`);
    }
}

function processPendingNodes() {
    processTimer = undefined;

    const deadline = performance.now() + maxSliceMs;
    let count = 0;

    while ( pendingNodes.length !== 0 && count < maxNodesPerSlice ) {
        const node = pendingNodes.shift();
        pendingNodeSet.delete(node);
        if ( node?.isConnected !== true ) { continue; }
        scanNodeTree(node);
        count += 1;
        if ( performance.now() >= deadline ) { break; }
    }

    applyQueuedSelectors();

    if ( pendingNodes.length !== 0 ) {
        scheduleProcessing();
    }
}

function scheduleProcessing() {
    if ( processTimer !== undefined ) { return; }
    processTimer = self.setTimeout(processPendingNodes, 48);
}

function stop() {
    if ( processTimer !== undefined ) {
        self.clearTimeout(processTimer);
        processTimer = undefined;
    }
    if ( idleTimer !== undefined ) {
        self.clearTimeout(idleTimer);
        idleTimer = undefined;
    }
    mutationObserver?.disconnect();
    mutationObserver = undefined;
    selectorMaps.length = 0;
    pendingNodes.length = 0;
    pendingHashes.clear();
}

function observeIdle() {
    idleTimer = undefined;
    if ( mutationObserver === undefined ) { return; }
    if ( Date.now() - lastChange > idleStopMs ) {
        stop();
        return;
    }
    idleTimer = self.setTimeout(observeIdle, idleStopMs);
}

function onMutations(mutations) {
    for ( const mutation of mutations ) {
        if ( mutation.type === 'childList' ) {
            for ( const node of mutation.addedNodes ) {
                enqueueNode(node);
            }
        } else if ( mutation.type === 'attributes' ) {
            enqueueNode(mutation.target);
        }
    }

    lastChange = Date.now();
    scheduleProcessing();
}

function addExceptionsFor(entry, candidates) {
    if ( Array.isArray(entry.hostnames) === false ) { return; }
    if ( Array.isArray(entry.exceptions) === false ) { return; }

    let start = 0;
    for ( const candidate of candidates ) {
        const index = self.isolatedAPI.binarySearch(entry.hostnames, candidate, start);
        if ( index >= 0 ) {
            for ( const selector of splitSelectorGroup(entry.exceptions[index], '\n') ) {
                exceptionSet.add(selector);
            }
            start = index + 1;
        } else {
            start = ~index;
        }
    }
}

function prepareDetails() {
    for ( const entry of genericDetails ) {
        if ( typeof entry.highlyGeneric === 'string' && entry.highlyGeneric !== '' ) {
            queuedSelectorText.push(entry.highlyGeneric);
        }

        addExceptionsFor(entry, self.isolatedAPI.contexts.hostnames);
        if ( entry.hasEntities === true ) {
            addExceptionsFor(entry, self.isolatedAPI.contexts.entities);
        }
    }
    genericDetails.length = 0;
}

/******************************************************************************/

prepareDetails();
enqueueNode(document.documentElement);
scheduleProcessing();

mutationObserver = new MutationObserver(onMutations);
mutationObserver.observe(document, {
    attributeFilter: [ 'class', 'id' ],
    attributes: true,
    childList: true,
    subtree: true,
});

observeIdle();

/******************************************************************************/

})();

void 0;
