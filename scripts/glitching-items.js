// Glitching Items — Foundry VTT v12–v14, SF2e
// Mark an item with a Glitching N trait (registered by this module in module.json).
// The item's name shows the value automatically, e.g. "Battery (Glitching 2)".
// When the item is used, a DC (5 + N) flat check is rolled in chat.
//  - Critical success: the item's glitching value drops by 1 (trait removed at 0).
//  - Failure: the DCs on the item's card drop by N (setting "Apply glitch results to cards").
//  - Critical failure: the item's buttons and check links on its card are shown to the GM
//    only (same setting); a consumable is used up (setting "Consume on crit failures"), with
//    a GM-only Restore button.
// Cards the module can't treat as a use (an item's check posted to chat) get a
// "Roll Glitch Check" button instead.

import {
  lowerSaveDcLabel, isItemDescriptionCard, glitchingLinks, lowerInlineCheckDcs
} from "./card-edits.js";

const MODULE_ID = "sf2e-glitching-items";
const DEBOUNCE_MS = 4000;          // duplicate item/activation cards within this window count once
const DELETED_CAP = 50;            // deleted glitching items remembered (until reload)
const recent = new Map();
const deleted = new Map();         // uuid -> { source, actor }

const TRAIT = /^glitching-(\d+)$/;
const RESTORE_BUTTON_RE = /<button\b[^>]*\bdata-glitch-restore\b[^>]*>[\s\S]*?<\/button>/;
// Buttons hidden from players on a critically failed card (Apply Damage/Healing is drawn at render time).
const CRIT_FAIL_BUTTONS = ".damage-application, [data-action='roll-area-save'], [data-action='roll-area-damage']";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "modifyCards", {
    name: "Apply glitch results to cards",
    hint: "On a failure, lower the DCs on the item's card. On a critical failure, remove the item's save, damage, healing and check buttons. When off, results are only posted in chat.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(MODULE_ID, "consumeOnCritFail", {
    name: "Consume on crit failures",
    hint: "A glitching consumable (e.g. a grenade) that critically fails is used up. The GM gets a Restore button on the check card.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // v13+ passes an HTMLElement to renderChatMessageHTML; v12 passes jQuery to renderChatMessage.
  if (foundry.utils.isNewerVersion(game.version, "13")) {
    Hooks.on("renderChatMessageHTML", (message, html) => onRenderMessage(message, html));
  } else {
    Hooks.on("renderChatMessage", (message, html) => onRenderMessage(message, html?.[0] ?? html));
  }
});

const setting = (key) => game.settings.get(MODULE_ID, key);

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

// Is "glitching-N" a trait the system knows about?
function traitExists(slug) {
  const cfg = CONFIG[game.system.id.toUpperCase()] ?? CONFIG.PF2E ?? {};
  return ["weaponTraits", "equipmentTraits", "consumableTraits", "armorTraits", "shieldTraits"]
    .some((k) => cfg[k] && slug in cfg[k]);
}

function findItem(message) {
  let item = null;
  try { item = message.item ?? null; } catch { /* item getter can throw on stale data */ }
  if (item) return item;
  const uuid = message.flags?.[game.system.id]?.origin?.uuid;
  if (!uuid) return null;
  item = fromUuidSync(uuid);
  if (item) return item;
  // Consumables used up on use are deleted before their card is posted.
  return fromDeletedCache(uuid);
}

/** Remember glitching items as they're deleted, so their use card can still be checked. */
Hooks.on("preDeleteItem", (item) => {
  if (!glitchInfo(item)) return;
  deleted.delete(item.uuid);
  deleted.set(item.uuid, { source: item.toObject(), actor: item.actor ?? null });
  while (deleted.size > DELETED_CAP) deleted.delete(deleted.keys().next().value);
});

function fromDeletedCache(uuid) {
  const entry = deleted.get(uuid);
  if (!entry) return null;
  try {
    const item = new Item.implementation(entry.source, { parent: entry.actor });
    item.glitchDeleted = true;      // never write back to it
    return item;
  } catch (err) {
    console.error(`${MODULE_ID} | couldn't rebuild deleted item`, err);
    return null;
  }
}

function degreeOf(die, dc) {
  let d = die >= dc + 10 ? 3 : die >= dc ? 2 : die <= dc - 10 ? 0 : 1;
  if (die === 20) d = Math.min(3, d + 1);
  if (die === 1) d = Math.max(0, d - 1);
  return d;
}

const OUTCOME = [
  { label: "Critical Failure", color: "#b00", text: "The item failed to function." },
  { label: "Failure", color: "#c60", text: "Item penalty equal to the glitching value ({n}) to checks and DCs for this use." },
  { label: "Success", color: "#28a", text: "The item works normally." },
  { label: "Critical Success", color: "#2a2", text: "Works normally, and the item's glitching value drops by 1." }
];

