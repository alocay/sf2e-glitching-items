# Changelog

## 1.8.0
- A failed check lowers the DCs on the item's card by the glitching value: the Area Fire or Auto-Fire save DC, and the item's check links.
- A critical failure hides the item's save, damage, healing and check buttons on its card from players. The GM still sees them.
- A consumable that critically fails is used up. The check card says "X has been consumed." and the GM gets a Restore button that works as long as the card is in chat. A consumable the system already used up (a Medpatch) isn't taken twice.
- New "Roll Glitch Check" button on an item's check posted to chat (e.g. a glitching lock's DC).
- New settings: "Apply glitch results to cards" and "Consume on crit failures". Both on by default.
- Glitching 4 and Glitching 5 traits.
- A consumable used up by its own use (the last Medpatch in a stack) now gets its check.
- Posting an item to chat to show its description no longer triggers a check.
- Shorter check card text: a critical failure reads "The item failed to function.", and the failure line no longer has an example.

## 1.7.0
- Module ID changed to `sf2e-glitching-items`. Uninstall the old Glitching Items module before installing this one. Existing glitching items keep working.
- Removed the automatic conversion of items tagged by name in older versions. Give those items the Glitching trait by hand.
- Damage rolls never trigger a check. The Strike or Area Fire card already counts as the use.
- The flat check card no longer describes splitting a stack.

## 1.6.0
- Traits are now the only way to mark an item as glitching. A number in the name no longer counts as a tag.
- The name shows the value: "Battery (Glitching 2)" instead of "Battery (Glitching)", so Glitching 1 and Glitching 2 stacks are easy to tell apart.
- Items tagged by name in older versions are converted to the matching trait when the GM loads the world, or when they're created (e.g. dragged in from a compendium).

## 1.5.0
- Critical success on a stack of reusable items splits the used one off into its own stack with the lower glitching value. The rest of the stack keeps its glitch.
- Consumables (grenades) are left unchanged on a critical success, since the one that rolled is used up.
- The flat check card says what happened to the item.
- Removed PF2e from the supported systems. SF2e only.

## 1.4.1
- Marked as verified for Foundry v14.

## 1.4.0
- Items with a Glitching trait get " (Glitching)" added to their name automatically, and removed when the trait is removed.

## 1.3.0
- Every attack roll gets its own check.
- A damage roll after a check no longer triggers another check.

## 1.2.1
- Saves against the item, damage taken by targets, and cards from other creatures no longer trigger a check.

## 1.2.0
- The module registers the Glitching 1–3 traits itself. No Homebrew Elements setup needed.

## 1.1.0
- Items can be tagged with a Glitching N trait as well as by name.
- On a critical success, a trait drops to the next lower value.

## 1.0.0
- First version: "Glitching N" in an item's name triggers a DC 5 + N flat check whenever the item posts a chat card.
