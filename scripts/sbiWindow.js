import { sbiUtils } from "./sbiUtils.js";
import { sbiParser } from "./sbiParser.js";
import { sbiConfig } from "./sbiConfig.js";

export class sbiWindow extends Application {

    constructor(options) {
        super(options);
    }

    static get defaultOptions() {
        const options = super.defaultOptions;
        options.id = "sbi-window";
        options.template = "modules/5e-statblock-importer/templates/sbiWindow.html";
        options.width = 800;
        options.height = 600;
        options.resizable = true;
        options.classes = ["sbi-window"];
        options.popup = true;
        options.title = "5e Statblock Importer";

        return options;
    }

    static sbiInputWindowInstance = {}

    static async renderWindow() {
        sbiWindow.sbiInputWindowInstance = new sbiWindow();
        sbiWindow.sbiInputWindowInstance.render(true);
    }

    activateListeners(html) {
        sbiUtils.log("Listeners activated")
        super.activateListeners(html);

        const folderSelect = $("#sbi-import-select")[0];

        // Add a default option.
        const noneFolder = "None";
        folderSelect.add(new Option(noneFolder));

        var actorFolders = [...game.folders]
            .filter(f => f.type === "Actor")
            .map(f => ({ "name": f.name, "id": f._id }));

        // Add the available folders.
        for (const folder of actorFolders) {
            folderSelect.add(new Option(folder.name));
        }

        const importButton = $("#sbi-import-button");
        importButton.on("click", async function () {
            sbiUtils.log("Clicked import button");

            const lines = $("#sbi-input")
                .val()
                .trim()
                .split(/\n/g)
                .filter(str => str.length); // remove empty lines

            const selectedFolderName = folderSelect.options[folderSelect.selectedIndex].text;
            const selectedFolder = selectedFolderName == noneFolder ? null : actorFolders.find(f => f.name === selectedFolderName);

            if (sbiConfig.options.debug) {
                await sbiParser.parseInput(lines, selectedFolder?.id);
            } else {
                try {
                    await sbiParser.parseInput(lines, selectedFolder?.id);
                } catch (error) {
                    ui.notifications.error("5E STATBLOCK IMPORTER: An error has occured. Please report it using the module link so it can get fixed.")
                }
            }
        });

        // ###############################
        // DEBUG
        // ###############################
        if (sbiConfig.options.debug && sbiConfig.options.autoDebug) {
            const lines = sbiConfig.options.testBlock
                .trim()
                .split(/\n/g)
                .filter(str => str.length); // remove empty lines

            sbiParser.parseInput(lines, null);
        }
    }
}