async function rollCheck(n) {
  const dc = 5 + n;
  const roll = await new Roll("1d20").evaluate();
  const deg = degreeOf(roll.total, dc);
  return { roll, dc, deg, outcome: OUTCOME[deg] };
}

function checkFlavor({ n, name, dc, outcome, notes = [], extraHtml = "" }) {
  return `<strong>Glitching ${n}</strong> flat check — ${name} (DC ${dc})
      <div style="color:${outcome.color};font-weight:bold;margin-top:4px">${outcome.label}</div>
      <div>${outcome.text.replaceAll("{n}", n)}</div>${notes.map((t) => `<div style="margin-top:4px"><em>${t}</em></div>`).join("")}${extraHtml}`;
}

Hooks.on("createChatMessage", async (message) => {
  // A "Roll Glitch Check" result: applied by one client to the card it came from.
  if (message.flags?.[MODULE_ID]?.manual) return applyManualResult(message);

  // Run only on the client that created the message, so the check is rolled once
  if (message.author?.id !== game.user.id) return;
  if (message.flags?.[MODULE_ID]) return;

  const item = findItem(message);
  const info = glitchInfo(item);
  if (!info?.n) return;

  // Not a use of the item: damage rolls (part of the Strike/Area Fire already checked),
  // a target's save against it, damage applied to a target, flat checks,
  // and the item's description posted to chat. Only the item's holder "uses" it.
  const sys = game.system.id;
  const ctxType = message.flags?.[sys]?.context?.type;
  if (["damage-roll", "saving-throw", "damage-taken", "flat-check"].includes(ctxType)) return;
  if (item.actor && message.actor && message.actor.id !== item.actor.id) return;
  if (isItemDescriptionCard(message.content)) return;
  const n = info.n;

  // Decide whether this card is a new "use" of the item:
  //  - attack rolls: every Strike is a use, always check (MAP attacks back to back)
  //  - anything else (Area Fire, item card, activation): short debounce so
  //    duplicate cards from one use count once
  const key = item.uuid;
  const now = Date.now();
  const last = recent.get(key) ?? 0;
  if (ctxType !== "attack-roll" && now - last < DEBOUNCE_MS) return;
  recent.set(key, now);

  const { roll, dc, deg, outcome } = await rollCheck(n);
  const name = foundry.utils.escapeHTML(item.name);
  const qty = item.system?.quantity ?? 1;
  const usedUp = isConsumable(item);
  const notes = [];
  const checkFlags = { check: true };

  // Critical success: work out what happens to the item before posting, so the card can say so.
  if (deg === 3 && item.isOwner && !item.glitchDeleted) {
    const lowerText = n > 1 ? `Glitching ${n - 1}` : "no longer glitching";
    if (usedUp) { if (qty > 1) notes.push("This one was used up. The rest of the stack is still glitching."); }
    else if (qty === 1) notes.push(n > 1 ? `Lowered to ${lowerText}.` : "No longer glitching.");
  }

  // Failure / critical failure: change the item's card itself.
  if (deg <= 1 && setting("modifyCards") && !message.flags?.[MODULE_ID]?.applied) {
    try {
      await applyToUseCard(message, item, deg, n);
    } catch (err) {
      console.error(`${MODULE_ID} | couldn't update the item's card`, err);
    }
  }

  // Critical failure on a consumable: it's used up, and the GM can restore it.
  //  - Already used up by the system (a consumable's own use card, e.g. a Medpatch): don't take another.
  //  - Otherwise (Area Fire with a grenade): use it up now, if the setting is on.
  let consumeNow = false;
  if (deg === 0 && usedUp) {
    const systemUsedUp = item.glitchDeleted || (!ctxType && item.type === "consumable");
    consumeNow = !systemUsedUp && setting("consumeOnCritFail") && item.isOwner;
    if (systemUsedUp || consumeNow) {
      checkFlags.restore = { actorUuid: item.actor?.uuid ?? null, itemId: item.id, name: item.name, source: item.toObject(), restored: false };
    }
  }
  const extraHtml = checkFlags.restore
    ? `<div style="margin-top:4px"><em>${name} has been consumed.</em></div>
      <button type="button" data-glitch-restore>Restore ${name}</button>`
    : "";

  await roll.toMessage({
    speaker: message.speaker,
    flavor: checkFlavor({ n, name, dc, outcome, notes, extraHtml }),
    flags: { [MODULE_ID]: checkFlags }
  });

  if (consumeNow) {
    try {
      if (qty > 1) await item.update({ "system.quantity": qty - 1 });
      else await item.delete();
    } catch (err) {
      console.error(`${MODULE_ID} | couldn't consume the item`, err);
    }
    return;
  }

  // Critical success lowers the glitch. Consumables (grenades etc.) are used up, so nothing to fix.
  if (deg === 3 && item.isOwner && !usedUp && !item.glitchDeleted) await lowerItemGlitch(item, info);
});

