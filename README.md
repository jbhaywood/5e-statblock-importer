![Latest Version](https://img.shields.io/github/v/release/joebags99/5e-statblock-importer-2026)
![Foundry Version](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fversion%3Fstyle%3Dflat%26url%3Dhttps%3A%2F%2Fraw.githubusercontent.com%2Fjoebags99%2F5e-statblock-importer-2026%2Fmain%2Fmodule.json)
![License](https://img.shields.io/github/license/joebags99/5e-statblock-importer-2026)

# 5e-statblock-importer
A module for the FoundryVTT **DND5e - Fifth Edition System**. Easily import 5e monster and NPC statblocks into your game. Paste a statblock in the standard WotC layout (either the 2014 or the 2024 *Monster Manual* style) and it creates a new actor with an NPC character sheet using those stats.

This is a fork of [jbhaywood/5e-statblock-importer](https://github.com/jbhaywood/5e-statblock-importer), updated for **Foundry VTT v14** and **dnd5e 6.x**.

## Requirements
- Foundry VTT v14 or later
- D&D Fifth Edition system (dnd5e) 6.0.0 or later

## What gets imported
- Size, type, subtype, alignment, AC, HP, speeds (including hover), senses, languages (including telepathy), CR, and the 2024 initiative bonus.
- Ability scores, saving throw proficiencies (from the *Saving Throws* line or the 2024 ability table) and skill proficiencies. Bonuses that don't line up with proficiency are kept as flat bonuses so the sheet shows the printed numbers.
- Damage immunities, resistances and vulnerabilities (with the nonmagical / silvered / adamantine bypasses) and condition immunities, including the combined 2024 *Immunities* line.
- Traits, actions, bonus actions, reactions, legendary actions, lair actions, mythic actions and MCDM villain actions as feature items with dnd5e **activities**:
  - Weapon attacks become natural weapons with an attack activity, the right ability, reach/range and damage.
  - Saving throw effects become save activities with the DC, affected ability, area template and damage.
  - Recharge and X/Day features get limited uses, legendary actions spend the actor's legendary action pool, and legendary resistance spends the actor's legendary resistance pool.
- Spellcasting, innate spellcasting and 2024 "Spellcasting" actions, pulling the spells from your compendiums (the system's SRD spells are enough), with slots, innate uses and at-will casting set up.
- Armor and gear named in the statblock (the 2014 *Armor Class* parenthetical or the 2024 *Gear* line) are added from your compendiums and equipped. If the resulting AC doesn't match the statblock, it's overridden to match.

## How to use
## How to use
Once installed, GMs will see a new **Import Statblock** button at the bottom of the Actors tab in the sidebar.

![image](https://user-images.githubusercontent.com/5131886/128588603-cbbc558c-8ae5-4005-a56f-0c28afb6fcfd.png)

Clicking the button will open a window with a big text box that you can paste the statblock into. Here's an example of one for a Glabrezu from the [SRD](https://dnd.wizards.com/articles/features/systems-reference-document-srd).

![image](https://user-images.githubusercontent.com/5131886/128588988-0a501b2c-b1c7-4ed8-ae8f-4396325f7a4f.png)

After you've pasted it in, click the "Import" button and you'll see a new actor appear in the side panel.

![image](https://user-images.githubusercontent.com/5131886/128589018-48fc68f1-6e82-46fb-9d49-4e420cca3a26.png)

Open the character sheet for that new actor and you'll see all of the stats, actions, and spells filled out for you. Everything in the statblock should be represented on the character sheet, including legendary actions and reactions (which the Glabrezu doesn't have). Spells are looked up by name in your Item compendiums (non-system compendiums first, then the system's own spell compendiums, preferring the ones that match the world's rules version), so the system's SRD spells are enough for most statblocks. Spells that can't be found are listed at the bottom of the Spellcasting feature's description.

![image](https://user-images.githubusercontent.com/5131886/128589035-e94c92f7-e515-4daa-9670-e3d599282faf.png)
![image](https://user-images.githubusercontent.com/5131886/128589301-f9c7e640-0e2c-4611-aa05-d2e535babc41.png)
![image](https://user-images.githubusercontent.com/5131886/128589059-c4a57931-9ed8-43cb-85ce-32f07d783777.png)

Here's the text if you want to try it yourself and don't have any statblocks handy.

```
Glabrezu
Large fiend (demon), chaotic evil
Armor Class 17 (natural armor)
Hit Points 157 (15d10 + 75)
Speed 40 ft.
STR
DEX
CON
INT
WIS
CHA
20 (+5) 15 (+2) 21 (+5) 19 (+4) 17 (+3) 16 (+3)
Saving Throws Str +9, Con +9, Wis +7, Cha +7
Damage Resistances cold, fire, lightning; bludgeoning,
piercing, and slashing from nonmagical attacks
Damage Immunities poison
Condition Immunities poisoned
Senses truesight 120 ft., passive Perception 13
Languages Abyssal, telepathy 120 ft.
Challenge 9 (5,000 XP)
Innate Spellcasting. The glabrezu’s spellcasting ability
is Intelligence (spell save DC 16). The glabrezu can
innately cast the following spells, requiring no material
components:
At will: darkness, detect magic, dispel magic
1/day each: confusion, fly, power word stun
Magic Resistance. The glabrezu has advantage on
saving throws against spells and other magical effects.
Actions
Multiattack. The glabrezu makes four attacks: two with
its pincers and two with its fists. Alternatively, it makes
two attacks with its pincers and casts one spell.
Pincer. Melee Weapon Attack: +9 to hit, reach 10 ft.,
one target. Hit: 16 (2d10 + 5) bludgeoning damage. If
the target is a Medium or smaller creature, it is
grappled (escape DC 15). The glabrezu has two pincers,
each of which can grapple only one target.
Fist. Melee Weapon Attack: +9 to hit, reach 5 ft., one
target. Hit: 7 (2d4 + 2) bludgeoning damage.
```
The module also exposes a small API for macros:

```js
const api = game.modules.get("5e-statblock-importer").api;
api.openWindow();                       // open the import window
await api.importStatblock(text, null);  // import text directly, optionally into a folder id
```

## Development
The parser and the actor data builder have no dependency on Foundry, so the statblocks in `testBlocks/` can be converted from the command line to check the generated dnd5e data:

```
node test/run.mjs            # convert every test block and validate the data paths
node test/run.mjs --verbose  # also print a summary of the generated actor and items
node test/run.mjs lich       # only run the test blocks whose file name contains "lich"
```

`test/dnd5e-keyset.json` holds the data paths found in the dnd5e compendium sources and is used to flag typos in the generated data.

## Issues
If you find a statblock that doesn't import correctly, open an issue [here](https://github.com/joebags99/5e-statblock-importer-2026/issues) and include the text that you were trying to use.

## Credit
This module was based on the [Pathfinder 1e Statblock Library](https://github.com/baileymh/statblock-library) module because I hadn't made a module before and needed a place to start.

## License
This work is licensed under Foundry Virtual Tabletop [EULA - Limited License Agreement for module development v 0.1.6](http://foundryvtt.com/pages/license.html).  
This Foundry VTT module, written by James Haywood and updated for Foundry v14 / dnd5e 6 in this fork, is licensed under the [MIT License](https://github.com/joebags99/5e-statblock-importer-2026/blob/main/LICENSE).
