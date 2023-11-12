import { sbiUtils as sUtils } from "./sbiUtils.js";
import { BlockID } from "./sbiData.js";
import { sbiRegex as sRegex } from "./sbiRegex.js";

export class sbiActor {
    static async convertCreatureToActorAsync(creatureData, selectedFolderId) {
        const actor = await Actor.create({
            name: sUtils.capitalizeAll(creatureData.name),
            type: "npc",
            folder: selectedFolderId
        });

        await this.setActionsAsync(actor, creatureData);
        await this.setMajorActionAsync(actor, BlockID.legendaryActions, creatureData);
        await this.setMajorActionAsync(actor, BlockID.lairActions, creatureData);
        await this.setMajorActionAsync(actor, BlockID.villainActions, creatureData);
        await this.setMinorActionsAsync(actor, BlockID.bonusActions, creatureData);
        await this.setMinorActionsAsync(actor, BlockID.reactions, creatureData);
        await this.setArmorAsync(actor, creatureData);
        await this.setAbilitiesAsync(actor, creatureData);
        await this.setChallengeAsync(actor, creatureData);
        await this.setDamagesAndConditionsAsync(actor, creatureData);
        await this.setFeaturesAsync(actor, creatureData);
        await this.setHealthAsync(actor, creatureData);
        await this.setLanguagesAsync(actor, creatureData);
        await this.setRoleAsync(actor, creatureData);
        await this.setSavingThrowsAsync(actor, creatureData);
        await this.setSensesAsync(actor, creatureData);
        await this.setSkillsAsync(actor, creatureData);
        await this.setSpeedAsync(actor, creatureData);
        await this.setSoulsAsync(actor, creatureData);
        await this.setRacialDetailsAsync(actor, creatureData);
        await this.setUtilitySpells(actor, creatureData);

        return actor;
    }

    static async setActionsAsync(actor, creatureData) {
        for (const actionDescription of creatureData.actions) {
            const name = actionDescription.name;
            const lowerName = name.toLowerCase();
            const description = actionDescription.value;

            const itemData = {};
            itemData.name = sUtils.capitalizeAll(name);
            itemData.type = "feat";
            itemData.img = await sUtils.getImgFromPackItemAsync(lowerName);

            sUtils.assignToObject(itemData, "data.description.value", description);
            sUtils.assignToObject(itemData, "data.activation.type", "action");
            sUtils.assignToObject(itemData, "data.activation.cost", 1);

            // The "Multiattack" action isn't a real action, so there's nothing more to add to it.
            if (lowerName !== "multiattack") {
                // We'll assume that an NPC with stuff will have that stuff identified, equipped, attuned, etc.
                sUtils.assignToObject(itemData, "data.identified", true);
                sUtils.assignToObject(itemData, "data.equipped", true);
                sUtils.assignToObject(itemData, "data.attunement", 2);
                sUtils.assignToObject(itemData, "data.proficient", true);
                sUtils.assignToObject(itemData, "data.quantity", 1);

                this.setAttackOrSave(description, itemData, actor);
                this.setPerDay(name, itemData);
                this.setReach(description, itemData);
                this.setRecharge(name, itemData);
                this.setRange(description, itemData);
                this.setTarget(description, itemData);
            }

            await this.setItemAsync(itemData, actor);
        }
    }

