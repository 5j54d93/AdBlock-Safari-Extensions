/*******************************************************************************

    AdBlock

    Procedural cosmetic filtering engine for compiled AdBlock selectors.

*/

(function adblockProceduralFilteringAPI() {

'use strict';

if ( self.ProceduralFiltererAPI instanceof Function ) { return; }
if ( self.__adblockSkipGoogleSearch === true ) { return; }

/******************************************************************************/

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
            scriptName: 'css-procedural-api',
            url: document.location.href,
        }).catch(( ) => {});
    } catch {
    }
}

if ( isGoogleSearchPage() ) {
    reportGoogleSearchSkip();
    return;
}

/******************************************************************************/

const nonVisualTags = new Set([
    'head',
    'link',
    'meta',
    'script',
    'style',
    'template',
]);

function regexFromString(value, exact = false) {
    const text = String(value || '');
    if ( text === '' ) { return /^/; }

    const match = /^\/(.+)\/([dgimsuvy]*)$/.exec(text);
    if ( match !== null ) {
        return new RegExp(match[1], match[2] || undefined);
    }

    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(exact ? `^${escaped}$` : escaped);
}

function token() {
    return `data-adblock-style-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2)}`;
}

function safeQuery(root, selector) {
    if ( root === null || selector === '' ) { return []; }
    try {
        return Array.from(root.querySelectorAll(selector));
    } catch {
        return [];
    }
}

function relativeQuery(node, selector) {
    if ( node instanceof Element === false ) { return []; }
    const trimmed = String(selector || '').trim();
    if ( trimmed === '' ) { return []; }

    if ( trimmed.startsWith('>') ) {
        return safeQuery(node, `:scope ${trimmed}`);
    }

    if ( /^[+~:]/.test(trimmed) ) {
        const parent = node.parentElement;
        if ( parent === null ) { return []; }

        let index = 1;
        let previous = node.previousElementSibling;
        while ( previous !== null ) {
            index += 1;
            previous = previous.previousElementSibling;
        }

        return safeQuery(parent, `:scope > :nth-child(${index})${trimmed}`);
    }

    return safeQuery(node, trimmed);
}

function firstElementFromXPath(xpath, contextNode) {
    try {
        const expression = document.createExpression(xpath, null);
        const result = expression.evaluate(
            contextNode,
            XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE
        );
        const out = [];
        for ( let index = 0; index < result.snapshotLength; index += 1 ) {
            const node = result.snapshotItem(index);
            if ( node instanceof Element ) {
                out.push(node);
            }
        }
        return out;
    } catch {
        return [];
    }
}

function openShadowRoot(node) {
    if ( node instanceof Element === false ) { return null; }
    if ( node.shadowRoot instanceof DocumentFragment ) {
        return node.shadowRoot;
    }
    try {
        if (
            typeof chrome === 'object' &&
            chrome?.dom?.openOrClosedShadowRoot instanceof Function
        ) {
            return chrome.dom.openOrClosedShadowRoot(node);
        }
    } catch {
    }
    return node.openOrClosedShadowRoot || null;
}

function selectorForDirectCSS(selector) {
    return String(selector || '').replace(/::[a-zA-Z-]+(?:\([^)]*\))?$/, '');
}

/******************************************************************************/

class SelectorProgram {
    constructor(owner, details = {}) {
        this.owner = owner;
        this.selector = String(details.selector || '');
        this.action = details.action;
        this.raw = details.raw || this.selector;
        this.tasks = Array.isArray(details.tasks)
            ? details.tasks.map(task => createTask(owner, task)).filter(Boolean)
            : [];
    }

    destroy() {
        for ( const task of this.tasks ) {
            task.destroy?.();
        }
    }

    prime(input = document) {
        if ( this.selector === '' ) {
            return input instanceof Element || input instanceof Document
                ? [ input ]
                : [];
        }

        if ( input !== document && input instanceof Element ) {
            if ( /^[>+~:]/.test(this.selector.trim()) ) {
                return relativeQuery(input, this.selector);
            }
            return safeQuery(input, this.selector);
        }

        return safeQuery(document, this.selector);
    }

    exec(input = document) {
        let nodes = this.prime(input);
        for ( const task of this.tasks ) {
            if ( nodes.length === 0 ) { break; }
            nodes = task.apply(nodes);
        }
        return nodes.filter(node => node instanceof Element);
    }

    test(input) {
        return this.exec(input).length !== 0;
    }
}

