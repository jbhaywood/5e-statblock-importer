import {
    sbiUtils
} from "./sbiUtils.js";

class ActionDescription {
    name;
    description;

    constructor(name, description) {
        this.name = name;
        this.description = description;
    }
}

export class sbiParser {
    // For action titles, the first word has to start with a capital letter, followed by 0-3 other words, ignoring prepositions,
    // followed by a period. Support words with hyphens, non-capital first letter, and parentheses like '(Recharge 5-6)'.
    static #actionTitleRegex = /^(([A-Z]\w+[ \-]?)(\s(of|and|the|from|in|at|on|with|to|by)\s)?(\w+ ?){0,3}(\([\w –\-\/]+\))?)\./;
    static #racialDetailsRegex = /^(?<size>\bfine\b|\bdiminutive\b|\btiny\b|\bsmall\b|\bmedium\b|\blarge\b|\bhuge\b|\bgargantuan\b|\bcolossal\b)\s(?<type>\w+)([,|\s]+\((?<race>[\w|\s]+)\))?([,|\s]+(?<alignment>[\w|\s]+))?/i;
    static #armorRegex = /^((armor|armour) class) (?<ac>\d+)( \((?<armortype>.+)\))?/i;
    static #healthRegex = /^(hit points) (?<hp>\d+) \((?<formula>\d+d\d+( ?[\+|\-|−|–] ?\d+)?)\)/i;
    static #speedRegex = /(?<name>\w+) (?<value>\d+)/ig;
    static #abilityNamesRegex = /\bstr\b|\bdex\b|\bcon\b|\bint\b|\bwis\b|\bcha\b/gi;
    static #abilityValuesRegex = /(?<base>\d+)\s?\((?<modifier>[\+|\-|−|–]\d+)\)/g;
    static #abilitySavesRegex = /(?<name>\bstr\b|\bdex\b|\bcon\b|\bint\b|\bwis\b|\bcha\b) (?<modifier>[\+|-]\d+)/ig;
    static #skillsRegex = /(?<name>\bacrobatics\b|\barcana\b|\banimal handling\b|\bathletics\b|\bdeception\b|\bhistory\b|\binsight\b|\bintimidation\b|\binvestigation\b|\bmedicine\b|\bnature\b|\bperception\b|\bperformance\b|\bpersuasion\b|\breligion\b|\bsleight of hand\b|\bstealth\b|\bsurvival\b) (?<modifier>[\+|-]\d+)/ig;
    static #damageTypesRegex = /\bbludgeoning\b|\bpiercing\b|\bslashing\b|\bacid\b|\bcold\b|\bfire\b |\blightning\b|\bnecrotic\b|\bpoison\b|\bpsychic\b|\bradiant\b|\bthunder\b|/ig;
    static #sensesRegex = /(?<name>\bdarkvision\b|\bblindsight\b|\btremorsense\b|\btruesight\b) (?<modifier>\d+)/i;
    static #challengeRegex = /^challenge (?<cr>(½|[\d/]+)) \((?<xp>[\d,]+)/i;
    static #spellCastingRegex = /\((?<slots>\d+) slot|(?<perday>\d+)\/day|spellcasting ability is (?<ability>\w+)|spell save dc (?<savedc>\d+)/ig;
    static #spellLevelRegex = /(?<level>\d+)(.+)level spellcaster/i;
    static #attackRegex = /(attack|damage): \+(?<tohit>\d+) to hit/i;
    static #reachRegex = /reach (?<reach>\d+) ?(ft|'|’)/i;
    static #rangeRegex = /range (?<near>\d+)\/(?<far>\d+) ?(ft|'|’)/i;
    static #rechargeRegex = /\(recharge (?<recharge>\d+)([–|-]\d+)?\)/i;
    static #savingThrowRegex = /dc (?<savedc>\d+) (?<saveability>\w+) saving throw/i;
    static #versatileRegex = /\((?<damageroll>\d+d\d+( ?\+ ?\d+)?)\) (?<damagetype>\w+) damage if used with two hands/i;
    static #targetRegex = /(?<range>\d+)?-(foot|ft?.|'|’) (?<shape>\w+)/i;
    static #damageRollsQuery = "(?<={0})[\\s\\w\\d,]+\\((?<damageroll1>\\d+d\\d+)( \\+ (?<damagemod1>\\d+))?\\) (?<damagetype1>\\w+)(.+plus.+\\((?<damageroll2>\\d+d\\d+( \\+ (?<damagemod2>\\d+))?)\\) (?<damagetype2>\\w+))?";