    // These are things like legendary, mythic, and lair actions
    static async setMajorActionAsync(actor, type, creatureData) {
        // Set the type of action this is.
        let activationType = "";
        const isLegendaryTypeAction = type === BlockID.legendaryActions || type === BlockID.villainActions;

        if (isLegendaryTypeAction) {
            activationType = "legendary";
        }

        // Create the items for each action.
        // NOTE: If we hit an exception here that 'creature[type]' is undefined, make sure
        // to add that type to the CreatureData constructor with a default array value.
        for (const actionData of creatureData[type]) {
            const actionName = actionData.name;
            const description = actionData.value;
            const itemData = {};
            itemData.name = actionName;
            itemData.type = "feat";

            sUtils.assignToObject(itemData, "data.description.value", description);

            if (actionName === "Description") {
                itemData.name = sUtils.camelToTitleCase(type);
                // Add these just so that it doesn't say the action is not equipped and not proficient in the UI.
                sUtils.assignToObject(itemData, "data.equipped", true);
                sUtils.assignToObject(itemData, "data.proficient", true);

                // Determine whether this is a legendary or lair action.
                if (type === BlockID.lairActions) {
                    sUtils.assignToObject(itemData, "flags.adnd5e.itemInfo.type", "lair");

                    // Lair actions don't use titles, so it's just one item with all actions included in the description 
                    // text. Because of that, we need to assign the type here instead of in the 'else' block below.
                    sUtils.assignToObject(itemData, "data.activation.type", "lair");

                    // What iniative count does the lair action activate?
                    const lairInitiativeRegex = /initiative count (?<count>\d+)/i;
                    const lairInitiativeMatch = lairInitiativeRegex.exec(description);

                    if (lairInitiativeMatch) {
                        await actor.update(sUtils.assignToObject({}, "data.resources.lair.value", true));
                        await actor.update(sUtils.assignToObject({}, "data.resources.lair.initiative", parseInt(lairInitiativeMatch.groups.count)));
                    }
                } else if (isLegendaryTypeAction) {
                    sUtils.assignToObject(itemData, "flags.adnd5e.itemInfo.type", "legendary");

                    // How many legendary actions can it take?
                    const legendaryActionMatch = sRegex.legendaryActionCount.exec(description);
                    const actionCount = legendaryActionMatch ? parseInt(legendaryActionMatch.groups.count) : 3;

                    await actor.update(sUtils.assignToObject({}, "data.resources.legact.value", actionCount));
                    await actor.update(sUtils.assignToObject({}, "data.resources.legact.max", actionCount));
                }

                await this.setItemAsync(itemData, actor);
            } else {
                itemData.name = actionName;
                sUtils.assignToObject(itemData, "data.activation.type", activationType);

                // How many actions does this cost?
                const actionCostMatch = sRegex.actionCost.exec(actionName);
                let actionCost = 1;

                if (actionCostMatch) {
                    actionCost = parseInt(actionCostMatch.groups.cost);
                    itemData.name = itemData.name.slice(0, actionCostMatch.index).trim();
                }

                sUtils.assignToObject(itemData, "data.consume.type", "attribute");
                sUtils.assignToObject(itemData, "data.consume.target", "resources.legact.value");
                sUtils.assignToObject(itemData, "data.consume.amount", actionCost);
                sUtils.assignToObject(itemData, "data.activation.cost", actionCost);

                await this.setItemAsync(itemData, actor);
            }
        }
    }

    // These are things like bonus actions and reactions.
    static async setMinorActionsAsync(actor, type, creatureData) {
        // NOTE: If we hit an exception here that 'creature[type]' is undefined, make sure
        // to add that type to the CreatureData constructor with a default array value.
        for (const actionDescription of creatureData[type]) {
            const name = actionDescription.name;
            const description = actionDescription.value;

            const itemData = {};
            itemData.name = sUtils.capitalizeAll(name);
            itemData.type = "feat";
            itemData.img = await sUtils.getImgFromPackItemAsync(name);

            sUtils.assignToObject(itemData, "data.description.value", description);
            sUtils.assignToObject(itemData, "data.activation.cost", 1);

            let activationType = null;

            if (type == BlockID.bonusActions) {
                activationType = "bonus";
            } else if (type === BlockID.reactions) {
                activationType = "reaction";
            }

            sUtils.assignToObject(itemData, "flags.adnd5e.itemInfo.type", activationType);
            sUtils.assignToObject(itemData, "data.activation.type", activationType);

            await this.setItemAsync(itemData, actor);
        }
    }