/******************************************************************************/

function createTask(owner, task) {
    if ( Array.isArray(task) === false ) { return; }

    const [ name, argument ] = task;

    switch ( name ) {
    case 'has':
    case 'if':
    case 'not':
    case 'if-not': {
        const program = new SelectorProgram(owner, argument);
        const keepMatch = name === 'has' || name === 'if';
        return {
            apply(nodes) {
                return nodes.filter(node => program.test(node) === keepMatch);
            },
            destroy() {
                program.destroy();
            },
        };
    }

    case 'has-text': {
        const regex = regexFromString(argument);
        return {
            apply(nodes) {
                return nodes.filter(node => regex.test(node.textContent || ''));
            },
        };
    }

    case 'matches-attr': {
        const attrRegex = regexFromString(argument?.attr, true);
        const valueRegex = regexFromString(argument?.value, true);
        return {
            apply(nodes) {
                return nodes.filter(node => {
                    if ( node.getAttributeNames instanceof Function === false ) {
                        return false;
                    }
                    for ( const attr of node.getAttributeNames() ) {
                        if ( attrRegex.test(attr) === false ) { continue; }
                        if ( valueRegex.test(node.getAttribute(attr) || '') ) {
                            return true;
                        }
                    }
                    return false;
                });
            },
        };
    }

    case 'matches-css':
    case 'matches-css-after':
    case 'matches-css-before': {
        const pseudo = name === 'matches-css-after'
            ? '::after'
            : name === 'matches-css-before'
                ? '::before'
                : argument?.pseudo
                    ? `::${argument.pseudo}`
                    : null;
        const cssName = argument?.name || '';
        const value = Array.isArray(argument?.value)
            ? new RegExp(argument.value[0], argument.value[1])
            : regexFromString(argument?.value);
        return {
            apply(nodes) {
                return nodes.filter(node => {
                    try {
                        const style = self.getComputedStyle(node, pseudo);
                        return style !== null && value.test(style?.[cssName] || '');
                    } catch {
                        return false;
                    }
                });
            },
        };
    }

    case 'matches-media': {
        const mql = self.matchMedia(argument);
        const onChange = ( ) => owner?.requestCommit?.();
        try {
            mql.addEventListener('change', onChange);
        } catch {
        }
        return {
            apply(nodes) {
                return mql.matches ? nodes : [];
            },
            destroy() {
                try {
                    mql.removeEventListener('change', onChange);
                } catch {
                }
            },
        };
    }

    case 'matches-path': {
        const pathRegex = regexFromString(
            String(argument || '').replace(/\P{ASCII}/gu, value =>
                encodeURIComponent(value)
            )
        );
        return {
            apply(nodes) {
                const path = self.location.pathname + self.location.search;
                return pathRegex.test(path) ? nodes : [];
            },
        };
    }

    case 'matches-prop': {
        const props = String(argument?.attr || '').split('.').filter(Boolean);
        const valueRegex = argument?.value
            ? regexFromString(argument.value, true)
            : null;
        return {
            apply(nodes) {
                return nodes.filter(node => {
                    let value = node;
                    for ( const prop of props ) {
                        if ( value === undefined || value === null ) { return false; }
                        value = value[prop];
                    }
                    if ( valueRegex === null ) {
                        return value !== undefined;
                    }
                    return valueRegex.test(String(value));
                });
            },
        };
    }

    case 'min-text-length': {
        const min = Number(argument) || 0;
        return {
            apply(nodes) {
                return nodes.filter(node => (node.textContent || '').length >= min);
            },
        };
    }

    case 'others':
        return {
            apply(nodes) {
                const keep = new Set();
                const discard = new Set();
                const body = document.body;
                const head = document.head;

                for ( const node of nodes ) {
                    let current = node;
                    while (
                        current instanceof Element &&
                        current !== body &&
                        current !== head
                    ) {
                        keep.add(current);
                        discard.delete(current);

                        for ( const direction of [ 'previousElementSibling', 'nextElementSibling' ] ) {
                            let sibling = current[direction];
                            while ( sibling instanceof Element ) {
                                if (
                                    keep.has(sibling) === false &&
                                    nonVisualTags.has(sibling.localName) === false
                                ) {
                                    discard.add(sibling);
                                }
                                sibling = sibling[direction];
                            }
                        }

                        current = current.parentElement;
                    }
                }

                return Array.from(discard).filter(node => keep.has(node) === false);
            },
        };

    case 'shadow':
        return {
            apply(nodes) {
                const out = [];
                for ( const node of nodes ) {
                    const root = openShadowRoot(node);
                    if ( root === null ) { continue; }
                    out.push(...safeQuery(root, argument));
                }
                return out;
            },
        };

    case 'spath':
        return {
            apply(nodes) {
                const out = [];
                for ( const node of nodes ) {
                    out.push(...relativeQuery(node, argument));
                }
                return out;
            },
        };

    case 'upward':
        return {
            apply(nodes) {
                const out = [];
                for ( const node of nodes ) {
                    if ( typeof argument === 'number' ) {
                        let current = node;
                        for ( let i = 0; i < argument; i += 1 ) {
                            current = current?.parentElement;
                            if ( current === null ) { break; }
                        }
                        if ( current instanceof Element ) {
                            out.push(current);
                        }
                    } else {
                        const match = node.parentElement?.closest(argument);
                        if ( match instanceof Element ) {
                            out.push(match);
                        }
                    }
                }
                return out;
            },
        };

    case 'watch-attr': {
        const observed = new WeakSet();
        const observerOptions = {
            attributes: true,
            subtree: true,
        };
        if ( Array.isArray(argument) && argument.length !== 0 ) {
            observerOptions.attributeFilter = argument;
        }
        let observer;
        return {
            apply(nodes) {
                if ( owner === null || owner === undefined ) { return nodes; }
                observer ??= new MutationObserver(( ) => owner.requestCommit());
                for ( const node of nodes ) {
                    if ( observed.has(node) ) { continue; }
                    observer.observe(node, observerOptions);
                    observed.add(node);
                }
                return nodes;
            },
            destroy() {
                observer?.disconnect();
                observer = undefined;
            },
        };
    }

    case 'xpath':
        return {
            apply(nodes) {
                const out = [];
                for ( const node of nodes ) {
                    out.push(...firstElementFromXPath(argument, node));
                }
                return out;
            },
        };

    default:
        console.info(`AdBlock: unsupported procedural operator ${name}`);
        return {
            apply() {
                return [];
            },
        };
    }
}

