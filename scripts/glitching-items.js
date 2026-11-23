// Glitching Items — Foundry VTT v12–v14, SF2e
// Mark an item with the Glitching 1/2/3 trait (registered by this module in module.json).
// The item's name shows the value automatically, e.g. "Battery (Glitching 2)".
// When the item posts a chat card, a DC (5 + N) flat check is rolled in chat.
// On a critical success the item's glitching value drops by 1 (trait removed at 0).

const MODULE_ID = "glitching-items";
// "Glitching N" in a name: only used to convert items tagged by name in versions before 1.6
const TAG = /\(?\s*glitching[\s-]*(\d+)\s*\)?/i;
const DEBOUNCE_MS = 4000;          // duplicate item/activation cards within this window count once
const DAMAGE_WINDOW_MS = 120000;   // a damage roll within 2 min of a check belongs to that use
const recent = new Map();

const TRAIT = /^glitching-(\d+)$/;

// Returns { n, trait } from the item's Glitching N trait, or null.
function glitchInfo(item) {
  if (!item) return null;
  const traits = item.system?.traits?.value ?? [];
  for (const t of traits) {
    const m = String(t).match(TRAIT);
    if (m) return { n: Number(m[1]), trait: t };
  }
  return null;
}

// Is "glitching-N" a trait the system knows about (i.e. created in Homebrew Elements)?
function traitExists(slug) {
  const cfg = CONFIG[game.system.id.toUpperCase()] ?? CONFIG.PF2E ?? {};
  return ["weaponTraits", "equipmentTraits", "consumableTraits", "armorTraits", "shieldTraits"]
    .some((k) => cfg[k] && slug in cfg[k]);
}

function findItem(message) {
  if (message.item) return message.item;                       // PF2e/SF2e chat messages expose .item
  const uuid = message.flags?.[game.system.id]?.origin?.uuid;
  return uuid ? fromUuidSync(uuid) : null;
}

function degreeOf(die, dc) {
  let d = die >= dc + 10 ? 3 : die >= dc ? 2 : die <= dc - 10 ? 0 : 1;
  if (die === 20) d = Math.min(3, d + 1);
  if (die === 1) d = Math.max(0, d - 1);
  return d;
}

const OUTCOME = [
  { label: "Critical Failure", color: "#b00", text: "The item doesn't function and the actions spent using it are lost." },
  { label: "Failure", color: "#c60", text: "Item penalty equal to the glitching value ({n}) to checks and DCs for this use (e.g. lower the save DC by {n})." },
  { label: "Success", color: "#28a", text: "The item works normally." },
  { label: "Critical Success", color: "#2a2", text: "Works normally, and the item's glitching value drops by 1." }
];

Hooks.on("createChatMessage", async (message) => {
  // Run only on the client that created the message, so the check is rolled once
  if (message.author?.id !== game.user.id) return;
  if (message.flags?.[MODULE_ID]) return;

  const item = findItem(message);
  const info = glitchInfo(item);
  if (!info?.n) return;

  // Ignore reactions to the item by other creatures: a target's save against the
  // grenade, damage applied to a target, etc. Only the item's holder "uses" it.
  const ctxType = message.flags?.[game.system.id]?.context?.type;
  if (["saving-throw", "damage-taken", "flat-check"].includes(ctxType)) return;
  if (item.actor && message.actor && message.actor.id !== item.actor.id) return;
  const n = info.n;

  // Decide whether this card is a new "use" of the item:
  //  - attack rolls: every Strike is a use, always check (MAP attacks back to back)
  //  - damage rolls: usually follow an attack/Area Fire already checked, so skip
  //    if this item was checked recently; otherwise treat as the use
  //  - anything else (item card, Area Fire, activation): short debounce
  const key = item.uuid;
  const now = Date.now();
  const last = recent.get(key) ?? 0;
  if (ctxType === "attack-roll") {
    // always a new use
  } else if (ctxType === "damage-roll") {
    if (now - last < DAMAGE_WINDOW_MS) return;
  } else if (now - last < DEBOUNCE_MS) {
    return;
  }
  recent.set(key, now);

  const dc = 5 + n;
  const roll = await new Roll("1d20").evaluate();
  const die = roll.total;
  const deg = degreeOf(die, dc);
  const o = OUTCOME[deg];

  // Critical success: work out what happens to the item before posting, so the card can say so.
  const qty = item.system?.quantity ?? 1;
  const usedUp = isConsumable(item);
  const lowerText = n > 1 ? `Glitching ${n - 1}` : "no longer glitching";
  let note = "";
  if (deg === 3 && item.isOwner) {
    if (usedUp) note = qty > 1 ? "This one was used up. The rest of the stack is still glitching." : "";
    else if (qty > 1) {
      const rest = qty - 1;
      note = `Split off 1 into its own stack (${lowerText}). The other ${rest} ${rest === 1 ? "is" : "are"} still Glitching ${n}.`;
    } else note = n > 1 ? `Lowered to ${lowerText}.` : "No longer glitching.";
  }

  await roll.toMessage({
    speaker: message.speaker,
    flavor: `<strong>Glitching ${n}</strong> flat check — ${foundry.utils.escapeHTML(item.name)} (DC ${dc})
      <div style="color:${o.color};font-weight:bold;margin-top:4px">${o.label}</div>
      <div>${o.text.replaceAll("{n}", n)}</div>${note ? `<div style="margin-top:4px"><em>${note}</em></div>` : ""}`,
    flags: { [MODULE_ID]: { check: true } }
  });

  // Consumables (grenades etc.) are used up, so there's nothing left to fix.
  if (deg !== 3 || !item.isOwner || usedUp) return;

  try {
    if (qty > 1) {
      // Split the lucky one off: the stack keeps its glitch, the new single item gets the lower value.
      const data = item.toObject();
      delete data._id;
      data.system.quantity = 1;
      lowerGlitch(data, info, n);
      await item.update({ "system.quantity": qty - 1 });
      await Item.implementation.create(data, { parent: item.actor ?? null });
    } else {
      const data = { name: item.name, system: { traits: { value: [...(item.system.traits?.value ?? [])] } } };
      lowerGlitch(data, info, n);
      await item.update({ "system.traits.value": data.system.traits.value });
    }
  } catch (err) {
    console.error(`${MODULE_ID} | couldn't lower the glitching value`, err);
  }
});

