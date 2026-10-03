import { sbiUtils as sUtils } from "./sbiUtils.js";
import { sbiRegex as sRegex } from "./sbiRegex.js";
import { sbiActor as sActor } from "./sbiActor.js";
import {
    CreatureData,
    ArmorData,
    ChallengeData,
    RollData,
    LanguageData,
    NameValueData,
    DamageConditionId,
    BlockID,
    TopBlocks,
    KnownCreatureTypes,
    KnownRoles,
    RulesVersion
} from "./sbiData.js";

// Steps that the parser goes through:
//  - Break text into well defined statblock parts
//  - Create the Foundry data object from the parts

export class sbiParser {
    static async parseInput(lines, selectedFolderId) {
        const creature = this.parseLines(lines);
        if (!creature) return null;

        const actor = await sActor.convertCreatureToActorAsync(creature, selectedFolderId);

        // Open the sheet.
        actor.sheet.render(true);

        return actor;
    }

    // Turns the lines of a statblock into a CreatureData object. This has no
    // dependency on Foundry so that it can be tested outside of the game.
    static parseLines(lines) {
        lines = lines.map(l => l.trim()).filter(l => l.length);
        if (!lines.length) return null;

        const creature = new CreatureData("unknown");

        // Assume the first line is the name.
        creature.name = lines.shift().trim();

        // The way this works is that this goes through each line, looks for something it recognizes,
        // and then gathers up the following lines until it hits a new thing it recognizes.
        // When that happens, it parses the lines it had been gathering up to that point.
        const statBlocks = new Map();
        let lastBlockId = null;

        // Ability scores are tricky because there's not a consistent pattern to how
        // they're formatted. So we have to jump through some hoops. The code currently 
        // handles all statblocks from creatures in the 'testBlocks' file.
        let foundAbilityLine = false;

        // Another tricky part are the features listed under the known stuff at the top of
        // the statblock, since there's no heading for them. So we have to collect everything
        // we can after we've gone out of that part up until the next known Block.
        let foundTopBlock = true;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Ignore empty lines.
            if (!line.length) {
                continue;
            }

            // Get the first block match, excluding the ones we already have
            const match = sRegex.getFirstMatch(line, [...statBlocks.keys()]);

            // This check is a little shaky, but it's the best we can do. We assume that if
            // we've been going through the top blocks and hit a line that doesn't match anything
            // that we've found the first line of the 'features' block. BUT only if the line has
            // a block title in it, because it could also be the second in a long line of 
            // Damage Immunities or something like that.
            if (!match && foundTopBlock && sRegex.blockTitle.exec(line)) {
                foundTopBlock = false;
                lastBlockId = BlockID.features;
                statBlocks.set(lastBlockId, []);
            }

            if (match) {
                foundTopBlock = TopBlocks.includes(match.id);
            }

            // Turn off 'foundAbilityLine' when we've hit the next block.
            if (match && foundAbilityLine && match.id !== BlockID.abilities) {
                foundAbilityLine = false;
            }

            // It should never find the same match twice, so don't bother checking to see
            // if the ID already exists on the 'statBlocks' object. Also skip over other
            // abilities after we've found the first one.
            if (match && !foundAbilityLine) {
                lastBlockId = match.id;
                statBlocks.set(lastBlockId, []);

                // Set 'foundAbilityLine' to true when we've found the first ability.
                foundAbilityLine = lastBlockId === BlockID.abilities;
            }

            if (statBlocks.has(lastBlockId)) {
                statBlocks.get(lastBlockId).push(line);
            }
        }

        // Remove everything we've found so far and see what we end up with.
        const foundLines = [...statBlocks.values()].flat();
        const unaccountedLines = lines.map(l => l.trim()).filter(item => !foundLines.includes(item));

        if (unaccountedLines.length) {
            sUtils.log(`Found unaccounted for lines: ${unaccountedLines.join(" | ")}`);
        }

