import { sbiUtils as sUtils } from "./sbiUtils.js";
import { BlockID, RulesVersion } from "./sbiData.js";
import { sbiRegex as sRegex } from "./sbiRegex.js";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const SORT_STEP = 100000;

// Builds dnd5e (v6+) actor and item data from the parsed CreatureData.
//
// The data model moved to "activities" in dnd5e 4.0: attacks, saves, damage, targets,
// uses and consumption live on an activity embedded in the item rather than on the
// item itself. Everything here writes that newer structure.
export class sbiActor {
    static async convertCreatureToActorAsync(creatureData, selectedFolderId) {
        const context = this.buildContext(creatureData);
        const actorData = this.buildActorData(creatureData, context, selectedFolderId);

        const actor = await Actor.create(actorData);

        const items = await this.buildItemsAsync(creatureData, context);

        if (items.length) {
            await actor.createEmbeddedDocuments("Item", items);
        }

        await this.finalizeSpellSlotsAsync(actor, context);
        await this.finalizeArmorClassAsync(actor, creatureData);

        return actor;
    }

    // NPCs don't get slots from a class, so the slots printed in the statblock are stored as overrides.
    static async finalizeSpellSlotsAsync(actor, context) {
        const update = {};

        for (const [level, slots] of Object.entries(context.slotOverrides ?? {})) {
            if (!(parseInt(level) > 0)) continue;
            sUtils.assignToObject(update, `system.spells.spell${level}.value`, slots);
            sUtils.assignToObject(update, `system.spells.spell${level}.override`, slots);
        }

        if (Object.keys(update).length) {
            await actor.update(update);
        }
    }

    // ===============================
    // Context
    // ===============================

    // Values that several parts of the conversion need, calculated up front so that
    // the actor can be created in one go instead of a long chain of updates.
    static buildContext(creatureData) {
        const abilities = {};

        for (const abbr of ABILITIES) {
            const data = creatureData.abilities.find(a => a.name.toLowerCase() === abbr);
            const value = Number.isFinite(parseInt(data?.value)) ? parseInt(data.value) : 10;
            abilities[abbr] = { value, mod: Math.floor((value - 10) / 2) };
        }

        const cr = creatureData.challenge?.cr ?? 0;
        // Same formula as dnd5e's Proficiency.calculateMod(Math.max(cr, 1)).
        const prof = Math.floor((Math.max(cr, 1) + 7) / 4);

        const context = {
            abilities,
            prof,
            cr,
            modernRules: creatureData.rulesVersion === RulesVersion.modern,
            spellcastingAbility: null,
            spellSaveDC: null,
            spellAttackBonus: null,
            spellcasterLevel: null,
            missingSpells: [],
            sort: 0
        };

        // Spellcasting details are needed when creating spell attack and save activities.
        for (const spellDatas of [creatureData.spellcasting, creatureData.innateSpellcasting, creatureData.utilitySpells]) {
            const description = spellDatas?.[0]?.value;
            if (!description) continue;

            const spellMatches = [...description.matchAll(sRegex.spellcastingDetails)];
            const ability = this.getGroupValue("ability1", spellMatches) ?? this.getGroupValue("ability2", spellMatches);
            const dc = this.getGroupValue("savedc", spellMatches);
            const toHit = this.getGroupValue("tohit", spellMatches);
            const levelMatch = sRegex.spellcasterLevel.exec(description);

            if (ability && !context.spellcastingAbility) {
                const abbr = this.convertToShortAbility(ability);
                if (ABILITIES.includes(abbr)) context.spellcastingAbility = abbr;
            }
            if (dc && !context.spellSaveDC) context.spellSaveDC = parseInt(dc);
            if (toHit && context.spellAttackBonus == null) context.spellAttackBonus = sUtils.parseSignedInt(toHit);
            if (levelMatch && !context.spellcasterLevel) context.spellcasterLevel = parseInt(levelMatch.groups.level);
        }

        return context;
    }

    static nextSort(context) {
        context.sort += SORT_STEP;
        return context.sort;
    }

    // ===============================
    // Actor
    // ===============================

    static buildActorData(creatureData, context, selectedFolderId) {
        const system = {};

        this.setAbilities(system, creatureData, context);
        this.setArmor(system, creatureData, context);
        this.setChallenge(system, creatureData);
        this.setDamagesAndConditions(system, creatureData);
        this.setHealth(system, creatureData);
        this.setInitiative(system, creatureData, context);
        this.setLanguages(system, creatureData);
        this.setLegendaryResources(system, creatureData);
        this.setRacialDetails(system, creatureData);
        this.setSenses(system, creatureData);
        this.setSkills(system, creatureData, context);
        this.setSource(system, creatureData, context);
        this.setSpeed(system, creatureData);
        this.setSpellcasting(system, creatureData, context);

        const actorData = {
            name: sUtils.capitalizeAll(creatureData.name),
            type: "npc",
            folder: selectedFolderId || null,
            system
        };

        // Give the token vision that matches its best special sense.
        const senseRanges = Object.values(system.attributes?.senses?.ranges ?? {}).filter(Number.isFinite);
        if (senseRanges.length) {
            sUtils.assignToObject(actorData, "prototypeToken.sight.range", Math.max(...senseRanges));
        }

        return actorData;
    }

    static setAbilities(system, creatureData, context) {
        for (const abbr of ABILITIES) {
            const ability = context.abilities[abbr];
            sUtils.assignToObject(system, `abilities.${abbr}.value`, ability.value);

            if (creatureData.savingThrows.map(s => s.toLowerCase()).includes(abbr)) {
                sUtils.assignToObject(system, `abilities.${abbr}.proficient`, 1);

                // Reproduce any bonus beyond proficiency, like a +3 from a magic item.
                const printed = creatureData.savingThrowBonuses?.[abbr];
                if (Number.isFinite(printed)) {
                    const extra = printed - (ability.mod + context.prof);
                    if (extra !== 0) {
                        sUtils.assignToObject(system, `abilities.${abbr}.bonuses.save`, this.formatBonus(extra));
                    }
                }
            }
        }
    }

