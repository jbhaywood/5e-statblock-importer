export class ActionDescription {
    name;
    description;

    constructor(name, description) {
        this.name = name;
        this.description = description;
    }
}

export class BlockID {
    static armor = "armor";
    static actions = "actions";
    static abilities = "abilities";
    static bonusActions = "bonusActions";
    static challenge = "challenge";
    static conditionImmunities = "conditionImmunities";
    static damageImmunities = "damageImmunities";
    static damageResistances = "damageResistences";
    static damageVulnerabilities = "damageVulnerabilities";
    static features = "features";
    static health = "health";
    static lairActions = "lairActions";
    static languages = "languages";
    static legendaryActions = "legendaryActions";
    static mythicActions = "mythicActions";
    static proficiencyBonus = "proficiencyBonus";
    static racialDetails = "racialDetails";
    static reactions = "reactions";
    static savingThrows = "savingThrows";
    static senses = "senses";
    static skills = "skills";
    static souls = "souls";
    static speed = "speed";
    static traits = "traits";
    static utilitySpells = "utilitySpells";
    static villainActions = "villainActions";
}

export const TopBlocks = [
    BlockID.armor,
    BlockID.abilities,
    BlockID.challenge,
    BlockID.conditionImmunities,
    BlockID.damageImmunities,
    BlockID.damageResistances,
    BlockID.damageVulnerabilities,
    BlockID.health,
    BlockID.languages,
    BlockID.proficiencyBonus,
    BlockID.racialDetails,
    BlockID.savingThrows,
    BlockID.senses,
    BlockID.skills,
    BlockID.souls,
    BlockID.speed,
]

export class DamageConditionId {
    static immunities = "immunities";
    static resistances = "resistances";
    static vulnerabilities = "vulnerabilities";
}

export const KnownLanguages = [
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

// Creature Properties
//  - Name
//  - Armor (value, type)
//  - Challenge (value)
//  - Racial Details (alignment, race, type, size)
//  - Hit Points (value, dice formula)
//  - Movement (types/values, units, can hover)
//  - Senses (types/values, units, special)
//  - Abilities (name, value, proficient)
//  - Damage Immunities (types)
//  - Damage Resistances (types)
//  - Damage Vulnerabilities (types)
//  - Condition Immunities (types)
//  - Languages (types)
//  - Skills Proficiencies (names/proficiency types) (ignore the ones they aren't proficient in, those will get default values)
//  - Spell (name, level)
//  - Action (name, type, description, icon, damage, damage type, range, uses)

export class CreatureData {
    constructor(name) {
        this.name = name;                   // string
        this.actions = [];                  // NameValueData[]
        this.armor = null;                  // ArmorData
        this.abilities = [];                // NameValueData[]
        this.alignment = null;              // string
        this.bonusActions = [];             // NameValueData[]
        this.challenge = null;              // ChallengeData
        this.conditionImmunities = null;    // string
        this.damageImmunities = null;       // string
        this.damageResistances = null;      // string
        this.damageVulnerabilities = null;  // string
        this.features = [];                 // NameValueData[]
        this.health = null;                 // RollData
        this.language = null;               // LanguageData
        this.lairActions = [];              // NameValueData[]
        this.legendaryActions = [];         // NameValueData[]
        this.mythicActions = [];            // NameValueData[]
        this.reactions = [];                // NameValueData[]
        this.role = null;                   // string
        this.savingThrows = [];             // string[]
        this.senses = [];                   // NameValueData[]
        this.specialSense = null;           // string
        this.skills = [];                   // NameValueData[]
        this.speeds = [];                   // NameValueData[]
        this.size = null;                   // string
        this.souls = null;                  // RollData
        this.race = null;                   // string
        this.type = null;                   // string
        this.utilitySpells = [];            // NameValueData[]
        this.villainActions = [];           // NameValueData[]
    }
}

/*
name: string
value: object
*/
export class NameValueData {
    constructor(name, value) {
        this.name = name;
        this.value = value;
    }
}

/*
ac: int
types: string[]
*/
export class ArmorData {
    constructor(ac, types) {
        this.ac = ac;
        this.types = types || [];
    }
}

/*
cr: int
xp: int
*/
export class ChallengeData {
    constructor(cr, xp) {
        this.cr = cr;
        this.xp = xp;
    }
}

/*
value: int
diceFormula: string
*/
export class RollData {
    constructor(value, diceFormula) {
        this.value = value;
        this.formula = diceFormula;
    }
}

/*
knownLanguages: string[]
unknownLanguages: string[]
*/
export class LanguageData {
    constructor(knownLanguages, unknownLanguages) {
        this.knownLanguages = knownLanguages;
        this.unknownLanguages = unknownLanguages;
    }
}