        // The 2024 layout can be recognized by a few of its headers.
        if (statBlocks.has(BlockID.initiative)
            || statBlocks.has(BlockID.gear)
            || sRegex.abilityTriples.test(sUtils.combineToString(statBlocks.get(BlockID.abilities) ?? []))
            || /^(ac|hp|cr)\b/i.test(statBlocks.get(BlockID.armor)?.[0] ?? "")) {
            creature.rulesVersion = RulesVersion.modern;
        }
        sRegex.abilityTriples.lastIndex = 0;

        // Parse the top blocks first, since the actions depend on some of their values.
        const orderedKeys = [...statBlocks.keys()].sort((a, b) => TopBlocks.includes(b) - TopBlocks.includes(a));

        for (const key of orderedKeys) {
            const value = statBlocks.get(key);

            switch (key) {
                case BlockID.actions:
                case BlockID.bonusActions:
                case BlockID.features:
                case BlockID.lairActions:
                case BlockID.legendaryActions:
                case BlockID.mythicActions:
                case BlockID.reactions:
                case BlockID.traits:
                case BlockID.utilitySpells:
                case BlockID.villainActions:
                    this.setActions(value, key, creature);
                    break;
                case BlockID.health:
                case BlockID.souls:
                    this.setRoll(value, key, creature);
                    break;
                case BlockID.armor:
                    this.setArmor(value, creature);
                    break;
                case BlockID.abilities:
                    this.setAbilities(value, creature);
                    break;
                case BlockID.challenge:
                    this.setChallenge(value, creature);
                    break;
                case BlockID.conditionImmunities:
                    this.setDamagesAndConditions(value, BlockID.conditionImmunities, creature);
                    break;
                case BlockID.damageImmunities:
                    this.setDamagesAndConditions(value, DamageConditionId.immunities, creature);
                    break;
                case BlockID.damageResistances:
                    this.setDamagesAndConditions(value, DamageConditionId.resistances, creature);
                    break;
                case BlockID.damageVulnerabilities:
                    this.setDamagesAndConditions(value, DamageConditionId.vulnerabilities, creature);
                    break;
                case BlockID.gear:
                    this.setGear(value, creature);
                    break;
                case BlockID.initiative:
                    this.setInitiative(value, creature);
                    break;
                case BlockID.languages:
                    this.setLanguages(value, creature);
                    break;
                case BlockID.racialDetails:
                    this.setRacialDetails(value, creature);
                    break;
                case BlockID.savingThrows:
                    this.setSavingThrows(value, creature);
                    break;
                case BlockID.senses:
                    this.setSenses(value, creature);
                    break;
                case BlockID.skills:
                    this.setSkills(value, creature);
                    break;
                case BlockID.speed:
                    this.setSpeed(value, creature);
                    break;
                default:
                    // Ignore anything we don't recognize.
                    break;
            }
        }

