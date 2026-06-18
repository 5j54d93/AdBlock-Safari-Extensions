/*******************************************************************************

    AdBlock

    Minimal DOM helpers shared by extension pages.

*/

function toElements(target) {
    if ( typeof target === 'string' ) {
        return Array.from(document.querySelectorAll(target));
    }
    if ( target instanceof Window || target instanceof Document ) {
        return [ target ];
    }
    if ( target instanceof Element ) {
        return [ target ];
    }
    if ( target === null || target === undefined ) {
        return [];
    }
    return Array.from(target);
}

function delegate(selector, callback) {
    return function(event) {
        const dispatcher = event.currentTarget;
        const target = event.target;
        if (
            dispatcher instanceof Element === false ||
            target instanceof Element === false
        ) {
            return;
        }
        const match = target.closest(selector);
        if ( match === null || match === dispatcher ) { return; }
        if ( dispatcher.contains(match) === false ) { return; }
        callback.call(match, event);
    };
}

/******************************************************************************/

class dom {
    static attr(target, name, value) {
        for ( const element of toElements(target) ) {
            if ( value === undefined ) {
                return element.getAttribute(name);
            }
            if ( value === null ) {
                element.removeAttribute(name);
            } else {
                element.setAttribute(name, value);
            }
        }
    }

    static clear(target) {
        for ( const element of toElements(target) ) {
            element.textContent = '';
        }
    }

    static clone(target) {
        const [ element ] = toElements(target);
        return element?.cloneNode(true) ?? null;
    }

    static create(tagName) {
        return typeof tagName === 'string'
            ? document.createElement(tagName)
            : undefined;
    }

    static empty(target) {
        dom.clear(target);
    }

    static prop(target, name, value) {
        for ( const element of toElements(target) ) {
            if ( value === undefined ) {
                return element[name];
            }
            element[name] = value;
        }
    }

    static remove(target) {
        for ( const element of toElements(target) ) {
            element.remove();
        }
    }

    static text(target, value) {
        const elements = toElements(target);
        if ( value === undefined ) {
            return elements[0]?.textContent;
        }
        for ( const element of elements ) {
            element.textContent = value;
        }
    }

    static on(target, type, selectorOrCallback, callbackOrOptions, options) {
        let callback = selectorOrCallback;
        let eventOptions = callbackOrOptions;

        if ( typeof selectorOrCallback === 'string' ) {
            callback = delegate(selectorOrCallback, callbackOrOptions);
            eventOptions = options ?? { capture: true };
        }

        if ( typeof eventOptions === 'boolean' ) {
            eventOptions = { capture: eventOptions };
        }

        for ( const element of toElements(target) ) {
            element.addEventListener(type, callback, eventOptions);
        }
    }

    static off(target, type, callback, options) {
        if ( typeof callback !== 'function' ) { return; }
        if ( typeof options === 'boolean' ) {
            options = { capture: options };
        }
        for ( const element of toElements(target) ) {
            element.removeEventListener(type, callback, options);
        }
    }

    static onFirstShown(callback, element) {
        if ( element instanceof Element === false ) { return; }
        let observer = new IntersectionObserver(entries => {
            if ( entries.some(entry => entry.isIntersecting) === false ) { return; }
            observer.disconnect();
            observer = undefined;
            callback();
        });
        observer.observe(element);
    }
}

dom.cl = class {
    static add(target, ...names) {
        for ( const element of toElements(target) ) {
            element.classList.add(...names);
        }
    }

    static remove(target, ...names) {
        for ( const element of toElements(target) ) {
            element.classList.remove(...names);
        }
    }

    static toggle(target, name, state) {
        let result;
        for ( const element of toElements(target) ) {
            result = element.classList.toggle(name, state);
        }
        return result;
    }

    static has(target, name) {
        return toElements(target).some(element =>
            element.classList.contains(name)
        );
    }
};

/******************************************************************************/

function qs$(rootOrSelector, selector) {
    if ( typeof rootOrSelector === 'string' ) {
        return document.querySelector(rootOrSelector);
    }
    return rootOrSelector?.querySelector(selector) ?? null;
}

function qsa$(rootOrSelector, selector) {
    if ( typeof rootOrSelector === 'string' ) {
        return document.querySelectorAll(rootOrSelector);
    }
    return rootOrSelector?.querySelectorAll(selector) ?? [];
}

dom.root = document.documentElement;
dom.html = document.documentElement;
dom.head = document.head;
dom.body = document.body;

/******************************************************************************/

export { dom, qs$, qsa$ };
