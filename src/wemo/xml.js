// -----------------------------------------------------------------------------
// Minimal XML helpers.
//
// Wemo devices answer small, flat, predictable XML documents (setup.xml and
// SOAP envelopes). A full XML parser would be a second runtime dependency for
// a handful of tags, so we read them with anchored regular expressions. Every
// value read here comes from the LAN: it is treated as untrusted text, never
// evaluated, and always length-bounded by the caller.
// -----------------------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/**
 * Decode the five predefined XML entities and the numeric ones.
 * @param {string} text
 */
export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code =
        entity[1].toLowerCase() === 'x'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * Inner text of the first `<tag>` element (namespace prefix ignored), decoded,
 * or `undefined` when the tag is absent.
 * @param {string} xml
 * @param {string} tag local name, e.g. "BinaryState"
 */
export function readTag(xml, tag) {
  const name = tag.replace(/[^A-Za-z0-9_.-]/g, '');
  const match = new RegExp(
    `<(?:[A-Za-z0-9_-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_-]+:)?${name}>`,
  ).exec(String(xml));
  return match ? decodeEntities(match[1]).trim() : undefined;
}

/** Escape a value written into a SOAP body. */
export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