/**
 * Failure: lower the card's stored DC (Area Fire, Auto-Fire, …) and the item's inline check DCs by n.
 * Critical failure: the card is only flagged. At render, its save/damage/healing buttons and the
 * item's check links are hidden from players and marked as GM-only for the GM.
 */
async function applyToUseCard(message, item, deg, n) {
  const sys = game.system.id;
  const oldDc = message.flags?.[sys]?.context?.dc?.value;
  // Only a prompt card's DC (Area Fire, Auto-Fire: no rolls) belongs to the item.
  // On a rolled check (a Strike) the stored DC is the target's defense, e.g. AC.
  const hasDc = Number.isFinite(oldDc) && !(message.rolls?.length);
  const update = {};
  let content = message.content ?? "";

  if (deg === 1) {
    if (hasDc) {
      update[`flags.${sys}.context.dc.value`] = oldDc - n;
      content = lowerSaveDcLabel(content, oldDc, oldDc - n, n);
    }
    content = lowerInlineCheckDcs(content, n, item.uuid);
    if (!hasDc && content === message.content) return;   // nothing on this card the module can lower
  }

  if (content !== message.content) update.content = content;
  update[`flags.${MODULE_ID}.applied`] = {
    result: deg === 0 ? "criticalFailure" : "failure",
    originalDC: hasDc ? oldDc : null,
    itemUuid: item.uuid
  };
  await message.update(update);
}

// ---------------------------------------------------------------------------
// Rendering: GM-only buttons on critical failure, GM-only Restore button, Roll Glitch Check button.
// ---------------------------------------------------------------------------
function onRenderMessage(message, root) {
  if (!root?.querySelector) return;
  const flags = message.flags?.[MODULE_ID];

  if (flags?.applied?.result === "criticalFailure") gmOnlyCritFailControls(root, flags.applied.itemUuid);

  bindRestoreButton(message, root);
  addManualCheckButton(message, root);
}

/**
 * Critical failure: the item doesn't function, so its buttons and check links are removed for
 * players. The GM still sees them (dashed outline) to override the result if needed.
 * itemUuid null (Roll Glitch Check): every glitching check link on the card.
 */
function gmOnlyCritFailControls(root, itemUuid) {
  const links = itemUuid
    ? `a.inline-check[data-item-uuid="${CSS.escape(itemUuid)}"]`
    : `a.inline-check[data-pf2-traits*="glitching-"]`;
  root.querySelectorAll(`${CRIT_FAIL_BUTTONS}, ${links}`).forEach((el) => {
    if (!game.user.isGM) return el.remove();
    el.classList.add("glitching-gm-only");
    el.style.outline = "1px dashed var(--color-level-error, #c00)";
    el.title = "Glitched (critical failure): only the GM sees this.";
  });
}

function appendToContent(root, html) {
  const content = root.querySelector(".message-content");
  if (!content) return null;
  const div = document.createElement("div");
  div.innerHTML = html;
  content.append(div);
  return div;
}

function bindRestoreButton(message, root) {
  const button = root.querySelector("[data-glitch-restore]");
  if (!button) return;
  const r = message.flags?.[MODULE_ID]?.restore;
  if (!r || r.restored || !game.user.isGM) {
    button.remove();
    return;
  }
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    button.disabled = true;
    try {
      await restoreItem(message);
    } catch (err) {
      console.error(`${MODULE_ID} | couldn't restore the item`, err);
      ui.notifications.error(`Couldn't restore ${r.name}. See the console for details.`);
      button.disabled = false;
    }
  });
}

async function restoreItem(message) {
  const r = message.flags?.[MODULE_ID]?.restore;
  if (!r || r.restored) return;
  const actor = r.actorUuid ? fromUuidSync(r.actorUuid) : null;
  if (!actor) throw new Error(`actor ${r.actorUuid} not found`);

  const existing = actor.items.get(r.itemId);
  if (existing) {
    await existing.update({ "system.quantity": (existing.system?.quantity ?? 0) + 1 });
  } else {
    const data = foundry.utils.deepClone(r.source);
    data.system ??= {};
    data.system.quantity = 1;
    let created = await Item.implementation.create(data, { parent: actor, keepId: true }).catch(() => null);
    if (!created) {
      delete data._id;
      created = await Item.implementation.create(data, { parent: actor });
    }
    if (!created) throw new Error("item creation failed");
  }

  await message.update({
    flavor: String(message.flavor ?? "").replace(RESTORE_BUTTON_RE, `<em>${foundry.utils.escapeHTML(r.name)} restored.</em>`),
    [`flags.${MODULE_ID}.restore.restored`]: true
  });
}