    static async setArmorAsync(actor, creatureData) {
        if (!creatureData.armor) return;

        const actorObj = {};
        const armorValue = creatureData.armor.ac;
        let foundArmorItems = false;

        for (const armorType of creatureData.armor.types) {
            if (armorType.toLowerCase() === "natural armor") {
                sUtils.assignToObject(actorObj, "data.attributes.ac.calc", "natural");
                sUtils.assignToObject(actorObj, "data.attributes.ac.flat", armorValue);

                foundArmorItems = true;
            } else {
                const item = await sUtils.getItemFromPacksAsync(armorType, "equipment");

                if (item) {
                    item.data.equipped = true;
                    item.data.proficient = true;
                    item.data.attunement = 2;

                    await actor.createEmbeddedDocuments("Item", [item]);

                    foundArmorItems = true;
                }
            }
        }

        if (!foundArmorItems) {
            sUtils.assignToObject(actorObj, "data.attributes.ac.calc", "flat");
            sUtils.assignToObject(actorObj, "data.attributes.ac.flat", armorValue);
        }

        await actor.update(actorObj);
    }

    static async setAbilitiesAsync(actor, creatureData) {
        const actorObj = {};

        for (const data of creatureData.abilities) {
            const propPath = `data.abilities.${data.name.toLowerCase()}.value`;
            sUtils.assignToObject(actorObj, propPath, parseInt(data.value));
        }

        await actor.update(actorObj);
    }

    static async setChallengeAsync(actor, creatureData) {
        if (!creatureData.challenge) return;

        const actorData = {};
        sUtils.assignToObject(actorData, "data.details.cr", creatureData.challenge.cr);

        if (creatureData.challenge.xp) {
            sUtils.assignToObject(actorData, "data.details.xp.value", creatureData.challenge.xp);
        }

        await actor.update(actorData);
    }

    static async setDamagesAndConditionsAsync(actor, creatureData) {
        if (creatureData.conditionImmunities) {
            const conditionTypes = [...creatureData.conditionImmunities.matchAll(sRegex.conditionTypes)]
                .map(arr => arr[0].toLowerCase())
            await actor.update(sUtils.assignToObject({}, "data.traits.ci.value", conditionTypes));
        }

        if (creatureData.damageImmunities) {
            const actorData = {};
            this.setDamageData(creatureData.damageImmunities, "di", actorData);
            await actor.update(actorData);
        }

        if (creatureData.damageResistances) {
            const actorData = {};
            this.setDamageData(creatureData.damageResistances, "dr", actorData);
            await actor.update(actorData);
        }

        if (creatureData.damageVulnerabilities) {
            const actorData = {};
            this.setDamageData(creatureData.damageVulnerabilities, "dv", actorData);
            await actor.update(actorData);
        }
    }

    static async setFeaturesAsync(actor, creatureData) {
        for (const actionDescription of creatureData.features) {
            const name = actionDescription.name;
            const lowerName = name.toLowerCase();
            const description = actionDescription.value;

            const itemData = {};
            itemData.name = sUtils.capitalizeAll(name);
            itemData.type = "feat";
            itemData.img = await sUtils.getImgFromPackItemAsync(lowerName);

            sUtils.assignToObject(itemData, "data.description.value", description);

            if (lowerName.includes("innate spellcasting")) {
                // Example:
                // Innate Spellcasting. The aridni's innate spellcasting ability is Charisma (spell save DC 14). 
                // It can innately cast the following spells: 
                // At will: dancing lights, detect magic, invisibility 
                // 3/day: charm person, faerie fire, mage armor 
                // 1/day: spike growth
                await this.setSpellcastingAsync(description, itemData, actor, sRegex.spellInnateLine);
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
                await this.setSpellcastingAsync(description, itemData, actor, sRegex.spellLine);
            } else if (lowerName.startsWith("legendary resistance")) {
                // Example:
                // Legendary Resistance (3/day)
                const resistanceCountRegex = /\((?<perday>\d+)\/day\)/i;
                const resistanceMatch = resistanceCountRegex.exec(name);

                if (resistanceMatch) {
                    itemData.name = itemData.name.slice(0, resistanceMatch.index).trim();
                    await actor.update(sUtils.assignToObject({}, "data.resources.legres.value", parseInt(resistanceMatch.groups.perday)));
                    await actor.update(sUtils.assignToObject({}, "data.resources.legres.max", parseInt(resistanceMatch.groups.perday)));
                }

                sUtils.assignToObject(itemData, "data.activation.type", "special");
                sUtils.assignToObject(itemData, "data.consume.type", "attribute");
                sUtils.assignToObject(itemData, "data.consume.target", "resources.legres.value");
                sUtils.assignToObject(itemData, "data.consume.amount", 1);
            }

            await this.setItemAsync(itemData, actor);
        }
    }

