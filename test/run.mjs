// Runs the parser and actor builder over every statblock in ../testBlocks without Foundry.
// Usage: node test/run.mjs [--verbose] [name-filter]
//
// A minimal stand-in for the Foundry globals is installed, then the generated actor and
// item data is checked against the key paths found in the dnd5e compendium sources
// (see test/dnd5e-keyset.json) so that typos in the data model are caught early.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const filter = args.find(a => !a.startsWith("--"));

// ---------------------------------------------------------------------------
// Fake Foundry environment
// ---------------------------------------------------------------------------

function makeIndexEntry(name, type, level = 1) {
    const _id = Math.random().toString(36).slice(2, 18).padEnd(16, "0");
    return { _id, name, type, img: `icons/${type}/${name.toLowerCase().replace(/\s+/g, "-")}.webp`, level };
}

function makeDocument(entry, packId) {
    const system = entry.type === "spell"
        ? { level: entry.level, method: "", prepared: 0, uses: { spent: 0, max: "", recovery: [] }, activities: {} }
        : entry.type === "equipment"
            ? { type: { value: entry.name === "Shield" ? "shield" : "light" }, armor: { value: entry.name === "Shield" ? 2 : 11, dex: null }, equipped: false, quantity: 1, activities: {} }
            : { type: { value: "simpleM" }, equipped: false, quantity: 1, activities: {}, damage: { base: {} } };

    return {
        uuid: `Compendium.${packId}.Item.${entry._id}`,
        toObject: () => ({ _id: entry._id, name: entry.name, type: entry.type, img: entry.img, system: structuredClone(system), sort: 0, folder: null, ownership: {} })
    };
}

function makePack(id, name, entries) {
    const pack = {
        documentName: "Item",
        collection: id,
        metadata: { id, name, packageName: id.split(".")[0] },
        index: entries,
        getDocument: async (docId) => {
            const entry = entries.find(e => e._id === docId);
            return entry ? makeDocument(entry, id) : null;
        }
    };
    return pack;
}

const spellNames = [
    ["Mage Hand", 0], ["Prestidigitation", 0], ["Ray of Frost", 0], ["Light", 0], ["Minor Illusion", 0], ["Fire Bolt", 0],
    ["Detect Magic", 1], ["Magic Missile", 1], ["Shield", 1], ["Thunderwave", 1], ["Mage Armor", 1], ["Command", 1], ["Charm Person", 1],
    ["Acid Arrow", 2], ["Detect Thoughts", 2], ["Invisibility", 2], ["Mirror Image", 2], ["Darkness", 2], ["Scorching Ray", 2], ["Misty Step", 2],
    ["Animate Dead", 3], ["Counterspell", 3], ["Dispel Magic", 3], ["Fireball", 3], ["Fly", 3],
    ["Blight", 4], ["Dimension Door", 4], ["Confusion", 4],
    ["Cloudkill", 5], ["Scrying", 5], ["Cone of Cold", 5],
    ["Disintegrate", 6], ["Globe of Invulnerability", 6],
    ["Finger of Death", 7], ["Plane Shift", 7],
    ["Dominate Monster", 8], ["Power Word Stun", 8],
    ["Power Word Kill", 9], ["Fog Cloud", 1]
];

const spellEntries = spellNames.map(([name, level]) => makeIndexEntry(name, "spell", level));
const equipmentEntries = ["Shield", "Leather Armor", "Chain Shirt", "Hide Armor", "Chain Mail", "Studded Leather Armor"].map(n => makeIndexEntry(n, "equipment"));
const weaponEntries = ["Scimitar", "Shortbow", "Longsword", "Javelin", "Morningstar"].map(n => makeIndexEntry(n, "weapon"));

globalThis.game = {
    packs: [
        makePack("dnd5e.spells24", "spells24", spellEntries),
        makePack("dnd5e.spells", "spells", spellEntries),
        makePack("dnd5e.equipment24", "equipment24", [...equipmentEntries, ...weaponEntries]),
        makePack("dnd5e.items", "items", [...equipmentEntries, ...weaponEntries])
    ],
    settings: { get: () => "modern" },
    user: { isGM: true },
    i18n: { localize: s => s, format: s => s, lang: "en" },
    folders: []
};

globalThis.ui = { notifications: { info() { }, warn() { }, error() { } } };

function setProperty(obj, key, value) {
    const parts = key.split(".");
    let current = obj;
    for (const part of parts.slice(0, -1)) {
        current[part] ??= {};
        current = current[part];
    }
    current[parts.at(-1)] = value;
}

