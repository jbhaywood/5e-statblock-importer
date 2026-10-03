import { sbiConfig } from "./sbiConfig.js";
import { KnownLanguages, LanguageAliases } from "./sbiData.js";

export class sbiUtils {

    static log(message) {
        if (sbiConfig.options.debug) {
            console.log("5e Statblock Importer | " + message);
        }
    }

    // ==========================
    // Object Functions    
    // ==========================

    static assignToObject(obj, path, val) {
        const pathArr = path.split(".");

        let length = pathArr.length;
        let current = obj;

        for (let i = 0; i < pathArr.length; i++) {
            const key = pathArr[i];

            // If this is the last item in the loop, assign the value
            if (i === length - 1) {
                current[key] = val;
            } else {
                // If the key doesn't exist, create it
                if (!current[key]) {
                    current[key] = {};
                }

                current = current[key];
            }
        }

        return obj;
    }

    static getFromObject(obj, path) {
        return path.split(".").reduce((current, key) => current?.[key], obj);
    }

    // Generate a 16 character random ID, matching Foundry's own format.
    static randomID() {
        if (globalThis.foundry?.utils?.randomID) {
            return foundry.utils.randomID();
        }

        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let id = "";
        for (let i = 0; i < 16; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
    }

    // ==========================
    // Compendium Functions    
    // ==========================

    // Search all compendiums and get just the icon from the item, if found.
    // Don't get the whole item because the one from the statblock may be different.
    static async getImgFromPackItemAsync(itemName, type) {
        const entry = this.findPackIndexEntry(itemName, type);
        return entry?.img ?? null;
    }

    static modernPacks = null;
    static legacyPacks = null;
    static otherPacks = null;

    // Group the available Item compendiums once so that lookups are quick. Non-system
    // packs are searched first since they are more likely to contain customized versions
    // of the dnd5e items. Within the system packs, the ones matching the world's rules
    // version (2014 vs 2024) are preferred.
    static getPackGroups() {
        if (this.otherPacks == null) {
            this.modernPacks = [];
            this.legacyPacks = [];
            this.otherPacks = [];

            for (const pack of game.packs) {
                if (pack.documentName !== "Item") continue;

                if (pack.metadata.packageName === "dnd5e" || pack.metadata.id.startsWith("dnd5e.")) {
                    if (/24$/.test(pack.metadata.name)) {
                        this.modernPacks.push(pack);
                    } else {
                        this.legacyPacks.push(pack);
                    }
                } else {
                    this.otherPacks.push(pack);
                }
            }
        }

        const modernRules = this.isModernRules();
        const systemPacks = modernRules
            ? [...this.modernPacks, ...this.legacyPacks]
            : [...this.legacyPacks, ...this.modernPacks];

        return [...this.otherPacks, ...systemPacks];
    }

    static isModernRules() {
        try {
            return game.settings.get("dnd5e", "rulesVersion") === "modern";
        } catch {
            return true;
        }
    }

    // Find a compendium index entry by name (case insensitive), optionally restricted to a type
    // or a list of types in order of preference.
    static findPackIndexEntry(itemName, type) {
        if (!itemName) return null;
        const lowerName = itemName.toLowerCase().trim();
        const types = Array.isArray(type) ? type : [type];

        for (const wantedType of types) {
            for (const pack of this.getPackGroups()) {
                const entry = pack.index.find(e => e.name.toLowerCase() === lowerName && (!wantedType || e.type === wantedType));

                if (entry) {
                    return { pack, entry, img: entry.img, uuid: entry.uuid ?? `Compendium.${pack.collection}.Item.${entry._id}` };
                }
            }
        }

        return null;
    }

    // Get a plain data object for the compendium item with the given name, if it exists.
    static async getItemFromPacksAsync(itemName, type) {
        const found = this.findPackIndexEntry(itemName, type);
        if (!found) return null;

        const itemDoc = await found.pack.getDocument(found.entry._id);
        if (!itemDoc) return null;

        const data = itemDoc.toObject();
        delete data._id;
        delete data.folder;
        delete data.sort;
        delete data.ownership;
        data._stats = { compendiumSource: itemDoc.uuid };

        return data;
    }

    // ==========================
    // Language Functions    
    // ==========================

    static languageMap = null;

    // Returns a Map of lower-case language label -> dnd5e language key, built from
    // CONFIG.DND5E.languages when available so that custom languages are picked up.
    static getLanguageMap() {
        if (this.languageMap) return this.languageMap;

        const map = new Map();
        for (const key of KnownLanguages) {
            map.set(key, key);
        }
        for (const [alias, key] of Object.entries(LanguageAliases)) {
            map.set(alias, key);
        }

        const config = globalThis.CONFIG?.DND5E?.languages;
        const walk = (entries) => {
            for (const [key, data] of Object.entries(entries ?? {})) {
                const label = typeof data === "string" ? data : data?.label;
                if (label) map.set(String(label).toLowerCase(), key);
                map.set(key.toLowerCase(), key);
                if (data?.children) walk(data.children);
            }
        };
        walk(config);

        this.languageMap = map;
        return map;
    }

    // ==========================
    // String Functions    
    // ==========================
    // camelToTitleCase("legendaryActions") => "Legendary Actions"
    static camelToTitleCase(string) {
        return string// insert a space before all caps
            .replace(/([A-Z])/g, ' $1')
            // uppercase the first character
            .replace(/^./, function (str) { return str.toUpperCase(); })
    }

    // capitalizeAll("passive perception") => "Passive Perception"
    static capitalizeAll(string) {
        if (!string) {
            return null;
        }

        return string.toLowerCase().replace(/^\w|\s\w|\(\w/g, function (letter) {
            return letter.toUpperCase();
        })
    }

    // capitalizeFirstLetter("passive perception") => "Passive perception"
    static capitalizeFirstLetter(string) {
        if (!string) return string;
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    // format("{0} comes before {1}", "a", "b") => "a comes before b"
    static format(stringToFormat, ...tokens) {
        return stringToFormat.replace(/{(\d+)}/g, function (match, number) {
            return typeof tokens[number] != 'undefined' ? tokens[number] : match;
        });
    };

    // startsWithCapital("Foo") => true
    static startsWithCapital(string) {
        return /[A-Z]/.test(string.charAt(0))
    }

    // parseFraction("1/2") => 0.5
    static parseFraction(string) {
        let result = null;
        const numbers = string.split("/");

        if (numbers.length == 2) {
            const numerator = parseFloat(numbers[0]);
            const denominator = parseFloat(numbers[1]);
            result = numerator / denominator;
        }

        return result;
    }

    // parseSignedInt("−2") => -2, parseSignedInt("+3") => 3
    static parseSignedInt(string) {
        if (string == null) return NaN;
        return parseInt(String(string).replace(/[−–]/g, "-").replace(/\+/g, "").trim());
    }

    static exactMatch(string, regex) {
        const match = string.match(regex);
        return match && match[0] === string;
    }

    static replaceAt(string, index, char) {
        if (index > string.length - 1) return string;
        return string.substring(0, index) + char + string.substring(index + 1);
    }

    static trimStringEnd(string, trimString) {
        let result = string;

        if (string.endsWith(trimString)) {
            result = string.substr(0, string.length - trimString.length);
        }

        return result;
    }

    // Given an array of strings, returns an array of strings, each representing one sentence.
    static makeSentences(strings) {
        return this.combineToString(strings)
            .split(/[.!]/)
            .filter(str => str)
            .map(str => str.trim(" ") + ".");
    }

    // Given an array of strings, returns one string.
    static combineToString(strings) {
        return strings
            .join(" ")
            .replace(/\s{2,}/g, " ")
            .replace(/(\w)- (\w)/g, "$1-$2");
    }

    // ==========================
    // Array Functions    
    // ==========================

    // last([1,2,3]) => 3
    static last(array) {
        return array[array.length - 1];
    }

    // skipWhile([1,2,3], (item) => item !== 2) => [2,3]
    static skipWhile(array, callback) {
        let doneSkipping = false;

        return array.filter((item) => {
            if (!doneSkipping) {
                doneSkipping = !callback(item);
            }

            return doneSkipping;
        });
    };

    // intersect([1,2,3], [2]) => [2]
    static intersect(sourceArr, targetArr) {
        return sourceArr.filter(item => targetArr.indexOf(item) !== -1);
    };

    // except([1,2,3], [2]) => [1,3]
    static except(sourceArr, targetArr) {
        return sourceArr.filter(item => targetArr.indexOf(item) === -1);
    };
}
