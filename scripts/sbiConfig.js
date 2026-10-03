import { statblock } from "../testBlocks/uberNpc.js";

export const sbiConfig = {};

// Set 'debug' to true to get console logging and to have errors thrown instead of
// being reported as a notification.
//
// Set 'autoDebug' to true and set the file above to the statblock in the
// "testBlocks" folder you want to test. Doing this will make it so that you only
// have to click the "Import Statblock" button. No need to paste into the window
// and click the Import button.
//
// Feel free to add more tests. The uberNPC creature tests a lot of things all at
// once, but takes longer. Statblocks in "testBlocks" can also be run outside of
// Foundry with `node test/run.mjs --verbose`.
//
// IMPORTANT: Don't submit this with debug turned on!
sbiConfig.options = {
    "debug": false,
    "testBlock": statblock,
    // Turn autoDebug off if you still want to be able to use the window.
    "autoDebug": false,
}
