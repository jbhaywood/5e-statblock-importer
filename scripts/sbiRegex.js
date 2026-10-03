import { BlockID, KnownConditions, KnownDamageTypes } from "./sbiData.js";

const abilityNameGroup = "\\bstr\\b|\\bdex\\b|\\bcon\\b|\\bint\\b|\\bwis\\b|\\bcha\\b";
const sizeGroup = "\\bfine\\b|\\bdiminutive\\b|\\btiny\\b|\\bsmall\\b|\\bmedium\\b|\\blarge\\b|\\bhuge\\b|\\bgargantuan\\b|\\bcolossal\\b";
// Numbers in statblocks use a mix of hyphens, minus signs and dashes.
const sign = "[\\+\\-−–]";

export class sbiRegex {
    // Regexes for checking known types of lines. They have to be written carefully 
    // so that it matches on the line we care about, but not any other random line
    // that happens to start with same the word(s).
    static armor = /^((armor|armour) class|\bac\b)\s\d+/i;
    static actions = /^actions$/i;
    static abilities = new RegExp(`^(${abilityNameGroup})`, "i");
    static bonusActions = /^bonus actions$/i;
    static challenge = /^(challenge|\bcr\b|challenge rating)\s(\d+|½|¼|⅛)/i;
    static conditionImmunities = /^condition immunities\s/i;
    // The 2024 layout drops the "Damage" prefix and mixes conditions into the Immunities line.
    static damageImmunities = /^(damage )?immunities\s/i;
    static damageResistances = /^(damage )?resistances\s/i;
    static damageVulnerabilities = /^(damage )?vulnerabilities\s/i;
    // Case sensitive on purpose: sentences inside descriptions can start with "gear ...".
    static gear = /^Gear\s[A-Z0-9]/;
    static health = /^(hit points|\bhp\b)\s\d+/i;
    static initiative = new RegExp(`^Initiative\\s${sign}?\\d+`);
    static lairActions = /^lair actions$/i;
    static languages = /^languages\s/i;
    static legendaryActions = /^legendary actions$/i;
    static mythicActions = /^mythic actions$/i;
    // Proficiency Bonus isn't used because Foundry calculates it automatically.
    // This is just here for completeness.
    static proficiencyBonus = /^proficiency bonus\s\+/i;
    // The racial details line is here instead of below because it doesn't have a 
    // standard starting word, so we have to look at the whole line.
    // Examples:
    //   Large fiend (demon), chaotic evil
    //   Medium or Small Humanoid (Cultist), Neutral Evil
    //   Large Swarm of Tiny Beasts, Unaligned
    static racialDetails = new RegExp(`^(?<size>${sizeGroup})(\\sor\\s(${sizeGroup}))?(\\sswarm of (?<swarmsize>\\w+))?\\s(?<type>\\w+)([,\\s]+\\((?<race>[,\\w\\s\\-]+)\\))?([,\\s]+(?<alignment>[\\w\\s\\-]+))?`, "ig");
    static reactions = /^reactions$/i;
    static savingThrows = new RegExp(`^(saving throws|saves)\\s(${abilityNameGroup})`, "i");
    static senses = /^senses( passive)?(.+\d+\s\bft\b)?/i;
    static skills = /^skills.+[\+-]\d+/i;
    static souls = /^souls\s\d+/i;
    static speed = /^speed\s\d+\sft/i;
    static traits = /^traits\.?$/i;
    static utilitySpells = /^utility spells$/i;
    static villainActions = /^villain actions$/i;