    // AC in dnd5e 6 is driven by "calcs" (which formulas to consider) plus "flat" for natural
    // armor and "override" when the value should simply be forced.
    static setArmor(system, creatureData, context) {
        if (!creatureData.armor) return;

        const ac = creatureData.armor.ac;
        const types = creatureData.armor.types.map(t => t.toLowerCase());
        const hasNaturalArmor = types.some(t => t.includes("natural"));
        const hasEquipment = types.some(t => !t.includes("natural")) || creatureData.gear.length > 0;

        if (hasNaturalArmor) {
            sUtils.assignToObject(system, "attributes.ac.calcs", ["natural"]);
            sUtils.assignToObject(system, "attributes.ac.flat", ac);
        } else if (hasEquipment) {
            // Armor and shields will be added as items; let the system work out the AC.
            // The result is checked against the statblock after the items are created.
            sUtils.assignToObject(system, "attributes.ac.calcs", ["unarmored", "armored"]);
        } else if (10 + context.abilities.dex.mod === ac) {
            // Plain unarmored creature, nothing to do.
            sUtils.assignToObject(system, "attributes.ac.calcs", ["unarmored"]);
        } else {
            // The 2024 layout doesn't print "(natural armor)" anymore, so treat any other
            // unexplained AC as natural armor.
            sUtils.assignToObject(system, "attributes.ac.calcs", ["natural"]);
            sUtils.assignToObject(system, "attributes.ac.flat", ac);
        }
    }

    static setChallenge(system, creatureData) {
        // XP is derived from the CR by the system, so only the CR is stored.
        sUtils.assignToObject(system, "details.cr", creatureData.challenge?.cr ?? 0);
    }

    static setDamagesAndConditions(system, creatureData) {
        if (creatureData.standardConditionImmunities.length) {
            sUtils.assignToObject(system, "traits.ci.value", creatureData.standardConditionImmunities);
        }

        if (creatureData.specialConditionImmunities) {
            sUtils.assignToObject(system, "traits.ci.custom", sUtils.capitalizeFirstLetter(creatureData.specialConditionImmunities));
        }

        this.setDamageData(creatureData.standardDamageImmunities, creatureData.specialDamageImmunities, "di", system);
        this.setDamageData(creatureData.standardDamageResistances, creatureData.specialDamageResistances, "dr", system);
        this.setDamageData(creatureData.standardDamageVulnerabilities, creatureData.specialDamageVulnerabilities, "dv", system);
    }

    static setDamageData(standardDamages, specialDamage, damageID, system) {
        if (standardDamages.length) {
            sUtils.assignToObject(system, `traits.${damageID}.value`, standardDamages);
        }

        if (specialDamage) {
            const specialDamagesLower = specialDamage.toLowerCase();
            const bypasses = new Set();

            // "mundane attacks" is an MCDM thing.
            if (specialDamagesLower.includes("nonmagical")
                || specialDamagesLower.includes("non-magical")
                || specialDamagesLower.includes("mundane attacks")) {
                bypasses.add("mgc");
            }

            if (specialDamagesLower.includes("adamantine")) {
                bypasses.add("ada");
            }

            if (specialDamagesLower.includes("silver")) {
                bypasses.add("sil");
            }

            if (bypasses.size) {
                // The physical damage types named alongside the bypass also need to be in the list.
                const physicalTypes = [...specialDamagesLower.matchAll(/\b(bludgeoning|piercing|slashing)\b/g)].map(m => m[1]);
                const currentValues = sUtils.getFromObject(system, `traits.${damageID}.value`) ?? [];
                sUtils.assignToObject(system, `traits.${damageID}.value`, [...new Set([...currentValues, ...physicalTypes])]);
                sUtils.assignToObject(system, `traits.${damageID}.bypasses`, [...bypasses]);
            } else {
                sUtils.assignToObject(system, `traits.${damageID}.custom`, sUtils.capitalizeFirstLetter(specialDamage));
            }
        }
    }

    static setHealth(system, creatureData) {
        const hp = creatureData.health?.value ?? 0;
        sUtils.assignToObject(system, "attributes.hp.value", hp);
        sUtils.assignToObject(system, "attributes.hp.max", hp);
        sUtils.assignToObject(system, "attributes.hp.formula", creatureData.health?.formula ?? "");
    }

    // The 2024 layout prints the initiative bonus. Anything beyond the Dexterity modifier
    // is stored as a flat bonus so that the sheet shows the same number.
    static setInitiative(system, creatureData, context) {
        if (!Number.isFinite(creatureData.initiative)) return;

        const extra = creatureData.initiative - context.abilities.dex.mod;
        if (extra !== 0) {
            sUtils.assignToObject(system, "attributes.init.bonus", this.formatBonus(extra));
        }
    }

    static setLanguages(system, creatureData) {
        if (!creatureData.language) return;

        sUtils.assignToObject(system, "traits.languages.value", creatureData.language.knownLanguages);
        sUtils.assignToObject(system, "traits.languages.custom", creatureData.language.unknownLanguages.join("; "));

        if (creatureData.language.telepathy) {
            sUtils.assignToObject(system, "traits.languages.communication.telepathy.value", creatureData.language.telepathy);
            sUtils.assignToObject(system, "traits.languages.communication.telepathy.units", "ft");
        }
    }

