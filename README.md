# Glitching Items

Automates the Starfinder 2e **glitching** condition on equipment. Tag an item as glitching, and each time it's used the module rolls the DC (5 + glitching value) flat check in chat.

**Requires:** Foundry VTT v12–v14 and the SF2e system.

## Install

In Foundry, go to **Add-on Modules → Install Module** and paste this manifest URL:

```
https://github.com/alocay/sf2e-glitching-items/releases/latest/download/module.json
```

## How to use

### 1. Tag the item

Use either method:

- **Trait (recommended):** add **Glitching 1**, **Glitching 2** or **Glitching 3** to the item's traits. The module adds these traits to the weapon and equipment trait lists. Consumables and armor get them too.
- **Name:** put "Glitching N" in the item's name, e.g. `Frag Grenade (Glitching 1)`.

With a trait, " (Glitching)" is added to the item's name automatically, and removed when the trait is removed.

### 2. Use the item

When the item posts a chat card (a Strike, Area Fire, an activation), the module rolls the flat check and posts the result:

| Result | Effect |
|---|---|
| Critical success | Works normally, and the glitching value drops by 1. |
| Success | Works normally. |
| Failure | Item penalty equal to the glitching value on checks and DCs for this use. |
| Critical failure | The item doesn't function, and the actions are lost. |

Penalties aren't applied automatically. Apply them from the chat result.

### What counts as a use

- Every attack roll gets a check.
- A damage roll right after a check is part of that use and doesn't get its own.
- Saves against the item, damage taken by targets, and cards posted by other creatures are ignored.

### Critical success

The glitching value drops by 1: Glitching 2 becomes Glitching 1, and Glitching 1 is removed. This only happens when the item's quantity is 1, so a lucky roll doesn't fix a whole stack.

### Limitations

- The check is rolled after the attack card appears, so adjust the attack by hand on a failure or critical failure.
- Posting an item to chat just to show its description counts as a use.
- Shields aren't covered.

## Settings

None.

## License

MIT
