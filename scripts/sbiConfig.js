import { statblock } from "../testBlocks/uberNpc.js";

export const sbiConfig = {};

// Set 'autoDebug' to true and set file above to the statblock in the 
// "testBlocks" folder you want to test. Doing this will make it
// so that you only have to click the "Import Statblock" button.
// No need to paste into the window and click the Import button.
// Feel free to add more tests. The uberNPC creature tests a lot of
// things all at once, but takes longer. Feel free to add to it too.
//
// IMPORTANT: Don't submit this with debug turned on!
sbiConfig.options = {
    "debug": false,
    "testBlock": statblock,
    // Turn autoDebug off if you still want to be able to use the window.
    "autoDebug": false,
}