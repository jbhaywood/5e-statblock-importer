import {
    sbiUtils
} from "./sbiUtils.js";
import {
    sbiWindow
} from "./sbiWindow.js";

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