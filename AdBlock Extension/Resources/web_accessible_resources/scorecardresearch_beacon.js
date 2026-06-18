/*******************************************************************************

    AdBlock

    Compatibility shim for redirected ScorecardResearch beacon scripts.

*/

(function adblockScorecardShim() {

'use strict';

window.COMSCORE = {
    purge() {
        window._comscore = [];
    },
    beacon() {},
};

})();