    static async setHealthAsync(actor, creatureData) {
        const actorData = {};

        sUtils.assignToObject(actorData, "data.attributes.hp.value", creatureData.health?.value || 0);
        sUtils.assignToObject(actorData, "data.attributes.hp.max", creatureData.health?.value || 0);
        sUtils.assignToObject(actorData, "data.attributes.hp.formula", creatureData.health?.formula || 0);

        await actor.update(actorData);
    }

    static async setLanguagesAsync(actor, creatureData) {
        if (!creatureData.language) return;
        
        const knownValues = creatureData.language.knownLanguages.map(str => this.convertLanguage(str));
        const unknownValues = creatureData.language.unknownLanguages.map(str => this.convertLanguage(str));

        const actorData = {};
        sUtils.assignToObject(actorData, "data.traits.languages.value", knownValues);
        sUtils.assignToObject(actorData, "data.traits.languages.custom", unknownValues.join(";"));

        await actor.update(actorData);
    }

    static async setRoleAsync(actor, creatureData) {
        if (!creatureData.role) return;

        await actor.update(sUtils.assignToObject({}, "data.details.type.subtype", creatureData.role));
    }

    static async setSavingThrowsAsync(actor, creatureData) {
        const actorData = {};

        for (const savingThrow of creatureData.savingThrows) {
            const name = savingThrow.toLowerCase();
            const propPath = `data.abilities.${name}.proficient`;
            sUtils.assignToObject(actorData, propPath, 1);
        }

        await actor.update(actorData);
    }

    static async setSensesAsync(actor, creatureData) {
        const actorData = {};

        for (const sense of creatureData.senses) {
            const name = sense.name.toLowerCase();
            const modifier = parseInt(sense.value);

            sUtils.assignToObject(actorData, `data.attributes.senses.${name}`, modifier);

            if (name === "darkvision") {
                sUtils.assignToObject(actorData, "token.dimSight", modifier);
            }
        }

        if (creatureData.specialSense) {
            sUtils.assignToObject(actorData, "data.attributes.senses.special", sUtils.capitalizeAll(creatureData.specialSense));
        }

        await actor.update(actorData);
    }

    static async setSkillsAsync(actor, creatureData) {
        // Calculate skill proficiency value by querying the actor data. This must happen after the abilities are set.
        // 1 is regular proficiency, 2 is double proficiency, etc.
        for (const skill of creatureData.skills) {
            const skillId = this.convertToShortSkill(skill.name);
            const skillMod = parseInt(skill.value);
            const actorSkill = actor.data.data.skills[skillId];
            const abilityMod = actor.data.data.abilities[actorSkill.ability].mod;
            const generalProf = actor.data.data.attributes.prof;
            const skillProf = (skillMod - abilityMod) / generalProf;

            await actor.update(sUtils.assignToObject({}, `data.skills.${skillId}.value`, skillProf));
        }
    }

    static async setSoulsAsync(actor, creatureData) {
        if (!creatureData.souls) return;

        let description = "<p>Demons feast not on food or water, but on souls. These fuel their ";
        description += "bloodthirsty powers, and while starved for souls, a demon can scarcely think.</p>";
        description += "<p>A demon’s stat block states the number of souls a given demon ";
        description += "has already consumed at the beginning of combat, ";
        description += "both as a die expression and as an average number.</p>";

        const itemData = {};
        itemData.name = `Souls: ${creatureData.souls.value} (${creatureData.souls.formula})`;
        itemData.type = "feat";

        sUtils.assignToObject(itemData, "data.description.value", description);
        await this.setItemAsync(itemData, actor);
    }

