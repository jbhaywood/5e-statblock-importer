import { sbiUtils } from "./sbiUtils.js";

class ActionDescription {
    name;
    description;

    constructor(name, description) {
        this.name = name;
        this.description = description;
    }
}

export class sbiParser {
    // First word has to start with a capitol letter, followed by 0-3 other words, followed by a period. Support words with hyphens, non-capitol first letter, and parentesis like '(Recharge 5-6)'.
    static #actionTitleRegex = /^(([A-Z]\w+[ \-]?)(\w+ ?){0,3}(\([\w –\-\/]+\))?)\./;
    static #sizeRegex = /^(?<size>\bfine\b|\bdiminutive\b|\btiny\b|\bsmall\b|\bmedium\b|\blarge\b|\bhuge\b|\bgargantuan\b|\bcolossal\b) (?<type>\w+)[,|\s]+(\((?<race>\w+)\))?[,|\s]+(?<alignment>\w+)/i;
    static #armorRegex = /^(armor class) (?<ac>\d+)/i;
    static #healthRegex = /^(hit points) (?<hp>\d+) \((?<formula>\d+d\d+( \+ \d+)?)\)/i;
    static #speedRegex = /(?<name>\w+) (?<value>\d+)/ig;
    static #abilityNamesRegex = /\bstr\b|\bdex\b|\bcon\b|\bint\b|\bwis\b|\bcha\b/ig;
    static #abilityValuesRegex = /(?<base>\d+)\s?\((?<modifier>[\+|-|−]\d+)\)/g;
    static #abilitySavesRegex = /(?<name>\bstr\b|\bdex\b|\bcon\b|\bint\b|\bwis\b|\bcha\b) (?<modifier>[\+|-]\d+)/ig;
    static #skillsRegex = /(?<name>\bacrobatics\b|\barcana\b|\banimal handling\b|\bathletics\b|\bdeception\b|\bhistory\b|\binsight\b|\bintimidation\b|\binvestigation\b|\bmedicine\b|\bnature\b|\bperception\b|\bperformance\b|\bpersuasion\b|\breligion\b|\bsleight of hand\b|\bstealth\b|\bsurvival\b) (?<modifier>[\+|-]\d+)/ig;
    static #sensesRegex = /(?<name>\bdarkvision\b|\bblindsight\b|\btremorsense\b|\btruesight\b) (?<modifier>\d+)/i;
    static #challengeRegex = /^challenge (?<cr>[\d/]+) \((?<xp>[\d,]+)/i;
    static #spellCastingRegex = /innately cast (?<spell>[\w\s]+)|\((?<perday>\d+)\/day\)|spellcasting ability is (?<ability>\w+)|spell save dc (?<savedc>\d+)/ig;
    static #attackRegex = /(attack|damage): \+(?<tohit>\d+) to hit/i;
    static #reachRegex = /reach (?<reach>\d+) ft/i;
    static #rangeRegex = /range (?<near>\d+)\/(?<far>\d+) ft/i;
    static #rechargeRegex = /\(recharge (?<recharge>\d+)([–|-]\d+)?\)/i;
    static #savingThrowRegex = /dc (?<savedc>\d+) (?<saveability>\w+) saving throw/i;
    static #versatileRegex = /\((?<damageroll>\d+d\d+( \+ \d+)?)\) (?<damagetype>\w+) damage if used with two hands/i;
    static #targetRegex = /(?<range>\d+)-foot (?<shape>\w+)/i;
    static #damageRollsQuery = "(?<={0})[\\s\\w\\d,]+\\((?<damageroll1>\\d+d\\d+)( \\+ (?<damagemod1>\\d+))?\\) (?<damagetype1>\\w+)(.+plus.+\\((?<damageroll2>\\d+d\\d+( \\+ (?<damagemod2>\\d+))?)\\) (?<damagetype2>\\w+))?";

