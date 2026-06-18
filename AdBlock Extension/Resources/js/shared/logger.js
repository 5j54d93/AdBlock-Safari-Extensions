import { webext } from './ext-compat.js';

const isDevelopmentBuild = (( ) => {
    const { permissions } = webext.runtime.getManifest();
    return permissions?.includes('declarativeNetRequestFeedback') === true;
})();

export const adblockLog = (...args) => {
    if ( isDevelopmentBuild === false ) { return; }
    console.info('[AdBlock]', ...args);
};

export const adblockErr = (...args) => {
    if ( isDevelopmentBuild === false ) { return; }
    console.error('[AdBlock]', ...args);
};
