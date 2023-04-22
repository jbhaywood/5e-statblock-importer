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
    // The action title regex is complicated. Here's the breakdown...
    // ([A-Z][\w\d\-+,;']+[\s\-]?)               <- Represents the first word of the title, followed by a space or hyphen. It has to start with a capital letter.
    //                                              The word can include word characters, digits, and some punctuation characters.
    //                                              NOTE: Don't add more punctuation than is absolutely neccessary so that we don't get false positives.
    // (of|and|the|from|in|at|on|with|to|by)\s)? <- Represents the prepostion words we want to ignore.
    // ([\w\d\-+,;']+\s?){0,3}                   <- Represents the words that follow the first word, using the same regex for the allowed characters.
    //                                              We assume the title only has 0-3 words following it, otherwise it's probably a sentence.
    // (\([\w –\-\/]+\))?                        <- Represents an optional bit in parentheses, like '(Recharge 5-6)'.
    static #actionTitleRegex = /^(([A-Z][\w\d\-+,;'’]+[\s\-]?)((of|and|the|from|in|at|on|with|to|by|into)\s)?([\w\d\-+,;']+\s?){0,3}(\((?!spell save)[^)]+\))?)[.!]/;
    static #racialDetailsRegex = /^(?<size>\bfine\b|\bdiminutive\b|\btiny\b|\bsmall\b|\bmedium\b|\blarge\b|\bhuge\b|\bgargantuan\b|\bcolossal\b)(\sswarm of (tiny|small))?\s(?<type>\w+)([,\s]+\((?<race>[,\w\s]+)\))?([,\s]+(?<alignment>[\w\s\-]+))?/i;
    static #armorRegex = /^((armor|armour) class)\s?(?<ac>\d+)( \((?<armortype>.+)\))?/i;
    static #hitPointsRegex = /^(hit points)\.?\s?(?<hp>\d+)\s?(\((?<formula>\d+d\d+( ?[\+\-−–] ?\d+)?)\))?/i;
    static #speedRegex = /(?<name>\w+)\s?(?<value>\d+)/ig;
    static #abilityNamesRegex = /\bstr\b|\bdex\b|\bcon\b|\bint\b|\bwis\b|\bcha\b/ig;
    static #abilityValuesRegex = /(?<base>\d+)\s?\((?<modifier>[\+\-−–]?\d+)\)/g;
    static #abilitySavesRegex = /(?<name>\bstr\b|\bdex\b|\bcon\b|\bint\b|\bwis\b|\bcha\b) (?<modifier>[\+|-]\d+)/ig;
    static #skillsRegex = /(?<name>\bacrobatics\b|\barcana\b|\banimal handling\b|\bathletics\b|\bdeception\b|\bhistory\b|\binsight\b|\bintimidation\b|\binvestigation\b|\bmedicine\b|\bnature\b|\bperception\b|\bperformance\b|\bpersuasion\b|\breligion\b|\bsleight of hand\b|\bstealth\b|\bsurvival\b) (?<modifier>[\+|-]\d+)/ig;
    static #damageTypesRegex = /\bbludgeoning\b|\bpiercing\b|\bslashing\b|\bacid\b|\bcold\b|\bfire\b|\blightning\b|\bnecrotic\b|\bpoison\b|\bpsychic\b|\bradiant\b|\bthunder\b/ig;
    static #conditionTypesRegex = /\bblinded\b|\bcharmed\b|\bdeafened\b|\bdiseased\b|\bexhaustion\b|\bfrightened\b|\bgrappled\b|\bincapacitated\b|\binvisible\b|\bparalyzed\b|\bpetrified\b|\bpoisoned\b|\bprone\b|\brestrained\b|\bstunned\b|\bunconscious\b/ig;
    static #sensesRegex = /(?<name>\bdarkvision\b|\bblindsight\b|\btremorsense\b|\btruesight\b) (?<modifier>\d+)/i;
    static #challengeRegex = /^(challenge|cr|challenge rating)\s?(?<cr>(½|[\d\/]+))\s?(\((?<xp>[\d,]+)\s?xp\))?/i;
    static #spellCastingRegex = /\((?<slots>\d+) slot|(?<perday>\d+)\/day|spellcasting ability is (?<ability1>\w+)|(?<ability2>\w+) as the spellcasting ability|spell save dc (?<savedc>\d+)/ig;
    static #spellLevelRegex = /(?<level>\d+)(.+)level spellcaster/i;
    static #spellLineRegex = /(at-will|cantrips|1st|2nd|3rd|4th|5th|6th|7th|8th|9th)[\w\d\s\(\)-]*:/ig;
    static #spellInnateLineRegex = /at will:|\d\/day( each)?:/ig;
    static #spellInnateSingle = /innately cast (?<spellname>[\w|\s]+)(\s\(.+\))?,/i
    static #attackRegex = /\+(?<tohit>\d+) to hit/i;
    static #reachRegex = /reach (?<reach>\d+) ?(ft|'|’)/i;
    static #rangeRegex = /range (?<near>\d+)\/(?<far>\d+) ?(ft|'|’)/i;
    static #rechargeRegex = /\(recharge (?<recharge>\d+)([–|-]\d+)?\)/i;
    static #savingThrowRegex = /must (make|succeed on) a dc (?<savedc>\d+) (?<saveability>\w+) (?<savetext>saving throw|save)/i;
    static #versatileRegex = /\((?<damageroll>\d+d\d+( ?\+ ?\d+)?)\) (?<damagetype>\w+) damage if used with two hands/i;
    static #targetRegex = /(?<range>\d+)?-(foot|ft?.|'|’) (?<shape>\w+)/i;
    static #damageRollRegex = /\(?(?<damageroll1>\d+d\d+)(\s?\+\s?(?<damagemod1>\d+))?\)? (?<damagetype1>\w+)(.+(plus|and).+\(?(?<damageroll2>\d+d\d+(\s?\+\s?(?<damagemod2>\d+))?)\)? (?<damagetype2>\w+))?/i;

    // Regexes for old school stat blocks
    static #isOsrRegex = /^HP[\s\d]*;\sAC[\s\d]*;/;
    static #osrHealthRegex = /HP (?<hp>\d+);/;
    static #osrArmorRegex = /AC (?<ac>\d+)( \((?<armortype>.+)\))?;/;
    static #osrChallengeRegex = /CR (?<cr>[\d/]+); XP (?<xp>[\d,]+)/;
    static #osrSpeedRegex = /Speed[\s\d\w’,]+;/;
    static #osrReachRegex = /(?<reach>\d+)’ reach/;

    static async parseInput(lines, selectedFolderId) {
        if (lines.length) {
            const sectionHeaders = [
                "actions",
                "traits",
                "bonus actions",
                "reactions",
                "legendary actions",
                "mythic actions",
                "lair actions",
                "regional effects",
                "villain actions"
            ];

            // Save off all the lines that precede the first of the above sections.
            const storedLines = [];
            let isOsr = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                const nextLine = i < lines.length - 1 ? lines[i + 1] : null;

                // We need to know if this is an OSR style statblock to make some of the parsing easier.
                isOsr = isOsr || this.#isOsrRegex.exec(line) != null;

                if (this.isLineIgnored(line, nextLine)) {
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

            for (let i = 0; i < lines.length; i++) {
                const trimmedLine = lines[i].trim();
                const nextLine = i < lines.length - 1 ? lines[i + 1] : null;

                if (this.isLineIgnored(trimmedLine, nextLine)) {
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
                type: "npc",
                folder: selectedFolderId
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
            this.setDamageVulnerabilities(storedLines, actor, isOsr);
            await this.setSensesAsync(storedLines, actor);
            await this.setLanguagesAsync(storedLines, actor);
            await this.setChallengeAsync(storedLines, actor);
            await this.setFeaturesAsync(storedLines, actor, isOsr);
            await this.fixupSkillValues(actor, skillData);

            // Add the sections to the character actor.
            Object.entries(sections).forEach(async ([key, value]) => {
                const sectionHeader = sbiUtils.capitalizeAll(key);

                if (key === "actions" || key === "traits") {
                    await this.setActionsAsync(value, actor);
                } else if (key === "reactions" || key === "bonus actions") {
                    await this.setAlternateActionAsync(value, key, actor);
                } else {
                    // Anything that isn't an action, trait, reaction, or bonus action is a
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
            itemData.img = await sbiUtils.getImgFromPackItemAsync(lowerName);

            sbiUtils.assignToObject(itemData, "data.description.value", description);
            sbiUtils.assignToObject(itemData, "data.activation.type", "action");
            sbiUtils.assignToObject(itemData, "data.activation.cost", 1);

            // The "Multiattack" action isn't a real action, so there's nothing more to add to it.
            if (lowerName !== "multiattack") {
                // We'll assume that an NPC with stuff will have that stuff identified, equipped, attuned, etc.
                sbiUtils.assignToObject(itemData, "data.identified", true);
                sbiUtils.assignToObject(itemData, "data.equipped", true);
                sbiUtils.assignToObject(itemData, "data.attunement", 2);
                sbiUtils.assignToObject(itemData, "data.proficient", true);
                sbiUtils.assignToObject(itemData, "data.quantity", 1);

                if (lowerName === "spellcasting") {
                    await this.setSpellcastingAsync(description, itemData, actor, /at will:|\d\/day( each)?:/ig);
                } else {
                    this.setRecharge(name, itemData);
                    this.setTarget(description, itemData);
                    this.setReach(description, itemData);
                    this.setRange(description, itemData);
                    this.setAttackOrSave(description, itemData, actor);
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
            itemData.img = await sbiUtils.getImgFromPackItemAsync(name);

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
            sbiUtils.assignToObject(detailsData, "data.details.type.value", matchObj.match.groups.type?.trim().toLowerCase());

            await actor.update(detailsData);
            sbiUtils.remove(lines, matchObj.line);
        }
    }

    static async setArmorAsync(lines, actor) {
        const matchObj = lines
            .map(line => {
                return {
                    "line": line,
                    "match": this.#osrArmorRegex.exec(line) ?? this.#armorRegex.exec(line)
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
                        const item = await sbiUtils.getItemFromPacksAsync(armorName, "equipment");

                        if (item) {
                            item.data.equipped = true;
                            item.data.proficient = true;
                            item.data.attunement = 2;

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
            this.updateLines(lines, matchObj, this.#osrArmorRegex);
        }
    }

    static async setHealthAsync(lines, actor) {
        const matchObj = lines
            .map(line => {
                return {
                    "line": line,
                    "match": this.#osrHealthRegex.exec(line) ?? this.#hitPointsRegex.exec(line)
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

            this.updateLines(lines, matchObj, this.#osrHealthRegex);
        }
    }

    static async setSpeedAsync(lines, actor) {
        const matchObj = lines
            .map(line => {
                return {
                    "line": line,
                    "match": this.#osrSpeedRegex.exec(line) ?? /^speed.+/i.exec(line)
                }
            })
            .find(obj => obj.match);

        if (matchObj) {
            const speedLine = matchObj.match[0];
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
                                    .map(obj => `${sbiUtils.capitalizeAll(obj.name)} ${obj.value} ft`)
                                    .join(", ")
                            },
                            "movement": {
                                "burrow": parseInt(otherSpeeds.find(obj => obj.name.toLowerCase().startsWith("burrow"))?.value ?? 0),
                                "climb": parseInt(otherSpeeds.find(obj => obj.name.toLowerCase().startsWith("climb"))?.value ?? 0),
                                "fly": parseInt(otherSpeeds.find(obj => obj.name.toLowerCase().startsWith("fly"))?.value ?? 0),
                                "swim": parseInt(otherSpeeds.find(obj => obj.name.toLowerCase().startsWith("swim"))?.value ?? 0),
                                "hover": speedLine.toLowerCase().includes("hover")
                            }
                        }
                    }
                })
            }

            this.updateLines(lines, matchObj, this.#osrSpeedRegex);
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
        let abilitiesFound = false;
        const foundLines = [];

        // Check for standard abilities first.
        ////////////////////////////////////////////////

        const foundAbilityNames = [];
        const foundAbilityValues = []

        for (const line of lines) {
            const trimmedLine = line.trim();

            // Names come before values, so if we've found all the values then we've found all the names.
            if (foundAbilityValues.length == 6) {
                abilitiesFound = true;
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

        // Check for OSR abilities if standard ones weren't found.
        ////////////////////////////////////////////////

        if (!abilitiesFound) {
            const abilities = ["str", "dex", "con", "int", "wis", "cha"];

            for (const line of lines) {
                const osrAbilityMatches = abilities
                    .map(a => {
                        const regex = new RegExp(`(?<attribute>${a}) (?<modifier>[+-]\\d+)`, "i");
                        const match = regex.exec(line);
                        return match;
                    })
                    .filter(m => m);

                if (osrAbilityMatches.length) {
                    abilitiesFound = true;
                    foundLines.push(line);
                    const actorData = {};

                    for (const match of osrAbilityMatches) {
                        const baseValue = 10 + (parseInt(match.groups.modifier) * 2)
                        sbiUtils.assignToObject(actorData, `data.abilities.${match.groups.attribute.toLowerCase()}.value`, baseValue);
                    }

                    await actor.update(actorData);
                }
            }
        }

        for (const line of foundLines) {
            sbiUtils.remove(lines, line);
        }
    }

    static async setSavingThrowsAsync(lines, actor) {
        const line = lines.find(line => {
            const lowerLine = line.toLowerCase();
            return lowerLine.startsWith("saving throw") || lowerLine.startsWith("saves")
        });

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
        const foundLines = lines.filter(line => line.toLowerCase().includes(type));

        for (const line of foundLines) {
            const idx = line.toLowerCase().indexOf(type);
            const foundLine = this.combineLines(lines, line).slice(idx + type.length).trim();
            const damageTypes = [...foundLine.matchAll(this.#damageTypesRegex)]
                .filter(arr => arr[0].length)
                .map(arr => arr[0].toLowerCase());

            // Set conditions immunities
            if (type === "immunities") {
                const conditionTypes = [...foundLine.matchAll(this.#conditionTypesRegex)]
                    .filter(arr => arr[0].length)
                    .map(arr => arr[0].toLowerCase());

                if (conditionTypes.length) {
                    await actor.update(sbiUtils.assignToObject({}, "data.traits.ci.value", conditionTypes));
                }
            }

            // Set damage traits
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

                    if (name === "darkvision") {
                        sbiUtils.assignToObject(actorData, "token.dimSight", modifier);
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
    static setDamageVulnerabilities(lines, actor, isOsr) {
        const name = isOsr ? "vulnerabilities " : "damage vulnerabilities ";
        this.setArrayValues(lines, name,
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
            let modLine = foundLine;

            // Replace the comman in numbers, like 1,000, so that we can ignore it when gathering the languages.
            for (let index = 0; index < foundLine.length; index++) {
                if (index > 0 && index < foundLine.length - 1) {
                    const curLetter = foundLine[index];
                    const lastLetter = foundLine[index - 1];
                    const nextLetter = foundLine[index + 1];

                    if (curLetter === "," && !isNaN(Number(lastLetter) && !isNaN(nextLetter))) {
                        modLine = sbiUtils.replaceAt(foundLine, index, "!");
                    }
                }
            }

            // Gather languages here by splitting on commas.
            const values = modLine.split(",").map(str => this.convertLanguage(str));
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
        const matchObj = lines
            .map(line => {
                return {
                    "line": line,
                    "match": this.#osrChallengeRegex.exec(line) ?? this.#challengeRegex.exec(line)
                }
            })
            .find(obj => obj.match);

        if (matchObj != null) {
            const crValue = matchObj.match.groups.cr;

            // Handle fractions.
            let crNumber = 0;

            if (crValue === "½") {
                crNumber = 0.5;
            } else if (crValue.includes("/")) {
                crNumber = sbiUtils.parseFraction(crValue);
            } else {
                crNumber = parseInt(matchObj.match.groups.cr);
            }

            const actorData = {};
            sbiUtils.assignToObject(actorData, "data.details.cr", crNumber);

            if (matchObj.match.groups.xp) {
                sbiUtils.assignToObject(actorData, "data.details.xp.value", parseInt(matchObj.match.groups.xp.replace(",", "")));
            }

            await actor.update(actorData);
            this.updateLines(lines, matchObj, this.#osrChallengeRegex);
        }
    }

    static async setFeaturesAsync(lines, actor, isOsr) {
        const actionDescriptions = this.getActionDescriptions(lines, isOsr);

        for (const actionDescription of actionDescriptions) {
            const name = actionDescription.name;
            const lowerName = name.toLowerCase();
            const description = actionDescription.description;

            const itemData = {};
            itemData.name = sbiUtils.capitalizeAll(name);
            itemData.type = "feat";
            itemData.img = await sbiUtils.getImgFromPackItemAsync(lowerName);

            sbiUtils.assignToObject(itemData, "data.description.value", description);

            if (lowerName.includes("innate spellcasting")) {
                // Example:
                // Innate Spellcasting. The aridni's innate spellcasting ability is Charisma (spell save DC 14). 
                // It can innately cast the following spells: 
                // At will: dancing lights, detect magic, invisibility 
                // 3/day: charm person, faerie fire, mage armor 
                // 1/day: spike growth
                await this.setSpellcastingAsync(description, itemData, actor, this.#spellInnateLineRegex);
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
                await this.setSpellcastingAsync(description, itemData, actor, this.#spellLineRegex);
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

                    // Lair actions don't use titles, so it's just one item with all actions included in the description 
                    // text. Because of that, we need to assign the type here instead of in the 'else' block below.
                    sbiUtils.assignToObject(itemData, "data.activation.type", "lair");

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
                const actionCostRegex = /\((costs )?(?<cost>\d+) actions\)/i;
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
                    .split(/,(?![^\(]*\))/) // split on commas that are outside of parenthesis
                    .map(spell => sbiUtils.trimStringEnd(spell, ".")) // remove end period
                    .map(spell => sbiUtils.capitalizeAll(spell)); // capitalize words

                featureDescription.push(`<p><b>${match[0]}</b> ${spellNames.join(", ")}</p>`);
                lastIndex = match.index;

                const slots = this.getGroupValue("slots", [...match[0].matchAll(this.#spellCastingRegex)]);
                const perday = this.getGroupValue("perday", [...match[0].matchAll(this.#spellCastingRegex)]);
                let spellType;
                let spellCount;

                if (slots) {
                    spellType = "slots";
                    spellCount = parseInt(slots);
                } else if (perday) {
                    spellType = "innate";
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
            var match = this.#spellInnateSingle.exec(description);

            if (match) {
                const spell = await sbiUtils.getItemFromPacksAsync(match.groups.spellname, "spell");

                if (spell) {
                    const perday = this.getGroupValue("perday", [...itemData.name.matchAll(this.#spellCastingRegex)]);

                    spellDatas.push({
                        "name": spell.name,
                        "type": "innate",
                        "count": parseInt(perday)
                    });
                }
            }
        }

        // Set spellcasting ability.
        let spellcastingAbility = this.getGroupValue("ability1", [...description.matchAll(this.#spellCastingRegex)]);

        if (spellcastingAbility == null) {
            spellcastingAbility = this.getGroupValue("ability2", [...description.matchAll(this.#spellCastingRegex)]);
        }

        if (spellcastingAbility != null) {
            const actorData = sbiUtils.assignToObject({}, "data.attributes.spellcasting", this.convertToShortAbility(spellcastingAbility));
            await actor.update(actorData)
        }

        // Add spells to actor.
        if (spellDatas.length) {
            for (const spellData of spellDatas) {
                const spell = await sbiUtils.getItemFromPacksAsync(spellData.name, "spell");

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
                            sbiUtils.assignToObject(spell, "data.uses.value", spellData.count);
                            sbiUtils.assignToObject(spell, "data.uses.max", spellData.count);
                            sbiUtils.assignToObject(spell, "data.uses.per", "day");
                            sbiUtils.assignToObject(spell, "data.preparation.mode", "innate");
                        } else {
                            sbiUtils.assignToObject(spell, "data.preparation.mode", "atwill");
                        }

                        sbiUtils.assignToObject(spell, "data.preparation.prepared", true);
                    }

                    // Add the spell to the character sheet if it doesn't exist already.
                    if (!actor.items.getName(spell.name)) {
                        await actor.createEmbeddedDocuments("Item", [spell]);
                    }
                }
            }
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
        const match = this.#reachRegex.exec(text) ?? this.#osrReachRegex.exec(text);

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
    static setAttackOrSave(description, itemData, actor) {
        // Some attacks include a saving throw, so we'll just for both attack rolls and saving throw rolls
        let attackDescription = description;
        let saveDescription = null;
        let attackMatch = null;
        const saveMatch = this.#savingThrowRegex.exec(description);

        if (saveMatch) {
            attackDescription = description.slice(0, saveMatch.index);
            saveDescription = description.slice(saveMatch.index);
        }

        if (attackDescription.length) {
            attackMatch = this.#attackRegex.exec(attackDescription);
            if (attackMatch) {
                itemData.type = "weapon";
                sbiUtils.assignToObject(itemData, "data.weaponType", "natural");
                sbiUtils.assignToObject(itemData, "data.ability", actor.data.data.abilities.str.mod > actor.data.data.abilities.dex.mod ? "str" : "dex");

                this.setDamageRolls(attackDescription, "attack", itemData, actor)
            }
        }

        if (saveDescription) {
            if (!attackMatch) {
                sbiUtils.assignToObject(itemData, "data.actionType", "save");
            }

            const savingThrowMatch = this.#savingThrowRegex.exec(description);
            if (savingThrowMatch) {
                const dc = savingThrowMatch.groups.savedc;
                const ability = savingThrowMatch.groups.saveability;

                sbiUtils.assignToObject(itemData, "data.save.ability", this.convertToShortAbility(ability));
                sbiUtils.assignToObject(itemData, "data.save.dc", parseInt(dc));
                sbiUtils.assignToObject(itemData, "data.save.scaling", "flat");

                this.setDamageRolls(saveDescription, savingThrowMatch.groups.savetext, itemData, actor)
            }
        }
    }

    static setDamageRolls(description, lookup, itemData, actor) {
        // const regexQuery = sbiUtils.format(this.#damageRollsQuery, lookup);
        // const regex = new RegExp(regexQuery, "i");
        // const match = regex.exec(description);
        const match = this.#damageRollRegex.exec(description);

        if (match) {
            const damageRoll = match.groups.damageroll1;
            const damageType = match.groups.damagetype1;
            const hasDamageMod = match.groups.damagemod1 != undefined;
            const plusDamageRoll = match.groups.damageroll2;
            const plusDamageType = match.groups.damagetype2;
            const plusHasDamageMod = match.groups.damagemod2 != undefined;

            // Set the damage rolls and types. I've never seen more that two damage rolls for one attack.
            const damageParts = [];

            if (damageRoll && damageType) {
                var modText = hasDamageMod ? " + @mod" : "";
                damageParts.push([`${damageRoll}${modText}`, damageType]);
            }

            if (plusDamageRoll && plusDamageType) {
                var modText = plusHasDamageMod ? " + @mod" : "";
                damageParts.push([`${plusDamageRoll}${modText}`, plusDamageType]);
            }

            if (itemData.data.damage === undefined) {
                itemData.data.damage = {};
            }

            if (damageParts.length) {
                const currentParts = itemData.data.damage.parts ?? [];
                itemData.data.damage.parts = currentParts.concat(damageParts);
            }

            // If the ability for the damage hasn't been set, try to find the correct 
            // one to use so that it doesn't just default to Strength.
            if (!itemData.data.ability) {
                if (match.groups.damagemod1) {
                    const damageMod = parseInt(match.groups.damagemod1);

                    if (damageMod === actor.data.data.abilities.str.mod) {
                        sbiUtils.assignToObject(itemData, "data.ability", "str");
                    } else if (damageMod === actor.data.data.abilities.dex.mod) {
                        sbiUtils.assignToObject(itemData, "data.ability", "dex");
                    } else if (damageMod === actor.data.data.abilities.con.mod) {
                        sbiUtils.assignToObject(itemData, "data.ability", "con");
                    } else if (damageMod === actor.data.data.abilities.int.mod) {
                        sbiUtils.assignToObject(itemData, "data.ability", "int");
                    } else if (damageMod === actor.data.data.abilities.wis.mod) {
                        sbiUtils.assignToObject(itemData, "data.ability", "wis");
                    } else if (damageMod === actor.data.data.abilities.cha.mod) {
                        sbiUtils.assignToObject(itemData, "data.ability", "cha");
                    }
                }
            }
        }

        const versatilematch = this.#versatileRegex.exec(description);

        if (versatilematch !== null) {
            itemData.data.damage.versatile = versatilematch.groups.damageroll;

            if (itemData.data.properties) {
                itemData.data.properties.ver = true;
            }
        }
    }

    // Combines lines of text into sentences and paragraphs. This is complicated because finding 
    // sentences that can span multiple lines are hard to describe to a computer.
    static getActionDescriptions(lines, isOsr) {
        const result = [];
        const validLines = lines.filter(l => l);
        let actionDescription = null;
        let foundTitle = false;

        // Pull out the entire spell block because it's formatted differently than all the other action blocks.
        const notSpellLines = [];
        const spellLines = [];
        let foundSpellBlock = false;

        // Start taking lines from the spell block when we've found the beginning until 
        // we've gotten into the spells and hit a line where the next line has a period.
        for (let index = 0; index < validLines.length; index++) {
            let line = validLines[index];

            if (!foundSpellBlock) {
                foundSpellBlock = line.match(/\binnate spellcasting\b|\bspellcasting\b/i) != null;

                if (foundSpellBlock && line === "Spellcasting" && !line.endsWith(".")) {
                    line = line + ".";
                }
            }

            // If we're inside of a spell block, store it off in the spell lines array,
            // otherwise store it into the not spell lines array.
            if (foundSpellBlock) {
                spellLines.push(line);
            } else {
                foundSpellBlock = false;
                notSpellLines.push(line);
            }

            if (!isOsr) {
                // Check to see if we've reached the end of the spell block by seeing if 
                // the next line is a title.
                const nextLineIsTitle = index < validLines.length - 2
                    && this.#actionTitleRegex.exec(validLines[index + 1]) != null;

                if (foundSpellBlock && nextLineIsTitle) {
                    // Add a period at the end so that sections are extracted correctly.
                    if (!spellLines[spellLines.length - 1].endsWith(".")) {
                        spellLines[spellLines.length - 1] = spellLines[spellLines.length - 1] + ".";
                    }

                    // Break out of the spell block.
                    foundSpellBlock = false;
                }
            }
        }

        const notSpellSentences = sbiUtils.makeSentences(notSpellLines);
        const spellSentences = sbiUtils.makeSentences(spellLines);
        const sentences = notSpellSentences.concat(spellSentences);

        for (const sentence of sentences) {
            const titleMatch = this.#actionTitleRegex.exec(sentence);

            if (titleMatch && !foundTitle) {
                // Ignore two titles in a row because it means that the second one is just a short description and not a real title.
                foundTitle = true;

                // Remove the period or exclamation mark from the title.
                const title = sentence.replace(/[.!]$/, "");
                actionDescription = new ActionDescription(title);

                result.push(actionDescription);
            } else {
                foundTitle = false;

                if (actionDescription == null) {
                    actionDescription = new ActionDescription("Description", sentence);
                    result.push(actionDescription);
                } else if (actionDescription.description == null) {
                    actionDescription.description = sentence;
                } else {
                    actionDescription.description = `${actionDescription.description} ${sentence}`;
                }
            }
        }

        for (let index = 0; index < result.length; index++) {
            const actionDescription = result[index];
            if (actionDescription.description == null && index != 0) {
                // If there's no description, assume it's a line at the end of the last action description that just looks like a title.
                result[index - 1].description = result[index - 1].description + " " + actionDescription.name;
            } else {
                actionDescription.description = this.formatForDisplay(actionDescription.description);
            }
        }

        return result;
    }

    // ===============================
    // Utilities
    // ===============================

    static isLineIgnored(line, nextLine) {
        const ignoreList = [
            "proficiency bonus"
        ]

        const lowerLine = line.toLowerCase();

        return line.length == 0 // empty line
            // || (nextLine != null && nextLine.toLowerCase().startsWith(lowerLine)) // duplicate line
            || ignoreList.find(ignore => lowerLine.startsWith(ignore)) != null; // ignored line
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
                .map(str => str.trim().toLowerCase());

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
            "challenge",
            "cr",
            // osr
            "resistances",
            "immunities",
            "vulnerabilities",
            "spellcasting"
        ];

        const linesToCheck = sbiUtils.skipWhile(lines, (line) => line !== startingLine);
        const combinedLines = [];
        const linesCount = linesToCheck.length;

        if (linesCount > 0) {
            for (let i = 0; i < linesCount; i++) {
                const currentLine = linesToCheck[i];
                combinedLines.push(currentLine);

                const lowerCurLine = currentLine.toLowerCase().trim();
                const nextLine = i < linesCount - 1 ? linesToCheck[i + 1].trim() : null;
                const lowerNextLine = nextLine?.toLowerCase();

                // If the next line start with one of the known beginnings listed above, or
                // if the current line ends in a period while the next line starts with a capital 
                // letter, consider this the end of the block and break out of the loop.
                if (nextLine != null && lowerNextLine != null) {
                    // Special check for OSR-type blocks where the passive perception is split across two lines.
                    if (lowerCurLine.endsWith("pass.") && lowerNextLine.startsWith("perception")) {
                        continue;
                    }

                    if (lineBeginnings.some(lb => lowerNextLine.startsWith(lb)) ||
                        (lowerCurLine.endsWith('.') && sbiUtils.startsWithCapital(nextLine) ||
                        this.#actionTitleRegex.exec(nextLine) != null)) {
                        break;
                    }
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

    // Updates the 'lines' array based on whether the statblock is an osr version or not.
    // For osr blocks, we don't want to remove the entire line.
    static updateLines(lines, matchObj, matchRegex) {
        if (matchObj.line.match(matchRegex)) {
            var idx = lines.indexOf(matchObj.line);
            lines[idx] = lines[idx].replace(matchObj.match[0], "").trim();

            if (lines[idx].trim().length == 0) {
                sbiUtils.remove(lines, matchObj.line);
            }
        } else {
            sbiUtils.remove(lines, matchObj.line);
        }
    }

    static convertLanguage(language) {
        // We replaced commas in numbers, like 1,000, with a "!" ealier, so put the comman back now.
        let result = language.trim().toLowerCase().replace("!", ",");

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