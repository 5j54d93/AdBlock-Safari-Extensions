/*******************************************************************************

    AdBlock

    Compatibility shim for redirected Google Analytics Content Experiments.

*/

(function adblockCxApiShim() {

'use strict';

window.cxApi = {
    chooseVariation() {
        return 0;
    },
    getChosenVariation() {},
    setAllowHash() {},
    setChosenVariation() {},
    setCookiePath() {},
    setDomainName() {},
};

})();