/******************************************************************************/

class ProceduralEngine {
    constructor() {
        this.programs = [];
        this.styledNodes = new Set();
        this.styleTokens = new Map();
        this.timer = undefined;
        this.defaultStyle = 'display:none!important;';
    }

    async reset() {
        if ( this.timer !== undefined ) {
            self.cancelAnimationFrame(this.timer);
            this.timer = undefined;
        }

        for ( const program of this.programs ) {
            program.destroy();
        }
        this.programs.length = 0;

        const removals = [];
        for ( const [ style, attr ] of this.styleTokens ) {
            for ( const node of this.styledNodes ) {
                node.removeAttribute(attr);
            }
            removals.push(removeCSS(`[${attr}]\n{${style}}\n`));
        }

        this.styleTokens.clear();
        this.styledNodes.clear();
        await Promise.all(removals);
    }

    add(selectors) {
        for ( const details of selectors ) {
            const program = new SelectorProgram(this, details);
            this.prepareStyle(program.action);
            this.programs.push(program);
        }
    }

    prepareStyle(action) {
        const op = action?.[0] || 'style';
        if ( op !== 'style' && op !== '' ) { return; }
        this.styleToken(action?.[1] || this.defaultStyle);
    }

    styleToken(style) {
        const safeStyle = style || this.defaultStyle;
        let attr = this.styleTokens.get(safeStyle);
        if ( attr !== undefined ) { return attr; }

        attr = token();
        this.styleTokens.set(safeStyle, attr);
        self.cssAPI.insert(`[${attr}]\n{${safeStyle}}\n`);
        return attr;
    }

    requestCommit() {
        if ( this.timer !== undefined ) { return; }
        this.timer = self.requestAnimationFrame(( ) => {
            this.timer = undefined;
            this.commit();
        });
    }

    commit() {
        if ( this.timer !== undefined ) {
            self.cancelAnimationFrame(this.timer);
            this.timer = undefined;
        }

        const previouslyStyled = this.styledNodes;
        this.styledNodes = new Set();

        for ( const program of this.programs ) {
            const nodes = program.exec(document);
            if ( nodes.length === 0 ) { continue; }
            this.applyAction(nodes, program.action);
        }

        this.removeStaleStyles(previouslyStyled);
    }