        return creature;
    }

    static setActions(lines, type, creature) {
        // Remove the first line because it's just the block name,
        // except for features because they don't have a heading.
        if (type !== BlockID.features) {
            lines.shift();
        }

        if (type === BlockID.villainActions) {
            creature[type] = this.getVillainActions(lines);
        } else if (type === BlockID.utilitySpells) {
            const spellDatas = this.getBlockDatas(lines);

            // There should only be one block under the Utility Spells title.
            if (spellDatas.length === 1) {
                creature.utilitySpells = this.getSpells(spellDatas[0].value, sRegex.spellInnateLine);
            }
        } else {
            // The 2024 layout uses a "Traits" heading for what the 2014 layout left unlabeled.
            const targetType = type === BlockID.traits ? BlockID.features : type;
            const actionDatas = [];

            for (const actionData of this.getBlockDatas(lines)) {
                const nameLower = actionData.name.toLowerCase();

                // Spellcasting is a trait in the 2014 layout and an action in the 2024 layout.
                if (nameLower === "spellcasting") {
                    creature.spellcasting = this.getSpells(actionData.value, this.getSpellRegex(actionData.value));
                    creature.spellcastingIsAction = targetType !== BlockID.features;
                } else if (nameLower === "innate spellcasting" || nameLower.startsWith("innate spellcasting (")) {
                    creature.innateSpellcasting = this.getSpells(actionData.value, sRegex.spellInnateLine);
                    creature.innateSpellcastingTitle = actionData.name;
                } else {
                    actionDatas.push(new NameValueData(actionData.name, actionData.value));
                }
            }

            creature[targetType] = (creature[targetType] ?? []).concat(actionDatas);
        }
    }

    // Decide whether a spellcasting description lists slots per level (2014 prepared casters)
    // or at will / per day groups (innate casters and all 2024 casters).
    static getSpellRegex(spellText) {
        sRegex.spellLine.lastIndex = 0;
        sRegex.spellInnateLine.lastIndex = 0;
        const hasLevels = sRegex.spellLine.test(spellText);
        const hasInnate = sRegex.spellInnateLine.test(spellText);
        sRegex.spellLine.lastIndex = 0;
        sRegex.spellInnateLine.lastIndex = 0;

        return hasInnate && !hasLevels ? sRegex.spellInnateLine : sRegex.spellLine;
    }

    // Examples:
    //   Armor Class 17 (natural armor)
    //   AC 15 Initiative +2 (12)
    static setArmor(lines, creature) {
        const line = sUtils.combineToString(lines);
        const match = sRegex.armorDetails.exec(line);
        if (!match) return;

        // AC value
        const ac = match.groups.ac;
        // Armor types, like "natural armor" or "leather armor, shield"
        const armorTypes = match.groups.armortype?.split(",").map(str => str.trim());

        creature.armor = new ArmorData(parseInt(ac), armorTypes);

        // The 2024 layout puts the initiative on the same line as the AC.
        const initiativeMatch = sRegex.initiativeDetails.exec(line);
        if (initiativeMatch) {
            creature.initiative = sUtils.parseSignedInt(initiativeMatch.groups.init);
        }
    }

    // Example: Initiative +2 (12)
    static setInitiative(lines, creature) {
        const line = sUtils.combineToString(lines);
        const match = sRegex.initiativeDetails.exec(line);
        if (!match) return;

        creature.initiative = sUtils.parseSignedInt(match.groups.init);
    }

    static setAbilities(lines, creature) {
        const combined = sUtils.combineToString(lines);

        // 2024 layout: "STR 15 +2 +2 DEX 14 +2 +2 ..." (score, modifier, saving throw)
        sRegex.abilityTriples.lastIndex = 0;
        const tripleMatches = [...combined.matchAll(sRegex.abilityTriples)];

        if (tripleMatches.length >= 6) {
            const abilitiesData = [];

            for (const match of tripleMatches.slice(0, 6)) {
                const name = match.groups.name.toLowerCase();
                const score = parseInt(match.groups.base);
                const modifier = sUtils.parseSignedInt(match.groups.modifier);
                const save = sUtils.parseSignedInt(match.groups.save);

                abilitiesData.push(new NameValueData(name, score));

                // A save that differs from the modifier means the creature is proficient in it.
                if (save !== modifier) {
                    creature.savingThrows.push(name);
                    creature.savingThrowBonuses[name] = save;
                }
            }

            creature.abilities = abilitiesData;
            return;
        }

        // 2014 layout: names on one or more lines, followed by "18 (+4)" style values.
        const foundAbilityNames = [];
        const foundAbilityValues = []

        for (const line of lines) {
            const trimmedLine = line.trim();

            // Names come before values, so if we've found all the values then we've found all the names.
            if (foundAbilityValues.length == 6) {
                break;
            }

            // Look for ability identifiers, like STR, DEX, etc.
            const abilityMatches = [...trimmedLine.matchAll(sRegex.abilityNames)];

            if (abilityMatches.length) {
                const names = abilityMatches.map(m => m[0]);
                foundAbilityNames.push.apply(foundAbilityNames, names);
            }

            // Look for ability values, like 18 (+4).
            const valueMatches = [...trimmedLine.matchAll(sRegex.abilityValues)];

            if (valueMatches.length) {
                const values = valueMatches.map(m => m.groups.base);
                foundAbilityValues.push.apply(foundAbilityValues, values);
            }
        }

        const abilitiesData = [];

        for (let i = 0; i < foundAbilityNames.length; i++) {
            abilitiesData.push(new NameValueData(foundAbilityNames[i].toLowerCase(), parseInt(foundAbilityValues[i])));
        }

        creature.abilities = abilitiesData;
    }

    // Examples:
    //   Challenge 9 (5,000 XP)
    //   CR 1 (XP 200; PB +2)
    //   CR 3 Ambusher             (MCDM)
    static setChallenge(lines, creature) {
        const line = sUtils.combineToString(lines);
        const match = sRegex.challengeDetails.exec(line);
        if (!match) return;

        const crValue = match.groups.cr;
        let cr = 0;

        // Handle fractions.
        if (crValue === "½") {
            cr = 0.5;
        } else if (crValue === "¼") {
            cr = 0.25;
        } else if (crValue === "⅛") {
            cr = 0.125;
        } else if (crValue.includes("/")) {
            cr = sUtils.parseFraction(crValue);
        } else {
            cr = parseInt(match.groups.cr);
        }

        let xp = 0;
        const xpText = match.groups.xp ?? match.groups.xp2;

        if (xpText) {
            xp = parseInt(xpText.replace(/,/g, ""));
        }

        creature.challenge = new ChallengeData(cr, xp);

        // MCDM's "Flee, Mortals!" puts the role alongside the challenge rating,
        // so handle that here. Only accept known roles so that "5,000 XP" isn't mistaken for one.
        const role = sRegex.roleDetails.exec(line)?.groups.role;
        if (role && KnownRoles.includes(role.toLowerCase())) {
            creature.role = sUtils.capitalizeFirstLetter(role.toLowerCase());
        }
    }

    // Example: Damage Vulnerabilities bludgeoning, fire
    static setDamagesAndConditions(lines, type, creature) {
        let line = sUtils.combineToString(lines);

        // Remove the type name.
        switch (type) {
            case DamageConditionId.immunities:
                line = line.replace(/^(damage )?immunities/i, "").trim();
                break;
            case DamageConditionId.resistances:
                line = line.replace(/^(damage )?resistances/i, "").trim();
                break;
            case DamageConditionId.vulnerabilities:
                line = line.replace(/^(damage )?vulnerabilities/i, "").trim();
                break;
            case BlockID.conditionImmunities:
                line = line.replace(/^condition immunities/i, "").trim();
                break;
        }

        const regex = type === BlockID.conditionImmunities ? sRegex.conditionTypes : sRegex.damageTypes;

        // Parse out the known damage types.
        const knownTypes = [...new Set([...line.matchAll(regex)]
            .filter(arr => arr[0].length)
            .map(arr => arr[0].toLowerCase()))];

        // The 2024 layout lists condition immunities on the same line as damage immunities,
        // e.g. "Immunities Poison; Charmed, Exhaustion, Frightened".
        let conditionLine = line;
        if (type === DamageConditionId.immunities) {
            const knownConditions = [...new Set([...line.matchAll(sRegex.conditionTypes)].map(arr => arr[0].toLowerCase()))];
            if (knownConditions.length) {
                creature.standardConditionImmunities = [...new Set([...creature.standardConditionImmunities, ...knownConditions])];
                conditionLine = line.replace(sRegex.conditionTypes, "");
            }
        }

        // Now see if there is any custom text we should add.
        let customType = null;

        // Split on ";" first for lines like "poison; bludgeoning, piercing, and slashing from nonmagical attacks"
        const strings = conditionLine.split(";").map(str => str.replace(/^[\s,]+|[\s,]+$/g, "")).filter(str => str.length);
        const leftover = (str) => str.replace(regex, "").replace(/,/g, "").replace(/\band\b/g, "").trim();

        if (strings.length === 2 && leftover(strings[1]).length) {
            customType = strings[1].trim();
        } else {
            // Handle something like "piercing from magic weapons wielded by good creatures"
            // by taking out the known types, commas, and spaces, and seeing if there's anything left.
            const descLeftover = leftover(conditionLine.replace(/;/g, ""));
            if (descLeftover) {
                customType = descLeftover;
            }
        }

        if (knownTypes.length) {
            switch (type) {
                case DamageConditionId.immunities:
                    creature.standardDamageImmunities = knownTypes;
                    break;
                case DamageConditionId.resistances:
                    creature.standardDamageResistances = knownTypes;
                    break;
                case DamageConditionId.vulnerabilities:
                    creature.standardDamageVulnerabilities = knownTypes;
                    break;
                case BlockID.conditionImmunities:
                    creature.standardConditionImmunities = knownTypes;
                    break;
            }
        }

        if (customType) {
            switch (type) {
                case DamageConditionId.immunities:
                    creature.specialDamageImmunities = customType;
                    break;
                case DamageConditionId.resistances:
                    creature.specialDamageResistances = customType;
                    break;
                case DamageConditionId.vulnerabilities:
                    creature.specialDamageVulnerabilities = customType;
                    break;
                case BlockID.conditionImmunities:
                    creature.specialConditionImmunities = customType;
                    break;
            }
        }
    }

    // Example: Gear Chain Shirt, Shield, Shortbow
    static setGear(lines, creature) {
        const line = sUtils.combineToString(lines).replace(/^gear\s/i, "");

        creature.gear = line
            .split(/,(?![^\(]*\))/)
            .map(str => str.trim())
            .filter(str => str.length);
    }

    static setRoll(lines, type, creature) {
        const line = sUtils.combineToString(lines);
        const match = sRegex.rollDetails.exec(line);
        if (!match) return;

        const formula = match.groups.formula?.replace(/[−–]/g, "-").replace(/\s+/g, " ");
        creature[type] = new RollData(parseInt(match.groups.value), formula);
    }

    // Examples:
    //   Languages Common, Goblin
    //   Languages Abyssal, telepathy 120 ft.
    //   Languages Common plus up to five other languages
    //   Languages understands Common but can't speak
    static setLanguages(lines, creature) {
        const trimCount = "Languages".length;
        let line = sUtils.combineToString(lines).slice(trimCount).trim();

        // Telepathy is stored separately in dnd5e.
        let telepathy = null;
        const telepathyMatch = sRegex.telepathy.exec(line);
        if (telepathyMatch) {
            telepathy = parseInt(telepathyMatch.groups.range.replace(/,/g, ""));
            line = line.replace(telepathyMatch[0], "").replace(/\.\s*$/, "").trim();
        }

        const languageMap = sUtils.getLanguageMap();
        const knownValues = [];
        const unknownValues = [];

        line = line.replace(/\.$/, "").trim();

        if (!line.length || /^(—|–|-|none)$/i.test(line)) {
            creature.language = new LanguageData([], [], telepathy);
            return;
        }

        // "understands Common but can't speak" shouldn't count as speaking Common.
        if (/^understands\b/i.test(line)) {
            creature.language = new LanguageData([], [sUtils.capitalizeFirstLetter(line)], telepathy);
            return;
        }

        // Pull out every known language, longest names first so "Deep Speech" wins over "Deep".
        const names = [...languageMap.keys()].sort((a, b) => b.length - a.length);
        let remainder = line;

        for (const name of names) {
            const regex = new RegExp(`(^|[\\s,;])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[\\s,;.])`, "i");
            const match = regex.exec(remainder);

            if (match) {
                knownValues.push(languageMap.get(name));
                remainder = remainder.slice(0, match.index) + match[1] + remainder.slice(match.index + match[0].length);
            }
        }

        // Whatever is left is free text, like "any three languages" or "the languages it knew in life".
        const leftovers = remainder
            .split(/[,;]/)
            .map(str => str.replace(/^\s*(and|plus|or)\b/i, "").trim())
            .filter(str => str.length && !/^(—|–|-|none)$/i.test(str));

        for (const value of leftovers) {
            unknownValues.push(sUtils.capitalizeFirstLetter(value));
        }

        creature.language = new LanguageData([...new Set(knownValues)], unknownValues, telepathy);
    }

    // Example: Saving Throws Con +10, Int +12, Wis +9
    static setSavingThrows(lines, creature) {
        const line = sUtils.combineToString(lines);

        // Save off the ability names associated with the saving throws along with
        // the printed bonus, so that any extra bonus can be reproduced.
        for (const match of line.matchAll(sRegex.abilitySaves)) {
            const name = match.groups.name.toLowerCase();
            if (!creature.savingThrows.includes(name)) {
                creature.savingThrows.push(name);
            }
            creature.savingThrowBonuses[name] = sUtils.parseSignedInt(match.groups.modifier);
        }
    }

    // Example: Senses darkvision 60 ft., passive Perception 18
    static setSenses(lines, creature) {
        const line = sUtils.combineToString(lines);
        const matches = [...line.matchAll(sRegex.sensesDetails)];
        creature.senses = matches.map(m => new NameValueData(m.groups.name, m.groups.modifier));
    }

    static setSkills(lines, creature) {
        const line = sUtils.combineToString(lines);
        const matches = [...line.matchAll(sRegex.skillDetails)];
        creature.skills = matches.map(m => new NameValueData(m.groups.name, sUtils.parseSignedInt(m.groups.modifier)));
    }

    static setSpeed(lines, creature) {
        const line = sUtils.combineToString(lines);
        const match = [...line.matchAll(sRegex.speedDetails)];
        if (!match) return;

        const speeds = match
            .map(m => new NameValueData(m.groups.name, m.groups.value))
            .filter(nv => nv.name != null && nv.value != null);

        if (line.toLowerCase().includes("hover")) {
            speeds.push(new NameValueData("hover", ""));
        }

        creature.speeds = speeds;
    }

    static setRacialDetails(lines, creature) {
        const line = sUtils.combineToString(lines);
        sRegex.racialDetails.lastIndex = 0;
        const match = [...line.matchAll(sRegex.racialDetails)][0];
        if (!match) return;

        creature.size = match.groups.size.toLowerCase();
        creature.alignment = match.groups.alignment?.trim();
        creature.race = match.groups.race?.trim();
        creature.swarmSize = match.groups.swarmsize?.trim();

        const creatureType = match.groups.type?.toLowerCase().trim();
        let singleCreatureType = creatureType.endsWith('s') ? creatureType.slice(0, -1) : creatureType;
        if (singleCreatureType === "monstrositie") {
            singleCreatureType = "monstrosity";
        };
        const isKnownType = KnownCreatureTypes.includes(singleCreatureType);
        creature.type = isKnownType ? singleCreatureType : undefined;
        creature.customType = isKnownType ? undefined : creatureType;
    }

    // Combines lines of text into sentences and paragraphs. This is complicated because finding 
    // sentences that can span multiple lines are hard to describe to a computer.
    static getBlockDatas(lines) {
        const result = [];
        const validLines = lines.filter(l => l);
        let actionData = null;
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
                foundSpellBlock = /^(innate spellcasting|spellcasting)\b/i.test(line);

                if (foundSpellBlock && /^spellcasting$/i.test(line)) {
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

            // Check to see if we've reached the end of the spell block by seeing if 
            // the next line is a title.
            const nextLineIsTitle = index < validLines.length - 1
                && sRegex.blockTitle.exec(validLines[index + 1]) != null;

            if (foundSpellBlock && nextLineIsTitle) {
                // Add a period at the end so that blocks are extracted correctly.
                if (!spellLines[spellLines.length - 1].endsWith(".")) {
                    spellLines[spellLines.length - 1] = spellLines[spellLines.length - 1] + ".";
                }

                // Break out of the spell block.
                foundSpellBlock = false;
            }
        }

        const notSpellSentences = sUtils.makeSentences(notSpellLines);
        const spellSentences = sUtils.makeSentences(spellLines);
        const sentences = notSpellSentences.concat(spellSentences);

        for (const sentence of sentences) {
            const titleMatch = sRegex.blockTitle.exec(sentence);

            if (titleMatch && !foundTitle) {
                // Ignore two titles in a row because it means that the second one is just a short description and not a real title.
                foundTitle = true;

                // Remove the period or exclamation mark from the title.
                const title = sentence.replace(/[.!]$/, "");
                actionData = new NameValueData(title);

                result.push(actionData);
            } else {
                foundTitle = false;

                if (actionData == null) {
                    actionData = new NameValueData("Description", sentence);
                    result.push(actionData);
                } else if (actionData.value == null) {
                    actionData.value = sentence;
                } else {
                    actionData.value = `${actionData.value} ${sentence}`;
                }
            }
        }

        for (let index = 0; index < result.length; index++) {
            const aData = result[index];
            if (aData.value == null && index != 0) {
                // If there's no description, assume it's a line at the end of the last action description that just looks like a title.
                result[index - 1].value = result[index - 1].value + " " + aData.name;
            } else {
                aData.value = this.formatForDisplay(aData.value ?? "");
            }
        }

        return result.filter(aData => aData.value != null);
    }

    static getVillainActions(lines) {
        const result = [];
        let actionData = null;

        for (const line of lines) {
            const titleMatch = sRegex.villainActionTitle.exec(line);

            if (titleMatch) {
                actionData = new NameValueData(titleMatch.groups.title, titleMatch.groups.description);
                result.push(actionData);
            } else {
                if (actionData == null) {
                    actionData = new NameValueData("Description", line);
                    result.push(actionData);
                } else {
                    actionData.value = `${actionData.value} ${line}`;
                }
            }
        }

        return result;
    }

    static getSpells(spellText, spellRegex) {
        spellRegex.lastIndex = 0;
        const spellMatches = [...spellText.matchAll(spellRegex)];
        const spellGroups = [];

        // Put spell groups on their own lines in the description so that it reads better.
        if (spellMatches.length) {
            const introDescription = spellText.slice(0, spellMatches[0].index).trim();
            spellGroups.push(new NameValueData("Description", introDescription));

            for (let idx = 0; idx < spellMatches.length; idx++) {
                const match = spellMatches[idx];
                let lastIndex = idx < spellMatches.length - 1 ? spellMatches[idx + 1].index : undefined;

                const spellNames = spellText
                    .slice(match.index + match[0].length, lastIndex)
                    .split(/,(?![^\(]*\))/) // split on commas that are outside of parenthesis
                    .map(spell => spell.trim()) // remove spaces
                    .map(spell => sUtils.trimStringEnd(spell, ".")) // remove end period
                    .map(spell => spell.replace(/(\s[ABR]|\s?\+)$/, "")) // remove MCDM activation symbols
                    .map(spell => spell.replace(/\*/g, "").trim()) // remove footnote markers
                    .filter(spell => spell.length)
                    .map(spell => sUtils.capitalizeAll(spell)); // capitalize words

                spellGroups.push(new NameValueData(sUtils.trimStringEnd(match[0], ":"), spellNames));
            }
        } else {
            // No spell lists, so keep the description so the feature is still created.
            spellGroups.push(new NameValueData("Description", spellText));
        }

        return spellGroups;
    }

    // ===============================
    // Utilities
    // ===============================

    static formatForDisplay(text) {
        const textArr = text.replaceAll("•", "\n•").split("\n");

        if (textArr.length > 1) {
            return `<p>${textArr.join("</p><p>")}</p>`
        } else {
            return textArr.join("");
        }
    }
}