    static async setSpellcastingAsync(description, itemData, actor, spellRegex) {
        const spellMatches = [...description.matchAll(spellRegex)];
        let spellDatas = [];

        // Set spell level
        const spellLevelMatch = sRegex.spellLevel.exec(description);

        if (spellLevelMatch) {
            await actor.update(sUtils.assignToObject({}, "data.details.spellLevel", parseInt(spellLevelMatch.groups.level)));
        }

        // Put spell groups on their own lines in the description so that it reads better.
        if (spellMatches.length) {
            const descriptionLines = [];
            let lastIndex = description.length;

            // Go backwards through the matches and separate the header from the spells so that the header is bolded.
            for (let index = spellMatches.length - 1; index >= 0; index--) {
                const match = spellMatches[index];
                const spellNames = description
                    .slice(match.index, lastIndex)
                    .slice(match[0].length)
                    .split(/,(?![^\(]*\))/) // split on commas that are outside of parenthesis
                    .map(spell => spell.trim()) // remove spaces
                    .map(spell => sUtils.trimStringEnd(spell, ".")) // remove end period
                    .map(spell => spell.replace(/\s[ABR\+]$/, "")) // remove MCDM activation symbols
                    .map(spell => sUtils.capitalizeAll(spell)); // capitalize words

                descriptionLines.push(`<p><b>${match[0]}</b> ${spellNames.join(", ")}</p>`);
                lastIndex = match.index;

                const slots = this.getGroupValue("slots", [...match[0].matchAll(sRegex.spellcastingDetails)]);
                const perday = this.getGroupValue("perday", [...match[0].matchAll(sRegex.spellcastingDetails)]);
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
                    // Remove text in parenthesis when storing the spell name for lookup later.
                    let cleanName = spellName.replace(/\(.*\)/, "").trim()

                    spellDatas.push({
                        "name": cleanName,
                        "type": spellType,
                        "count": spellCount
                    });
                }
            }

            const introDescription = `<p>${description.slice(0, spellMatches[0].index)}</p>`;
            const fullDescription = introDescription.concat(descriptionLines.reverse().join("\n"));
            sUtils.assignToObject(itemData, "data.description.value", fullDescription);
        } else {
            // Some spell casting description bury the spell in the description, like Mehpits.
            // Example: The mephit can innately cast fog cloud, requiring no material components.
            var match = sRegex.spellInnateSingle.exec(description);

            if (match) {
                const spell = await sUtils.getItemFromPacksAsync(match.groups.spellname, "spell");

                if (spell) {
                    const perday = this.getGroupValue("perday", [...itemData.name.matchAll(sRegex.spellcastingDetails)]);

                    spellDatas.push({
                        "name": spell.name,
                        "type": "innate",
                        "count": parseInt(perday)
                    });
                }
            }
        }

        // Set spellcasting ability.
        let spellcastingAbility = this.getGroupValue("ability1", [...description.matchAll(sRegex.spellcastingDetails)]);

        if (spellcastingAbility == null) {
            spellcastingAbility = this.getGroupValue("ability2", [...description.matchAll(sRegex.spellcastingDetails)]);
        }

        if (spellcastingAbility != null) {
            const actorData = sUtils.assignToObject({}, "data.attributes.spellcasting", this.convertToShortAbility(spellcastingAbility));
            await actor.update(actorData)
        }