    applyAction(nodes, action) {
        const op = action?.[0] || 'style';
        const argument = action?.[1] || '';

        switch ( op ) {
        case '':
        case 'style': {
            const attr = this.styleToken(argument || this.defaultStyle);
            for ( const node of nodes ) {
                node.setAttribute(attr, '');
                this.styledNodes.add(node);
            }
            break;
        }

        case 'remove':
            for ( const node of nodes ) {
                node.textContent = '';
                node.remove();
            }
            break;

        case 'remove-attr': {
            const attrRegex = regexFromString(argument, true);
            for ( const node of nodes ) {
                for ( const name of Array.from(node.getAttributeNames())) {
                    if ( attrRegex.test(name) ) {
                        node.removeAttribute(name);
                    }
                }
            }
            break;
        }

        case 'remove-class': {
            const classRegex = regexFromString(argument, true);
            for ( const node of nodes ) {
                for ( const name of Array.from(node.classList)) {
                    if ( classRegex.test(name) ) {
                        node.classList.remove(name);
                    }
                }
            }
            break;
        }

        default:
            break;
        }
    }

    removeStaleStyles(nodes) {
        const attrs = Array.from(this.styleTokens.values());
        for ( const node of nodes ) {
            if ( this.styledNodes.has(node) ) { continue; }
            for ( const attr of attrs ) {
                node.removeAttribute(attr);
            }
        }
    }
}

/******************************************************************************/

function removeCSS(css) {
    return chrome.runtime.sendMessage({
        what: 'removeCSS',
        css,
    }).catch(( ) => {});
}

function directCSSRule(details) {
    let selector = selectorForDirectCSS(details.selector);
    let style = 'display:none!important;';
    let media;

    if ( Array.isArray(details.action) && details.action[0] === 'style' ) {
        style = details.action[1] || style;
    }

    for ( const task of details.tasks || [] ) {
        if ( task[0] === 'matches-media' ) {
            media = task[1];
        } else if ( task[0] === 'spath' && selector === '' ) {
            selector = selectorForDirectCSS(task[1]);
        }
    }

    if ( selector === '' ) { return; }

    const rule = `${selector}\n{${style}}\n`;
    return media ? `@media ${media} {\n${rule}}\n` : rule;
}

/******************************************************************************/

self.ProceduralFiltererAPI = class AdBlockProceduralFiltererAPI {
    constructor() {
        this.cssSheets = new Set();
        this.engine = null;
        this.domObserver = null;
    }

    async reset() {
        this.domObserver?.disconnect();
        this.domObserver = null;

        const removals = [];
        if ( this.engine !== null ) {
            removals.push(this.engine.reset());
            this.engine = null;
        }

        for ( const css of this.cssSheets ) {
            removals.push(removeCSS(css));
        }
        this.cssSheets.clear();

        await Promise.all(removals);
    }

    addDeclaratives(selectors) {
        const rules = [];
        for ( const details of selectors ) {
            const rule = directCSSRule(details);
            if ( rule !== undefined ) {
                rules.push(rule);
            }
        }

        if ( rules.length === 0 ) { return; }

        const css = rules.join('\n');
        if ( this.cssSheets.has(css) ) { return; }

        this.cssSheets.add(css);
        self.cssAPI.insert(css);
    }

    addProcedurals(selectors) {
        if ( this.engine === null ) {
            this.engine = new ProceduralEngine();
        }

        this.engine.add(selectors);
        this.observeDOM();
        this.engine.commit();
    }

    qsa(selector) {
        let details;
        try {
            details = JSON.parse(selector);
        } catch {
            return [];
        }

        if ( details.cssable === true ) {
            return safeQuery(document, selectorForDirectCSS(details.selector));
        }

        return new SelectorProgram(null, details).exec(document);
    }

    observeDOM() {
        if ( this.domObserver !== null ) { return; }

        this.domObserver = new MutationObserver(mutations => {
            for ( const mutation of mutations ) {
                if (
                    mutation.type === 'attributes' ||
                    mutation.addedNodes.length !== 0 ||
                    mutation.removedNodes.length !== 0
                ) {
                    this.engine?.requestCommit();
                    return;
                }
            }
        });

        this.domObserver.observe(document, {
            attributeFilter: [ 'class', 'id', 'style' ],
            attributes: true,
            childList: true,
            subtree: true,
        });
    }
};

/******************************************************************************/

})();

void 0;
