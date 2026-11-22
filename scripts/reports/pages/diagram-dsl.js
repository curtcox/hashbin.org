// The diagram definition language: reserved words and the parser. No DOM access, so it can
// be tested and reused on its own.

// -----------------------------
// Reserved vocab
// -----------------------------
export const NODE_SIZES = ["tiny", "small", "normal", "big", "bigger", "huge"];
export const NODE_SHAPES = ["none", "circle", "square", "diamond", "triangle", "hex"];
export const EDGE_STYLES = ["solid", "dashed", "dotted", "bold"];

export const COLORS = {
  gray:   "#9aa4b2",
  black:  "#1f2937",
  white:  "#f8fafc",
  red:    "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  green:  "#22c55e",
  teal:   "#14b8a6",
  blue:   "#3b82f6",
  purple: "#a855f7",
  pink:   "#ec4899",
  brown:  "#92400e",
};

// -----------------------------
// Parsing DSL
// -----------------------------
function stripInlineComment(line) {
  const t = line.trim();
  if (!t) return "";
  if (t.startsWith("#")) return "";
  // Inline: treat first " #" as comment start (space before #)
  const idx = line.search(/\s#/);
  if (idx >= 0) return line.slice(0, idx).trimEnd();
  return line.trimEnd();
}

function splitWS(s) {
  return s.trim().length ? s.trim().split(/\s+/) : [];
}

function looksLikeUrlToken(tok) {
  if (!tok) return false;
  if (tok.startsWith("/")) return true;
  if (tok.startsWith("http://") || tok.startsWith("https://")) return true;
  if (tok.startsWith("mailto:")) return true;
  if (tok.startsWith("www.")) return true;
  return false;
}

function normalizeUrl(tok) {
  if (!tok) return "";
  if (tok.startsWith("/")) return "https://" + tok.slice(1);
  if (tok.startsWith("www.")) return "https://" + tok;
  return tok;
}

function isValidId(id) {
  // Keep it simple; allow common graph ids
  return /^[A-Za-z0-9_:-]+$/.test(id);
}

function parseAttrs(tokens, kind) {
  // Order: style, color, url, text
  // But each optional, so we detect by reserved sets.
  let i = 0;

  let size = "";
  let style = "";
  let color = "";
  let url = "";
  let text = "";

  if (tokens[i]) {
    if (kind === "node") {
      if (NODE_SIZES.includes(tokens[i])) {
        size = tokens[i++];
      }
      if (tokens[i] && NODE_SHAPES.includes(tokens[i])) {
        style = tokens[i++]; // shape
      }
    } else if (kind === "edge") {
      if (NODE_SIZES.includes(tokens[i])) {
        size = tokens[i++];
      }
      if (tokens[i] && EDGE_STYLES.includes(tokens[i])) {
        style = tokens[i++]; // line style
      }
    }
  }

  if (tokens[i] && Object.prototype.hasOwnProperty.call(COLORS, tokens[i])) {
    color = tokens[i++];
  }

  if (tokens[i] && looksLikeUrlToken(tokens[i])) {
    url = normalizeUrl(tokens[i++]);
  }

  if (i < tokens.length) {
    text = tokens.slice(i).join(" ");
  }

  return { size, style, color, url, text };
}

export function parseSource(src) {
  const nodes = new Map(); // id -> {id, size, shape, color, url, text}
  const edges = [];        // {from,to, size,style,color,url,text, key}
  let background = "";

  const errors = [];
  const lines = src.split(/\r?\n/);

  function ensureNode(id) {
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        size: "normal",
        shape: "circle",
        color: "gray",
        url: "",
        text: "",
      });
    }
    return nodes.get(id);
  }

  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const raw = lines[lineNo];
    const line = stripInlineComment(raw);
    if (!line.trim()) continue;

    const trimmed = line.trim();
    if (Object.prototype.hasOwnProperty.call(COLORS, trimmed)) {
      background = trimmed;
      continue;
    }

    if (line.includes("->")) {
      // Edge line (possibly chain)
      const segs = line.split("->").map(s => s.trim()).filter(Boolean);
      if (segs.length < 2) {
        errors.push(`Line ${lineNo+1}: malformed edge line`);
        continue;
      }

      // Last segment may contain attrs after the last node id
      const lastTokens = splitWS(segs[segs.length - 1]);
      if (lastTokens.length === 0) {
        errors.push(`Line ${lineNo+1}: missing last node id`);
        continue;
      }

      const chainIds = [];
      for (let i = 0; i < segs.length - 1; i++) {
        const tok = splitWS(segs[i])[0];
        if (!tok || !isValidId(tok)) {
          errors.push(`Line ${lineNo+1}: invalid node id "${tok || segs[i]}"`);
          continue;
        }
        chainIds.push(tok);
      }

      const lastId = lastTokens[0];
      if (!isValidId(lastId)) {
        errors.push(`Line ${lineNo+1}: invalid node id "${lastId}"`);
        continue;
      }
      chainIds.push(lastId);

      const attrs = parseAttrs(lastTokens.slice(1), "edge");
      // Apply to every edge in chain
      for (let i = 0; i < chainIds.length - 1; i++) {
        const from = chainIds[i];
        const to = chainIds[i + 1];
        ensureNode(from);
        ensureNode(to);

        edges.push({
          from, to,
          size: attrs.size || "normal",
          style: attrs.style || "solid",
          color: attrs.color || "gray",
          url: attrs.url || "",
          text: attrs.text || "",
          key: `${from}->${to}#${edges.length}` // allow duplicates
        });
      }
    } else {
      // Node line
      const tokens = splitWS(line);
      const id = tokens[0];
      if (!id || !isValidId(id)) {
        errors.push(`Line ${lineNo+1}: invalid node id "${id || line}"`);
        continue;
      }
      const attrs = parseAttrs(tokens.slice(1), "node");
      const n = ensureNode(id);
      if (attrs.size) n.size = attrs.size;
      if (attrs.style) n.shape = attrs.style;
      if (attrs.color) n.color = attrs.color;
      if (attrs.url) n.url = attrs.url;
      if (attrs.text) n.text = attrs.text;
      // If attrs.text is empty, we keep prior text (so a later "id" line won't wipe it accidentally).
    }
  }

  // Prune accidental empty duplicates? We'll just keep as parsed.

  return { nodes, edges, background, errors };
}
