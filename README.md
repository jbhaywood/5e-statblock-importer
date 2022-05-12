![Latest Version](https://img.shields.io/github/v/release/jbhaywood/5e-statblock-importer)
![Foundry Version](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fversion%3Fstyle%3Dflat%26url%3Dhttps%3A%2F%2Fraw.githubusercontent.com%2Fjbhaywood%2F5e-statblock-importer%2Fmain%2Fmodule.json)
![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2F5e-statblock-importer&colorB=blueviolet)
![License](https://img.shields.io/github/license/jbhaywood/5e-statblock-importer)

# 5e-statblock-importer
A module for the FoundryVTT **DND5e - Fifth Edition System**. Easily import 5e monster and NPC statblocks into your game. As long as it's formatted using the standard WotC layout, it'll create a new actor with an NPC character sheet using those stats.

## How to use
Once installed, you'll see a new button at the bottom of the characters tab that looks like this...

![image](https://user-images.githubusercontent.com/5131886/128588603-cbbc558c-8ae5-4005-a56f-0c28afb6fcfd.png)

Clicking the button will open a window with a big text box that you can past the statblock into. Here's an example of one for a Glabrezu from the [SRD](https://dnd.wizards.com/articles/features/systems-reference-document-srd).

![image](https://user-images.githubusercontent.com/5131886/128588988-0a501b2c-b1c7-4ed8-ae8f-4396325f7a4f.png)

After you've pasted it in, click the "Import" button and you'll see a new actor appear in the side panel.

![image](https://user-images.githubusercontent.com/5131886/128589018-48fc68f1-6e82-46fb-9d49-4e420cca3a26.png)

Open the character sheet for that new actor and you'll see all of the stats, actions, and spells filled out for you. Everything in the statblock should be represented on the character sheet, including legendary actions and reactions (which the Glabrezu doesn't have). To have the spells show up in the Spellbook requires having the "Spells (SRD)" compendium installed, which should come with the 5e system.

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
## Issues
If you find a statblock that doesn't import correctly, open an issue [here](https://github.com/jbhaywood/5e-statblock-importer/issues) and include the text that you were trying to use.

## Credit
This module was based on the [Pathfinder 1e Statblock Library](https://github.com/baileymh/statblock-library) module because I hadn't made a module before and needed a place to start.

## License
This work is licensed under Foundry Virtual Tabletop [EULA - Limited License Agreement for module development v 0.1.6](http://foundryvtt.com/pages/license.html).  
This Foundry VTT module, writen by James Haywood, is licensed under the [MIT License](https://github.com/jbhaywood/5e-statblock-importer/blob/main/LICENSE).