function expand(update) {
    const result = {};
    for (const [key, value] of Object.entries(update)) {
        if (key.includes(".")) setProperty(result, key, value);
        else result[key] = value;
    }
    return result;
}

function merge(target, source) {
    for (const [key, value] of Object.entries(source)) {
        if (value && typeof value === "object" && !Array.isArray(value) && target[key] && typeof target[key] === "object") {
            merge(target[key], value);
        } else {
            target[key] = value;
        }
    }
    return target;
}

class FakeActor {
    constructor(data) {
        Object.assign(this, structuredClone(data));
        this.items = [];
        this.updates = [];
        this.sheet = { render() { } };
    }

    static async create(data) {
        return new FakeActor(data);
    }

    async createEmbeddedDocuments(type, items) {
        this.items.push(...items);
        return items;
    }

    async update(update) {
        this.updates.push(update);
        merge(this, expand(update));
        return this;
    }

    // Crude AC emulation: natural armor uses the flat value plus any equipped shield,
    // everything else is 10 + Dex plus a leather armor's worth for equipped armor.
    get acValue() {
        const ac = this.system.attributes?.ac ?? {};
        const dexMod = Math.floor(((this.system.abilities?.dex?.value ?? 10) - 10) / 2);
        const shield = this.items.some(i => i.type === "equipment" && i.system.type?.value === "shield" && i.system.equipped) ? 2 : 0;
        const armor = this.items.find(i => i.type === "equipment" && i.system.type?.value !== "shield" && i.system.equipped);
        if ((ac.calcs ?? []).includes("natural")) return (ac.flat ?? 0) + shield;
        if (armor) return (armor.system.armor?.value ?? 10) + dexMod + shield;
        return 10 + dexMod + shield;
    }
}

Object.defineProperty(FakeActor.prototype, "system", {
    get() { return this._system; },
    set(value) {
        this._system = value;
        const actor = this;
        value.attributes ??= {};
        value.attributes.ac ??= {};
        if (Array.isArray(value.attributes.ac.calcs)) value.attributes.ac._calcs = value.attributes.ac.calcs;
        Object.defineProperty(value.attributes.ac, "value", { get: () => actor.acValue, configurable: true });
        Object.defineProperty(value.attributes.ac, "calcs", {
            get: () => { const arr = value.attributes.ac._calcs ?? []; arr.has = (k) => arr.includes(k); return arr; },
            set: (v) => value.attributes.ac._calcs = v,
            configurable: true
        });
    }
});

globalThis.Actor = FakeActor;

// ---------------------------------------------------------------------------
// Key path validation
// ---------------------------------------------------------------------------

const keysetPath = path.join(here, "dnd5e-keyset.json");
const keyset = existsSync(keysetPath) ? JSON.parse(readFileSync(keysetPath, "utf8")) : null;
const actorKeys = new Set(keyset?.actor ?? []);
const itemKeys = Object.fromEntries(Object.entries(keyset?.items ?? {}).map(([k, v]) => [k, new Set(v)]));

function collectKeys(obj, prefix, out, normalizeIds = false) {
    if (Array.isArray(obj)) {
        for (const v of obj) collectKeys(v, prefix + "[]", out, normalizeIds);
    } else if (obj && typeof obj === "object") {
        for (const [k, v] of Object.entries(obj)) {
            const key = normalizeIds && /^[A-Za-z0-9]{16}$/.test(k) ? "*" : k;
            const p = prefix ? `${prefix}.${key}` : key;
            out.add(p);
            collectKeys(v, p, out, normalizeIds);
        }
    }
}

