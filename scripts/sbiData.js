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
    static gear = "gear";
    static health = "health";
    static initiative = "initiative";
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

// Blocks that appear at the top of a statblock, before the features/traits.
export const TopBlocks = [
    BlockID.armor,
    BlockID.abilities,
    BlockID.challenge,
    BlockID.conditionImmunities,
    BlockID.damageImmunities,
    BlockID.damageResistances,
    BlockID.damageVulnerabilities,
    BlockID.gear,
    BlockID.health,
    BlockID.initiative,
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

// Fallback list of language keys known to the dnd5e system. At runtime the list is
// extended with whatever is in CONFIG.DND5E.languages so that modules that add
// languages are picked up too.
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
    "sign",
    "sylvan",
    "terran",
    "cant",
    "undercommon"
];

// Maps the way a language is written in a statblock to its dnd5e key when they differ.
export const LanguageAliases = {
    "deep speech": "deep",
    "thieves' cant": "cant",
    "thieves’ cant": "cant",
    "thieves cant": "cant",
    "common sign language": "sign",
    "sign language": "sign"
};

export const KnownCreatureTypes = [
    "aberration",
    "beast",
    "celestial",
    "construct",
    "dragon",
    "elemental",
    "fey",
    "fiend",
    "giant",
    "humanoid",
    "monstrosity",
    "ooze",
    "plant",
    "undead"
];

export const KnownDamageTypes = [
    "acid",
    "bludgeoning",
    "cold",
    "fire",
    "force",
    "lightning",
    "necrotic",
    "piercing",
    "poison",
    "psychic",
    "radiant",
    "slashing",
    "thunder"
];

export const KnownConditions = [
    "blinded",
    "charmed",
    "deafened",
    "diseased",
    "exhaustion",
    "frightened",
    "grappled",
    "incapacitated",
    "invisible",
    "paralyzed",
    "petrified",
    "poisoned",
    "prone",
    "restrained",
    "stunned",
    "unconscious"
];

// Roles used by MCDM's "Flee, Mortals!" statblocks, which print them next to the CR.
export const KnownRoles = [
    "ambusher",
    "artillery",
    "brute",
    "controller",
    "leader",
    "minion",
    "skirmisher",
    "soldier",
    "solo",
    "support"
];

export const RulesVersion = {
    legacy: "2014",
    modern: "2024"
};

export class CreatureData {
    constructor(name) {
        this.name = name;                           // string
        this.rulesVersion = RulesVersion.legacy;    // "2014" | "2024"
        this.actions = [];                          // NameValueData[]
        this.armor = null;                          // ArmorData
        this.abilities = [];                        // NameValueData[]
        this.alignment = null;                      // string
        this.bonusActions = [];                     // NameValueData[]
        this.challenge = null;                      // ChallengeData
        this.features = [];                         // NameValueData[]
        this.gear = [];                             // string[]         (2024)
        this.health = null;                         // RollData
        this.initiative = null;                     // int              (2024)
        this.language = null;                       // LanguageData
        this.lairActions = [];                      // NameValueData[]
        this.legendaryActions = [];                 // NameValueData[]
        this.mythicActions = [];                    // NameValueData[]
        this.reactions = [];                        // NameValueData[]
        this.role = null;                           // string           (MCDM)
        this.savingThrows = [];                     // string[] of ability abbreviations
        this.savingThrowBonuses = {};               // { str: int, ... } printed save bonus, when known
        this.senses = [];                           // NameValueData[]
        this.specialSense = null;                   // string
        this.skills = [];                           // NameValueData[]
        this.speeds = [];                           // NameValueData[]
        this.spellcasting = [];                     // NameValueData[]
        this.spellcastingIsAction = false;          // boolean          (2024 puts Spellcasting under Actions)
        this.innateSpellcasting = [];               // NameValueData[]
        this.innateSpellcastingTitle = null;        // string, e.g. "Innate Spellcasting (1/Day)"
        this.size = null;                           // string
        this.souls = null;                          // RollData
        this.race = null;                           // string
        this.type = null;                           // string
        this.customType = null;                     // string
        this.swarmSize = null;                      // string
        this.utilitySpells = [];                    // NameValueData[]  (MCDM)
        this.villainActions = [];                   // NameValueData[]  (MCDM)
        this.standardConditionImmunities = [];      // string[]
        this.standardDamageImmunities = [];         // string[]
        this.standardDamageResistances = [];        // string[]
        this.standardDamageVulnerabilities = [];    // string[]
        this.specialConditionImmunities = null;     // string
        this.specialDamageImmunities = null;        // string
        this.specialDamageResistances = null;       // string
        this.specialDamageVulnerabilities = null;   // string
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
cr: number
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
knownLanguages: string[]       dnd5e language keys
unknownLanguages: string[]     free text
telepathy: int|null            range in feet
*/
export class LanguageData {
    constructor(knownLanguages, unknownLanguages, telepathy = null) {
        this.knownLanguages = knownLanguages;
        this.unknownLanguages = unknownLanguages;
        this.telepathy = telepathy;
    }
}
