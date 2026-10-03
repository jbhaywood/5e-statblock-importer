import { sbiUtils } from "./sbiUtils.js";
import { sbiWindow } from "./sbiWindow.js";

const MODULE_ID = "5e-statblock-importer";

/**
 * Add the "Import Statblock" button to the Actors sidebar tab.
 * In Foundry v13+ the `html` argument of render hooks is a plain HTMLElement.
 * @param {HTMLElement|jQuery} html  The rendered directory element.
 */
function injectImportButton(html) {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || !game.user.isGM) return;

    // Guard against duplicate buttons when the directory re-renders.
    if (root.querySelector("#sbi-main-button")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = "sbi-main-button";
    button.innerHTML = `<i class="fa-solid fa-file-import" inert></i> ${game.i18n.localize("SBI.Button")}`;
    button.addEventListener("click", () => {
        sbiUtils.log("Module button clicked");
        sbiWindow.renderWindow();
    });

    // Prefer the directory footer; fall back to the header action buttons.
    const footer = root.querySelector(".directory-footer")
        ?? root.querySelector(".header-actions")
        ?? root;
    footer.append(button);
}

Hooks.on("renderActorDirectory", (app, html) => {
    sbiUtils.log("Rendering sbi button");
    injectImportButton(html);
});

Hooks.once("ready", () => {
    // Expose a small API so macros and other modules can trigger an import.
    const module = game.modules.get(MODULE_ID);
    if (module) {
        module.api = {
            openWindow: () => sbiWindow.renderWindow(),
            importStatblock: (text, folderId = null) => sbiWindow.importText(text, folderId)
        };
    }
});
