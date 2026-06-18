/*******************************************************************************

    AdBlock

    Compatibility shim which suppresses eval from redirected resources.

*/

(function adblockNoEvalShim() {

'use strict';

if ( window.eval instanceof Function === false ) { return; }

window.eval = new Proxy(window.eval, {
    apply() {},
});

})();
