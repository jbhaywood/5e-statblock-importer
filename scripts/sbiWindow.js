import { sbiUtils } from "./sbiUtils.js";
import { sbiParser } from "./sbiParser.js";
import { sbiConfig } from "./sbiConfig.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class sbiWindow extends HandlebarsApplicationMixin(ApplicationV2) {

    /** @override */
    static DEFAULT_OPTIONS = {
        id: "sbi-window",
        tag: "form",
        classes: ["sbi-window"],
        window: {
            title: "SBI.Title",
            icon: "fa-solid fa-file-import",
            resizable: true
        },
        position: {
            width: 800,
            height: 600
        },
        form: {
            handler: sbiWindow.#onSubmit,
            closeOnSubmit: false,
            submitOnChange: false
        }
    };

    /** @override */
    static PARTS = {
        form: {
            template: "modules/5e-statblock-importer/templates/sbiWindow.hbs"
        }
    };

    /**
     * The single open instance of the window, if any.
     * @type {sbiWindow|null}
     */
    static instance = null;

    /**
     * Text that should be shown in the box when (re)rendering.
     * @type {string}
     */
    #statblock = "";

    /**
     * Whether an import is currently running.
     * @type {boolean}
     */
    #importing = false;

    /* -------------------------------------------- */

    static async renderWindow() {
        if (!sbiWindow.instance) {
            sbiWindow.instance = new sbiWindow();
        }

        return sbiWindow.instance.render({ force: true });
    }

    /* -------------------------------------------- */

    /**
     * Import a statblock from raw text. Used by the window and exposed through the module API.
     * @param {string} text          The full statblock text.
     * @param {string|null} folderId  The folder to create the actor in.
     * @returns {Promise<Actor|null>}
     */
    static async importText(text, folderId = null) {
        const lines = (text ?? "")
            .trim()
            .split(/\r?\n/g)
            .map(str => str.trim())
            .filter(str => str.length); // remove empty lines

        if (!lines.length) {
            ui.notifications.warn(game.i18n.localize("SBI.Notifications.Empty"));
            return null;
        }

        if (sbiConfig.options.debug) {
            return sbiParser.parseInput(lines, folderId);
        }

        try {
            return await sbiParser.parseInput(lines, folderId);
        } catch (error) {
            ui.notifications.error(game.i18n.localize("SBI.Notifications.Error"));
            console.error("5e Statblock Importer |", error);
            return null;
        }
    }

    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        context.folders = game.folders
            .filter(f => f.type === "Actor")
            .map(f => ({ id: f.id, name: this.#folderLabel(f) }))
            .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
        context.statblock = this.#statblock;
        context.importing = this.#importing;
        context.placeholder = game.i18n.localize("SBI.Placeholder");

        return context;
    }

    /* -------------------------------------------- */

    /** @override */
    _onRender(context, options) {
        super._onRender(context, options);
        sbiUtils.log("Window rendered");

        // Remember the text so that re-renders don't wipe out what the user pasted.
        const textarea = this.element.querySelector("#sbi-input");
        textarea?.addEventListener("input", event => this.#statblock = event.target.value);

        // ###############################
        // DEBUG
        // ###############################
        if (sbiConfig.options.debug && sbiConfig.options.autoDebug && options.isFirstRender) {
            sbiWindow.importText(sbiConfig.options.testBlock, null);
        }
    }

    /* -------------------------------------------- */

    /** @override */
    _onClose(options) {
        super._onClose(options);
        if (sbiWindow.instance === this) sbiWindow.instance = null;
    }

    /* -------------------------------------------- */

    /**
     * Build a readable label for a folder, including its parent folders.
     * @param {Folder} folder
     * @returns {string}
     */
    #folderLabel(folder) {
        const names = [folder.name];
        let parent = folder.folder;
        while (parent) {
            names.unshift(parent.name);
            parent = parent.folder;
        }
        return names.join(" / ");
    }

    /* -------------------------------------------- */

    /**
     * Handle the form submission.
     * @this {sbiWindow}
     * @param {SubmitEvent} event
     * @param {HTMLFormElement} form
     * @param {FormDataExtended} formData
     */
    static async #onSubmit(event, form, formData) {
        if (this.#importing) return;
        sbiUtils.log("Clicked import button");

        const { statblock, folder } = formData.object;
        this.#statblock = statblock ?? "";

        this.#importing = true;
        this.#setBusy(true);

        try {
            const actor = await sbiWindow.importText(statblock, folder || null);

            if (actor) {
                ui.notifications.info(game.i18n.format("SBI.Notifications.Success", { name: actor.name }));
            }
        } finally {
            this.#importing = false;
            this.#setBusy(false);
        }
    }

    /* -------------------------------------------- */

    /**
     * Toggle the busy state of the import button.
     * @param {boolean} busy
     */
    #setBusy(busy) {
        const button = this.element?.querySelector("#sbi-import-button");
        if (!button) return;

        button.disabled = busy;
        button.querySelector("span").textContent = game.i18n.localize(busy ? "SBI.Importing" : "SBI.Import");
    }
}
