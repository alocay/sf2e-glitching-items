// Pure HTML helpers for editing system chat cards. No Foundry globals here.

const MINUS = "−";

/** Regex matching a whole <button> element with the given data-action. */
function buttonRe(action) {
  return new RegExp(`<button\\b[^>]*\\bdata-action="${action}"[^>]*>[\\s\\S]*?</button>`, "g");
}

/** Lower the DC shown on the Area Fire save button and mark it as glitched. */
export function lowerSaveDcLabel(html, oldDc, newDc, n) {
  return String(html ?? "").replace(buttonRe("roll-area-save"), (button) => {
    const open = button.indexOf(">") + 1;
    const close = button.lastIndexOf("</button>");
    let label = button.slice(open, close).replace(new RegExp(`\\bDC ${oldDc}\\b`), `DC ${newDc}`);
    label = label.replace(/(\s*)$/, ` (Glitching ${MINUS}${n})$1`);
    return button.slice(0, open) + label + "</button>";
  });
}

/** Remove every button whose data-action is in `actions`. */
export function removeButtons(html, actions) {
  let out = String(html ?? "");
  for (const action of actions) out = out.replace(buttonRe(action), "");
  return out;
}

/** Append an italic note to the end of a card. */
export function appendNote(html, noteHtml) {
  return `${html ?? ""}<p class="glitching-note"><em>${noteHtml}</em></p>`;
}

// ---------------------------------------------------------------------------
// Inline check links: <a class="inline-check" data-pf2-dc="20" data-item-uuid="…"
//   data-pf2-traits="glitching-1,tech">…DC 20…</a>
// ---------------------------------------------------------------------------
const ANCHOR_RE = /<a\b[^>]*>[\s\S]*?<\/a>/g;

function attr(openTag, name) {
  const m = openTag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function parseLink(anchor) {
  const openTag = anchor.slice(0, anchor.indexOf(">") + 1);
  if (!/\bclass="[^"]*\binline-check\b/.test(openTag)) return null;
  const rawDc = attr(openTag, "data-pf2-dc");
  const dc = rawDc === null || rawDc === "" || !Number.isFinite(Number(rawDc)) ? null : Number(rawDc);
  const traits = (attr(openTag, "data-pf2-traits") ?? "").split(",");
  const g = traits.map((t) => t.trim().match(/^glitching-(\d+)$/)).find(Boolean);
  return { dc, n: g ? Number(g[1]) : 0, itemUuid: attr(openTag, "data-item-uuid") };
}

/** A link matches the item uuid when given, otherwise when it carries a glitching trait. */
function linkMatches(link, itemUuid) {
  return itemUuid ? link.itemUuid === itemUuid : link.n > 0;
}

/** Inline check links that carry a Glitching N trait: [{ n, dc, itemUuid }]. */
export function glitchingLinks(html) {
  const out = [];
  for (const [anchor] of String(html ?? "").matchAll(ANCHOR_RE)) {
    const link = parseLink(anchor);
    if (link?.n) out.push({ n: link.n, dc: link.dc, itemUuid: link.itemUuid });
  }
  return out;
}

/** Lower the DC of matching inline check links by n (attribute and visible label). */
export function lowerInlineCheckDcs(html, n, itemUuid = null) {
  return String(html ?? "").replace(ANCHOR_RE, (anchor) => {
    const link = parseLink(anchor);
    if (!link || link.dc === null || !linkMatches(link, itemUuid)) return anchor;
    const newDc = link.dc - n;
    return anchor
      .replace(`data-pf2-dc="${link.dc}"`, `data-pf2-dc="${newDc}"`)
      .replace(new RegExp(`\\bDC ${link.dc}\\b`), `DC ${newDc} (Glitching ${MINUS}${n})`);
  });
}

/** Remove matching inline check links. */
export function removeInlineChecks(html, itemUuid = null) {
  return String(html ?? "").replace(ANCHOR_RE, (anchor) => {
    const link = parseLink(anchor);
    return link && linkMatches(link, itemUuid) ? "" : anchor;
  });
}

/** True for an item description card (an item posted to chat), which isn't a use. */
export function isItemDescriptionCard(html) {
  return /class="[^"]*\bitem-card\b[^"]*"/.test(String(html ?? ""));
}