/** Grenades and other one-shot items: the one that rolled is gone after use. */
function isConsumable(item) {
  if (item.isOfType?.("consumable")) return true;
  const traits = item.system?.traits?.value ?? [];
  return traits.includes("consumable") || traits.includes("grenade");
}

/** Lower the glitching value by 1 on item source data. The name follows via the hooks below. */
function lowerGlitch(data, info, n) {
  const lower = `glitching-${n - 1}`;
  const traits = (data.system.traits?.value ?? []).filter((t) => t !== info.trait);
  if (n > 1 && traitExists(lower)) traits.push(lower);
  data.system.traits ??= {};
  data.system.traits.value = traits;
  // Rename now too, so a split-off copy's old "(Glitching N)" isn't read as a pre-1.6 name tag
  if (data.name !== undefined) data.name = syncedName(data.name, traits);
}

// ---------------------------------------------------------------------------
// Keep " (Glitching N)" at the end of the name of any item with a Glitching N trait.
// The trait is the source of truth; the name just shows it.
// ---------------------------------------------------------------------------
const SUFFIX_RE = /\s*\(\s*glitching(?:[\s-]*\d+)?\s*\)\s*$/i;

function glitchLevel(traits) {
  if (!Array.isArray(traits)) return 0;
  for (const t of traits) {
    const m = String(t).match(TRAIT);
    if (m) return Number(m[1]);
  }
  return 0;
}

function syncedName(name, traits) {
  const base = String(name ?? "").replace(SUFFIX_RE, "");
  const n = glitchLevel(traits);
  return n ? `${base} (Glitching ${n})` : base;
}

/** Items tagged by name before 1.6 ("... (Glitching 2)", no trait): the trait to give them. */
function traitFromOldName(name, traits) {
  if (glitchLevel(traits)) return null;
  const m = String(name ?? "").match(TAG);
  const slug = m ? `glitching-${Number(m[1])}` : null;
  return slug && traitExists(slug) ? slug : null;
}

Hooks.on("preCreateItem", (item) => {
  let traits = item._source.system?.traits?.value;
  const converted = traitFromOldName(item.name, traits);
  if (converted) {
    traits = [...(traits ?? []), converted];
    item.updateSource({ "system.traits.value": traits });
  }
  const name = syncedName(item.name, traits);
  if (name !== item.name) item.updateSource({ name });
});

Hooks.on("preUpdateItem", (item, changes) => {
  const traits =
    foundry.utils.getProperty(changes, "system.traits.value") ??
    changes["system.traits.value"] ??
    item.system?.traits?.value;
  const currentName = changes.name ?? item.name;
  const name = syncedName(currentName, traits);
  if (name !== currentName) changes.name = name;
});

// When the GM loads the world: convert old name-tagged items to traits, and bring every
// glitching item's name in line with its trait (world items and actor inventories).
Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  const fix = (i) => {
    let traits = i.system?.traits?.value ?? [];
    const converted = traitFromOldName(i.name, traits);
    if (converted) traits = [...traits, converted];
    const name = syncedName(i.name, traits);
    if (!converted && name === i.name) return null;
    return converted ? { _id: i.id, name, "system.traits.value": traits } : { _id: i.id, name };
  };

  for (const i of game.items) {
    const u = fix(i);
    if (u) await i.update(u);
  }
  for (const actor of game.actors) {
    const updates = actor.items.map(fix).filter(Boolean);
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  }
});