/**
 * Cards with a glitching item's check link that the module doesn't check by itself
 * (a check posted to chat, an item description) get a "Roll Glitch Check" button.
 */
function addManualCheckButton(message, root) {
  const flags = message.flags?.[MODULE_ID];
  if (flags?.check) return;
  const autoChecked = message.flags?.[game.system.id]?.origin && !isItemDescriptionCard(message.content);
  if (autoChecked) return;
  const link = glitchingLinks(message.content)[0];
  if (!link) return;

  if (flags?.manual) {
    appendToContent(root, `<p class="glitching-manual"><em>Glitch check: ${foundry.utils.escapeHTML(flags.manual.result)}</em></p>`);
    return;
  }
  const div = appendToContent(root, `<button type="button" class="glitching-manual" data-glitch-manual>Roll Glitch Check</button>`);
  const button = div?.querySelector("button");
  button?.addEventListener("click", async (event) => {
    event.preventDefault();
    button.disabled = true;
    try {
      await rollManualCheck(message, link);
    } catch (err) {
      console.error(`${MODULE_ID} | couldn't roll the glitch check`, err);
      button.disabled = false;
    }
  });
}

async function rollManualCheck(message, link) {
  const item = link.itemUuid ? fromUuidSync(link.itemUuid) : null;
  const name = foundry.utils.escapeHTML(item?.name ?? "Glitching item");
  const { roll, dc, deg, outcome } = await rollCheck(link.n);
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker(),
    flavor: checkFlavor({ n: link.n, name, dc, outcome }),
    flags: { [MODULE_ID]: { check: true, manual: { promptId: message.id, n: link.n, itemUuid: link.itemUuid, deg } } }
  });
}

/**
 * Apply a "Roll Glitch Check" result to the card it came from. Runs on one client only:
 * the active GM, or the card's author when no GM is online (they're the ones allowed to edit it).
 */
async function applyManualResult(checkMessage) {
  const { promptId, n, itemUuid, deg } = checkMessage.flags[MODULE_ID].manual;
  const prompt = game.messages.get(promptId);
  if (!prompt) return;
  const gm = game.users.activeGM;
  if (gm ? !gm.isSelf : !prompt.isAuthor) return;
  if (prompt.flags?.[MODULE_ID]?.manual) return;       // one check per card

  const update = {};
  let result = OUTCOME[deg].label;
  if (deg <= 1 && setting("modifyCards")) {
    if (deg === 1) {
      update.content = lowerInlineCheckDcs(prompt.content, n, null);
    } else {
      update[`flags.${MODULE_ID}.applied`] = { result: "criticalFailure", originalDC: null, itemUuid: null };
    }
  }
  update[`flags.${MODULE_ID}.manual`] = { result, checkId: checkMessage.id };

  try {
    await prompt.update(update);
    if (deg === 3 && itemUuid) {
      const item = fromUuidSync(itemUuid);
      const info = glitchInfo(item);
      if (item?.isOwner && info && !isConsumable(item)) await lowerItemGlitch(item, info);
    }
  } catch (err) {
    console.error(`${MODULE_ID} | couldn't apply the glitch check`, err);
  }
}

// ---------------------------------------------------------------------------
// Item helpers
// ---------------------------------------------------------------------------

/** Grenades and other one-shot items: the one that rolled is gone after use. */
function isConsumable(item) {
  if (item.isOfType?.("consumable")) return true;
  const traits = item.system?.traits?.value ?? [];
  return traits.includes("consumable") || traits.includes("grenade");
}

/** Critical success: lower the item's glitching value by 1. A stack splits off the lucky one. */
async function lowerItemGlitch(item, info) {
  const n = info.n;
  const qty = item.system?.quantity ?? 1;
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
}

/** Lower the glitching value by 1 on item source data. The name follows via the hooks below. */
function lowerGlitch(data, info, n) {
  const lower = `glitching-${n - 1}`;
  const traits = (data.system.traits?.value ?? []).filter((t) => t !== info.trait);
  if (n > 1 && traitExists(lower)) traits.push(lower);
  data.system.traits ??= {};
  data.system.traits.value = traits;
  // Rename the source data too, so a split-off copy is created with the right name
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

Hooks.on("preCreateItem", (item) => {
  const name = syncedName(item.name, item._source.system?.traits?.value);
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