    // Regexes for pulling the details out of the lines we identified using the ones above.
    static armorDetails = /(?<ac>\d+)( \((?<armortype>[^)]+)\))?/i;
    static initiativeDetails = new RegExp(`initiative\\s(?<init>${sign}?\\d+)`, "i");
    static challengeDetails = /(?<cr>(½|¼|⅛|[\d\/]+))\s?(\((?<xp>[\d,]+)\s?xp|\(xp\s(?<xp2>[\d,]+))?/i;
    static rollDetails = /(?<value>\d+)\s?(\((?<formula>\d+d\d+(\s?[\+\-−–]\s?\d+)?)\))?/i;
    static perDayDetails = /(?<perday>\d+)\/day/i;
    static roleDetails = /\d+\s(?<role>\w+)/i;
    // 2014: "must make a DC 13 Dexterity saving throw"
    // 2024: "Dexterity Saving Throw: DC 13"
    static savingThrowDetails = /(must (make|succeed on) a dc (?<savedc>\d+) (?<saveability>\w+) (?<savetext>saving throw|save))|((?<saveability2>strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw:\s?dc (?<savedc2>\d+))/i;
    static sensesDetails = /(?<name>\w+) (?<modifier>\d+)/ig;
    static skillDetails = /(?<name>\bacrobatics\b|\barcana\b|\banimal handling\b|\bathletics\b|\bdeception\b|\bhistory\b|\binsight\b|\bintimidation\b|\binvestigation\b|\bmedicine\b|\bnature\b|\bperception\b|\bperformance\b|\bpersuasion\b|\breligion\b|\bsleight of hand\b|\bstealth\b|\bsurvival\b) (?<modifier>[\+\-−–]\d+)/ig;
    static speedDetails = /(?<name>\w+)\s?(?<value>\d+)/ig;
    static spellcastingDetails = /\((?<slots>\d+) slots?|(?<perday>\d+)\/day|spellcasting ability is (?<ability1>\w+)|(?<ability2>\w+) as (the|its) spellcasting ability|spell save dc (?<savedc>\d+)|(?<tohit>[\+\-−–]\d+) to hit with spell attacks/ig;

    // The block title regex is complicated. Here's the breakdown...
    // ([A-Z][\w\d\-+,;']+[\s\-]?)               <- Represents the first word of the title, followed by a space or hyphen. It has to start with a capital letter.
    //                                              The word can include word characters, digits, and some punctuation characters.
    //                                              NOTE: Don't add more punctuation than is absolutely neccessary so that we don't get false positives.
    // (of|and|the|from|in|at|on|with|to|by)\s)? <- Represents the prepostion words we want to ignore.
    // ([\w\d\-+,;']+\s?){0,3}                   <- Represents the words that follow the first word, using the same regex for the allowed characters.
    //                                              We assume the title only has 0-3 words following it, otherwise it's probably a sentence.
    // (\([\w –\-\/]+\))?                        <- Represents an optional bit in parentheses, like '(Recharge 5-6)'.
    static blockTitle = /^(([A-Z][\w\d\-+,;'’]+[\s\-]?)((of|and|the|from|in|at|on|with|to|by|into|or)\s)?([\w\d\-+,;'’]+\s?){0,3}(\((?!spell save)[^)]+\))?)[.!]/;
    static villainActionTitle = /(?<title>^Action\s[123]:\s.+[.!?])\s+(?<description>.*)/;
    // The rest of these are utility regexes to pull out specific data.
    static abilityNames = new RegExp(abilityNameGroup, "ig");
    // 2014: "18 (+4)"
    static abilityValues = new RegExp(`(?<base>\\d+)\\s?\\((?<modifier>${sign}?\\d+)\\)`, "g");
    // 2024: "STR 18 +4 +7" (score, modifier, save)
    static abilityTriples = new RegExp(`(?<name>${abilityNameGroup})\\s+(?<base>\\d+)\\s+(?<modifier>${sign}\\d+)\\s+(?<save>${sign}\\d+)`, "ig");
    static abilitySaves = new RegExp(`(?<name>${abilityNameGroup}) (?<modifier>${sign}\\d+)`, "ig");
    static actionCost = /\((costs )?(?<cost>\d+) actions?\)/i;
    // 2014: "+5 to hit"   2024: "Melee Attack Roll: +5"
    static attack = /(\+(?<tohit>\d+) to hit)|(attack( roll)?:\s?(?<tohit2>[\+\-−–]?\d+))/i;
    static attackType = /(?<melee>melee)?( or )?(?<ranged>ranged)? (?<kind>weapon|spell)? ?attack( roll)?:/i;
    static conditionTypes = new RegExp(KnownConditions.map(c => `\\b${c}\\b`).join("|"), "ig");
    static damageRoll = /\(?(?<damageroll1>\d+(d\d+)?)(\s?[\+\-−–]\s?(?<damagemod1>\d+))?\)? (?<damagetype1>\w+)( damage)(.+?(plus|and)\s+(\d+\s+\(*)?((?<damageroll2>\d+(d\d+)?)(\s?[\+\-−–]\s?(?<damagemod2>\d+))?)\)? (?<damagetype2>\w+)( damage))?/i;
    static damageTypes = new RegExp(KnownDamageTypes.map(d => `\\b${d}\\b`).join("|"), "ig");
    // 2014: "can take 3 legendary actions"   2024: "Legendary Action Uses: 3 (4 in Lair)"
    static legendaryActionCount = /(take (?<count>\d+) legendary)|(legendary action uses:\s?(?<count2>\d+))/i;
    static inLair = /\bin lair\b/i;
    static nameValue = /(?<name>\w+)\s?(?<value>\d+)/ig;
    static spellcasterLevel = /(?<level>\d+)(st|nd|rd|th)[\s\-­‐]*level spellcaster/i;
    static spellLine = /(at-will|cantrips|1st|2nd|3rd|4th|5th|6th|7th|8th|9th)[\w\d\s\(\)-]*:/ig;
    static spellInnateLine = /at will:|\d+\/day( each)?:/ig;
    static spellInnateSingle = /innately cast (?<spellname>[\w|\s]+)(\s\(.+\))?,/i
    static range = /range (?<near>\d+)(\/(?<far>\d+))? ?(f(ee|oo)?t|'|’)/i;
    static reach = /reach (?<reach>\d+) ?(f(ee|oo)?t|'|’)/i;
    static recharge = /\(recharge (?<recharge>\d+)([–\-−]\d+)?\)/i;
    static versatile = /\((?<damageroll>\d+d\d+( ?\+ ?\d+)?)\) (?<damagetype>\w+) damage if used with two hands/i;
    // "15-foot cone", "60-foot line", "20-foot-radius sphere", "60-foot-long, 5-foot-wide line", "10-foot emanation"
    static target = /(?<range>\d+)[\-\s](foot|ft\.?|'|’)(-long|-radius|-tall|-high)?(,?\s(?<width>\d+)[\-\s](foot|ft\.?)-wide)?\s(?<shape>cone|cube|cylinder|line|sphere|square|emanation|radius|wall)/i;
    static singleTarget = /\bone (?<kind>target|creature|object|creature or object)\b/i;
    static telepathy = /telepathy\s(?<range>[\d,]+)\s?(f(ee|oo)?t|'|’)/i;

    // Store the regexs we use to determine line type and an identifier we can 
    // use to know which one it was that returned successfully.
    static lineCheckRegexes = [
        { r: this.armor, id: BlockID.armor },
        { r: this.actions, id: BlockID.actions },
        { r: this.abilities, id: BlockID.abilities },
        { r: this.bonusActions, id: BlockID.bonusActions },
        { r: this.challenge, id: BlockID.challenge },
        { r: this.conditionImmunities, id: BlockID.conditionImmunities },
        { r: this.damageImmunities, id: BlockID.damageImmunities },
        { r: this.damageResistances, id: BlockID.damageResistances },
        { r: this.damageVulnerabilities, id: BlockID.damageVulnerabilities },
        { r: this.gear, id: BlockID.gear },
        { r: this.health, id: BlockID.health },
        { r: this.initiative, id: BlockID.initiative },
        { r: this.lairActions, id: BlockID.lairActions },
        { r: this.languages, id: BlockID.languages },
        { r: this.legendaryActions, id: BlockID.legendaryActions },
        { r: this.mythicActions, id: BlockID.mythicActions },
        { r: this.proficiencyBonus, id: BlockID.proficiencyBonus },
        { r: this.racialDetails, id: BlockID.racialDetails },
        { r: this.reactions, id: BlockID.reactions },
        { r: this.savingThrows, id: BlockID.savingThrows },
        { r: this.senses, id: BlockID.senses },
        { r: this.skills, id: BlockID.skills },
        { r: this.speed, id: BlockID.speed },
        { r: this.souls, id: BlockID.souls },
        { r: this.traits, id: BlockID.traits },
        { r: this.utilitySpells, id: BlockID.utilitySpells },
        { r: this.villainActions, id: BlockID.villainActions },
    ]

    static getFirstMatch(line, excludeIds = []) {
        return this.lineCheckRegexes.find(obj => {
            // Reset global regexes so that a previous exec doesn't skip the start of the string.
            obj.r.lastIndex = 0;
            return obj.r.exec(line) && !excludeIds.includes(obj.id);
        });
    }
}
