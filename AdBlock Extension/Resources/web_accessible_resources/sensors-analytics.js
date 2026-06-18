/*******************************************************************************

    AdBlock

    Compatibility shim for redirected Sensors Analytics scripts.

*/

(function adblockSensorsAnalyticsShim() {

'use strict';

const noop = function adblockNoop() {};

window.sensorsDataAnalytic201505 = {
    init: noop,
    quick: noop,
    register: noop,
    registerPage: noop,
    setProfile: noop,
    track: noop,
    use: noop,
};

})();
