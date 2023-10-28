import { sbiConfig } from "./sbiConfig.js";

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

    // Search all compendiums and get just the icon from the item, if found.
    // Don't get the whole item because the one from the statblock may be different.
    static async getImgFromPackItemAsync(itemName, type) {
        let result = null;
        const item = await this.getItemFromPacksAsync(itemName, type);

        if (item) {
            result = item.img;
        }

        return result;
    }

    static dndPacks = null;
    static otherPacks = null;

    static async getItemFromPacksAsync(itemName, type) {
        let result = null;

        // Create pack arrays once to save time.
        if (this.dndPacks == null && this.otherPacks == null) {
            // Look through the non-default packs first, since those are more
            // likely to contain customized versions of the dnd5e items.
            this.dndPacks = [];
            this.otherPacks = [];

            for (const pack of game.packs) {
                if (pack.metadata.id.startsWith("dnd5e")) {
                    this.dndPacks.push(pack);
                } else {
                    this.otherPacks.push(pack);
                }
            }
        }

        for (const pack of this.otherPacks) {
            result = await this.getItemFromPackAsync(pack, itemName);

            if (result && (!type || result.type === type)) {
                break;
            }
        }

        if (result == null) {
            for (const pack of this.dndPacks) {
                result = await this.getItemFromPackAsync(pack, itemName);

                if (result && (!type || result.type === type)) {
                    break;
                }
            }
        }

        return result;
    }

    static async getItemFromPackAsync(pack, itemName) {
        let result = null;
        const lowerName = itemName.toLowerCase();
        const item = pack.index.find(e => lowerName === e.name.toLowerCase());

        if (item) {
            const itemDoc = await pack.getDocument(item._id);
            result = itemDoc.toObject();
        }

        return result;
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
            .replace("  ", " ")
            .replace("- ", "-");
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