    // Legendary actions/resistances now track "spent" instead of "value".
    static setLegendaryResources(system, creatureData) {
        const legendaryDescription = this.getDescriptionText(creatureData.legendaryActions)
            ?? this.getDescriptionText(creatureData.villainActions);

        if (legendaryDescription) {
            const match = sRegex.legendaryActionCount.exec(legendaryDescription);
            const count = match ? parseInt(match.groups.count ?? match.groups.count2) : 3;

            sUtils.assignToObject(system, "resources.legact.max", count);
            sUtils.assignToObject(system, "resources.legact.spent", 0);

            // "Legendary Action Uses: 3 (4 in Lair)" means the creature has lair actions.
            if (sRegex.inLair.test(legendaryDescription)) {
                sUtils.assignToObject(system, "resources.lair.value", true);
            }
        }

        const lairDescription = this.getDescriptionText(creatureData.lairActions);

        if (lairDescription) {
            sUtils.assignToObject(system, "resources.lair.value", true);

            // What iniative count does the lair action activate?
            const lairInitiativeMatch = /initiative count (?<count>\d+)/i.exec(lairDescription);
            if (lairInitiativeMatch) {
                sUtils.assignToObject(system, "resources.lair.initiative", parseInt(lairInitiativeMatch.groups.count));
            }
        }

        const legendaryResistance = creatureData.features.find(f => f.name.toLowerCase().startsWith("legendary resistance"));

        if (legendaryResistance) {
            const resistanceMatch = sRegex.perDayDetails.exec(legendaryResistance.name);
            const count = resistanceMatch ? parseInt(resistanceMatch.groups.perday) : 3;

            sUtils.assignToObject(system, "resources.legres.max", count);
            sUtils.assignToObject(system, "resources.legres.spent", 0);

            if (sRegex.inLair.test(legendaryResistance.name)) {
                sUtils.assignToObject(system, "resources.lair.value", true);
            }
        }
    }

    static setRacialDetails(system, creatureData) {
        const getSizeAbbreviation = (size) => {
            switch (size) {
                case "fine":
                case "diminutive":
                    return "tiny";
                case "small":
                    return "sm";
                case "medium":
                    return "med";
                case "large":
                    return "lg";
                case "gargantuan":
                case "colossal":
                    return "grg";
                default:
                    return size;
            }
        };

        const sizeValue = creatureData.size?.toLowerCase() ?? "med";
        const swarmSizeValue = creatureData.swarmSize?.toLowerCase();

        sUtils.assignToObject(system, "traits.size", getSizeAbbreviation(sizeValue));

        if (swarmSizeValue) {
            sUtils.assignToObject(system, "details.type.swarm", getSizeAbbreviation(swarmSizeValue));
        }

        if (creatureData.alignment) {
            sUtils.assignToObject(system, "details.alignment", sUtils.capitalizeAll(creatureData.alignment.trim()));
        }

        if (creatureData.race) {
            sUtils.assignToObject(system, "details.type.subtype", sUtils.capitalizeAll(creatureData.race.trim()));
        }

        if (creatureData.type) {
            sUtils.assignToObject(system, "details.type.value", creatureData.type.trim().toLowerCase());
        }

        const hasCustomType = creatureData.customType?.trim();
        if (hasCustomType) {
            sUtils.assignToObject(system, "details.type.value", "custom");
            sUtils.assignToObject(system, "details.type.custom", sUtils.capitalizeAll(hasCustomType));
        }
    }

    // Senses moved to "senses.ranges.<sense>" in dnd5e 5.3.
    static setSenses(system, creatureData) {
        if (!creatureData.senses?.length) return;

        const specialSenses = [];

        for (const sense of creatureData.senses) {
            const senseName = sense.name.toLowerCase();
            const senseRange = parseInt(sense.value);

            if (senseName === "perception") {
                continue;
            } else if (["blindsight", "darkvision", "tremorsense", "truesight"].includes(senseName)) {
                sUtils.assignToObject(system, `attributes.senses.ranges.${senseName}`, senseRange);
            } else {
                specialSenses.push(`${sUtils.capitalizeFirstLetter(senseName)} ${senseRange} ft`);
            }
        }

        sUtils.assignToObject(system, "attributes.senses.units", "ft");

        if (specialSenses.length) {
            sUtils.assignToObject(system, "attributes.senses.special", specialSenses.join("; "));
        }
    }

    static setSkills(system, creatureData, context) {
        // Calculate skill proficiency value from the printed modifier. 
        // 1 is regular proficiency, 2 is double proficiency, 0.5 is half proficiency.
        for (const skill of creatureData.skills) {
            const skillId = this.convertToShortSkill(skill.name);
            const abilityId = this.getSkillAbility(skillId);
            const skillMod = parseInt(skill.value);
            if (!Number.isFinite(skillMod)) continue;

            const abilityMod = context.abilities[abilityId]?.mod ?? 0;
            const rawProf = (skillMod - abilityMod) / context.prof;

            // Snap to a proficiency level that the system understands.
            const levels = [0, 0.5, 1, 2];
            const profLevel = levels.reduce((best, level) => Math.abs(level - rawProf) < Math.abs(best - rawProf) ? level : best, 0);
            sUtils.assignToObject(system, `skills.${skillId}.value`, profLevel);

            // Anything left over is stored as a flat bonus so the sheet shows the same number.
            const extra = skillMod - (abilityMod + profLevel * context.prof);
            if (extra !== 0) {
                sUtils.assignToObject(system, `skills.${skillId}.bonuses.check`, this.formatBonus(extra));
                sUtils.assignToObject(system, `skills.${skillId}.bonuses.passive`, this.formatBonus(extra));
            }
        }
    }

    static setSource(system, creatureData, context) {
        sUtils.assignToObject(system, "source.rules", context.modernRules ? RulesVersion.modern : RulesVersion.legacy);

        if (creatureData.role) {
            sUtils.assignToObject(system, "source.custom", `Role: ${creatureData.role}`);
            sUtils.assignToObject(system, "source.book", "Flee, Mortals!");
        }
    }

    // Movement moved to "movement.speeds.<type>" in dnd5e 6.0.
    static setSpeed(system, creatureData) {
        const knownSpeeds = ["walk", "burrow", "climb", "fly", "swim"];
        const specialSpeeds = [];

        for (const speed of creatureData.speeds) {
            const name = speed.name.toLowerCase();
            const value = parseInt(speed.value);

            if (name === "speed") {
                sUtils.assignToObject(system, "attributes.movement.speeds.walk", value);
            } else if (knownSpeeds.includes(name)) {
                sUtils.assignToObject(system, `attributes.movement.speeds.${name}`, value);
            } else if (name === "hover") {
                sUtils.assignToObject(system, "attributes.movement.hover", true);
            } else if (Number.isFinite(value)) {
                specialSpeeds.push(`${sUtils.capitalizeAll(name)} ${value} ft`);
            }
        }

        if (creatureData.speeds.length) {
            sUtils.assignToObject(system, "attributes.movement.units", "ft");
        }

        if (specialSpeeds.length) {
            sUtils.assignToObject(system, "attributes.movement.special", specialSpeeds.join(", "));
        }
    }

