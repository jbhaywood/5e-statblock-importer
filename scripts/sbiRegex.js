import { BlockID } from "./sbiData.js";

export class sbiRegex {
    // Regexes for checking known types of lines. They have to be written carefully 
    // so that it matches on the line we carea bout, but not any other random line
    // that happens to start with same the word(s).
    static armor = /^((armor|armour) class)\s\d+/i;
    static actions = /^actions$/i;
    static abilities = /^(\bstr\b|\bdex\b|\bcon\b|\bint\b|\bwis\b|\bcha\b)/i;
    static bonusActions = /^bonus actions$/i;
    static challenge = /^(challenge|\bcr\b|challenge rating)\s\d+/i;
    static conditionImmunities = /^condition immunities\s/i;
    static damageImmunities = /^damage immunities\s/i;
    static damageResistances = /^damage resistances\s/i;
    static damageVulberabilities = /^damage vulnerabilities\s/i;
    static health = /^(hit points|\bhp\b)\s\d+/i;
    static lairActions = /^lair actions$/i;
    static languages = /^languages\s/i;
    static legendaryActions = /^legendary actions$/i;
    static mythicActions = /^mythic actions$/i;
    // Proficiency Bonus isn't used because Foundry calculates it automatically.
    // This is just here for completeness.
    static proficiencyBonus = /^proficiency bonus\s\+/i;
    // The racial details line is here instead of below because it doesn't have a 
    // standard starting word, so we have to look at the whole line.
    static racialDetails = /^(?<size>\bfine\b|\bdiminutive\b|\btiny\b|\bsmall\b|\bmedium\b|\blarge\b|\bhuge\b|\bgargantuan\b|\bcolossal\b)(\sswarm of (tiny|small))?\s(?<type>\w+)([,\s]+\((?<race>[,\w\s]+)\))?([,\s]+(?<alignment>[\w\s\-]+))?/ig;
    static reactions = /^reactions$/i;
    static savingThrows = /^(saving throws|saves)\s(\bstr\b|\bdex\b|\bcon\b|\bint\b|\bwis\b|\bcha\b)/i;
    static senses = /^senses.+\d+\s\bft\b/i;
    static skills = /^skills.+[\+-]\d+/i;
    static souls = /^souls\s\d+/i;
    static speed = /^speed\s\d+\sft/i;
    static traits = /^traits$/i;
    static utilitySpells = /^utility spells$/i;
    static villainActions = /^villain actions$/i;

