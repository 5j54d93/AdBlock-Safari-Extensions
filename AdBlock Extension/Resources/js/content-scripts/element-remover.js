/*******************************************************************************

    AdBlock

    Content-side temporary element remover.

*/

(function adblockElementRemover() {

'use strict';

/******************************************************************************/

const HIGHLIGHT_RADIUS_PX = 8;

/******************************************************************************/

if ( self.adblockElementRemover?.stop instanceof Function ) {
    self.adblockElementRemover.stop();
}

if ( self.adblockOverlay?.stop instanceof Function ) {
    self.adblockOverlay.stop();
}

/******************************************************************************/

function computedValue(element, property) {
    try {
        return self.getComputedStyle(element)?.[property] || '';
    } catch {
        return '';
    }
}

function unlockPageScrollFrom(element) {
    let current = element;
    let mayLockScroll = element.shadowRoot instanceof DocumentFragment;

    while ( current instanceof Element && mayLockScroll === false ) {
        const position = computedValue(current, 'position');
        const zIndex = Number.parseInt(computedValue(current, 'zIndex'), 10);
        mayLockScroll = position === 'fixed' || zIndex >= 1000;
        current = current.parentElement;
    }

    if ( mayLockScroll === false ) { return; }

    for ( const root of [ document.documentElement, document.body ] ) {
        if ( root instanceof HTMLElement === false ) { continue; }
        if ( computedValue(root, 'overflowY') === 'hidden' ) {
            root.style.setProperty('overflow', 'auto', 'important');
        }
        if ( computedValue(root, 'position') === 'fixed' ) {
            root.style.setProperty('position', 'initial', 'important');
        }
    }
}

function rectPath(rect) {
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(self.innerWidth, rect.right);
    const bottom = Math.min(self.innerHeight, rect.bottom);
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    if ( width === 0 || height === 0 ) { return ''; }
    const radius = Math.min(HIGHLIGHT_RADIUS_PX, width / 2, height / 2);
    if ( radius === 0 ) {
        return `M${left} ${top}h${width}v${height}h-${width}z`;
    }
    return [
        `M${left + radius} ${top}`,
        `H${right - radius}`,
        `Q${right} ${top} ${right} ${top + radius}`,
        `V${bottom - radius}`,
        `Q${right} ${bottom} ${right - radius} ${bottom}`,
        `H${left + radius}`,
        `Q${left} ${bottom} ${left} ${bottom - radius}`,
        `V${top + radius}`,
        `Q${left} ${top} ${left + radius} ${top}`,
        'Z',
    ].join('');
}

function isVisibleRect(rect) {
    return rect.width > 0 &&
        rect.height > 0 &&
        rect.right >= 0 &&
        rect.bottom >= 0 &&
        rect.left <= self.innerWidth &&
        rect.top <= self.innerHeight;
}

function hasControlInPath(event) {
    return event.composedPath().some(node =>
        node instanceof Element && node.closest?.('[data-adblock-control]') !== null
    );
}

function stopControlEvent(event) {
    event.stopPropagation();
}

function onRuntimeMessage(message) {
    if ( message?.what !== 'leave-element-remover-mode' ) { return; }
    remover.stop();
    return true;
}

/******************************************************************************/

function cssEscapeIdent(value) {
    if ( typeof value !== 'string' || value === '' ) { return ''; }
    if ( typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ) {
        return CSS.escape(value);
    }
    return value.replace(/[^\w-]/g, ch => `\\${ch}`);
}

function looksStableName(name) {
    if ( typeof name !== 'string' || name === '' || name.length > 50 ) { return false; }
    if ( /\d{4,}/.test(name) ) { return false; }
    if ( /[0-9a-f]{8,}/i.test(name) ) { return false; }
    return true;
}

function isUniqueSelector(selector, element) {
    if ( selector === '' ) { return false; }
    try {
        const found = document.querySelectorAll(selector);
        return found.length === 1 && found[0] === element;
    } catch {
        return false;
    }
}

function classSelectorFor(element) {
    const parts = [];
    for ( const name of element.classList ) {
        if ( looksStableName(name) === false ) { continue; }
        parts.push(`.${cssEscapeIdent(name)}`);
    }
    return parts.join('');
}

function nthOfTypeIndex(element) {
    let index = 1;
    let sibling = element;
    const tag = element.tagName;
    while ( (sibling = sibling.previousElementSibling) !== null ) {
        if ( sibling.tagName === tag ) { index += 1; }
    }
    return index;
}

function simpleSelectorFor(element) {
    const tag = element.tagName.toLowerCase();

    const id = element.id;
    if ( typeof id === 'string' && looksStableName(id) ) {
        const selector = `#${cssEscapeIdent(id)}`;
        if ( isUniqueSelector(selector, element) ) { return selector; }
    }

    const classes = classSelectorFor(element);
    if ( classes !== '' ) {
        if ( isUniqueSelector(`${tag}${classes}`, element) ) { return `${tag}${classes}`; }
        if ( isUniqueSelector(classes, element) ) { return classes; }
        return `${tag}${classes}:nth-of-type(${nthOfTypeIndex(element)})`;
    }

    return `${tag}:nth-of-type(${nthOfTypeIndex(element)})`;
}

function cssSelectorFromElement(element) {
    if ( element instanceof Element === false ) { return ''; }

    const direct = simpleSelectorFor(element);
    if ( isUniqueSelector(direct, element) ) { return direct; }

    const parts = [];
    let current = element;
    let depth = 0;
    while (
        current instanceof Element &&
        current !== document.documentElement &&
        current !== document.body &&
        depth < 6
    ) {
        const part = simpleSelectorFor(current);
        parts.unshift(part);
        if ( isUniqueSelector(parts.join(' > '), element) ) {
            return parts.join(' > ');
        }
        if ( part.startsWith('#') ) { break; }
        current = current.parentElement;
        depth += 1;
    }

    return parts.join(' > ');
}

function labelForElement(element) {
    const tag = element.tagName.toLowerCase();

    if ( tag === 'img' || tag === 'picture' || tag === 'svg' ) {
        const alt = (element.getAttribute?.('alt') || '').trim();
        return alt !== '' ? `圖片：${alt.slice(0, 40)}` : '圖片元素';
    }
    if ( tag === 'video' ) { return '影片元素'; }
    if ( tag === 'iframe' ) { return '內嵌框架'; }

    const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
    if ( text !== '' ) {
        const clipped = text.length > 24 ? `${text.slice(0, 24)}…` : text;
        return `含有文字「${clipped}」`;
    }

    return `${tag} 區塊`;
}

function saveCustomFilter(selector, label) {
    try {
        chrome.runtime?.sendMessage({
            what: 'saveCustomFilter',
            hostname: self.location.hostname,
            selector,
            label,
        });
    } catch {
    }
}

function removeSavedCustomFilter(selector) {
    try {
        chrome.runtime?.sendMessage({
            what: 'removeCustomFilter',
            hostname: self.location.hostname,
            selector,
        });
    } catch {
    }
}

/******************************************************************************/

const remover = {
    host: null,
    undoButton: null,
    oceanPath: null,
    highlightPath: null,
    highlightedElements: [],
    removedElements: [],
    candidate: null,
    pointedElement: null,
    hoverTimer: undefined,
    lastX: undefined,
    lastY: undefined,
    started: false,

    start() {
        if ( this.started ) { return; }

        const host = document.createElement('adblock-element-remover');
        host.setAttribute('tabindex', '-1');
        host.style.setProperty('all', 'initial', 'important');
        host.style.setProperty('bottom', '0', 'important');
        host.style.setProperty('display', 'block', 'important');
        host.style.setProperty('height', '100vh', 'important');
        host.style.setProperty('height', '100svh', 'important');
        host.style.setProperty('left', '0', 'important');
        host.style.setProperty('margin', '0', 'important');
        host.style.setProperty('max-height', 'none', 'important');
        host.style.setProperty('max-width', 'none', 'important');
        host.style.setProperty('min-height', '0', 'important');
        host.style.setProperty('min-width', '0', 'important');
        host.style.setProperty('padding', '0', 'important');
        host.style.setProperty('pointer-events', 'auto', 'important');
        host.style.setProperty('position', 'fixed', 'important');
        host.style.setProperty('right', '0', 'important');
        host.style.setProperty('top', '0', 'important');
        host.style.setProperty('width', '100vw', 'important');
        host.style.setProperty('z-index', '2147483647', 'important');

        const shadow = host.attachShadow({ mode: 'closed' });
        shadow.innerHTML = `
            <style>
                :host {
                    color-scheme: light dark;
                    --remover-bg-000: #fff;
                    --remover-bg-100: #f8f8f6;
                    --remover-text-000: #1f1f1d;
                    --remover-text-400: #817f79;
                    --remover-border-rgb: 31 31 29;
                    --remover-accent: #2f6fe4;
                    --remover-toolbar-bg: rgb(248 248 246 / 0.80);
                    --remover-toolbar-hover-bg: rgb(255 255 255 / 0.72);
                    --remover-z-header: 20;
                    contain: layout style paint;
                    font: 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
                }
                svg {
                    height: 100%;
                    inset: 0;
                    position: fixed;
                    width: 100%;
                }
                .ocean {
                    fill: rgba(31, 31, 29, 0.24);
                    fill-rule: evenodd;
                }
                .highlight {
                    fill: rgba(47, 111, 228, 0.16);
                    stroke: var(--remover-accent);
                    stroke-width: 1.5px;
                }
                .toolbar {
                    -webkit-backdrop-filter: blur(8px);
                    align-items: center;
                    backdrop-filter: blur(8px);
                    background: var(--remover-toolbar-bg);
                    border-radius: 0.6rem;
                    display: flex;
                    flex-direction: row;
                    gap: 6px;
                    padding: 2px;
                    position: absolute;
                    right: 14px;
                    top: 12px;
                    z-index: var(--remover-z-header);
                }
                .hint {
                    background: var(--remover-bg-000);
                    border: 0.5px solid rgb(var(--remover-border-rgb) / 0.16);
                    border-radius: 12px;
                    bottom: calc(28px + env(safe-area-inset-bottom, 0px));
                    box-shadow:
                        0 0 0 1px rgb(var(--remover-border-rgb) / 0.08),
                        0 8px 24px rgba(20, 20, 18, 0.12),
                        0 2px 6px rgba(20, 20, 18, 0.08);
                    color: var(--remover-text-000);
                    font-size: 13px;
                    font-weight: 560;
                    left: 50%;
                    letter-spacing: 0;
                    line-height: 1.25;
                    padding: 8px 12px;
                    pointer-events: none;
                    position: fixed;
                    transform: translateX(-50%);
                    user-select: none;
                    white-space: nowrap;
                    z-index: 1;
                }
                button {
                    align-items: center;
                    appearance: none;
                    background: transparent;
                    border: 0;
                    border-radius: 8px;
                    color: var(--remover-text-000);
                    cursor: pointer;
                    display: flex;
                    height: 32px;
                    justify-content: center;
                    padding: 0;
                    transition: background-color 160ms ease, color 160ms ease, transform 120ms ease;
                    width: 32px;
                }
                button:hover {
                    background: var(--remover-toolbar-hover-bg);
                }
                button:active {
                    transform: scale(0.985);
                }
                button svg {
                    height: 18px;
                    pointer-events: none;
                    position: static;
                    width: 18px;
                }
                button path,
                button circle {
                    fill: none;
                    stroke: currentColor;
                    stroke-linecap: round;
                    stroke-linejoin: round;
                    stroke-width: 2;
                }
                @media (prefers-color-scheme: dark) {
                    :host {
                        --remover-bg-000: #1f1f1d;
                        --remover-bg-100: #292925;
                        --remover-text-000: #f4f3ef;
                        --remover-text-400: #a09d94;
                        --remover-border-rgb: 244 243 239;
                        --remover-accent: #8db2ff;
                        --remover-toolbar-bg: rgb(31 31 29 / 0.80);
                        --remover-toolbar-hover-bg: rgb(255 255 255 / 0.08);
                    }
                    .ocean {
                        fill: rgba(0, 0, 0, 0.34);
                    }
                }
                button:disabled {
                    cursor: default;
                    color: var(--remover-text-400);
                    opacity: 0.58;
                }
                button:disabled:hover {
                    background: transparent;
                }
            </style>
            <svg viewBox="0 0 ${self.innerWidth} ${self.innerHeight}">
                <path class="ocean"></path>
                <path class="highlight"></path>
            </svg>
            <div class="hint">點一下永久隱藏 · 滾輪或 ↑ ↓ 可選更大或更小範圍</div>
            <div class="toolbar" data-adblock-control>
                <button type="button" id="close" title="結束移除元素">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 6L18 18M18 6L6 18"></path>
                    </svg>
                </button>
                <button type="button" id="undo" title="復原上一個移除" disabled>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M9 7L4 12L9 17"></path>
                        <path d="M5 12H15A5 5 0 0 1 15 22"></path>
                    </svg>
                </button>
            </div>
        `;

        this.host = host;
        this.oceanPath = shadow.querySelector('.ocean');
        this.highlightPath = shadow.querySelector('.highlight');
        this.undoButton = shadow.querySelector('#undo');

        const toolbar = shadow.querySelector('.toolbar');
        for ( const type of [ 'click', 'mousedown', 'mouseup', 'mousemove', 'pointerdown', 'pointerup' ] ) {
            toolbar?.addEventListener(type, stopControlEvent);
        }

        shadow.querySelector('#close')?.addEventListener('click', event => {
            event.stopPropagation();
            event.preventDefault();
            this.stop();
        });
        this.undoButton?.addEventListener('click', event => {
            event.stopPropagation();
            event.preventDefault();
            this.undoLastRemoval();
        });

        host.addEventListener('click', this.onClick);
        host.addEventListener('mousemove', this.onMouseMove, { passive: true });
        chrome.runtime?.onMessage?.addListener(onRuntimeMessage);
        self.addEventListener('keydown', this.onKeyPressed, true);
        self.addEventListener('wheel', this.onWheel, { passive: false });
        self.addEventListener('scroll', this.onViewportChanged, { passive: true });
        self.addEventListener('resize', this.onViewportChanged, { passive: true });
        self.addEventListener('pagehide', this.onPageHidden, { once: true });

        document.documentElement.append(host);
        try {
            host.focus({ preventScroll: true });
        } catch {
        }
        this.started = true;
        this.highlightUpdate();
    },

    stop() {
        this.started = false;

        if ( this.hoverTimer !== undefined ) {
            cancelAnimationFrame(this.hoverTimer);
            this.hoverTimer = undefined;
        }

        this.host?.removeEventListener('click', this.onClick);
        this.host?.removeEventListener('mousemove', this.onMouseMove, { passive: true });
        chrome.runtime?.onMessage?.removeListener(onRuntimeMessage);
        self.removeEventListener('keydown', this.onKeyPressed, true);
        self.removeEventListener('wheel', this.onWheel, { passive: false });
        self.removeEventListener('scroll', this.onViewportChanged, { passive: true });
        self.removeEventListener('resize', this.onViewportChanged, { passive: true });
        self.removeEventListener('pagehide', this.onPageHidden, { once: true });

        this.host?.remove();
        this.host = null;
        this.undoButton = null;
        this.oceanPath = null;
        this.highlightPath = null;
        this.highlightedElements = [];
        this.removedElements = [];
        this.candidate = null;
        this.pointedElement = null;

        if ( self.adblockElementRemover === this ) {
            self.adblockElementRemover = undefined;
        }
    },

    onClick(event) {
        if ( hasControlInPath(event) ) { return; }
        event.stopPropagation();
        event.preventDefault();
        remover.removeElementAtPoint(event.clientX, event.clientY);
    },

    onMouseMove(event) {
        if ( hasControlInPath(event) ) { return; }
        remover.lastX = event.clientX;
        remover.lastY = event.clientY;
        if ( remover.hoverTimer !== undefined ) { return; }
        remover.hoverTimer = requestAnimationFrame(( ) => {
            remover.hoverTimer = undefined;
            remover.highlightElementAtPoint(remover.lastX, remover.lastY);
        });
    },

    onKeyPressed(event) {
        if ( event.key === 'Escape' || event.which === 27 ) {
            event.stopPropagation();
            event.preventDefault();
            remover.stop();
            return;
        }

        if ( event.key === 'z' && (event.metaKey || event.ctrlKey) ) {
            event.stopPropagation();
            event.preventDefault();
            remover.undoLastRemoval();
            return;
        }

        if ( event.key === 'ArrowUp' ) {
            event.stopPropagation();
            event.preventDefault();
            remover.expandSelection();
            return;
        }

        if ( event.key === 'ArrowDown' ) {
            event.stopPropagation();
            event.preventDefault();
            remover.narrowSelection();
            return;
        }

        if ( event.key !== 'Delete' && event.key !== 'Backspace' ) { return; }
        event.stopPropagation();
        event.preventDefault();
        remover.removeElementAtPoint();
    },

    onWheel(event) {
        if ( hasControlInPath(event) ) { return; }
        if ( remover.candidate instanceof Element === false ) { return; }
        event.preventDefault();
        event.stopPropagation();
        if ( event.deltaY < 0 ) {
            remover.expandSelection();
        } else if ( event.deltaY > 0 ) {
            remover.narrowSelection();
        }
    },

    onViewportChanged() {
        remover.highlightUpdate();
    },

    onPageHidden() {
        remover.stop();
    },

    elementFromPoint(x, y) {
        if ( typeof x === 'number' && typeof y === 'number' ) {
            this.lastX = x;
            this.lastY = y;
        } else if ( typeof this.lastX === 'number' && typeof this.lastY === 'number' ) {
            x = this.lastX;
            y = this.lastY;
        } else {
            return null;
        }

        this.host?.style.setProperty('pointer-events', 'none', 'important');
        let element = document.elementFromPoint(x, y);
        this.host?.style.setProperty('pointer-events', 'auto', 'important');

        if ( element === document.documentElement || element === document.body ) {
            element = null;
        }
        return element instanceof Element ? element : null;
    },

    highlightElementAtPoint(x, y) {
        const element = this.elementFromPoint(x, y);
        this.pointedElement = element;
        this.candidate = element;
        this.highlightElements([ element ]);
    },

    expandSelection() {
        const current = this.candidate;
        if ( current instanceof Element === false ) { return; }

        const parent = current.parentElement;
        if ( parent instanceof Element === false ) { return; }
        if ( parent === this.host ) { return; }
        if ( parent === document.documentElement || parent === document.body ) { return; }

        this.candidate = parent;
        this.highlightElements([ parent ]);
    },

    narrowSelection() {
        const current = this.candidate;
        const target = this.pointedElement;
        if ( current instanceof Element === false ) { return; }
        if ( target instanceof Element === false || current === target ) { return; }

        let child = target;
        while ( child instanceof Element && child.parentElement !== current ) {
            child = child.parentElement;
        }
        if ( child instanceof Element === false ) { return; }

        this.candidate = child;
        this.highlightElements([ child ]);
    },

    highlightElements(iterable = []) {
        this.highlightedElements = Array.from(iterable)
            .filter(element =>
                element instanceof Element &&
                element !== this.host &&
                element.isConnected
            );
        this.highlightUpdate();
    },

    unhighlight() {
        this.highlightElements([]);
    },

    updateToolbarState() {
        if ( this.undoButton instanceof HTMLButtonElement === false ) { return; }
        this.undoButton.disabled = this.removedElements.length === 0;
    },

    highlightUpdate() {
        if ( this.oceanPath === null || this.highlightPath === null ) { return; }

        const ocean = `M0 0h${self.innerWidth}v${self.innerHeight}h-${self.innerWidth}z`;
        const islands = [];

        for ( const element of this.highlightedElements ) {
            for ( const rect of this.rectsForElement(element) ) {
                if ( isVisibleRect(rect) === false ) { continue; }
                const path = rectPath(rect);
                if ( path !== '' ) {
                    islands.push(path);
                }
            }
        }

        const islandPath = islands.join('');
        this.oceanPath.setAttribute('d', `${ocean}${islandPath}`);
        this.highlightPath.setAttribute('d', islandPath);
        this.oceanPath.closest('svg')?.setAttribute(
            'viewBox',
            `0 0 ${self.innerWidth} ${self.innerHeight}`
        );
    },

    rectsForElement(element) {
        const rects = [];

        if ( element instanceof Element === false ) { return rects; }

        for ( const rect of element.getClientRects() ) {
            if ( rect.width !== 0 && rect.height !== 0 ) {
                rects.push(rect);
            }
        }

        if ( rects.length !== 0 ) { return rects; }

        const rect = element.getBoundingClientRect();
        if ( rect.width !== 0 && rect.height !== 0 ) {
            rects.push(rect);
            return rects;
        }

        for ( const child of element.children ) {
            rects.push(...this.rectsForElement(child));
        }

        return rects;
    },

    removeElementAtPoint(mx, my) {
        let element = this.highlightedElements[0];
        if ( element instanceof Element === false ) {
            element = this.elementFromPoint(mx, my);
        }
        if ( element instanceof Element === false ) { return; }

        const parent = element.parentNode;
        if ( parent === null ) { return; }

        const selector = cssSelectorFromElement(element);
        const label = selector !== '' ? labelForElement(element) : '';

        unlockPageScrollFrom(element);
        this.removedElements.push({
            element,
            parent,
            nextSibling: element.nextSibling,
            selector,
        });
        element.remove();
        this.updateToolbarState();

        if ( selector !== '' ) {
            saveCustomFilter(selector, label);
        }

        if ( typeof mx === 'number' && typeof my === 'number' ) {
            this.highlightElementAtPoint(mx, my);
        } else {
            this.unhighlight();
        }
    },

    undoLastRemoval() {
        const entry = this.removedElements.pop();
        this.updateToolbarState();
        if ( entry === undefined ) { return; }

        const { element, parent, nextSibling, selector } = entry;
        if ( element.isConnected ) { return; }
        if ( parent.isConnected === false ) { return; }

        parent.insertBefore(element, nextSibling?.parentNode === parent ? nextSibling : null);
        this.highlightElements([ element ]);

        if ( typeof selector === 'string' && selector !== '' ) {
            removeSavedCustomFilter(selector);
        }
    },
};

/******************************************************************************/

self.adblockElementRemover = remover;
remover.start();

/******************************************************************************/

})();

void 0;