function unknownKeys(obj, prefix, validKeys, normalizeIds = false) {
    if (!keyset) return [];
    const keys = new Set();
    collectKeys(obj, prefix, keys, normalizeIds);
    return [...keys].filter(k => k.includes(".") && !validKeys.has(k) && !k.startsWith("system.spells.spell") && !k.startsWith("system.attributes.movement.speeds.") && !k.endsWith("._calcs"));
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const { sbiParser } = await import("../scripts/sbiParser.js");

const testDir = path.join(here, "..", "testBlocks");
const files = readdirSync(testDir).filter(f => f.endsWith(".js") && (!filter || f.includes(filter))).sort();
let failures = 0;

for (const file of files) {
    const { statblock } = await import(path.join(testDir, file));
    const lines = statblock.trim().split(/\r?\n/).map(l => l.trim()).filter(l => l);

    let actor;
    try {
        actor = await sbiParser.parseInput(lines, null);
    } catch (error) {
        failures++;
        console.log(`\n✖ ${file}: ${error.stack}`);
        continue;
    }

    const problems = [];
    problems.push(...unknownKeys({ system: actor.system, prototypeToken: actor.prototypeToken }, "", actorKeys).map(k => `actor key ${k}`));
    for (const item of actor.items) {
        const valid = itemKeys[item.type];
        if (!valid) { problems.push(`item type ${item.type}`); continue; }
        problems.push(...unknownKeys({ system: item.system }, "", valid, true).map(k => `${item.type} "${item.name}" key ${k}`));
    }

    const s = actor.system;
    const summary = {
        name: actor.name,
        rules: s.source?.rules,
        cr: s.details?.cr,
        type: s.details?.type,
        size: s.traits?.size,
        ac: `${actor.acValue} (calcs: ${JSON.stringify(s.attributes?.ac?._calcs)}, flat: ${s.attributes?.ac?.flat}, override: ${s.attributes?.ac?.override})`,
        hp: s.attributes?.hp,
        abilities: Object.fromEntries(Object.entries(s.abilities ?? {}).map(([k, v]) => [k, `${v.value}${v.proficient ? "*" : ""}${v.bonuses?.save ? v.bonuses.save : ""}`])),
        skills: s.skills,
        speeds: s.attributes?.movement,
        senses: s.attributes?.senses,
        languages: s.traits?.languages,
        di: s.traits?.di, dr: s.traits?.dr, dv: s.traits?.dv, ci: s.traits?.ci,
        resources: s.resources,
        spellcasting: s.attributes?.spellcasting,
        spellLevel: s.attributes?.spell?.level,
        slots: s.spells,
        init: s.attributes?.init,
        items: actor.items.map(i => {
            const acts = Object.values(i.system.activities ?? {}).map(a => {
                let desc = `${a.type}:${a.activation.type}${a.activation.value && a.activation.value !== 1 ? "x" + a.activation.value : ""}`;
                if (a.type === "attack") desc += ` [${a.attack.type.value}/${a.attack.type.classification} ${a.attack.ability}${a.attack.bonus ? a.attack.bonus : ""}] dmg=${JSON.stringify(a.damage.parts.map(p => `${p.number}d${p.denomination}${p.bonus ? "+" + p.bonus : ""} ${p.types}`))}`;
                if (a.type === "save") desc += ` [${a.save.ability} dc=${a.save.dc.calculation || a.save.dc.formula}] dmg=${JSON.stringify(a.damage.parts.map(p => `${p.number}d${p.denomination}${p.bonus ? "+" + p.bonus : ""} ${p.types}`))} onSave=${a.damage.onSave}${a.target?.template?.type ? " tmpl=" + a.target.template.size + "ft " + a.target.template.type : ""}`;
                if (a.consumption.targets.length) desc += ` consume=${JSON.stringify(a.consumption.targets)}`;
                return desc;
            });
            let line = `${i.type}: ${i.name}`;
            if (i.type === "weapon") line += ` base=${i.system.damage.base.number}d${i.system.damage.base.denomination}${i.system.damage.base.bonus ? "+" + i.system.damage.base.bonus : ""} ${i.system.damage.base.types} range=${JSON.stringify(i.system.range)} props=${i.system.properties}`;
            if (i.type === "spell") line += ` method=${i.system.method} uses=${i.system.uses?.max || "-"}`;
            if (i.type === "feat" && i.system.uses?.max) line += ` uses=${i.system.uses.max}/${i.system.uses.recovery.map(r => r.period + (r.formula ? r.formula : "")).join(",")}`;
            if (i.type === "feat" && i.system.properties?.includes("trait")) line += " (trait)";
            if (acts.length) line += ` -> ${acts.join(" | ")}`;
            return line;
        })
    };

    if (problems.length) failures++;
    console.log(`\n${problems.length ? "✖" : "✔"} ${file} -> ${actor.name} (${actor.items.length} items)`);
    for (const problem of problems) console.log(`    PROBLEM: ${problem}`);
    if (verbose) {
        const { items, ...rest } = summary;
        console.log(JSON.stringify(rest, null, 1).replace(/\n\s*/g, " "));
        for (const line of items) console.log("    " + line);
    }
}

console.log(`\n${files.length - failures}/${files.length} statblocks converted without problems.`);
process.exit(failures ? 1 : 0);