    // Regexes for pulling the details out of the lines we identified using the ones above.
    static armorDetails = /(?<ac>\d+)( \((?<armortype>.+)\))?/i;
    static challengeDetails = /(?<cr>(½|[\d\/]+))\s?(\((?<xp>[\d,]+)\s?xp\))?/i;
    static rollDetails = /(?<value>\d+)\s?(\((?<formula>\d+d\d+(\s?[\+\-−–]\s?\d+)?)\))?/i;
    static perDayDetails = /(?<perday>\d+)\/day/i;
    static roleDetails = /cr\s\d+\s(?<role>\w+)/i;
    static savingThrowDetails = /must (make|succeed on) a dc (?<savedc>\d+) (?<saveability>\w+) (?<savetext>saving throw|save)/i;
    static sensesDetails = /(?<name>\bdarkvision\b|\bblindsight\b|\btremorsense\b|\btruesight\b) (?<modifier>\d+)/ig;
    static skillDetails = /(?<name>\bacrobatics\b|\barcana\b|\banimal handling\b|\bathletics\b|\bdeception\b|\bhistory\b|\binsight\b|\bintimidation\b|\binvestigation\b|\bmedicine\b|\bnature\b|\bperception\b|\bperformance\b|\bpersuasion\b|\breligion\b|\bsleight of hand\b|\bstealth\b|\bsurvival\b) (?<modifier>[\+|-]\d+)/ig;
    static speedDetails = /(?<name>\w+)\s?(?<value>\d+)/ig;
    static spellcastingDetails = /\((?<slots>\d+) slot|(?<perday>\d+)\/day|spellcasting ability is (?<ability1>\w+)|(?<ability2>\w+) as the spellcasting ability|spell save dc (?<savedc>\d+)/ig;

    // The block title regex is complicated. Here's the breakdown...
    // ([A-Z][\w\d\-+,;']+[\s\-]?)               <- Represents the first word of the title, followed by a space or hyphen. It has to start with a capital letter.
    //                                              The word can include word characters, digits, and some punctuation characters.
    //                                              NOTE: Don't add more punctuation than is absolutely neccessary so that we don't get false positives.
    // (of|and|the|from|in|at|on|with|to|by)\s)? <- Represents the prepostion words we want to ignore.
    // ([\w\d\-+,;']+\s?){0,3}                   <- Represents the words that follow the first word, using the same regex for the allowed characters.
    //                                              We assume the title only has 0-3 words following it, otherwise it's probably a sentence.
    // (\([\w –\-\/]+\))?                        <- Represents an optional bit in parentheses, like '(Recharge 5-6)'.
    static blockTitle = /^(([A-Z][\w\d\-+,;'’]+[\s\-]?)((of|and|the|from|in|at|on|with|to|by|into)\s)?([\w\d\-+,;'’]+\s?){0,3}(\((?!spell save)[^)]+\))?)[.!]/;
    static villainActionTitle = /(?<title>^Action\s[123]:\s.+[.!?])\s+(?<description>.*)/;
    // The rest of these are utility regexes to pull out specific data.
    static abilityNames = /\bstr\b|\bdex\b|\bcon\b|\bint\b|\bwis\b|\bcha\b/ig;
    static abilityValues = /(?<base>\d+)\s?\((?<modifier>[\+\-−–]?\d+)\)/g;
    static abilitySaves = /(?<name>\bstr\b|\bdex\b|\bcon\b|\bint\b|\bwis\b|\bcha\b) (?<modifier>[\+|-]\d+)/ig;
    static actionCost = /\((costs )?(?<cost>\d+) action(s)?\)/i;
    static attack = /\+(?<tohit>\d+) to hit/i;
    static conditionTypes = /\bblinded\b|\bcharmed\b|\bdeafened\b|\bdiseased\b|\bexhaustion\b|\bfrightened\b|\bgrappled\b|\bincapacitated\b|\binvisible\b|\bparalyzed\b|\bpetrified\b|\bpoisoned\b|\bprone\b|\brestrained\b|\bstunned\b|\bunconscious\b/ig;
    static damageRoll = /\(?(?<damageroll1>\d+d\d+)(\s?\+\s?(?<damagemod1>\d+))?\)? (?<damagetype1>\w+)(.+(plus|and).+\(?(?<damageroll2>\d+d\d+(\s?\+\s?(?<damagemod2>\d+))?)\)? (?<damagetype2>\w+))?/i;
    static damageTypes = /\bbludgeoning\b|\bpiercing\b|\bslashing\b|\bacid\b|\bcold\b|\bfire\b|\blightning\b|\bnecrotic\b|\bpoison\b|\bpsychic\b|\bradiant\b|\bthunder\b/ig;
    static legendaryActionCount = /take (?<count>\d+) legendary/i;
    static nameValue = /(?<name>\w+)\s?(?<value>\d+)/ig;
    static spellLevel = /(?<level>\d+)(.+)level spellcaster/i;
    static spellLine = /(at-will|cantrips|1st|2nd|3rd|4th|5th|6th|7th|8th|9th)[\w\d\s\(\)-]*:/ig;
    static spellInnateLine = /at will:|\d\/day( each)?:/ig;
    static spellInnateSingle = /innately cast (?<spellname>[\w|\s]+)(\s\(.+\))?,/i
    static range = /range (?<near>\d+)\/(?<far>\d+) ?(f(ee|oo)?t|'|’)/i;
    static reach = /reach (?<reach>\d+) ?(f(ee|oo)?t|'|’)/i;
    static recharge = /\(recharge (?<recharge>\d+)([–|-]\d+)?\)/i;
    static versatile = /\((?<damageroll>\d+d\d+( ?\+ ?\d+)?)\) (?<damagetype>\w+) damage if used with two hands/i;
    static target = /(?<range>\d+)?-(foot|ft?.|'|’) (?<shape>\w+)/i;

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
        { r: this.damageVulberabilities, id: BlockID.damageVulnerabilities },
        { r: this.health, id: BlockID.health },
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

    static getFirstMatch(line) {
        return this.lineCheckRegexes.find(obj => obj.r.exec(line));
    }
}