    static setSpellcasting(system, creatureData, context) {
        if (context.spellcastingAbility) {
            sUtils.assignToObject(system, "attributes.spellcasting", context.spellcastingAbility);
        }

        // Spellcaster level moved to "attributes.spell.level".
        if (context.spellcasterLevel) {
            sUtils.assignToObject(system, "attributes.spell.level", context.spellcasterLevel);
        }
    }

    // After the items exist, make sure the calculated AC matches the statblock. Armor items
    // from the compendium don't always add up (magic armor, mage armor, etc.).
    static async finalizeArmorClassAsync(actor, creatureData) {
        const target = creatureData.armor?.ac;
        if (!Number.isFinite(target)) return;

        const ac = actor.system.attributes.ac;
        if (ac.value === target) return;

        const update = {};

        if (ac.calcs?.has?.("natural") || ac.calc === "natural") {
            // A shield or other bonus is being added on top of the flat value, so lower the flat value to compensate.
            const flat = (ac.flat ?? target) - (ac.value - target);
            sUtils.assignToObject(update, "system.attributes.ac.flat", Math.max(flat, 0));
        } else {
            sUtils.assignToObject(update, "system.attributes.ac.override", target);
        }

        await actor.update(update);
    }

    // ===============================
    // Items
    // ===============================

    static async buildItemsAsync(creatureData, context) {
        const items = [];

        items.push(...await this.buildFeaturesAsync(creatureData, context));
        items.push(...await this.buildSpellcastingAsync(creatureData, context));
        items.push(...await this.buildActionsAsync(creatureData, context));
        items.push(...await this.buildMajorActionsAsync(creatureData, BlockID.legendaryActions, context));
        items.push(...await this.buildMajorActionsAsync(creatureData, BlockID.mythicActions, context));
        items.push(...await this.buildMajorActionsAsync(creatureData, BlockID.lairActions, context));
        items.push(...await this.buildMajorActionsAsync(creatureData, BlockID.villainActions, context));
        items.push(...await this.buildMinorActionsAsync(creatureData, BlockID.bonusActions, context));
        items.push(...await this.buildMinorActionsAsync(creatureData, BlockID.reactions, context));
        items.push(...await this.buildGearAsync(creatureData, context));
        items.push(...this.buildSouls(creatureData, context));

        return items;
    }

    // Passive traits listed above the Actions heading (or under "Traits" in the 2024 layout).
    static async buildFeaturesAsync(creatureData, context) {
        const items = [];

        for (const featureData of creatureData.features) {
            const name = featureData.name;
            const nameLower = name.toLowerCase();
            const itemData = this.makeFeat(sUtils.capitalizeAll(name), featureData.value, context, { trait: true });
            itemData.img = await sUtils.getImgFromPackItemAsync(nameLower, "feat");

            if (nameLower.startsWith("legendary resistance")) {
                // The uses are tracked on the actor, so the activity spends one of those.
                itemData.name = "Legendary Resistance";
                this.addActivity(itemData, "utility", {
                    name: "Expend Use",
                    activation: { type: "special", value: null, condition: "fails a saving throw" },
                    consumption: { targets: [{ type: "attribute", target: "resources.legres.value", value: "1" }] }
                });
            } else {
                const usesText = this.setUses(name, itemData);

                if (usesText) {
                    itemData.name = usesText.cleanName;
                    this.addActivity(itemData, "utility", {
                        activation: { type: "special", value: null },
                        consumption: { targets: [{ type: "itemUses", value: "1" }] }
                    });
                }
            }

            items.push(itemData);
        }

        return items;
    }

    static async buildActionsAsync(creatureData, context) {
        const items = [];

        for (const actionData of creatureData.actions) {
            items.push(await this.buildActionItemAsync(actionData, "action", context));
        }

        return items;
    }

    // These are things like bonus actions and reactions.
    static async buildMinorActionsAsync(creatureData, type, context) {
        const items = [];
        const activationType = type === BlockID.bonusActions ? "bonus" : "reaction";

        for (const actionData of creatureData[type] ?? []) {
            items.push(await this.buildActionItemAsync(actionData, activationType, context));
        }

        return items;
    }

    // These are things like legendary, mythic, villain and lair actions.
    static async buildMajorActionsAsync(creatureData, type, context) {
        const items = [];
        let activationType = "legendary";

        if (type === BlockID.lairActions) {
            activationType = "lair";
        } else if (type === BlockID.mythicActions) {
            activationType = "mythic";
        }

        for (const actionData of creatureData[type] ?? []) {
            const actionName = actionData.name;
            const description = actionData.value;

            if (actionName === "Description") {
                // The intro paragraph becomes a passive feature so the rules text is on the sheet.
                const itemData = this.makeFeat(sUtils.camelToTitleCase(type), description, context, { trait: true });
                items.push(itemData);
                continue;
            }

            // How many actions does this cost?
            const actionCostMatch = sRegex.actionCost.exec(actionName);
            let actionCost = 1;
            let cleanName = actionName;

            if (actionCostMatch) {
                actionCost = parseInt(actionCostMatch.groups.cost);
                cleanName = actionName.slice(0, actionCostMatch.index).trim();
            }

            // Villain action titles keep their punctuation ("Action 1: I See You!"), but a trailing period is just noise.
            cleanName = cleanName.replace(/\.$/, "");

            const itemData = await this.buildActionItemAsync({ name: cleanName, value: description }, activationType, context, actionCost);

            // Legendary actions draw from the actor's pool.
            if (activationType === "legendary") {
                for (const activity of Object.values(itemData.system.activities)) {
                    activity.consumption.targets.push({ type: "attribute", target: "resources.legact.value", value: String(actionCost) });
                }
            }

            items.push(itemData);
        }

        return items;
    }

