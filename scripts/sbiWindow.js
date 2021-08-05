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

        let importButton = $("#sbi-import-button");
        importButton.on("click", async function () {
            sbiUtils.log("Clicked import button");

            // TODO: let user define the folder that actor goes into

            const lines = $("#sbi-input").val().trim().split(/\n/g);
            sbiParser.parseInput(lines);
        });

        // ###############################
        // DEBUG
        // ###############################
        if (sbiConfig.options.debug) {
            // Prep scene for testing
            game.actors.forEach(t => {
                if (!t.data.folder) {
                    t.delete();
                }
            });

            const linesToAdd = [
                "NAINA",
                "Large dragon (shapechanger), lawful evil",
                "Armor Class 17 (natural armor)",
                "Hit Points 231 (22d10 + 110)",
                "Speed 40 ft., fly 120 ft. (hover)",
                "STR",
                "DEX",
                "CON",
                "INT",
                "WIS",
                "CHA",
                "20 (+5)",
                "16(+3)",
                "21(+5)",
                "15(+2)",
                "18(+4)",
                "18(+4)",
                "Saving Throws Dex +7, Con +9, Int +6, Wis +8, Cha +8",
                "Skills Arcana +6, Deception +8, Insight +8, Perception +8,",
                "Persuasion +8, Sleight of Hand +7",
                "dAmAge vulnerAbilities fire",
                "Damage Resistances bludgeoning, piercing, and slashing from",
                "nonmagical weapons",
                "dAmAge immunities cold",
                "Condition Immunities paralyzed, poisoned, unconscious",
                "Senses darkvision 60 ft., passive Perception 18",
                "Languages Common, Darakhul, Draconic, Elvish, Sylvan",
                "Challenge 11 (7,200 XP)",
                "Magic Sensitive.The naina detects magic as if it were",
                "permanently under the effect of a detect magic spell.",
                "Spellcasting.The naina is a 9th-level spellcaster. Her spellcasting",
                "ability is Charisma (spell save DC 16, +8 to hit with spell",
                "attacks). The naina has the following sorcerer spells prepared:",
                "Cantrips(at will): dancing lights, mage hand, mending, ray of",
                "frost, resistance, silent image",
                "1st level (4 slots): charm person, thunderwave, witch bolt",
                "2nd level (3 slots): darkness, invisibility, locate object",
                "3rd level(3 slots): dispel magic, hypnotic pattern",
                "4th level (3 slots): dimension door",
                "5th level (1 slot): dominate person",
                "Shapechanger. The naina can use her action to polymorph",
                "into one of her two forms: a drake or a female humanoid. She",
                "cannot alter either form’s appearance or capabilities (with the",
                "exception of her breath weapon) using this ability, and damage",
                "sustained in one form transfers to the other form.",
                "Innate Spellcasting. Revich’s spellcasting ability is",
                "Charisma (spell save DC 20). Revich can innately cast the",
                "following spells, requiring no material components:",
                "At will: detect evil and good, invisibility (self only)",
                "3/day each: blade barrier, dispel evil and good, flame",
                "strike, raise dead",
                "1/day each: commune, control weather, insect plague",
                "ACTIONS",
                "Multiattack. The naina makes two claw attacks and one bite",
                "attack.",
                "Bite (drake form only). Melee Weapon Attack: +9 to hit, reach 5",
                "ft., one target. Hit: 24(3d12 + 5) piercing damage.",
                "Claw(drake form only). Melee Weapon Attack: +9 to hit, reach",
                "5 ft., one target. Hit: 24(3d12 + 5) slashing damage.",
                "Poison Breath (Recharge 5-6). While in drake form(only), the",
                "naina breathes a 20-foot cone of poison gas, paralytic gas, or",
                "sleep gas.",
                "Dagger. Melee or Ranged Weapon Attack: +8 to hit,",
                "reach 5 ft. or range 20/60 ft., one target. Hit: 7 (1d4 +",
                "5) piercing damage, and a target creature must succeed",
                "on a DC 15 Constitution saving throw or be poisoned",
                "for 1 minute. A poisoned creature can repeat the save",
                "at the end of each of its turns, ending the effect on",
                "itself on a success.",
                "Poison. A creature caught in this poison gas takes 18",
                "(4d8) poison damage and is poisoned; a successful DC 17",
                "Constitution saving throw reduces damage to half and negates",
                "the poisoned condition. While poisoned this way, the creature",
                "must repeat the saving throw at the end of each of its turns.",
                "On a failure, it takes 9 (2d8) poison damage and the poisoning",
                "continues; on a success, the poisoning ends.",
                "Paralysis. A creature caught in this paralytic gas must succeed",
                "on a DC 17 Constitution saving throw or be paralyzed for 2d4",
                "rounds. A paralyzed creature repeats the saving throw at the",
                "end of each of its turns; a successful save ends the paralysis.",
                "Sleep. A creature caught in this sleeping gas must succeed on",
                "a DC 17 Constitution saving throw or fall unconscious for 6",
                "rounds. A sleeping creature repeats the saving throw at the end",
                "of each of its turns; it wakes up if it makes the save successfully.",
                "REACTIONS",
                "Protect. The shadow fey guardian imposes disadvantage",
                "on an attack roll against an ally within 5 feet. To do so,",
                "the guardian must be wielding a melee weapon."
            ];

            const statBlock = linesToAdd.join("\n");

            $("#sbi-input").val(statBlock);
        }
    }
}