    static async parseInput(lines) {
        if (lines.length) {
            const sectionHeaders = [
                "actions",
                "bonus actions",
                "reactions",
                "legendary actions",
                "lair actions",
                "regional effects"
            ];

            // Save off all the lines that preceed the first of the above sections.
            const storedLines = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                if (this.isLineIgnored(line)) {
                    continue;
                }

                if (!sectionHeaders.includes(line.toLowerCase())) {
                    storedLines.push(line);
                } else {
                    lines.splice(0, i);
                    break;
                }
            }

            // Split out the sections into a dictionary.
            const sections = {};
            let header = null;

            for (const line of lines) {
                const trimmedLine = line.trim();

                if (this.isLineIgnored(line)) {
                    continue;
                }

                const sectionName = trimmedLine.toLowerCase();

                if (sectionHeaders.includes(sectionName)) {
                    header = sectionName;
                    sections[header] = [];
                } else if (sections[header]) {
                    sections[header].push(trimmedLine);
                }
            }

            const actorName = storedLines.shift();

            const actor = await Actor.create({
                name: sbiUtils.capitalizeAll(actorName),
                type: "npc"
            });

            await this.setRacialDetailsAsync(storedLines, actor);
            await this.setArmorAsync(storedLines, actor);
            await this.setHealthAsync(storedLines, actor);
            await this.setSpeedAsync(storedLines, actor);
            await this.setInitiativeAsync(storedLines, actor);
            await this.setAbilitiesAsync(storedLines, actor);
            await this.setSavingThrowsAsync(storedLines, actor);
            const skillData = await this.setSkillsAsync(storedLines, actor);
            await this.setDamagesAsync(storedLines, actor, "resistances");
            await this.setDamagesAsync(storedLines, actor, "immunities");
            this.setConditionImmunities(storedLines, actor);
            this.setDamageVulnerabilities(storedLines, actor);
            await this.setSensesAsync(storedLines, actor);
            await this.setLanguagesAsync(storedLines, actor);
            await this.setChallengeAsync(storedLines, actor);
            await this.setFeaturesAsync(storedLines, actor);
            await this.fixupSkillValues(actor, skillData);

            // Add the sections to the character actor.
            Object.entries(sections).forEach(async ([key, value]) => {
                const sectionHeader = sbiUtils.capitalizeAll(key);

                if (key === "actions") {
                    await this.setActionsAsync(value, actor);
                } else if (key === "reactions" || key === "bonus actions") {
                    await this.setAlternateActionAsync(value, key, actor);
                } else {
                    // Anything that isn't an action, reaction, or bonus action is a
                    // "major" action, which are legendary actions and lair actions.
                    await this.setMajorActionAsync(sectionHeader, value, actor);
                }
            });

            // Open the sheet.
            actor.sheet.render(true);
        }
    }

    static async setActionsAsync(lines, actor) {
        const actionDescriptions = this.getActionDescriptions(lines);

        for (const actionDescription of actionDescriptions) {
            const name = actionDescription.name;
            const lowerName = name.toLowerCase();
            const description = actionDescription.description;

            const itemData = {};
            itemData.name = sbiUtils.capitalizeAll(name);
            itemData.type = "feat";

            sbiUtils.assignToObject(itemData, "data.description.value", description);
            sbiUtils.assignToObject(itemData, "data.activation.type", "action");
            sbiUtils.assignToObject(itemData, "data.activation.cost", 1);

            // The "Multiattack" action isn't a real action, so there's nothing more to add to it.
            if (lowerName !== "multiattack") {
                sbiUtils.assignToObject(itemData, "data.identified", true);
                sbiUtils.assignToObject(itemData, "data.equipped", true);
                sbiUtils.assignToObject(itemData, "data.proficient", true);
                sbiUtils.assignToObject(itemData, "data.quantity", 1);

                if (lowerName === "spellcasting") {
                    await this.setSpellcastingAsync(description, itemData, actor, /at will:|\d\/day( each)?:/ig);
                } else if (lowerName === "illumination") {
                    this.SetIllumination(description, item);
                } else {
                    this.setAttack(description, itemData, actor);
                    this.setSavingThrow(description, itemData);
                    this.setRecharge(name, itemData);
                    this.setTarget(description, itemData);
                    this.setReach(description, itemData);
                    this.setRange(description, itemData);
                }
            }

            const item = new Item(itemData);
            await actor.createEmbeddedDocuments("Item", [item.toObject()]);
        };
    }

    static async setAlternateActionAsync(lines, type, actor) {
        const actionDescriptions = this.getActionDescriptions(lines);

        for (const actionDescription of actionDescriptions) {
            const name = actionDescription.name;
            const description = actionDescription.description;

            const itemData = {};
            itemData.name = sbiUtils.capitalizeAll(name);
            itemData.type = "feat";

            sbiUtils.assignToObject(itemData, "data.description.value", description);
            sbiUtils.assignToObject(itemData, "data.activation.cost", 1);

            let activationType = null;

            if (type == "bonus actions") {
                activationType = "bonus";
            } else if (type === "reactions") {
                activationType = "reaction";
            }

            sbiUtils.assignToObject(itemData, "flags.adnd5e.itemInfo.type", activationType);
            sbiUtils.assignToObject(itemData, "data.activation.type", activationType);

            const item = new Item(itemData);
            await actor.createEmbeddedDocuments("Item", [item.toObject()]);
        }
    }

    static async setRacialDetailsAsync(lines, actor) {
        // First word in the line should be one of the size indicators.
        const matchObj = lines
            .map(line => {
                return {
                    "line": line,
                    "match": this.#racialDetailsRegex.exec(line)
                }
            })
            .find(obj => obj.match);

        if (matchObj) {
            const sizeValue = matchObj.match.groups.size.toLowerCase();
            const detailsData = {};

            switch (sizeValue) {
                case "small":
                    sbiUtils.assignToObject(detailsData, "data.traits.size", "sm");
                    break;
                case "medium":
                    sbiUtils.assignToObject(detailsData, "data.traits.size", "med");
                    break;
                case "large":
                    sbiUtils.assignToObject(detailsData, "data.traits.size", "lg");
                    break;
                case "gargantuan":
                    sbiUtils.assignToObject(detailsData, "data.traits.size", "grg");
                    break;
                default:
                    sbiUtils.assignToObject(detailsData, "data.traits.size", sizeValue);
                    break;
            }

            sbiUtils.assignToObject(detailsData, "data.details.alignment", sbiUtils.capitalizeAll(matchObj.match.groups.alignment?.trim()));
            sbiUtils.assignToObject(detailsData, "data.details.race", sbiUtils.capitalizeAll(matchObj.match.groups.race?.trim()));
            sbiUtils.assignToObject(detailsData, "data.details.type", sbiUtils.capitalizeAll(matchObj.match.groups.type?.trim()));

            await actor.update(detailsData);
            sbiUtils.remove(lines, matchObj.line);
        }
    }

    static async setArmorAsync(lines, actor) {
        const matchObj = lines
            .map(line => {
                return {
                    "line": line,
                    "match": this.#armorRegex.exec(line)
                }
            })
            .find(obj => obj.match);

        if (matchObj) {
            const armorData = {};
            const armorValue = parseInt(matchObj.match.groups.ac);
            const armorType = matchObj.match.groups.armortype;
            let foundArmorItems = false;

            if (armorType) {
                if (armorType.toLowerCase() === "natural armor") {
                    sbiUtils.assignToObject(armorData, "data.attributes.ac.calc", "natural");
                    sbiUtils.assignToObject(armorData, "data.attributes.ac.flat", armorValue);

                    foundArmorItems = true;
                } else {
                    const armorNames = armorType.split(",").map(str => str.trim());

                    for (const armorName of armorNames) {
                        const item = await sbiUtils.getFromPackAsync("dnd5e.items", armorName);

                        if (item) {
                            item.data.equipped = true;
                            item.data.proficient = true;

                            await actor.createEmbeddedDocuments("Item", [item]);

                            foundArmorItems = true;
                        }
                    }
                }
            }

            if (!foundArmorItems) {
                sbiUtils.assignToObject(armorData, "data.attributes.ac.calc", "flat");
                sbiUtils.assignToObject(armorData, "data.attributes.ac.flat", armorValue);
            }

            await actor.update(armorData);
            sbiUtils.remove(lines, matchObj.line);
        }
    }

    static async setHealthAsync(lines, actor) {
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

    static async setSpeedAsync(lines, actor) {
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
                                    .map(obj => `${sbiUtils.capitalizeAll(obj.name)} ${obj.value} ft.`)
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

    static async setInitiativeAsync(lines, actor) {
        const line = lines.find(l => l.toLowerCase().startsWith("roll initiative") ||
            l.toLowerCase().startsWith("initiative"));

        if (line != null) {
            const number = parseInt(sbiUtils.last(line.split(' ')));
            await actor.update(sbiUtils.assignToObject({}, "data.attributes.init.bonus", number));
            sbiUtils.remove(lines, line);
        }
    }

    static async setAbilitiesAsync(lines, actor) {
        const foundAbilityNames = [];
        const foundAbilityValues = []
        const foundLines = [];

        for (const line of lines) {
            const trimmedLine = line.trim();

            // Names come before values, so if we've found all the values then we've found all the names.
            if (foundAbilityValues.length == 6) {
                break;
            }

            // Look for ability identifiers, like STR, DEX, etc.
            const abilityMatches = [...trimmedLine.matchAll(this.#abilityNamesRegex)];

            if (abilityMatches.length) {
                const names = abilityMatches.map(m => m[0]);
                foundAbilityNames.push.apply(foundAbilityNames, names);

                foundLines.push(line);
            }

            // Look for ability values, like 18 (+4).
            const valueMatches = [...trimmedLine.matchAll(this.#abilityValuesRegex)];

            if (valueMatches.length) {
                const values = valueMatches.map(m => m.groups.base);
                foundAbilityValues.push.apply(foundAbilityValues, values);

                foundLines.push(line);
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

    static async setSavingThrowsAsync(lines, actor) {
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

    static async setSkillsAsync(lines, actor) {
        const startText = "skills";
        const line = lines.find(line => line.toLowerCase().startsWith(startText));
        const skillData = {};

        if (line != null) {
            const foundLine = this.combineLines(lines, line).slice(startText.length).trim();
            const matches = [...foundLine.matchAll(this.#skillsRegex)];

            for (const match of matches) {
                // Set the total modifier value here, and we'll fix up the 'value' later.
                const name = this.convertToShortSkill(match.groups.name);
                const skillMod = parseInt(match.groups.modifier);
                skillData[name] = skillMod;
            }

            sbiUtils.remove(lines, line);
        }

        // Return the skills with profiency and their total modifer so we can use this information to
        // set the proficiency 'value' later after we're able to get the character's proficiency bonus.
        return skillData;
    }

    // Calculate skill proficiency value. 1 is regular proficiency, 2 is double proficiency, etc.
    static async fixupSkillValues(actor, skillData) {
        for (let [key, value] of Object.entries(skillData)) {
            const skill = actor.data.data.skills[key];
            const abilityMod = actor.data.data.abilities[skill.ability].mod;
            const generalProf = actor.data.data.attributes.prof;
            const skillProf = (value - abilityMod) / generalProf;

            await actor.update(sbiUtils.assignToObject({}, `data.skills.${key}.value`, skillProf));
        }
    }

    static async setDamagesAsync(lines, actor, type) {
        const startText = `damage ${type} `;
        const line = lines.find(line => line.toLowerCase().startsWith(startText));

        if (line != null) {
            const foundLine = this.combineLines(lines, line).slice(startText.length).trim();
            const damageTypes = [...foundLine.matchAll(this.#damageTypesRegex)]
                .filter(arr => arr[0].length)
                .map(arr => arr[0]);

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
                if (damageTypes.length) {
                    const actorData = sbiUtils.assignToObject({}, `data.traits.${typeValue}.value`, damageTypes)
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
    static setConditionImmunities(lines, actor) {
        this.setArrayValues(lines, "condition immunities ",
            async (values) => {
                await actor.update(sbiUtils.assignToObject({}, "data.traits.ci.value", values));
            });
    }

    // Example: Senses darkvision 60 ft., passive Perception 18
    static async setSensesAsync(lines, actor) {
        const startText = "senses";
        const line = lines.find(line => line.toLowerCase().startsWith(startText));

        if (line != null) {
            const senses = this.combineLines(lines, line)
                .slice(startText.length)
                .split(",")
                .map(line => line.trim());

            const actorData = {};

            for (const sense of senses) {
                const match = this.#sensesRegex.exec(sense);

                if (match) {
                    const name = match.groups.name.toLowerCase();
                    const modifier = parseInt(match.groups.modifier);

                    sbiUtils.assignToObject(actorData, `data.attributes.senses.${name}`, modifier);

                    if (name.toLowerCase() === "darkvision") {
                        sbiUtils.assignToObject(actorData, `token.dimSight`, modifier);
                    }
                } else {
                    sbiUtils.assignToObject(actorData, "data.attributes.senses.special", sbiUtils.capitalizeAll(sense));
                }
            }

            await actor.update(actorData);
            sbiUtils.remove(lines, line);
        }
    }

    // Example: Damage Vulnerabilities bludgeoning, fire
    static setDamageVulnerabilities(lines, actor) {
        this.setArrayValues(lines, "damage vulnerabilities ",
            async (values) => {
                const knownTypes = [];
                let customType = null;

                for (const value of values) {
                    if (sbiUtils.exactMatch(value, this.#damageTypesRegex)) {
                        knownTypes.push(value);
                    } else {
                        customType = value;
                    }
                }

                if (knownTypes.length) {
                    await actor.update(sbiUtils.assignToObject({}, "data.traits.dv.value", knownTypes));
                }

                if (customType) {
                    await actor.update(sbiUtils.assignToObject({}, "data.traits.dv.custom", sbiUtils.capitalizeFirstLetter(customType)));
                }
            });
    }

    // Example: Languages Common, Darakhul, Draconic, Elvish, Sylvan
    static async setLanguagesAsync(lines, actor) {
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
            const foundLine = this.combineLines(lines, line).slice(startText.length).trim();
            const values = foundLine.split(",").map(str => this.convertLanguage(str));
            const knownValues = sbiUtils.intersect(values, knownLanguages);
            const unknownValues = sbiUtils.except(values, knownValues).map(str => sbiUtils.capitalizeFirstLetter(str));

            const actorData = {};
            sbiUtils.assignToObject(actorData, "data.traits.languages.value", knownValues);
            sbiUtils.assignToObject(actorData, "data.traits.languages.custom", unknownValues.join(";"));

            await actor.update(actorData);
            sbiUtils.remove(lines, line);
        }
    }

    // Example: Challenge 11 (7,200 XP)
    static async setChallengeAsync(lines, actor) {
        const foundMatch = lines
            .map(line => {
                return {
                    "line": line,
                    "match": this.#challengeRegex.exec(line)
                }
            })
            .filter(obj => obj.match !== null)
            .find(obj => obj.match.length);

        if (foundMatch != null) {
            const crValue = foundMatch.match.groups.cr;

            // Handle fractions.
            let crNumber = 0;

            if (crValue === "½") {
                crNumber = 0.5;
            } else if (crValue.includes("/")) {
                crNumber = sbiUtils.parseFraction(crValue);
            } else {
                crNumber = parseInt(foundMatch.match.groups.cr);
            }

            const actorData = {};
            sbiUtils.assignToObject(actorData, "data.details.cr", crNumber);
            sbiUtils.assignToObject(actorData, "data.details.xp.value", parseInt(foundMatch.match.groups.xp.replace(",", "")));

            await actor.update(actorData);
            sbiUtils.remove(lines, foundMatch.line);
        }
    }

    static async setFeaturesAsync(lines, actor) {
        const actionDescriptions = this.getActionDescriptions(lines);

        for (const actionDescription of actionDescriptions) {
            const name = actionDescription.name;
            const lowerName = name.toLowerCase();
            const description = actionDescription.description;

            const itemData = {};
            itemData.name = sbiUtils.capitalizeAll(name);
            itemData.type = "feat";

            sbiUtils.assignToObject(itemData, "data.description.value", description);

            if (lowerName.includes("innate spellcasting")) {
                // Example:
                // Innate Spellcasting. The aridni's innate spellcasting ability is Charisma (spell save DC 14). 
                // It can innately cast the following spells: 
                // At will: dancing lights, detect magic, invisibility 
                // 3/day: charm person, faerie fire, mage armor 
                // 1/day: spike growth
                await this.setSpellcastingAsync(description, itemData, actor, /at will:|\d\/day( each)?:/ig);
            } else if (lowerName === "spellcasting") {
                // Example:
                // Spellcasting. The sphinx is a 9th-­‐level spellcaster. Its spellcasting ability is Intelligence (spell save DC 16, +8
                // to hit with spell attacks). It requires no material components to cast its spells. The sphinx has the
                // following wizard spells prepared:
                // Cantrips (at will): mage hand, minor illusion, prestidigitation
                // 1st level (4 slots): detect magic, identify, shield
                // 2nd level (3 slots): darkness, locate object, suggestion
                // 3rd level (3 slots): dispel magic, remove curse, tongues
                // 4th level (3 slots): banishment, greater invisibility
                // 5th level (1 slot): legend lore
                await this.setSpellcastingAsync(description, itemData, actor, /(cantrips|1st|2nd|3rd|4th|5th|6th|7th|8th|9th) .+?:/ig);
            } else if (lowerName.startsWith("legendary resistance")) {
                // Example:
                // Legendary Resistance (3/day)
                const resistanceCountRegex = /\((?<perday>\d+)\/day\)/i;
                const resistanceMatch = resistanceCountRegex.exec(name);

                if (resistanceMatch) {
                    itemData.name = itemData.name.slice(0, resistanceMatch.index).trim();
                    await actor.update(sbiUtils.assignToObject({}, "data.resources.legres.value", parseInt(resistanceMatch.groups.perday)));
                    await actor.update(sbiUtils.assignToObject({}, "data.resources.legres.max", parseInt(resistanceMatch.groups.perday)));
                }

                sbiUtils.assignToObject(itemData, "data.activation.type", "special");
                sbiUtils.assignToObject(itemData, "data.consume.type", "attribute");
                sbiUtils.assignToObject(itemData, "data.consume.target", "resources.legres.value");
                sbiUtils.assignToObject(itemData, "data.consume.amount", 1);
            }

            const item = new Item(itemData);
            await actor.createEmbeddedDocuments("Item", [item.toObject()]);
        }
    }

    static async setMajorActionAsync(actionName, lines, actor) {
        const actionDescriptions = this.getActionDescriptions(lines);
        const lowerActionName = actionName.toLowerCase();
        let activationType = "";

        for (let index = 0; index < actionDescriptions.length; index++) {
            const actionDescription = actionDescriptions[index];
            const itemData = {};
            itemData.name = actionName;
            itemData.type = "feat";

            sbiUtils.assignToObject(itemData, "data.description.value", actionDescription.description);

            if (index == 0) {
                // Add these just so that it doesn't say the action is not equipped and not proficient in the UI.
                sbiUtils.assignToObject(itemData, "data.equipped", true);
                sbiUtils.assignToObject(itemData, "data.proficient", true);

                // Determine whether this is a legendary or lair action.
                if (lowerActionName === "lair actions") {
                    sbiUtils.assignToObject(itemData, "flags.adnd5e.itemInfo.type", "lair");

                    // What iniative count does the lair action activate?
                    const lairInitiativeRegex = /initiative count (?<count>\d+)/i;
                    const lairInitiativeMatch = lairInitiativeRegex.exec(actionDescription.description);

                    if (lairInitiativeMatch) {
                        await actor.update(sbiUtils.assignToObject({}, "data.resources.lair.value", true));
                        await actor.update(sbiUtils.assignToObject({}, "data.resources.lair.initiative", parseInt(lairInitiativeMatch.groups.count)));
                    }
                } else if (lowerActionName === "legendary actions") {
                    activationType = "legendary";
                    sbiUtils.assignToObject(itemData, "flags.adnd5e.itemInfo.type", "legendary");

                    // How many legendary actions can it take?
                    const legendaryActionCountRegex = /take (?<count>\d+) legendary/i;
                    const legendaryActionMatch = legendaryActionCountRegex.exec(actionDescription.description);

                    if (legendaryActionMatch) {
                        const actionCount = parseInt(legendaryActionMatch.groups.count);
                        await actor.update(sbiUtils.assignToObject({}, "data.resources.legact.value", actionCount));
                        await actor.update(sbiUtils.assignToObject({}, "data.resources.legact.max", actionCount));
                    }
                } else if (lowerActionName === "bonus actions") {
                    activationType = "bonus";
                }

                const item = new Item(itemData);
                await actor.createEmbeddedDocuments("Item", [item.toObject()]);
            } else {
                itemData.name = actionDescription.name;
                sbiUtils.assignToObject(itemData, "data.activation.type", activationType);

                // How many actions does this cost?
                const actionCostRegex = /\(costs (?<cost>\d+) actions\)/i;
                const actionCostMatch = actionCostRegex.exec(actionDescription.name);
                let actionCost = 1;

                if (actionCostMatch) {
                    actionCost = parseInt(actionCostMatch.groups.cost);
                    itemData.name = itemData.name.slice(0, actionCostMatch.index).trim();
                }

                sbiUtils.assignToObject(itemData, "data.consume.type", "attribute");
                sbiUtils.assignToObject(itemData, "data.consume.target", "resources.legact.value");
                sbiUtils.assignToObject(itemData, "data.consume.amount", actionCost);
                sbiUtils.assignToObject(itemData, "data.activation.cost", actionCost);

                const item = new Item(itemData);
                await actor.createEmbeddedDocuments("Item", [item.toObject()]);
            }
        }
    }

    // Example: Melee Weapon Attack: +8 to hit, reach 5 ft.,one target.
    static setAttack(text, itemData, actor) {
        const match = this.#attackRegex.exec(text);

        if (match !== null) {
            itemData.type = "weapon";
            sbiUtils.assignToObject(itemData, "data.weaponType", "natural");
            sbiUtils.assignToObject(itemData, "data.ability", actor.data.data.abilities.str.mod > actor.data.data.abilities.dex.mod ? "str" : "dex");

            this.setDamageRolls(text, itemData, "hit:");
        }
    }

    static async setSpellcastingAsync(description, itemData, actor, spellRegex) {
        const spellMatches = [...description.matchAll(spellRegex)];
        let spellDatas = [];

        // Set spell level
        const spellLevelMatch = this.#spellLevelRegex.exec(description);

        if (spellLevelMatch) {
            await actor.update(sbiUtils.assignToObject({}, "data.details.spellLevel", parseInt(spellLevelMatch.groups.level)));
        }

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
                    .map(spell => sbiUtils.capitalizeAll(spell.trim()));

                featureDescription.push(`<p><b>${match[0]}</b> ${spellNames.join(", ")}</p>`);
                lastIndex = match.index;

                const slots = this.getGroupValue("slots", [...match[0].matchAll(this.#spellCastingRegex)]);
                const perday = this.getGroupValue("perday", [...match[0].matchAll(this.#spellCastingRegex)]);
                const spellType = description.toLowerCase().includes("innate spellcasting") ? "innate" : "slots";
                let spellCount;

                if (slots) {
                    spellCount = parseInt(slots);
                } else if (perday) {
                    spellCount = parseInt(perday);
                }

                for (const spellName of spellNames) {
                    spellDatas.push({
                        // Remove text in parenthesis when storing the spell name for lookup later.
                        "name": spellName.replace(/\(.*\)/, "").trim(),
                        "type": spellType,
                        "count": spellCount
                    });
                }
            }

            const introDescription = `<p>${description.slice(0, spellMatches[0].index)}</p>`;
            const fullDescription = introDescription.concat(featureDescription.reverse().join("\n"));
            sbiUtils.assignToObject(itemData, "data.description.value", fullDescription);
        } else {
            // Some spell casting description bury the spell in the description, like Mehpits.
            // Example: The mephit can innately cast fog cloud, requiring no material components.
            // In that case search the description for every known spell.
            const spell = await sbiUtils.tryGetFromPackAsync("dnd5e.spells", description);

            if (spell) {
                const perday = this.getGroupValue("perday", [...itemData.name.matchAll(this.#spellCastingRegex)]);

                spellDatas.push({
                    "name": spell.name,
                    "type": "innate",
                    "count": parseInt(perday)
                });
            }
        }

        // Set the spellcasting ability.
        const spellcastingAbility = this.getGroupValue("ability", [...description.matchAll(this.#spellCastingRegex)]);

        if (spellcastingAbility != null) {
            const actorData = sbiUtils.assignToObject({}, "data.attributes.spellcasting", this.convertToShortAbility(spellcastingAbility));
            await actor.update(actorData)
        }

        // Add spells to actor.
        if (spellDatas.length) {
            for (const spellData of spellDatas) {
                const spell = await sbiUtils.getFromPackAsync("dnd5e.spells", spellData.name);

                if (spell) {
                    if (spellData.type == "slots") {
                        // Update the actor's number of slots per level.
                        let spellObject = {};
                        sbiUtils.assignToObject(spellObject, `data.spells.spell${spell.data.level}.value`, spellData.count);
                        sbiUtils.assignToObject(spellObject, `data.spells.spell${spell.data.level}.max`, spellData.count);
                        sbiUtils.assignToObject(spellObject, `data.spells.spell${spell.data.level}.override`, spellData.count);

                        await actor.update(spellObject);
                    } else if (spellData.type = "innate") {
                        // Separate the 'per day' spells from the 'at will' spells.
                        if (spellData.count) {
                            sbiUtils.assignToObject(spell, `data.uses.value`, spellData.count);
                            sbiUtils.assignToObject(spell, `data.uses.max`, spellData.count);
                            sbiUtils.assignToObject(spell, `data.uses.per`, "day");
                            sbiUtils.assignToObject(spell, `data.preparation.mode`, "innate");
                        } else {
                            sbiUtils.assignToObject(spell, `data.preparation.mode`, "atwill");
                        }

                        sbiUtils.assignToObject(spell, `data.preparation.prepared`, true);
                    }

                    // Add the spell to the character sheet.
                    await actor.createEmbeddedDocuments("Item", [spell]);
                }
            }
        }
    }

    // Example: Each creature in the cone must make a DC 13 Dexterity saving throw, taking 44 (8d10) 
    // cold damage on a failed save or half as much damage on a ssuccessful one.
    static setSavingThrow(text, itemData) {
        const match = this.#savingThrowRegex.exec(text);

        if (match !== null) {
            const dc = match.groups.savedc;
            const ability = match.groups.saveability;

            sbiUtils.assignToObject(itemData, "data.actionType", "save");
            sbiUtils.assignToObject(itemData, "data.save.ability", this.convertToShortAbility(ability));
            sbiUtils.assignToObject(itemData, "data.save.dc", parseInt(dc));
            sbiUtils.assignToObject(itemData, "data.save.scaling", "flat");

            this.setDamageRolls(text, itemData, "saving throw");
        }
    }

    // Example: Frost Breath (Recharge 5–6).
    static setRecharge(text, itemData) {
        const match = this.#rechargeRegex.exec(text);

        if (match !== null) {
            sbiUtils.assignToObject(itemData, "data.recharge.value", parseInt(match.groups.recharge));
            sbiUtils.assignToObject(itemData, "data.recharge.charged", true);
        }
    }

    // Example: The hound exhales a 15-foot cone of frost.
    static setTarget(text, itemData) {
        const match = this.#targetRegex.exec(text);

        if (match !== null) {
            sbiUtils.assignToObject(itemData, "data.target.value", match.groups.range);
            sbiUtils.assignToObject(itemData, "data.target.type", match.groups.shape);
            sbiUtils.assignToObject(itemData, "data.target.units", "ft");
        }
    }

    // Example: Melee Weapon Attack: +8 to hit, reach 5 ft., one target.
    static setReach(text, itemData) {
        const match = this.#reachRegex.exec(text);

        if (match !== null) {
            const reach = parseInt(match.groups.reach);

            sbiUtils.assignToObject(itemData, "data.range.value", reach);
            sbiUtils.assignToObject(itemData, "data.range.units", "ft");
            sbiUtils.assignToObject(itemData, "data.actionType", "mwak");
        }
    }

    // Example: Ranged Weapon Attack: +7 to hit, range 150/600 ft., one target.
    static setRange(text, itemData) {
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
    static setDamageRolls(text, itemData, lookup) {
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

            if (itemData.data.properties) {
                itemData.data.properties.ver = true;
            }
        }
    }

    // Combines lines of text into sentences and paragraphs.
    static getActionDescriptions(lines) {
        const result = [];
        let actionDescription = null;
        let foundSentenceEnd = true;
        let foundSpellBlock = true;

        for (const line of lines) {
            const match = this.#actionTitleRegex.exec(line);
            const foundSpellSaveLine = line.toLowerCase().includes("(spell save");

            if (match && (foundSentenceEnd || (foundSpellBlock && !foundSpellSaveLine))) {
                actionDescription = new ActionDescription(
                    match[match.index].replace(".", ""),
                    line.slice(match[match.index].length).trim());

                result.push(actionDescription);
            } else if (actionDescription == null) {
                actionDescription = new ActionDescription("Description", line);

                result.push(actionDescription);
            } else {
                if (actionDescription.description == null) {
                    actionDescription.description = line;
                } else {
                    actionDescription.description = `${actionDescription.description} ${line}`;
                }
            }

            // We want to track the current line before going on to the next so that we can tell if a 
            // match on the next action title is valid. We know it's a new block if the previous sentence 
            // ends with a period, meaning we didn't accidentally find text that looks like a title in 
            // the middle of a block, or if the new title is coming after an Innate Spellcasting or 
            // Spellcasting block. We need to test for the spellcasting blocks specially because they 
            // don't use periods at the ends of their spell lists.
            foundSentenceEnd = line.trimEnd().endsWith(".")
            foundSpellBlock = actionDescription.name.match(/\binnate spellcasting\b|\bspellcasting\b/i) != null;
        }

        for (const actionDescription of result) {
            actionDescription.description = this.formatForDisplay(actionDescription.description);
        }

        return result;
    }

    // ===============================
    // Utilities
    // ===============================

    static isLineIgnored(line) {
        const ignoreList = [
            "proficiency bonus",
            "traits"
        ]

        return line.length == 0 || ignoreList.find(ignore => line.toLowerCase().startsWith(ignore)) != null;
    }

    static formatForDisplay(text) {
        const textArr = text.replaceAll("•", "\n•").split("\n");

        if (textArr.length > 1) {
            return `<p>${textArr.join("</p><p>")}</p>`
        } else {
            return textArr.join("");
        }
    }

    static setArrayValues(lines, startText, setValueFunc) {
        const line = lines.find(line => line.toLowerCase().startsWith(startText));

        if (line != null) {
            const foundLine = this.combineLines(lines, line)
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

    static combineLines(lines, startingLine) {
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

                if (nextLine != null &&
                    (lineBeginnings.some(lb => nextLine.toLowerCase().startsWith(lb)) ||
                        (currentLine.trimEnd().endsWith('.') && sbiUtils.startsWithCapital(nextLine)))) {
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

    static convertLanguage(language) {
        let result = language.trim().toLowerCase();

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

    static getGroupValue(group, matches) {
        if (matches && matches.length) {
            return matches.map(m => m.groups[group]).find(val => val);
        }

        return null;
    }

    static convertToShortAbility(abilityName) {
        const ability = abilityName.toLowerCase();

        switch (ability) {
            case "strength":
                return "str";
            case "dexterity":
                return "dex";
            case "constitution":
                return "con";
            case "intelligence":
                return "int";
            case "wisdom":
                return "wis";
            case "charisma":
                return "cha";
            default:
                return ability;
        }
    }

    static convertToShortSkill(skillName) {
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