    // Creates a weapon or feature for an action, including attack and save activities.
    static async buildActionItemAsync(actionData, activationType, context, activationValue = 1) {
        const name = actionData.name;
        const description = actionData.value ?? "";
        const activation = { type: activationType, value: activationValue };

        const attack = this.parseAttack(description, context);
        const save = this.parseSave(description, context);
        const uses = this.parseUses(name);
        const cleanName = sUtils.capitalizeAll(uses?.cleanName ?? name);

        let itemData;

        if (attack && attack.classification === "weapon") {
            itemData = this.makeNaturalWeapon(cleanName, description, context, attack);
        } else {
            itemData = this.makeFeat(cleanName, description, context);
        }

        itemData.img = await sUtils.getImgFromPackItemAsync(cleanName, itemData.type === "weapon" ? "weapon" : null)
            ?? await sUtils.getImgFromPackItemAsync(name.toLowerCase());

        if (uses) {
            this.applyUses(itemData, uses);
        }

        const consumption = uses ? { targets: [{ type: "itemUses", value: "1" }] } : undefined;

        if (attack) {
            this.addActivity(itemData, "attack", {
                activation,
                consumption,
                attack: {
                    ability: attack.ability,
                    bonus: attack.bonus,
                    flat: attack.flat,
                    type: { value: attack.type, classification: attack.classification }
                },
                damage: {
                    includeBase: itemData.type === "weapon",
                    parts: itemData.type === "weapon" ? attack.damageParts.slice(1) : attack.damageParts
                },
                range: itemData.type === "weapon" ? undefined : attack.range,
                target: attack.target
            });
        }

        if (save) {
            this.addActivity(itemData, "save", {
                activation: attack ? { type: "special", value: null, condition: "on a hit" } : activation,
                consumption: attack ? undefined : consumption,
                save: save.save,
                damage: { parts: save.damageParts, onSave: save.onSave },
                range: save.range,
                target: save.target
            });
        }

        if (!attack && !save) {
            this.addActivity(itemData, "utility", { activation, consumption });
        }

        return itemData;
    }

    // Spellcasting, Innate Spellcasting and Utility Spells features plus the spells themselves.
    static async buildSpellcastingAsync(creatureData, context) {
        const items = [];
        const spellNames = new Set();

        const groups = [
            { name: "Spellcasting", datas: creatureData.spellcasting, isSpellcasting: true, isAction: creatureData.spellcastingIsAction },
            { name: creatureData.innateSpellcastingTitle ?? "Innate Spellcasting", datas: creatureData.innateSpellcasting, isSpellcasting: false, isAction: false },
            { name: "Utility Spells", datas: creatureData.utilitySpells, isSpellcasting: false, isAction: false }
        ];

        for (const group of groups) {
            if (!group.datas?.length) continue;

            const result = await this.buildSpellGroupAsync(group, context, spellNames);
            items.push(result.feature);
            items.push(...result.spells);
        }

        // Fix up the actor spell slots on the way out; they're stored on the actor and
        // applied in setSpellcasting through the context.
        return items;
    }

    static async buildSpellGroupAsync(group, context, spellNames) {
        const description = group.datas[0].value ?? "";
        const spellGroups = group.datas.slice(1);
        const descriptionLines = [`<p>${description}</p>`];
        const spellObjs = [];
        const spells = [];

        // Put spell groups on their own lines in the description so that it reads better.
        for (const spellGroup of spellGroups) {
            descriptionLines.push(`<p><b>${spellGroup.name}</b>: ${spellGroup.value.join(", ")}</p>`);

            const groupLabel = spellGroup.name.toLowerCase();
            const groupMatches = [...groupLabel.matchAll(sRegex.spellcastingDetails)];
            const slots = this.getGroupValue("slots", groupMatches);
            const perday = this.getGroupValue("perday", groupMatches);

            let spellType = "cantrip";
            let spellCount = null;

            if (slots) {
                spellType = "slots";
                spellCount = parseInt(slots);
            } else if (perday) {
                spellType = "innate";
                spellCount = parseInt(perday);
            } else if (groupLabel.includes("at will") || groupLabel.includes("at-will")) {
                spellType = group.isSpellcasting && !context.modernRules ? "cantrip" : "atwill";
            }

            for (const spellName of spellGroup.value) {
                // Remove text in parenthesis when storing the spell name for lookup later.
                const cleanName = spellName.replace(/\(.*\)/, "").trim();
                if (cleanName) spellObjs.push({ name: cleanName, type: spellType, count: spellCount });
            }
        }

        // Some spell casting descriptions bury the spell in the description, like Mephits.
        // Example: The mephit can innately cast fog cloud, requiring no material components.
        if (!spellGroups.length) {
            const match = sRegex.spellInnateSingle.exec(description);

            if (match) {
                const perday = this.getGroupValue("perday", [...group.name.matchAll(sRegex.spellcastingDetails)]);
                spellObjs.push({ name: match.groups.spellname.trim(), type: "innate", count: perday ? parseInt(perday) : null });
            }
        }

        const missing = [];
        const slotOverrides = {};

        for (const spellObj of spellObjs) {
            if (spellNames.has(spellObj.name.toLowerCase())) continue;

            const spell = await sUtils.getItemFromPacksAsync(spellObj.name, "spell");

            if (!spell) {
                missing.push(spellObj.name);
                continue;
            }

            spellNames.add(spellObj.name.toLowerCase());
            spell.sort = this.nextSort(context);

            // "preparation.mode" became "method" in dnd5e 5.x.
            if (spellObj.type === "slots") {
                sUtils.assignToObject(spell, "system.method", "spell");
                sUtils.assignToObject(spell, "system.prepared", 1);
                slotOverrides[spell.system.level] = spellObj.count;
            } else if (spellObj.type === "innate") {
                sUtils.assignToObject(spell, "system.method", "innate");

                if (spellObj.count) {
                    sUtils.assignToObject(spell, "system.uses.spent", 0);
                    sUtils.assignToObject(spell, "system.uses.max", String(spellObj.count));
                    sUtils.assignToObject(spell, "system.uses.recovery", [{ period: "day", type: "recoverAll" }]);
                }
            } else if (spellObj.type === "atwill") {
                sUtils.assignToObject(spell, "system.method", "atwill");
            } else {
                // Cantrips of a prepared caster.
                sUtils.assignToObject(spell, "system.method", "spell");
                sUtils.assignToObject(spell, "system.prepared", 1);
            }

            spells.push(spell);
        }

        if (missing.length) {
            descriptionLines.push(`<p><em>Spells not found in any compendium: ${missing.join(", ")}</em></p>`);
            context.missingSpells.push(...missing);
        }

        // Remember the slots so the actor can be updated once the spells are known.
        context.slotOverrides = { ...(context.slotOverrides ?? {}), ...slotOverrides };

        const feature = this.makeFeat(sUtils.capitalizeAll(group.name), descriptionLines.join(""), context, { trait: !group.isAction });
        feature.img = await sUtils.getImgFromPackItemAsync(group.isSpellcasting ? "spellcasting" : "innate spellcasting", "feat");

        if (group.isAction) {
            this.addActivity(feature, "utility", { activation: { type: "action", value: 1 } });
        }

        return { feature, spells };
    }

