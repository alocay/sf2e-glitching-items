// Glitching Items — Foundry VTT v12/v13
// Tag an item either way:
//   - a homebrew trait "Glitching N" (slug glitching-N), added under
//     System Settings > Homebrew Elements (Weapon Traits and/or Equipment Traits), or
//   - "Glitching N" anywhere in its name, e.g. "Commercial Frag Grenade (Glitching 1)"
// When that item posts a chat card, a DC (5 + N) flat check is rolled in chat.
// On a critical success the item's glitching value drops by 1 (tag removed at 0).

const MODULE_ID = "glitching-items";
const TAG = /\(?\s*glitching[\s-]*(\d+)\s*\)?/i;
const DEBOUNCE_MS = 4000;          // duplicate item/activation cards within this window count once
const DAMAGE_WINDOW_MS = 120000;   // a damage roll within 2 min of a check belongs to that use
const recent = new Map();

const TRAIT = /^glitching-(\d+)$/;

// Returns { n, source: "trait" | "name" } or null. A trait wins over a name tag.
function glitchInfo(item) {
  if (!item) return null;
  const traits = item.system?.traits?.value ?? [];
  for (const t of traits) {
    const m = String(t).match(TRAIT);
    if (m) return { n: Number(m[1]), source: "trait", trait: t };
  }
  const m = item.name?.match(TAG);
  return m ? { n: Number(m[1]), source: "name" } : null;
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

  await roll.toMessage({
    speaker: message.speaker,
    flavor: `<strong>Glitching ${n}</strong> flat check — ${foundry.utils.escapeHTML(item.name)} (DC ${dc})
      <div style="color:${o.color};font-weight:bold;margin-top:4px">${o.label}</div>
      <div>${o.text.replaceAll("{n}", n)}</div>`,
    flags: { [MODULE_ID]: { check: true } }
  });

  // Critical success: reduce the tag on the item
  // (skipped for stacks, so one lucky grenade doesn't fix the whole stack)
  const qty = item.system?.quantity ?? 1;
  if (deg === 3 && item.isOwner && qty <= 1) {
    if (info.source === "trait") {
      const lower = `glitching-${n - 1}`;
      const traits = item.system.traits.value.filter((t) => t !== info.trait);
      if (n > 1 && traitExists(lower)) traits.push(lower);
      await item.update({ "system.traits.value": traits });
    } else {
      const newName = n > 1
        ? item.name.replace(TAG, (m) => m.replace(/\d+/, String(n - 1)))
        : item.name.replace(TAG, "").replace(/\s{2,}/g, " ").trim();
      await item.update({ name: newName });
    }
  }
});

// ---------------------------------------------------------------------------
// Keep " (Glitching)" in the name of any item that has a Glitching N trait.
// The number lives on the trait only; the suffix is added/removed automatically.
// ---------------------------------------------------------------------------
const SUFFIX = " (Glitching)";
const SUFFIX_RE = /\s*\(glitching\)\s*$/i;

function hasGlitchTrait(traits) {
  return Array.isArray(traits) && traits.some((t) => TRAIT.test(String(t)));
}

function syncedName(name, glitching) {
  const base = String(name ?? "").replace(SUFFIX_RE, "");
  return glitching ? base + SUFFIX : base;
}

Hooks.on("preCreateItem", (item, data) => {
  const traits = item._source.system?.traits?.value;
  if (!hasGlitchTrait(traits) && !SUFFIX_RE.test(item.name)) return;
  const name = syncedName(item.name, hasGlitchTrait(traits));
  if (name !== item.name) item.updateSource({ name });
});

Hooks.on("preUpdateItem", (item, changes) => {
  const traits =
    foundry.utils.getProperty(changes, "system.traits.value") ??
    changes["system.traits.value"] ??
    item.system?.traits?.value;
  const currentName = changes.name ?? item.name;
  const name = syncedName(currentName, hasGlitchTrait(traits));
  if (name !== currentName) changes.name = name;
});

// One-time pass when the GM loads the world: fix names of items that already
// had a Glitching trait before this version (world items and actor inventories).
Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  const needsFix = (i) => syncedName(i.name, hasGlitchTrait(i.system?.traits?.value)) !== i.name;

  const worldItems = game.items.filter(needsFix);
  for (const i of worldItems) await i.update({ name: syncedName(i.name, hasGlitchTrait(i.system?.traits?.value)) });

  for (const actor of game.actors) {
    const updates = actor.items.filter(needsFix).map((i) => ({
      _id: i.id,
      name: syncedName(i.name, hasGlitchTrait(i.system?.traits?.value))
    }));
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  }
});
