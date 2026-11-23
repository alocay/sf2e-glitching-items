# Changelog

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