    // The 2024 layout lists the creature's equipment. Anything that already has its own
    // attack entry is skipped so weapons aren't duplicated.
    static async buildGearAsync(creatureData, context) {
        const items = [];
        const actionNames = new Set(creatureData.actions.map(a => a.name.toLowerCase().replace(/\(.*\)/, "").trim()));
        const gear = [...creatureData.gear];

        // Armor named in the 2014 "Armor Class 15 (chain shirt, shield)" line is equipment too.
        for (const armorType of creatureData.armor?.types ?? []) {
            if (!armorType.toLowerCase().includes("natural")) gear.push(armorType);
        }

        for (const gearName of gear) {
            const cleanName = gearName.replace(/\(.*\)/, "").trim();
            if (!cleanName || actionNames.has(cleanName.toLowerCase())) continue;

            const gearTypes = ["weapon", "equipment", "consumable", "tool", "loot", "container"];
            let item = await sUtils.getItemFromPacksAsync(cleanName, gearTypes);
            if (!item) item = await sUtils.getItemFromPacksAsync(`${cleanName} armor`, "equipment");
            if (!item) continue;

            item.sort = this.nextSort(context);

            if (item.type === "weapon" || item.type === "equipment") {
                sUtils.assignToObject(item, "system.equipped", true);
            }

            const quantityMatch = /\((?<qty>\d+)\)/.exec(gearName);
            if (quantityMatch && "quantity" in (item.system ?? {})) {
                item.system.quantity = parseInt(quantityMatch.groups.qty);
            }

            items.push(item);
        }

        return items;
    }

    static buildSouls(creatureData, context) {
        if (!creatureData.souls) return [];

        let description = "<p>Demons feast not on food or water, but on souls. These fuel their ";
        description += "bloodthirsty powers, and while starved for souls, a demon can scarcely think.</p>";
        description += "<p>A demon’s stat block states the number of souls a given demon ";
        description += "has already consumed at the beginning of combat, ";
        description += "both as a die expression and as an average number.</p>";

        const itemData = this.makeFeat(`Souls: ${creatureData.souls.value} (${creatureData.souls.formula})`, description, context, { trait: true });
        return [itemData];
    }

    // ===============================
    // Item factories
    // ===============================

    static makeFeat(name, description, context, { trait = false } = {}) {
        const itemData = {
            name,
            type: "feat",
            img: null,
            sort: this.nextSort(context),
            system: {
                description: { value: description ?? "" },
                type: { value: "monster", subtype: "" },
                properties: trait ? ["trait"] : [],
                activities: {}
            }
        };

        return itemData;
    }

    static makeNaturalWeapon(name, description, context, attack) {
        const baseDamage = attack.damageParts[0] ?? this.makeDamagePart(null, null, null, []);

        const itemData = {
            name,
            type: "weapon",
            img: null,
            sort: this.nextSort(context),
            system: {
                description: { value: description ?? "" },
                type: { value: "natural", baseItem: "" },
                equipped: true,
                identified: true,
                proficient: 1,
                properties: [],
                damage: { base: baseDamage },
                range: { value: null, long: null, reach: null, units: "ft" },
                activities: {}
            }
        };

        if (attack.type === "ranged") {
            itemData.system.range.value = attack.rangeValue;
            itemData.system.range.long = attack.rangeLong;
        } else {
            itemData.system.range.reach = attack.reach;
            // "Melee or Ranged" (thrown) attacks keep both.
            if (attack.rangeValue) {
                itemData.system.range.value = attack.rangeValue;
                itemData.system.range.long = attack.rangeLong;
                itemData.system.properties.push("thr");
            }
        }

        if (attack.versatile) {
            itemData.system.properties.push("ver");
            itemData.system.damage.versatile = attack.versatile;
        }

        return itemData;
    }

    static addActivity(itemData, type, data = {}) {
        const id = sUtils.randomID();
        const activity = {
            _id: id,
            type,
            name: data.name ?? "",
            sort: Object.keys(itemData.system.activities).length * SORT_STEP,
            activation: { type: "action", value: 1, condition: "", override: false, ...(data.activation ?? {}) },
            consumption: { targets: [], scaling: { allowed: false }, spellSlot: true, ...(data.consumption ?? {}) },
            duration: { units: "inst", concentration: false, override: false },
            range: { override: false, units: "self", ...(data.range ?? {}) },
            target: { override: false, prompt: true, template: {}, affects: {}, ...(data.target ?? {}) },
            uses: { spent: 0, max: "", recovery: [] }
        };

        if (data.range) activity.range.override = true;
        if (data.target) activity.target.override = true;

        if (type === "attack") {
            activity.attack = {
                ability: "",
                bonus: "",
                flat: false,
                critical: { threshold: null },
                type: { value: "", classification: "weapon" },
                ...(data.attack ?? {})
            };
            activity.damage = { critical: { bonus: "" }, includeBase: true, parts: [], ...(data.damage ?? {}) };
        } else if (type === "save") {
            activity.save = {
                ability: [],
                bonus: "",
                dc: { calculation: "", formula: "" },
                visible: true,
                ...(data.save ?? {})
            };
            activity.damage = { onSave: "half", parts: [], ...(data.damage ?? {}) };
        } else if (type === "utility") {
            activity.roll = { formula: "", name: "", prompt: false, visible: false };
        }

        itemData.system.activities[id] = activity;
        return activity;
    }

