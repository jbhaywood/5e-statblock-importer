import { sbiUtils } from "./sbiUtils.js";
import { sbiWindow } from "./sbiWindow.js";

/*
TODO - Known Issues:
- Actions listed after the spellcasting blocks aren't recognized because spell lists don't use periods.
- Spells that require a roll don't work, with the message "Error: You must provide an embedded Document instance as the input for a PlaceableObject
foundry.js:18511"

FIXED
- Legendary Actions get added.
- Features go into the features section of the character sheet.
- Spellcasting blocks are supported.
- Attack ability is set correctly.
*/

Hooks.on("renderActorDirectory", (app, html, data) => {
    sbiUtils.log("Rendering sbi button");

    // Add the import button to the UI in the characters tab.
    const importButton = $("<button id='sbi-main-button'><i class='fas fa-file-import'></i></i>Import Statblock</button>");
    html.find(".directory-footer").append(importButton);

    importButton.click(async (ev) => {
        sbiUtils.log("Module button clicked");

        await sbiWindow.renderWindow();
    });
});