    static async parseInput(lines) {
        if (lines.length) {
            const sectionHeaders = [
                "actions",
                "reactions",
                "legendary actions",
                "lair actions",
                "regional effects"
            ];

            // Save off the lines that preceed the first of the above sections.
            const storedLines = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                if (!sectionHeaders.includes(line.toLowerCase())) {
                    storedLines.push(line);
                }
                else {
                    lines.splice(0, i);
                    break;
                }
            }

            // Split out the sections into a dictionary.
            const sections = {};
            let header = null;

            lines.forEach(line => {
                const trimmedLine = line.trim();

                if (sectionHeaders.includes(trimmedLine.toLowerCase())) {
                    header = trimmedLine;
                    sections[header] = [];
                }
                else {
                    sections[header].push(trimmedLine);
                }
            });

            const actorName = storedLines.shift();

            let actor = await Actor.create({
                name: actorName,
                type: "npc"
            })

            // Add the sections to the character actor.
            Object.entries(sections).forEach(async ([key, value]) => {
                const sectionHeader = key;

                // Actions and Reactions are a special case, so handle them separately.
                if (sectionHeader.toLowerCase() === "actions" || sectionHeader.toLowerCase() === "reactions") {
                    if (sectionHeader.toLowerCase() === "actions") {
                        await this.SetActionsAsync(value, actor);
                    }
                    else {
                        await this.SetReactionsAsync(value, actor);
                    }
                }
                else {
                    const actionDescriptions = this.GetActionDescriptions(value);

                    for (const actionDescription of actionDescriptions) {
                        const itemData = {};
                        itemData.name = sbiUtils.capitalize(actionDescription.name);
                        itemData.type = "feat";

                        sbiUtils.assignToObject(itemData, "data.description.value", actionDescription.description);

                        // Add these just so that it doesn't say the action is not equipped and not proficient in the UI.
                        sbiUtils.assignToObject(itemData, "data.equipped", true);
                        sbiUtils.assignToObject(itemData, "data.proficient", true);

                        // Determine whether this is a legendary or lair action.
                        let itemType = null;

                        if (sectionHeader.toLowerCase() === "lair actions") {
                            itemType = "lair";
                        }
                        else if (sectionHeader.toLowerCase() === "legendary actions") {
                            itemType = "legendary";
                        }

                        sbiUtils.assignToObject(itemData, "flags.adnd5e.itemInfo.type", itemType);

                        const item = new Item(itemData);
                        await actor.createEmbeddedDocuments("Item", [item.toObject()]);
                    }
                }
            });

            await this.SetRacialFeaturesAsync(storedLines, actor);
            await this.SetArmorAsync(storedLines, actor);
            await this.SetHealthAsync(storedLines, actor);
            await this.SetSpeedAsync(storedLines, actor);
            await this.SetInitiativeAsync(storedLines, actor);
            await this.SetAbilitiesAsync(storedLines, actor);
            await this.SetSavingThrowsAsync(storedLines, actor);
            await this.SetSkillsAsync(storedLines, actor);
            await this.SetDamagesAsync(storedLines, actor, "resistances");
            await this.SetDamagesAsync(storedLines, actor, "immunities");
            this.SetConditionImmunities(storedLines, actor);
            this.SetDamageVulnerabilities(storedLines, actor);
            await this.SetSensesAsync(storedLines, actor);
            await this.SetLanguagesAsync(storedLines, actor);
            await this.SetChallengeAsync(storedLines, actor);
            await this.SetFeaturesAsync(storedLines, actor);
        }
    }

    static async SetActionsAsync(lines, actor) {
        const actionDescriptions = this.GetActionDescriptions(lines);

        for (const actionDescription of actionDescriptions) {
            const name = actionDescription.name;
            const description = actionDescription.description;

            const itemData = {};
            itemData.name = sbiUtils.capitalize(name);
            itemData.type = "feat";

            sbiUtils.assignToObject(itemData, "data.identified", true);
            sbiUtils.assignToObject(itemData, "data.equipped", true);
            sbiUtils.assignToObject(itemData, "data.proficient", true);
            sbiUtils.assignToObject(itemData, "data.quantity", 1);
            sbiUtils.assignToObject(itemData, "data.description.value", description);
            sbiUtils.assignToObject(itemData, "data.activation.type", "action");
            sbiUtils.assignToObject(itemData, "data.activation.cost", 1);

            // The "Multiattack" action isn't a real action, so there's nothing more to add to it.
            if (name.toLowerCase() !== "multiattack") {

                // TODO: this needs to be set after we've parsed the abilities.
                sbiUtils.assignToObject(itemData, "data.ability", actor.data.data.abilities.str.mod > actor.data.data.abilities.dex.mod ? "str" : "dex");

                if (name.toLowerCase() === "illumination") {
                    this.SetIllumination(description, item);
                }
                else {
                    this.SetAttack(description, itemData);
                    this.SetSavingThrow(description, itemData);
                    this.SetRecharge(name, itemData);
                    this.SetTarget(description, itemData);
                    this.SetReach(description, itemData);
                    this.SetRange(description, itemData);
                }
            }

            const item = new Item(itemData);
            await actor.createEmbeddedDocuments("Item", [item.toObject()]);
        };
    }

    static async SetReactionsAsync(lines, actor) {
        const actionDescriptions = this.GetActionDescriptions(lines);

        for (const actionDescription of actionDescriptions) {
            const name = actionDescription.name;
            const description = actionDescription.description;

            const itemData = {};
            itemData.name = sbiUtils.capitalize(name);
            itemData.type = "feat";

            sbiUtils.assignToObject(itemData, "flags.adnd5e.itemInfo.type", "reaction");
            sbiUtils.assignToObject(itemData, "data.description.value", description);
            sbiUtils.assignToObject(itemData, "data.activation.type", "reaction");
            sbiUtils.assignToObject(itemData, "data.activation.cost", 1);

            const item = new Item(itemData);
            await actor.createEmbeddedDocuments("Item", [item.toObject()]);
        }
    }

    static async SetRacialFeaturesAsync(lines, actor) {
        // First word in the line should be one of the size indicators.
        const matchObj = lines
            .map(line => {
                return {
                    "line": line,
                    "match": this.#sizeRegex.exec(line)
                }
            })
            .find(obj => obj.match);

        if (matchObj) {
            const sizeValue = matchObj.match.groups.size.toLowerCase();
            let size = null

            switch (sizeValue) {
                case "small":
                    size = "sm";
                    break;
                case "medium":
                    size = "med";
                    break;
                case "large":
                    size = "lg";
                    break;
                case "gargantuan":
                    size = "grg";
                    break;
                default:
                    size = sizeValue;
                    break;
            }

            await actor.update({
                "data": {
                    "traits": {
                        "size": size
                    },
                    "details": {
                        "alignment": sbiUtils.capitalize(matchObj.match.groups.alignment?.trim()),
                        "race": sbiUtils.capitalize(matchObj.match.groups.race?.trim()),
                        "type": sbiUtils.capitalize(matchObj.match.groups.type?.trim())
                    }
                }
            })

            sbiUtils.remove(lines, matchObj.line);
        }
    }

    static async SetArmorAsync(lines, actor) {
        const matchObj = lines
            .map(line => {
                return {
                    "line": line,
                    "match": this.#armorRegex.exec(line)
                }
            })
            .find(obj => obj.match);

        if (matchObj) {
            await actor.update({
                "data": {
                    "attributes": {
                        "ac": {
                            "value": parseInt(matchObj.match.groups.ac)
                        }
                    }
                }
            })

            sbiUtils.remove(lines, matchObj.line);
        }
    }

    static async SetHealthAsync(lines, actor) {
        const matchObj = lines
            .map(line => {
                return {
                    "line": line,
                    "match": this.#healthRegex.exec(line)
                }
            })
            .find(obj => obj.match);

        if (matchObj) {
            const hp = parseInt(matchObj.match.groups.hp);

            await actor.update({
                "data": {
                    "attributes": {
                        "hp": {
                            "value": hp,
                            "max": hp,
                            "formula": matchObj.match.groups.formula
                        }
                    }
                }
            });

            sbiUtils.remove(lines, matchObj.line);
        }
    }

    static async SetSpeedAsync(lines, actor) {
        const speedLine = lines.find(line => line.toLowerCase().startsWith("speed"));

        if (speedLine != null) {
            const match = [...speedLine.matchAll(this.#speedRegex)];
            const speedMatch = match.find(m => m.groups.name.toLowerCase() === "speed");

            if (speedMatch != null) {
                const speedValue = speedMatch.groups.value;

                await actor.update({
                    "data": {
                        "attributes": {
                            "speed": {
                                "value": speedValue
                            },
                            "movement": {
                                "walk": parseInt(speedValue)
                            }
                        }
                    }
                })
            }

            const otherSpeeds = match.filter(m => m != speedMatch)
                .map(m => {
                    return {
                        "name": m.groups.name,
                        "value": m.groups.value
                    }
                })
                .filter(obj => obj.name != null && obj.value != null);

            if (otherSpeeds.length) {
                await actor.update({
                    "data": {
                        "attributes": {
                            "speed": {
                                "special": otherSpeeds
                                    .map(obj => `${sbiUtils.capitalize(obj.name)} ${obj.value} ft.`)
                                    .join(", ")
                            },
                            "movement": {
                                "burrow": otherSpeeds.find(obj => obj.name.toLowerCase().startsWith("burrow"))?.value.concat(" ft."),
                                "climb": otherSpeeds.find(obj => obj.name.toLowerCase().startsWith("climb"))?.value.concat(" ft."),
                                "fly": otherSpeeds.find(obj => obj.name.toLowerCase().startsWith("fly"))?.value.concat(" ft."),
                                "swim": otherSpeeds.find(obj => obj.name.toLowerCase().startsWith("swim"))?.value.concat(" ft."),
                                "hover": speedLine.toLowerCase().includes("hover")
                            }
                        }
                    }
                })
            }

            sbiUtils.remove(lines, speedLine);
        }
    }

    static async SetInitiativeAsync(lines, actor) {
        const line = lines.find(l => l.toLowerCase().startsWith("roll initiative"));

        if (line != null) {
            const number = parseInt(sbiUtils.last(line.Split(' ')));
            await actor.update(sbiUtils.assignToObject(actorData, "data.attributes.init.bonus", number));
            sbiUtils.remove(lines, line);
        }
    }

    static async SetAbilitiesAsync(lines, actor) {
        const foundAbilityNames = [];
        const foundAbilityValues = [] //new List<Match>();
        const foundLines = [];

        for (const l of lines) {
            const line = l.trim();

            // Names come before values, so if we've found all the values then we've found all the names.
            if (foundAbilityValues.length == 6) {
                break;
            }

            if (this.#abilityNamesRegex.test(line)) {
                // TODO: Figure out why using the regex variable doesn't work, but using the same raw regex here does.
                var abilityMatches = [...line.matchAll(/\bstr\b|\bdex\b|\bcon\b|\bint\b|\bwis\b|\bcha\b/ig)];
                for (const match of abilityMatches) {
                    foundAbilityNames.push(match[0]);
                }
                foundLines.push(l);
            }
            else {
                const valueMatches = [...line.matchAll(this.#abilityValuesRegex)];

                if (valueMatches.length) {
                    foundLines.push(l);

                    const values = valueMatches.map(m => m.groups.base);
                    foundAbilityValues.push.apply(foundAbilityValues, values);
                }
            }
        }

        const actorData = {};

        // Set the value of each ability on the appropriate data property.
        for (let i = 0; i < foundAbilityNames.length; i++) {
            const name = foundAbilityNames[i].toLowerCase();
            const propPath = `data.abilities.${name}.value`;
            sbiUtils.assignToObject(actorData, propPath, parseInt(foundAbilityValues[i]));
        }

        await actor.update(actorData);

        for (const line of foundLines) {
            sbiUtils.remove(lines, line);
        }
    }

    static async SetSavingThrowsAsync(lines, actor) {
        const line = lines.find(line => line.toLowerCase().startsWith("saving throw"));

        if (line != null) {
            const matches = [...line.matchAll(this.#abilitySavesRegex)];
            const actorData = {};

            for (const match of matches) {
                const name = match.groups.name.toLowerCase();
                const propPath = `data.abilities.${name}.proficient`;
                sbiUtils.assignToObject(actorData, propPath, 1);
            }

            await actor.update(actorData);
            sbiUtils.remove(lines, line);
        }
    }

    static async SetSkillsAsync(lines, actor) {
        const startText = "skills";
        const line = lines.find(line => line.toLowerCase().startsWith(startText));

        if (line != null) {
            const foundLine = this.CombineLines(lines, line).slice(startText.Length).toLowerCase();
            const matches = [...foundLine.matchAll(this.#skillsRegex)];
            const actorData = {};

            for (const match of matches) {
                const name = this.ConvertToShortSkill(match.groups.name);
                const propPath = `data.skills.${name}.value`;
                sbiUtils.assignToObject(actorData, propPath, 1);
            }

            await actor.update(actorData);
            sbiUtils.remove(lines, line);
        }
    }

    static async SetDamagesAsync(lines, actor, type) {
        const startText = `damage ${type} `;
        const line = lines.find(line => line.toLowerCase().startsWith(startText));

        if (line != null) {
            const foundLine = this.CombineLines(lines, line).slice(startText.Length).toLowerCase();

            const types = [
                "bludgeoning",
                "piercing",
                "slashing",
                "acid",
                "cold",
                "fire",
                "lightning",
                "necrotic",
                "poison",
                "psychic",
                "radiant",
                "thunder"
            ].filter(type => foundLine.toLowerCase().includes(type));

            let typeValue;
            switch (type) {
                case "resistances":
                    typeValue = "dr";
                    break;
                case "immunities":
                    typeValue = "di";
                    break;
                default:
                    break;
            }

            if (typeValue) {
                if (types.length) {
                    const actorData = sbiUtils.assignToObject({}, `data.traits.${typeValue}.value`, types)
                    await actor.update(actorData);
                }

                if (foundLine.toLowerCase().includes("nonmagical weapons")) {
                    const actorData = sbiUtils.assignToObject({}, `data.traits.${typeValue}.custom`, "From nonmagical weapons")
                    await actor.update(actorData);
                }
            }

            sbiUtils.remove(lines, line);
        }
    }

    // Example: Condition Immunities paralyzed, poisoned, unconscious
    static SetConditionImmunities(lines, actor) {
        this.SetArrayValues(lines, "condition immunities ",
            async (values) => {
                await actor.update(sbiUtils.assignToObject({}, "data.traits.ci.value", values));
            });
    }

    // Example: Senses darkvision 60 ft., passive Perception 18
    static async SetSensesAsync(lines, actor) {
        const startText = "senses";
        const line = lines.find(line => line.toLowerCase().startsWith(startText));

        if (line != null) {
            const senses = this.CombineLines(lines, line)
                .slice(startText.length)
                .split(",")
                .map(line => line.trim());

            const actorData = {};

            for (const sense of senses) {
                const match = this.#sensesRegex.exec(sense);

                if (match) {
                    const name = match.groups.name.toLowerCase();
                    sbiUtils.assignToObject(actorData, `data.attributes.senses.${name}`, parseInt(match.groups.modifier));
                } else {
                    sbiUtils.assignToObject(actorData, "data.attributes.senses.special", sbiUtils.capitalize(sense));
                }
            }


            await actor.update(actorData);
            sbiUtils.remove(lines, line);
        }
    }

    // Example: Damage Resistances bludgeoning, piercing, and slashing from nonmagical weapons
    static SetDamageVulnerabilities(lines, actor) {
        this.SetArrayValues(lines, "damage vulnerabilities ",
            async (values) => {
                await actor.update(sbiUtils.assignToObject({}, "data.traits.dv.value", values));
            });
    }

    // Example: Languages Common, Darakhul, Draconic, Elvish, Sylvan
    static async SetLanguagesAsync(lines, actor) {
        const knownLanguages = [
            "aarakocra",
            "abyssal",
            "aquan",
            "auran",
            "celestial",
            "common",
            "deep",
            "draconic",
            "druidic",
            "dwarvish",
            "elvish",
            "giant",
            "gith",
            "gnoll",
            "gnomish",
            "goblin",
            "halfling",
            "ignan",
            "infernal",
            "orc",
            "primordial",
            "sylvan",
            "terran",
            "cant",
            "undercommon"
        ];

        const startText = "languages";
        const line = lines.find(line => line.toLowerCase().startsWith(startText));

        if (line != null) {
            const foundLine = line.toLowerCase().replace(startText, "");
            const values = foundLine.split(",").map(str => this.ConvertLanguage(str));
            const knownValues = sbiUtils.intersect(values, knownLanguages);
            const unknownValues = sbiUtils.except(values, knownValues).map(str => sbiUtils.capitalize(str));

            const actorData = {};
            sbiUtils.assignToObject(actorData, "data.traits.languages.value", knownValues);
            sbiUtils.assignToObject(actorData, "data.traits.languages.custom", unknownValues.join(";"));

            await actor.update(actorData);
            sbiUtils.remove(lines, line);
        }
    }

    // Example: Challenge 11 (7,200 XP)
    static async SetChallengeAsync(lines, actor) {
        const foundMatch = lines
            .map(line => {
                return { "line": line, "match": this.#challengeRegex.exec(line) }
            })
            .filter(obj => obj.match !== null)
            .find(obj => obj.match.length);

        if (foundMatch != null) {
            const crValue = foundMatch.match.groups.cr;

            // Handle fractions.
            let crNumber = 0;

            if (crValue.includes("/")) {
                crNumber = sbiUtils.parseFraction(crValue);
            }
            else {
                crNumber = parseInt(foundMatch.match.groups.cr);
            }

            const actorData = {};
            sbiUtils.assignToObject(actorData, "data.details.cr", crNumber);
            sbiUtils.assignToObject(actorData, "data.details.xp.value", parseInt(foundMatch.match.groups.xp.replace(",", "")));

            await actor.update(actorData);
            sbiUtils.remove(lines, foundMatch.line);
        }
    }

    static async SetFeaturesAsync(lines, actor) {
        const actionDescriptions = this.GetActionDescriptions(lines);

        for (const actionDescription of actionDescriptions) {
            const name = actionDescription.name;
            const description = actionDescription.description;

            const itemData = {};
            itemData.name = sbiUtils.capitalize(name);
            itemData.type = "feat";

            sbiUtils.assignToObject(itemData, "data.description.value", description);
            sbiUtils.assignToObject(itemData, "data.activation.type", "none");

            if (name.toLowerCase() === "innate spellcasting") {
                await this.SetInnateSpellsAsync(description, itemData, actor);
            }

            const item = new Item(itemData);
            await actor.createEmbeddedDocuments("Item", [item.toObject()]);
        }
    }

    // Example: Melee Weapon Attack: +8 to hit, reach 5 ft.,one target.
    static SetAttack(text, itemData) {
        const match = this.#attackRegex.exec(text);

        if (match !== null) {
            itemData.type = "weapon";
            sbiUtils.assignToObject(itemData, "data.weaponType", "natural");

            this.SetDamageRolls(text, itemData, "hit:");
        }
    }

    // Example:
    // Innate Spellcasting. The aridni's innate spellcasting ability is Charisma (spell save DC 14). 
    // It can innately cast the following spells: 
    // At will: dancing lights, detect magic, invisibility 
    // 3/day: charm person, faerie fire, mage armor 
    // 1/day: spike growth
    static async SetInnateSpellsAsync(description, itemData, actor) {
        const spellRegex = /at will:|\d\/day( each)?:/ig;
        const spellMatches = [...description.matchAll(spellRegex)];
        let allSpellNames = [];

        // Put spell groups on their own lines in the description so that it reads better.
        if (spellMatches.length) {
            const featureDescription = [];
            let lastIndex = description.length;

            // Go backwards through the matches and separate the header from the spells so that the header is bolded.
            for (let index = spellMatches.length - 1; index >= 0; index--) {
                const match = spellMatches[index];
                const spellNames = description
                    .slice(match.index, lastIndex)
                    .slice(match[0].length)
                    .split(",")
                    .map(spell => sbiUtils.capitalize(spell.trim()));

                featureDescription.push(`<p><b>${match[0]}</b> ${spellNames.join(", ")}</p>`);
                lastIndex = match.index;

                // Remove text in parenthesis when storing the spell name for lookup later.
                allSpellNames = allSpellNames.concat(spellNames.map(spell => spell.replace(/\(.*\)/, "")));
            }

            sbiUtils.assignToObject(itemData, "data.description.value", featureDescription.reverse().join("\n"));
        }

        // Set the spellcasting ability.
        const matches = [...description.matchAll(this.#spellCastingRegex)];

        if (matches.length) {
            const spell = this.GetGroupValue("spell", matches);

            if (spell) {
                const spellcastingAbility = this.GetGroupValue("ability", matches);

                if (spellcastingAbility != null) {
                    const actorData = sbiUtils.assignToObject({}, "data.attributes.spellcasting", this.ConvertToShortAbility(spellcastingAbility));
                    await actor.update(actorData)
                }
            }
        }

        // Add spells to actor.
        if (allSpellNames.length) {
            const pack = game.packs.get("dnd5e.spells");

            if (pack) {
                for (const spellName of allSpellNames) {
                    var spell = pack.index.find(e => spellName.toLowerCase() === e.name.toLowerCase());

                    if (spell) {
                        var spellDoc = await pack.getDocument(spell._id);
                        await actor.createEmbeddedDocuments("Item", [spellDoc.data.toObject()]);
                    }
                }
            }
        }
    }

    // Example: Each creature in the cone must make a DC 13 Dexterity saving throw, taking 44 (8d10) 
    // cold damage on a failed save or half as much damage on a ssuccessful one.
    static SetSavingThrow(text, itemData) {
        const match = this.#savingThrowRegex.exec(text);

        if (match !== null) {
            const dc = match.groups.savedc;
            const ability = match.groups.saveability;

            sbiUtils.assignToObject(itemData, "data.actionType", "save");
            sbiUtils.assignToObject(itemData, "data.save.ability", this.ConvertToShortAbility(ability));
            sbiUtils.assignToObject(itemData, "data.save.dc", parseInt(dc));
            sbiUtils.assignToObject(itemData, "data.save.scaling", "flat");

            this.SetDamageRolls(text, itemData, "saving throw");
        }
    }

    // Example: Frost Breath (Recharge 5–6).
    static SetRecharge(text, itemData) {
        const match = this.#rechargeRegex.exec(text);

        if (match !== null) {
            sbiUtils.assignToObject(itemData, "data.recharge.value", parseInt(match.groups.recharge));
            sbiUtils.assignToObject(itemData, "data.recharge.charged", true);
        }
    }

    // Example: The hound exhales a 15-foot cone of frost.
    static SetTarget(text, itemData) {
        const match = this.#targetRegex.exec(text);

        if (match !== null) {
            sbiUtils.assignToObject(itemData, "data.target.value", match.groups.range);
            sbiUtils.assignToObject(itemData, "data.target.type", match.groups.shape);
            sbiUtils.assignToObject(itemData, "data.target.units", "ft");
        }
    }

    // Example: Melee Weapon Attack: +8 to hit, reach 5 ft., one target.
    static SetReach(text, itemData) {
        const match = this.#reachRegex.exec(text);

        if (match !== null) {
            const reach = parseInt(match.groups.reach);

            sbiUtils.assignToObject(itemData, "data.range.value", reach);
            sbiUtils.assignToObject(itemData, "data.range.units", "ft");
            sbiUtils.assignToObject(itemData, "data.actionType", "mwak");
        }
    }

    // Example: Ranged Weapon Attack: +7 to hit, range 150/600 ft., one target.
    static SetRange(text, itemData) {
        const match = this.#rangeRegex.exec(text);

        if (match !== null) {
            const nearRange = parseInt(match.groups.near);
            const farRange = parseInt(match.groups.far);

            sbiUtils.assignToObject(itemData, "data.range.value", nearRange);
            sbiUtils.assignToObject(itemData, "data.range.long", farRange);
            sbiUtils.assignToObject(itemData, "data.range.units", "ft");
            sbiUtils.assignToObject(itemData, "data.actionType", "rwak");
            sbiUtils.assignToObject(itemData, "data.ability", "dex");
        }
    }

    // Example:
    // Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 10(2d6 + 3) slashing damage plus 3(1d6) acid damage.
    // or
    // Frost Breath (Recharge 5–6). The hound exhales a 15-foot cone of frost. Each creature in the cone must make a DC 13 
    // Dexterity saving throw, taking 44(8d10) cold damage on a failed save or half as much damage on a successful one.
    static SetDamageRolls(text, itemData, lookup) {
        const regexQuery = sbiUtils.format(this.#damageRollsQuery, lookup);
        const regex = new RegExp(regexQuery, "i");
        const match = regex.exec(text);

        if (match !== null) {
            const damageRoll = match.groups.damageroll1;
            const damageType = match.groups.damagetype1;
            const plusDamageRoll = match.groups.damageroll2;
            const plusDamageType = match.groups.damagetype2;

            // Set the damage rolls and types. I've never seen more that two damage rolls for one attack.
            const damageParts = [];

            if (damageRoll && damageType) {
                damageParts.push([`${damageRoll} + @mod`, damageType]);
            }

            if (plusDamageRoll && plusDamageType) {
                damageParts.push([`${plusDamageRoll} + @mod`, plusDamageType]);
            }

            if (itemData.data.damage === undefined) {
                itemData.data.damage = {};
            }

            if (damageParts.length) {
                const currentParts = itemData.data.damage.parts ?? [];
                itemData.data.damage.parts = currentParts.concat(damageParts);
            }
        }

        const versatilematch = this.#versatileRegex.exec(text);

        if (versatilematch !== null) {
            itemData.data.damage.versatile = versatilematch.groups.damageroll;
            itemData.data.properties.ver = true;
        }
    }

    // Combines lines of text into sentences and paragraphs.
    static GetActionDescriptions(lines) {
        const result = [];
        let actionDescription = null;
        let foundSentenceEnd = true;

        for (const line of lines) {
            const match = this.#actionTitleRegex.exec(line);

            if (match && foundSentenceEnd) {
                actionDescription = new ActionDescription(
                    match[match.index].replace(".", ""),
                    line.slice(match[match.index].length).trim());

                result.push(actionDescription);
            }
            else if (actionDescription == null) {
                actionDescription = new ActionDescription("Description", line);

                result.push(actionDescription);
            }
            else {
                if (actionDescription.description == null) {
                    actionDescription.description = line;
                }
                else {
                    actionDescription.description = `${actionDescription.description} ${line}`;
                }
            }

            // TODO: add special handling for spell blocks because the spell lines don't end with a period.
            // Example:
            // Innate Spellcasting. The glabrezu’s spellcasting ability
            // is Intelligence (spell save DC 16). The glabrezu can
            // innately cast the following spells, requiring no material
            // components:
            // At will: darkness, detect magic, dispel magic
            // 1/day each: confusion, fly, power word stun
            // Magic Resistance. The glabrezu has advantage on
            // saving throws against spells and other magical effects.
            foundSentenceEnd = line.trimEnd().endsWith(".")
        }

        return result;
    }

    // ===============================
    // Utilities
    // ===============================

    static SetArrayValues(lines, startText, setValueFunc) {
        const line = lines.find(line => line.toLowerCase().startsWith(startText));

        if (line != null) {
            const foundLine = this.CombineLines(lines, line)
                .slice(startText.length)
                .toLowerCase();

            const values = foundLine
                .split(",")
                .map(str => str.trim()
                    .toLowerCase());

            setValueFunc(values);
            sbiUtils.remove(lines, line);
        }
    }

    static CombineLines(lines, startingLine) {
        // The "line beginnings" check is here to handle the block of attributes right under the ability scores.
        const lineBeginnings = [
            "damage vulnerabilities",
            "damage resistances",
            "damage immunities",
            "condition immunities",
            "senses",
            "languages",
            "challenge"
        ];

        const linesToCheck = sbiUtils.skipWhile(lines, (line) => line !== startingLine);
        const combinedLines = [];
        const linesCount = linesToCheck.length;

        if (linesCount > 0) {
            for (let i = 0; i < linesCount; i++) {
                const currentLine = linesToCheck[i];
                combinedLines.push(currentLine);

                const nextLine = i < linesCount - 1 ? linesToCheck[i + 1] : null;

                if (nextLine != null
                    && (lineBeginnings.some(lb => nextLine.toLowerCase().startsWith(lb))
                        || (currentLine.trimEnd().endsWith('.') && sbiUtils.startsWithCapital(nextLine)))) {
                    break;
                }
            }
        }

        for (let i = 0; i < combinedLines.length; i++) {
            const line = combinedLines[i];

            // Remove the hyphen from hyphenated words that span a second line,
            // except if it's part of a range specification (like "15-foot cone").
            if (i != combinedLines.length - 1 && !combinedLines[i + 1].toLowerCase().startsWith("foot")) {
                line.trimEnd('-');
            }

            sbiUtils.remove(lines, line);
        }

        return combinedLines.join(" ").replace("- ", "-");
    }

    static ConvertLanguage(language) {
        const result = language.trim().toLowerCase();

        switch (result) {
            case "deep speech":
                result = "deep";
                break;
            case "thieves' cant":
                result = "cant";
                break;
            default:
                break;
        }

        return result;
    }

    static GetGroupValue(group, matches) {
        return matches.map(m => m.groups[group]).find(val => val);
    }

    static ConvertToShortAbility(abilityName) {
        const ability = abilityName.toLowerCase();

        switch (ability) {
            case "strength": return "str";
            case "dexterity": return "dex";
            case "constitution": return "con";
            case "intelligence": return "int";
            case "wisdom": return "wis";
            case "charisma": return "cha";
            default:
                return ability;
        }
    }

    static ConvertToShortSkill(skillName) {
        const skill = skillName.toLowerCase();

        switch (skill) {
            case "acrobatics":
                return "acr";
            case "animal handling":
                return "ani";
            case "arcana":
                return "arc";
            case "athletics":
                return "ath";
            case "deception":
                return "dec";
            case "history":
                return "his";
            case "insight":
                return "ins";
            case "intimidation":
                return "itm";
            case "investigation":
                return "inv";
            case "medicine":
                return "med";
            case "nature":
                return "nat";
            case "perception":
                return "prc";
            case "performance":
                return "prf";
            case "persuasion":
                return "per";
            case "religion":
                return "rel";
            case "sleight of hand":
                return "slt";
            case "stealth":
                return "ste";
            case "survival":
                return "sur";
            default:
                return skill;
        }
    }
}