    // ===============================
    // Text parsing
    // ===============================

    // Example (2014):
    // Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 10 (2d6 + 3) slashing damage plus 3 (1d6) acid damage.
    // Example (2024):
    // Melee Attack Roll: +5, reach 5 ft. Hit: 10 (2d6 + 3) Slashing damage.
    static parseAttack(description, context) {
        const attackMatch = sRegex.attack.exec(description);
        if (!attackMatch) return null;

        const toHit = sUtils.parseSignedInt(attackMatch.groups.tohit ?? attackMatch.groups.tohit2);

        // Only look at the text before any saving throw for the attack details.
        const saveMatch = sRegex.savingThrowDetails.exec(description);
        const attackText = saveMatch ? description.slice(0, saveMatch.index) : description;

        const typeMatch = sRegex.attackType.exec(attackText);
        const reachMatch = sRegex.reach.exec(attackText);
        const rangeMatch = sRegex.range.exec(attackText);
        const isSpell = /spell attack/i.test(attackText) || typeMatch?.groups.kind?.toLowerCase() === "spell";

        let type = "melee";
        if (typeMatch?.groups.ranged && !typeMatch.groups.melee) type = "ranged";
        else if (!typeMatch?.groups.melee && !reachMatch && rangeMatch) type = "ranged";

        let classification = isSpell ? "spell" : "weapon";

        // Pick the ability that reproduces the printed attack bonus. Weapon attacks try Strength and
        // Dexterity first, then the spellcasting ability, then anything else (a ghost's Withering Touch
        // uses Charisma) before giving up and adding a flat bonus.
        const spellcasting = context.spellcastingAbility ? [context.spellcastingAbility] : [];
        const others = ABILITIES.filter(a => !["str", "dex"].includes(a) && !spellcasting.includes(a));
        const candidates = isSpell
            ? [...spellcasting, ...ABILITIES.filter(a => !spellcasting.includes(a))]
            : ["str", "dex", ...spellcasting, ...others];
        const preferred = isSpell ? (spellcasting[0] ?? "int") : (type === "ranged" ? "dex" : "str");
        let { ability, bonus } = this.matchAbility(toHit, candidates, context, (mod) => mod + context.prof, preferred);

        // The 2024 layout doesn't say "Spell Attack" anymore. If neither Strength nor Dexterity
        // explains the attack bonus but the spellcasting ability does, it's a spell attack.
        if (!isSpell && bonus === "" && spellcasting.includes(ability)) {
            classification = "spell";
        }

        const abilityMod = context.abilities[ability]?.mod ?? 0;
        const damageParts = this.parseDamageParts(attackText, abilityMod);

        const result = {
            toHit,
            type,
            classification,
            ability,
            bonus,
            flat: false,
            reach: reachMatch ? parseInt(reachMatch.groups.reach) : (type === "melee" ? 5 : null),
            rangeValue: rangeMatch ? parseInt(rangeMatch.groups.near) : null,
            rangeLong: rangeMatch?.groups.far ? parseInt(rangeMatch.groups.far) : null,
            damageParts,
            versatile: null,
            range: undefined,
            target: this.parseTarget(attackText)
        };

        // Feature based attacks (spell attacks) carry their own range.
        if (classification === "spell") {
            if (type === "ranged" && result.rangeValue) {
                result.range = { value: String(result.rangeValue), long: result.rangeLong ? String(result.rangeLong) : "", units: "ft" };
            } else if (result.reach) {
                result.range = { value: String(result.reach), units: "ft" };
            }
        }

        const versatileMatch = sRegex.versatile.exec(attackText);
        if (versatileMatch) {
            result.versatile = this.makeDamagePartFromRoll(versatileMatch.groups.damageroll, versatileMatch.groups.damagetype, abilityMod);
        }

        return result;
    }

    // Example (2014):
    // Each creature in the cone must make a DC 13 Dexterity saving throw, taking 44 (8d10) cold damage on a failed save or half as much damage on a successful one.
    // Example (2024):
    // Dexterity Saving Throw: DC 13, each creature in a 15-foot Cone. Failure: 24 (7d6) Fire damage. Success: Half damage.
    static parseSave(description, context) {
        const saveMatch = sRegex.savingThrowDetails.exec(description);
        if (!saveMatch) return null;

        const dc = parseInt(saveMatch.groups.savedc ?? saveMatch.groups.savedc2);
        const abilityName = saveMatch.groups.saveability ?? saveMatch.groups.saveability2;
        const saveAbility = this.convertToShortAbility(abilityName);
        const saveText = description.slice(saveMatch.index);

        // Work out which ability produces the DC. Casters use their spellcasting ability; for everything
        // else try the usual suspects. If nothing fits the DC is stored as a flat number.
        const candidates = context.spellcastingAbility ? [context.spellcastingAbility] : ["con", "cha", "wis", "int", "str", "dex"];
        const { ability, bonus } = this.matchAbility(dc, candidates, context, (mod) => 8 + mod + context.prof, null);

        const save = {
            ability: ABILITIES.includes(saveAbility) ? [saveAbility] : [],
            dc: ability && bonus === "" ? { calculation: ability, formula: "" } : { calculation: "", formula: String(dc) }
        };

        const damageParts = this.parseDamageParts(saveText, context.abilities[ability]?.mod ?? 0);
        const onSave = /half as much|half damage|success: half/i.test(saveText) ? "half" : "none";

        let range;
        const withinMatch = /within (?<range>\d+) (f(ee|oo)?t)/i.exec(saveText);
        if (withinMatch) {
            range = { value: withinMatch.groups.range, units: "ft" };
        }

        return { dc, save, damageParts, onSave, range, target: this.parseTarget(saveText) ?? this.parseTarget(description) };
    }