        // Add spells to actor.
        if (spellDatas.length) {
            for (const spellData of spellDatas) {
                const spell = await sUtils.getItemFromPacksAsync(spellData.name, "spell");

                if (spell) {
                    if (spellData.type == "slots") {
                        // Update the actor's number of slots per level.
                        let spellObject = {};
                        sUtils.assignToObject(spellObject, `data.spells.spell${spell.data.level}.value`, spellData.count);
                        sUtils.assignToObject(spellObject, `data.spells.spell${spell.data.level}.max`, spellData.count);
                        sUtils.assignToObject(spellObject, `data.spells.spell${spell.data.level}.override`, spellData.count);

                        await actor.update(spellObject);
                    } else if (spellData.type = "innate") {
                        // Separate the 'per day' spells from the 'at will' spells.
                        if (spellData.count) {
                            sUtils.assignToObject(spell, "data.uses.value", spellData.count);
                            sUtils.assignToObject(spell, "data.uses.max", spellData.count);
                            sUtils.assignToObject(spell, "data.uses.per", "day");
                            sUtils.assignToObject(spell, "data.preparation.mode", "innate");
                        } else {
                            sUtils.assignToObject(spell, "data.preparation.mode", "atwill");
                        }

                        sUtils.assignToObject(spell, "data.preparation.prepared", true);
                    }

                    // Add the spell to the character sheet if it doesn't exist already.
                    if (!actor.items.getName(spell.name)) {
                        await actor.createEmbeddedDocuments("Item", [spell]);
                    }
                }
            }
        }
    }

    static async setSpeedAsync(actor, creatureData) {
        const speedData = creatureData.speeds.find(d => d.name.toLowerCase() === "speed");

        if (speedData != null) {
            const speedValue = speedData.value;

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

        const otherSpeeds = creatureData.speeds.filter(d => d != speedData);

        if (otherSpeeds.length) {
            await actor.update({
                "data": {
                    "attributes": {
                        "speed": {
                            "special": otherSpeeds
                                .map(d => `${sUtils.capitalizeAll(d.name)} ${d.value} ft`)
                                .join(", ")
                        },
                        "movement": {
                            "burrow": parseInt(otherSpeeds.find(d => d.name.toLowerCase() === "burrow")?.value ?? 0),
                            "climb": parseInt(otherSpeeds.find(d => d.name.toLowerCase() === "climb")?.value ?? 0),
                            "fly": parseInt(otherSpeeds.find(d => d.name.toLowerCase() === "fly")?.value ?? 0),
                            "swim": parseInt(otherSpeeds.find(d => d.name.toLowerCase() === "swim")?.value ?? 0),
                            "hover": otherSpeeds.find(d => d.name.toLowerCase() === "hover") != undefined
                        }
                    }
                }
            })
        }
    }

    static async setRacialDetailsAsync(actor, creatureData) {
        const sizeValue = creatureData.size.toLowerCase();
        const detailsData = {};

        switch (sizeValue) {
            case "small":
                sUtils.assignToObject(detailsData, "data.traits.size", "sm");
                break;
            case "medium":
                sUtils.assignToObject(detailsData, "data.traits.size", "med");
                break;
            case "large":
                sUtils.assignToObject(detailsData, "data.traits.size", "lg");
                break;
            case "gargantuan":
                sUtils.assignToObject(detailsData, "data.traits.size", "grg");
                break;
            default:
                sUtils.assignToObject(detailsData, "data.traits.size", sizeValue);
                break;
        }

        sUtils.assignToObject(detailsData, "data.details.alignment", sUtils.capitalizeAll(creatureData.alignment?.trim()));
        sUtils.assignToObject(detailsData, "data.details.race", sUtils.capitalizeAll(creatureData.race?.trim()));
        sUtils.assignToObject(detailsData, "data.details.type.value", creatureData.type?.trim().toLowerCase());

        await actor.update(detailsData);
    }

    static async setUtilitySpells(actor, creatureData) {
        for (const actionDescription of creatureData.utilitySpells) {
            const description = actionDescription.value;
            const itemData = {};

            itemData.name = "Utility Spells";
            itemData.type = "feat";

            sUtils.assignToObject(itemData, "data.description.value", description);

            await this.setSpellcastingAsync(description, itemData, actor, sRegex.spellInnateLine);
            await this.setItemAsync(itemData, actor);
        }
    }

    // ===============================
    // Utilities
    // ===============================

    static convertLanguage(language) {
        let result = language.toLowerCase();

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

    static setDamageData(description, damageID, actorData) {
        const descriptionLower = description.toLowerCase();

        // Parse out the known damage types.
        const knownTypes = [...description.matchAll(sRegex.damageTypes)]
            .filter(arr => arr[0].length)
            .map(arr => arr[0].toLowerCase());

        // Now see if there is any custom text we should add.
        let customType = null;
        // Split on ";" first for lines like "poison; bludgeoning, piercing, and slashing from nonmagical attacks"
        const strings = descriptionLower.split(";");
        if (strings.length === 2) {
            customType = strings[1].trim();
        } else {
            // Handle something like "piercing from magic weapons wielded by good creatures"
            // by taking out the known types, commas, and spaces, and seeing if there's anything left.
            const descLeftover = descriptionLower.replace(sRegex.damageTypes, "").replace(/,/g, "").trim();
            if (descLeftover) {
                customType = descriptionLower;
            }
        }

        if (knownTypes.length) {
            sUtils.assignToObject(actorData, `data.traits.${damageID}.value`, knownTypes)
        }

        if (customType) {
            sUtils.assignToObject(actorData, `data.traits.${damageID}.value`, sUtils.capitalizeFirstLetter(customType))
        }

        // "mundane attacks" is an MCDM thing.
        if (descriptionLower.includes("nonmagical weapons")
            || descriptionLower.includes("nonmagical attacks")
            || descriptionLower.includes("mundane attacks")) {
            sUtils.assignToObject(actorData, `data.traits.${damageID}.bypasses`, "mgc")
        }

        if (descriptionLower.includes("adamantine")) {
            sUtils.assignToObject(actorData, `data.traits.${damageID}.bypasses`, ["ada", "mgc"])
        }

        if (descriptionLower.includes("silvered")) {
            sUtils.assignToObject(actorData, `data.traits.${damageID}.bypasses`, ["sil", "mgc"])
        }
    }

    static async setItemAsync(itemData, actor) {
        // Add an appropriate icon if the item doesn't already have one just so that it looks 
        // better next to ones that do have an icon.
        if (!itemData.img) {
            if (itemData.type === "weapon") {
                itemData.img = "icons/svg/sword.svg";
            } else if (itemData.data.activation?.cost) {
                itemData.img = "icons/svg/combat.svg";
            } else if (itemData.type === "feat") {
                itemData.img = "icons/svg/book.svg";
            } else {
                itemData.img = "icons/svg/d20.svg";
            }
        }

        const item = new Item(itemData);
        await actor.createEmbeddedDocuments("Item", [item.toObject()]);
    }

    // Example:
    // Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 10(2d6 + 3) slashing damage plus 3(1d6) acid damage.
    // or
    // Frost Breath (Recharge 5–6). The hound exhales a 15-foot cone of frost. Each creature in the cone must make a DC 13 
    // Dexterity saving throw, taking 44(8d10) cold damage on a failed save or half as much damage on a successful one.
    static setAttackOrSave(description, itemData, actor) {
        // Some attacks include a saving throw, so we'll just check for both attack rolls and saving throw rolls
        let attackDescription = description;
        let saveDescription = null;
        let attackMatch = null;
        const saveMatch = sRegex.savingThrowDetails.exec(description);

        if (saveMatch) {
            attackDescription = description.slice(0, saveMatch.index);
            saveDescription = description.slice(saveMatch.index);
        }

        if (attackDescription.length) {
            attackMatch = sRegex.attack.exec(attackDescription);
            if (attackMatch) {
                itemData.type = "weapon";
                sUtils.assignToObject(itemData, "data.weaponType", "natural");
                sUtils.assignToObject(itemData, "data.ability", actor.data.data.abilities.str.mod > actor.data.data.abilities.dex.mod ? "str" : "dex");

                this.setDamageRolls(attackDescription, itemData, actor)
            }
        }

        if (saveDescription) {
            if (!attackMatch) {
                sUtils.assignToObject(itemData, "data.actionType", "save");
            }

            const savingThrowMatch = sRegex.savingThrowDetails.exec(description);
            if (savingThrowMatch) {
                const dc = savingThrowMatch.groups.savedc;
                const ability = savingThrowMatch.groups.saveability;

                sUtils.assignToObject(itemData, "data.save.ability", this.convertToShortAbility(ability));
                sUtils.assignToObject(itemData, "data.save.dc", parseInt(dc));
                sUtils.assignToObject(itemData, "data.save.scaling", "flat");

                this.setDamageRolls(saveDescription, itemData, actor)
            }
        }
    }

    // Example: Dizzying Hex (2/Day; 1st-Level Spell)
    static setPerDay(text, itemData) {
        const match = sRegex.perDayDetails.exec(text);

        if (match) {
            const uses = match.groups.perday;
            sUtils.assignToObject(itemData, "data.uses.value", parseInt(uses));
            sUtils.assignToObject(itemData, "data.uses.max", uses);
            sUtils.assignToObject(itemData, "data.range.per", "day");
        }
    }

    // Example: Ranged Weapon Attack: +7 to hit, range 150/600 ft., one target.
    static setRange(text, itemData) {
        const match = sRegex.range.exec(text);

        if (match) {
            const nearRange = parseInt(match.groups.near);
            const farRange = parseInt(match.groups.far);

            sUtils.assignToObject(itemData, "data.range.value", nearRange);
            sUtils.assignToObject(itemData, "data.range.long", farRange);
            sUtils.assignToObject(itemData, "data.range.units", "ft");
            sUtils.assignToObject(itemData, "data.actionType", "rwak");
            sUtils.assignToObject(itemData, "data.ability", "dex");
        }
    }

    // Example: Frost Breath (Recharge 5–6).
    static setRecharge(text, itemData) {
        const match = sRegex.recharge.exec(text);

        if (match) {
            sUtils.assignToObject(itemData, "data.recharge.value", parseInt(match.groups.recharge));
            sUtils.assignToObject(itemData, "data.recharge.charged", true);
        }
    }

    // Example: Melee Weapon Attack: +8 to hit, reach 5 ft., one target.
    static setReach(text, itemData) {
        const match = sRegex.reach.exec(text);

        if (match) {
            const reach = parseInt(match.groups.reach);

            sUtils.assignToObject(itemData, "data.range.value", reach);
            sUtils.assignToObject(itemData, "data.range.units", "ft");
            sUtils.assignToObject(itemData, "data.actionType", "mwak");
        }
    }

    // Example: The hound exhales a 15-foot cone of frost.
    static setTarget(text, itemData) {
        const match = sRegex.target.exec(text);

        if (match) {
            sUtils.assignToObject(itemData, "data.target.value", match.groups.range);
            sUtils.assignToObject(itemData, "data.target.type", match.groups.shape);
            sUtils.assignToObject(itemData, "data.target.units", "ft");
        }
    }

    static setDamageRolls(description, itemData, actor) {
        // const regexQuery = sUtils.format(sbiRegex.damageRollsQuery, lookup);
        // const regex = new RegExp(regexQuery, "i");
        // const match = .exec(description);
        const match = sRegex.damageRoll.exec(description);

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
                        sUtils.assignToObject(itemData, "data.ability", "str");
                    } else if (damageMod === actor.data.data.abilities.dex.mod) {
                        sUtils.assignToObject(itemData, "data.ability", "dex");
                    } else if (damageMod === actor.data.data.abilities.con.mod) {
                        sUtils.assignToObject(itemData, "data.ability", "con");
                    } else if (damageMod === actor.data.data.abilities.int.mod) {
                        sUtils.assignToObject(itemData, "data.ability", "int");
                    } else if (damageMod === actor.data.data.abilities.wis.mod) {
                        sUtils.assignToObject(itemData, "data.ability", "wis");
                    } else if (damageMod === actor.data.data.abilities.cha.mod) {
                        sUtils.assignToObject(itemData, "data.ability", "cha");
                    }
                }
            }
        }

        const versatilematch = sRegex.versatile.exec(description);

        if (versatilematch) {
            itemData.data.damage.versatile = versatilematch.groups.damageroll;

            if (itemData.data.properties) {
                itemData.data.properties.ver = true;
            }
        }
    }

    static getGroupValue(group, matches) {
        if (matches && matches.length) {
            return matches.map(m => m.groups[group]).find(val => val);
        }

        return null;
    }
}