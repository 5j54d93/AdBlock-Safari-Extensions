/*******************************************************************************

    AdBlock

    Applies environment classes used by extension pages.

*/

const root = document.documentElement;

function setExclusiveClass(enabledClass, disabledClass, enabled) {
    root.classList.toggle(enabledClass, enabled);
    root.classList.toggle(disabledClass, enabled === false);
}

function applyColorScheme() {
    const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
    setExclusiveClass('dark', 'light', prefersDark);
}

function applyPointerMode() {
    const hasHoverPointer = matchMedia('(hover: hover)').matches;
    setExclusiveClass('desktop', 'mobile', hasHoverPointer);
}

applyColorScheme();
applyPointerMode();

matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyColorScheme);
matchMedia('(hover: hover)').addEventListener?.('change', applyPointerMode);