    // Finds the ability whose modifier reproduces a printed number. Returns the ability
    // plus any leftover as a bonus formula.
    static matchAbility(printed, candidates, context, calculate, fallback) {
        if (!Number.isFinite(printed)) {
            return { ability: fallback ?? "", bonus: "" };
        }

        for (const abbr of candidates) {
            if (calculate(context.abilities[abbr].mod) === printed) {
                return { ability: abbr, bonus: "" };
            }
        }

        if (!fallback) {
            return { ability: "", bonus: this.formatBonus(printed) };
        }

        // Nothing matched exactly, so use the preferred ability and make up the difference.
        const extra = printed - calculate(context.abilities[fallback].mod);

        return { ability: fallback, bonus: extra === 0 ? "" : this.formatBonus(extra) };
    }

    static parseDamageParts(text, abilityMod) {
        const match = sRegex.damageRoll.exec(text);
        if (!match) return [];

        const parts = [];

        if (match.groups.damageroll1 && match.groups.damagetype1) {
            parts.push(this.makeDamagePart(match.groups.damageroll1, match.groups.damagemod1, match.groups.damagetype1, abilityMod));
        }

        // Skip conditional extra damage, like "plus 2 (1d4) Slashing damage if the attack roll had Advantage".
        const afterMatch = text.slice(match.index + match[0].length);
        const conditional = /^\s*(if|when|while|unless)\b/i.test(afterMatch);

        if (match.groups.damageroll2 && match.groups.damagetype2 && !conditional) {
            parts.push(this.makeDamagePart(match.groups.damageroll2, match.groups.damagemod2, match.groups.damagetype2, abilityMod));
        }

        return parts.filter(p => p);
    }

    // Damage parts are structured as number of dice, denomination, bonus and types.
    static makeDamagePart(roll, mod, type, abilityMod) {
        const types = type ? [type.toLowerCase()] : [];
        const part = {
            number: null,
            denomination: null,
            bonus: "",
            types,
            custom: { enabled: false, formula: "" },
            scaling: { mode: "", number: 1, formula: "" }
        };

        const diceMatch = /^(?<number>\d+)d(?<denomination>\d+)$/i.exec(roll ?? "");

        if (diceMatch) {
            part.number = parseInt(diceMatch.groups.number);
            part.denomination = parseInt(diceMatch.groups.denomination);
        } else if (roll) {
            // Flat damage like "5 fire damage".
            part.custom = { enabled: true, formula: String(roll) };
            return part;
        }

        if (mod != null) {
            const modValue = parseInt(mod);
            // Use the ability modifier when it matches so the attack scales with the creature.
            part.bonus = Number.isFinite(abilityMod) && modValue === abilityMod && abilityMod !== 0 ? "@mod" : String(modValue);
        }

        return part;
    }

    // Example: "1d10 + 4"
    static makeDamagePartFromRoll(roll, type, abilityMod) {
        const match = /(?<dice>\d+d\d+)(\s?\+\s?(?<mod>\d+))?/i.exec(roll);
        if (!match) return null;
        return this.makeDamagePart(match.groups.dice, match.groups.mod, type, abilityMod);
    }

    // Example: The hound exhales a 15-foot cone of frost. / one target / each creature within 30 feet
    static parseTarget(text) {
        const areaMatch = sRegex.target.exec(text);

        if (areaMatch) {
            let shape = areaMatch.groups.shape.toLowerCase();
            if (shape === "emanation") shape = "radius";

            const template = { type: shape, size: areaMatch.groups.range, units: "ft" };
            if (areaMatch.groups.width) template.width = areaMatch.groups.width;

            return { template, affects: { type: "creature" } };
        }

        const singleMatch = sRegex.singleTarget.exec(text);

        if (singleMatch) {
            const kind = singleMatch.groups.kind.toLowerCase();
            let type = "creatureOrObject";
            if (kind === "creature") type = "creature";
            else if (kind === "object") type = "object";

            return { affects: { type, count: "1" } };
        }

        return undefined;
    }

    // Examples: Dizzying Hex (2/Day; 1st-Level Spell), Frost Breath (Recharge 5–6)
    static parseUses(name) {
        const perDayMatch = sRegex.perDayDetails.exec(name);
        const rechargeMatch = sRegex.recharge.exec(name);

        if (!perDayMatch && !rechargeMatch) return null;

        const match = perDayMatch ?? rechargeMatch;
        const parenIndex = name.lastIndexOf("(", match.index);
        const cleanName = parenIndex >= 0 ? name.slice(0, parenIndex).trim() : name;

        if (perDayMatch) {
            return { cleanName, max: parseInt(perDayMatch.groups.perday), recovery: [{ period: "day", type: "recoverAll" }] };
        }

        return { cleanName, max: 1, recovery: [{ period: "recharge", formula: rechargeMatch.groups.recharge, type: "recoverAll" }] };
    }

    static applyUses(itemData, uses) {
        itemData.system.uses = { spent: 0, max: String(uses.max), recovery: uses.recovery };
    }

    static setUses(name, itemData) {
        const uses = this.parseUses(name);
        if (!uses) return null;

        this.applyUses(itemData, uses);
        return uses;
    }

    // ===============================
    // Utilities
    // ===============================

    static getDescriptionText(actionDatas) {
        return actionDatas?.find(a => a.name === "Description")?.value ?? null;
    }

    static formatBonus(value) {
        return value < 0 ? String(value) : `+${value}`;
    }

    static getSkillAbility(skillId) {
        const config = globalThis.CONFIG?.DND5E?.skills?.[skillId]?.ability;
        if (config) return config;

        switch (skillId) {
            case "acr": case "slt": case "ste": return "dex";
            case "ani": case "ins": case "med": case "prc": case "sur": return "wis";
            case "arc": case "his": case "inv": case "nat": case "rel": return "int";
            case "ath": return "str";
            default: return "cha";
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

    static convertToShortAbility(abilityName) {
        const ability = (abilityName ?? "").toLowerCase();

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

    static getGroupValue(group, matches) {
        if (matches && matches.length) {
            return matches.map(m => m.groups[group]).find(val => val);
        }

        return null;
    }
}
