import {
    sbiUtils
} from "./sbiUtils.js";
import {
    sbiParser
} from "./sbiParser.js";
import {
    sbiConfig
} from "./sbiConfig.js";

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

        // Add the available folders.
        for (const folder of [...game.folders]) {
            folderSelect.add(new Option(folder.name));
        }

        const importButton = $("#sbi-import-button");
        importButton.on("click", async function () {
            sbiUtils.log("Clicked import button");

            // TODO: let user define the folder that the actor goes into

            const lines = $("#sbi-input")
                .val()
                .trim()
                .split(/\n/g)
                .filter(str => str.length);

            const selectedFolder = folderSelect.options[folderSelect.selectedIndex].text;
            const selectedFolderId = selectedFolder == noneFolder ? null : [...game.folders.keys()][folderSelect.selectedIndex - 1];

            if (sbiConfig.options.debug) {
                await sbiParser.parseInput(lines, selectedFolderId);
            } else {
                try {
                    await sbiParser.parseInput(lines, selectedFolderId);
                } catch (error) {
                    ui.notifications.error("5E STATBLOCK IMPORTER: An error has occured. Please report it using the module link so it can get fixed.")
                }
            }
        });

        // ###############################
        // DEBUG
        // ###############################
        if (sbiConfig.options.debug) {
            const linesToAdd = [
                "Djinni",
                "Large elemental, chaotic good",
                "Armor Class 17 (natural armor)",
                "Hit Points 161 (14d10 + 84)",
                "Speed 30 ft., fly 90 ft.",
                "STR",
                "DEX",
                "CON",
                "INT",
                "WIS",
                "CHA",
                "21 (+5) 15 (+2) 22 (+6) 15 (+2) 16 (+3) 20 (+5)",
                "Saving Throws Dex +6, Wis +7, Cha +9",
                "Damage Immunities lightning, thunder",
                "Senses darkvision 120 ft., passive Perception 13",
                "Languages Auran",
                "Challenge 11 (7,200 XP)",
                "Elemental Demise. If the djinni dies, its body",
                "disintegrates into a warm breeze, leaving behind only",
                "equipment the djinni was wearing or carrying.",
                "Innate Spellcasting. The djinni’s innate spellcasting",
                "ability is Charisma (spell save DC 17, +9 to hit with spell",
                "attacks). It can innately cast the following spells,",
                "requiring no material components:",
                "At will: detect evil and good, detect magic,",
                "thunderwave",
                "3/day each: create food and water (can create wine",
                "instead of water), tongues, wind walk",
                "1/day each: conjure elemental (air elemental only),",
                "creation, gaseous form, invisibility, major image,",
                "plane shift",
                "Actions",
                "Multiattack. The djinni makes three scimitar attacks.",
                "Scimitar. Melee Weapon Attack: +9 to hit, reach 5 ft.,",
                "one target. Hit: 12 (2d6 + 5) slashing damage plus 3",
                "(1d6) lightning or thunder damage (djinni’s choice).",
                "Create Whirlwind. A 5-­‐foot-­‐radius, 30-­‐foot-­‐tall cylinder",
                "of swirling air magically forms on a point the djinni can",
                "see within 120 feet of it. The whirlwind lasts as long as",
                "the djinni maintains concentration (as if concentrating",
                "on a spell). Any creature but the djinni that enters the",
                "whirlwind must succeed on a DC 18 Strength saving",
                "throw or be restrained by it. The djinni can move the",
                "whirlwind up to 60 feet as an action, and creatures",
                "restrained by the whirlwind move with it. The",
                "whirlwind ends if the djinni loses sight of it.",
                "A creature can use its action to free a creature",
                "restrained by the whirlwind, including itself, by",
                "succeeding on a DC 18 Strength check. If the check",
                "succeeds, the creature is no longer restrained and",
                "moves to the nearest space outside the whirlwind."
            ];

            const statBlock = linesToAdd.join("\n");

            $("#sbi-input").val(statBlock);
        }
    }
}