import { HashBinClient } from "./sdk/hashbin.js";

// -----------------------------
// HashBin saving (runs before the editor boots so a save that redirected restores the diagram first)
// -----------------------------
// The public client ID of the "HashBin Diagram Editor" app registered on hashbin.org. It isn't a secret:
// hashbin.org only returns saves to this page's registered address.
const CLIENT_ID = "app_92c56b62-d5bf-4d8c-8577-79c104adf401";

// ?api=, ?content= and ?client_id= point the page at a local dev server for testing. Only localhost is
// accepted, so a crafted link can't send someone's saves anywhere but hashbin.org.
function localOverride(name, fallback) {
  const value = new URLSearchParams(location.search).get(name);
  if (!value) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) return url.origin;
  } catch {
    // fall through to the default
  }
  return fallback;
}
const API_BASE = localOverride("api", "https://hashbin.org");
const CONTENT_BASE = localOverride("content", "https://256t.us");
const IS_LOCAL_API = API_BASE !== "https://hashbin.org";
const clientId = (IS_LOCAL_API && new URLSearchParams(location.search).get("client_id")) || CLIENT_ID;

// hashbin.org returns to exactly this address, so it keeps only the testing overrides from the query
function redirectUri() {
  const params = new URLSearchParams();
  const current = new URLSearchParams(location.search);
  if (IS_LOCAL_API) {
    for (const name of ["api", "content", "client_id"]) {
      if (current.get(name)) params.set(name, current.get(name));
    }
  }
  const query = params.toString();
  return location.origin + location.pathname + (query ? `?${query}` : "");
}

function storage(kind) {
  try { return window[kind]; } catch { return null; }
}

const saveProblem = !clientId ? "HashBin saving isn't set up for this page yet. Use diagram.html with an API key instead" : null;

// Each save is approved on hashbin.org (HashBin Publish), so this page, on the github.io origin it shares
// with every other project there, never holds a HashBin credential.
const hb = !saveProblem
  ? new HashBinClient({
      clientId,
      redirectUri: redirectUri(),
      baseUrl: API_BASE,
      contentBaseUrl: CONTENT_BASE,
      storage: storage("localStorage"),
      transactionStorage: storage("sessionStorage"),
    })
  : null;

function publishMessage(error) {
  if (error.message === "access_denied") return "The save was cancelled on HashBin.";
  if (error.message === "Publish window closed.") return "The HashBin window was closed before the save was approved.";
  return `Couldn't save to HashBin: ${error.message}`;
}

// Handles #hashbin_publish=… on the way back from a save that redirected (popups blocked), and puts back
// the diagram's URL from before the trip
async function completeRedirectSave() {
  if (!hb || !new URLSearchParams(location.hash.slice(1)).has("hashbin_publish")) return null;
  let result;
  try {
    const { cid, clientState } = await hb.handlePublishCallback({ hash: location.hash });
    result = { cid, ...clientState };
  } catch (error) {
    result = { error: publishMessage(error), ...error.clientState };
  }
  history.replaceState(null, "", redirectUri() + (result.hash || ""));
  return result;
}

// Earlier versions kept an OAuth sign-in in this origin's storage. Revoke it on hashbin.org, since clearing
// it alone would leave a copy another page took still valid. A failed revoke is retried on the next visit.
async function retireLegacySignIn() {
  if (!hb?.getTokens()?.refreshToken) return;
  try { await hb.disconnect(); } catch { /* retried on the next load */ }
}

const publishReturn = await completeRedirectSave();
retireLegacySignIn();

(() => {
  // -----------------------------
  // Reserved vocab
  // -----------------------------
  const NODE_SIZES = ["tiny", "small", "normal", "big", "bigger", "huge"];
  const NODE_SHAPES = ["none", "circle", "square", "diamond", "triangle", "hex"];
  const EDGE_STYLES = ["solid", "dashed", "dotted", "bold"];

  const COLORS = {
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
  // UI wiring
  // -----------------------------
  const $src = document.getElementById("src");
  const $svg = document.getElementById("svg");
  const $parseStatus = document.getElementById("parseStatus");
  const $hashStatus = document.getElementById("hashStatus");
  const $errorBox = document.getElementById("errorBox");
  const $savedState = document.getElementById("savedState");
  const $svgWrap = document.querySelector(".svgWrap");
  const $btnZoomOut = document.getElementById("btnZoomOut");
  const $btnZoomIn = document.getElementById("btnZoomIn");

  const $app = document.querySelector(".app");
  const $btnViewSource = document.getElementById("btnViewSource");
  const $btnViewDiagram = document.getElementById("btnViewDiagram");
  const $btnViewHelp = document.getElementById("btnViewHelp");
  const $btnViewSplit = document.getElementById("btnViewSplit");

  const $shapeList = document.getElementById("shapeList");
  const $sizeList = document.getElementById("sizeList");
  const $colorList = document.getElementById("colorList");
  const $lineStyleList = document.getElementById("lineStyleList");

  function fillList(ul, items, renderItem) {
    ul.innerHTML = "";
    for (const it of items) {
      const li = document.createElement("li");
      if (renderItem) renderItem(li, it);
      else li.textContent = it;
      ul.appendChild(li);
    }
  }

  function mkSwatch() {
    const s = document.createElement("span");
    s.className = "swatch";
    return s;
  }

  function setSvg(el, svg) {
    el.innerHTML = svg;
  }

  function shapeSvg(shape, stroke) {
    const s = stroke || "rgba(232,237,243,0.9)";
    const f = "rgba(232,237,243,0.15)";
    if (shape === "none") {
      return `<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg"><text x="12" y="9" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="10" font-weight="800" fill="${s}">Aa</text></svg>`;
    }
    if (shape === "circle") {
      return `<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="6" fill="${f}" stroke="${s}" stroke-width="2"/></svg>`;
    }
    if (shape === "square") {
      return `<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="2" width="12" height="12" rx="3" fill="${f}" stroke="${s}" stroke-width="2"/></svg>`;
    }
    if (shape === "diamond") {
      return `<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg"><polygon points="12,1 21,8 12,15 3,8" fill="${f}" stroke="${s}" stroke-width="2"/></svg>`;
    }
    if (shape === "triangle") {
      return `<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg"><polygon points="12,1 21,15 3,15" fill="${f}" stroke="${s}" stroke-width="2"/></svg>`;
    }
    if (shape === "hex") {
      return `<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg"><polygon points="7,1 17,1 22,8 17,15 7,15 2,8" fill="${f}" stroke="${s}" stroke-width="2"/></svg>`;
    }
    return `<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="6" fill="${f}" stroke="${s}" stroke-width="2"/></svg>`;
  }

  function lineSvg(style, stroke) {
    const s = stroke || "rgba(232,237,243,0.9)";
    const dash = (style === "dashed") ? "7 5" : (style === "dotted") ? "2 5" : "";
    const w = (style === "bold") ? 3.5 : 2.2;
    return `<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg"><line x1="2" y1="8" x2="22" y2="8" stroke="${s}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${dash}"/></svg>`;
  }

  fillList($shapeList, NODE_SHAPES, (li, shape) => {
    li.className = "sample";
    const sw = mkSwatch();
    setSvg(sw, shapeSvg(shape));
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = shape;
    li.appendChild(sw);
    li.appendChild(label);
  });

  fillList($sizeList, NODE_SIZES, (li, size) => {
    li.className = "sample";
    const sw = mkSwatch();
    const sc = nodeScale(size);
    const max = nodeScale("huge") || 1;
    const nsc = Math.max(0.06, Math.min(1, sc / max));
    const fontSize = 2.5 + 10.5 * nsc;
    setSvg(sw, `<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg"><text x="12" y="9" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="${fontSize}" font-weight="800" fill="rgba(232,237,243,0.9)">A</text></svg>`);
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = size;
    li.appendChild(sw);
    li.appendChild(label);
  });

  fillList($lineStyleList, EDGE_STYLES, (li, style) => {
    li.className = "sample";
    const sw = mkSwatch();
    setSvg(sw, lineSvg(style));
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = style;
    li.appendChild(sw);
    li.appendChild(label);
  });

  fillList($colorList, Object.keys(COLORS), (li, name) => {
    li.className = "sample";
    const sw = document.createElement("span");
    sw.className = "swatch color";
    sw.style.background = COLORS[name];
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = name;
    li.appendChild(sw);
    li.appendChild(label);
  });

  function setViewMode(mode) {
    $app.classList.remove("mode-source", "mode-diagram", "mode-help");
    if (mode === "source") $app.classList.add("mode-source");
    if (mode === "diagram") $app.classList.add("mode-diagram");
    if (mode === "help") $app.classList.add("mode-help");

    const is = (m) => mode === m;
    $btnViewSource.classList.toggle("active", is("source"));
    $btnViewDiagram.classList.toggle("active", is("diagram"));
    $btnViewHelp.classList.toggle("active", is("help"));
    $btnViewSplit.classList.toggle("active", is("split"));

    $btnViewSource.setAttribute("aria-pressed", String(is("source")));
    $btnViewDiagram.setAttribute("aria-pressed", String(is("diagram")));
    $btnViewHelp.setAttribute("aria-pressed", String(is("help")));
    $btnViewSplit.setAttribute("aria-pressed", String(is("split")));
  }

  $btnViewSource.addEventListener("click", () => setViewMode("source"));
  $btnViewDiagram.addEventListener("click", () => setViewMode("diagram"));
  $btnViewHelp.addEventListener("click", () => setViewMode("help"));
  $btnViewSplit.addEventListener("click", () => setViewMode("split"));

  setViewMode("split");

  document.getElementById("btnCopy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      flashStatus("Copied URL", "ok");
    } catch {
      // Fallback
      const tmp = document.createElement("textarea");
      tmp.value = location.href;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand("copy");
      document.body.removeChild(tmp);
      flashStatus("Copied URL (fallback)", "ok");
    }
  });

  document.getElementById("btnReset").addEventListener("click", () => {
    saved = null;
    applyState(makeDefaultState(), { replace: true });
    renderAll();
    syncHash({ replace: true });
  });

  document.getElementById("btnCommit").addEventListener("click", () => {
    syncHash({ replace: false }); // pushState for milestone
    flashStatus("Committed snapshot", "ok");
  });

  function flashStatus(text, kind) {
    const prev = $parseStatus.textContent;
    const prevClass = $parseStatus.className;
    $parseStatus.textContent = text;
    $parseStatus.className = (kind === "err") ? "err" : (kind === "warn") ? "warn" : "ok";
    setTimeout(() => {
      $parseStatus.textContent = prev;
      $parseStatus.className = prevClass;
    }, 900);
  }

  // -----------------------------
  // Hash state encoding (all state in URL fragment)
  // -----------------------------
  // State = { src: string, pos: { [nodeId]: [x,y] } }
  const HASH_PREFIX = "h1=";

  function bytesToBase64Url(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);
    return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }

  function base64UrlToBytes(b64url) {
    const padLen = (4 - (b64url.length % 4)) % 4;
    const b64 = (b64url + "====".slice(0, padLen)).replaceAll("-", "+").replaceAll("_", "/");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function encodeState(state) {
    const json = JSON.stringify(state);
    const bytes = new TextEncoder().encode(json);
    return HASH_PREFIX + bytesToBase64Url(bytes);
    // Note: for very large diagrams you may want compression,
    // but this keeps the file dependency-free.
  }

  function decodeState(hash) {
    // Expect: #h1=...
    const raw = (hash.startsWith("#") ? hash.slice(1) : hash).trim();
    if (!raw) return null;
    if (!raw.startsWith(HASH_PREFIX)) return null;
    const payload = raw.slice(HASH_PREFIX.length);
    const bytes = base64UrlToBytes(payload);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  }

  // -----------------------------
  // HashBin storage: #256t=<cid> names a saved diagram on 256t.us
  // -----------------------------
  const CID_PREFIX = "256t=";

  // The CID of the last save or load, and the diagram it holds in savePayload form
  let saved = null; // { cid, payload }

  // Canonical JSON (sorted positions) so an unchanged diagram always produces the same bytes and CID
  function savePayload(st) {
    const pos = {};
    for (const id of Object.keys(st.pos).sort()) pos[id] = st.pos[id];
    return JSON.stringify({ format: "hashbin-diagram", version: 1, src: st.src, pos });
  }

  function cidFromHash(hash) {
    const raw = (hash.startsWith("#") ? hash.slice(1) : hash).trim();
    if (!raw.startsWith(CID_PREFIX)) return null;
    const cid = raw.slice(CID_PREFIX.length);
    return /^[A-Za-z0-9_-]+$/.test(cid) ? cid : "";
  }

  function stateFromContent(text) {
    try {
      const doc = JSON.parse(text);
      if (doc && typeof doc === "object" && typeof doc.src === "string") {
        return { src: doc.src, pos: (doc.pos && typeof doc.pos === "object") ? doc.pos : {} };
      }
    } catch {
      // not JSON: treat the whole file as diagram source
    }
    return { src: text, pos: {} };
  }

  async function loadFromCid(cid) {
    if (!cid) {
      showLoadError("The URL's #256t= value isn't a valid CID.");
      return;
    }
    $savedState.className = "savedState";
    $savedState.textContent = "Loading…";
    let text;
    try {
      const response = await fetch(`${CONTENT_BASE}/${cid}`);
      if (!response.ok) {
        const reason = (response.status === 404) ? "not found (it may have expired or been deleted)" : `HTTP ${response.status}`;
        showLoadError(`Couldn't load ${cid} from 256t.us: ${reason}.`);
        return;
      }
      text = await response.text();
    } catch (error) {
      showLoadError(`Couldn't reach 256t.us to load ${cid}: ${error.message}`);
      return;
    }
    applyState(stateFromContent(text), { replace: true, fromHash: true });
    saved = { cid, payload: text };
    renderAll();
    // Plain-text source gets laid out on load; that layout isn't an edit, so the URL keeps the CID
    saved.payload = savePayload(state);
    updateSavedState();
  }

  function showLoadError(message) {
    saved = null;
    applyState({ src: "", pos: {} }, { replace: true });
    renderAll();
    $errorBox.classList.add("show");
    $errorBox.textContent = message;
    $parseStatus.textContent = "Load failed";
    $parseStatus.className = "err";
    updateSavedState();
  }

  function shortCid(cid) {
    return cid.length > 16 ? `${cid.slice(0, 8)}…${cid.slice(-6)}` : cid;
  }

  function updateSavedState() {
    $savedState.textContent = "";
    if (!saved) {
      $savedState.className = "savedState";
      $savedState.textContent = "Not saved";
      return;
    }
    const link = document.createElement("a");
    link.href = `${CONTENT_BASE}/${saved.cid}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = saved.cid;
    link.textContent = shortCid(saved.cid);
    const dirty = savePayload(state) !== saved.payload;
    $savedState.className = dirty ? "savedState dirty" : "savedState";
    $savedState.append(dirty ? "Unsaved changes since " : "Saved as ", link);
  }

  let ignoreHashChange = false;

  function syncHash({ replace } = { replace: true }) {
    // While the diagram matches what's on HashBin, the short CID link describes it completely
    const unchanged = saved && savePayload(state) === saved.payload;
    const newHash = unchanged ? "#" + CID_PREFIX + saved.cid : "#" + encodeState(state);
    ignoreHashChange = true;
    if (replace) history.replaceState(null, "", newHash);
    else history.pushState(null, "", newHash);
    ignoreHashChange = false;
    updateHashStatus();
    updateSavedState();
  }

  function updateHashStatus() {
    $hashStatus.textContent = `hash: ${location.hash.length} chars`;
  }

  window.addEventListener("hashchange", () => {
    if (ignoreHashChange) return;
    const cid = cidFromHash(location.hash);
    if (cid !== null) {
      if (saved && saved.cid === cid) {
        // Back to the saved version: no need to fetch what we already have
        applyState(stateFromContent(saved.payload), { replace: true, fromHash: true });
        renderAll();
      } else {
        loadFromCid(cid);
      }
      return;
    }
    const incoming = decodeState(location.hash);
    if (!incoming) return;
    applyState(incoming, { replace: true, fromHash: true });
    renderAll();
  });

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
    return /^[A-Za-z0-9_:\-]+$/.test(id);
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

  function parseSource(src) {
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

  // -----------------------------
  // Layout + Rendering (SVG)
  // -----------------------------
  const NODE_W = 110;
  const NODE_H = 64;

  function nodeScale(size) {
    if (size === "tiny") return 0.25;
    if (size === "small") return 0.5;
    if (size === "big") return 2.0;
    if (size === "bigger") return 4.0;
    if (size === "huge") return 8.0;
    return 1.0; // normal
  }

  function hexToRgb(hex) {
    const h = hex.replace("#", "").trim();
    const v = parseInt(h, 16);
    if (h.length !== 6 || Number.isNaN(v)) return { r: 200, g: 200, b: 200 };
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }

  function rgba(hex, a) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }

  function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const srgb = [r, g, b].map(v => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  }

  function ensurePositions(diagram) {
    const rect = $svg.getBoundingClientRect();
    const W = Math.max(400, rect.width);
    const H = Math.max(300, rect.height);

    const ids = Array.from(diagram.nodes.keys()).sort();
    const missing = ids.filter(id => !state.pos[id] || !Array.isArray(state.pos[id]));

    if (missing.length === 0) return;

    // Place missing nodes around a circle
    const cx = W * 0.5;
    const cy = H * 0.5;
    const r = Math.min(W, H) * 0.32;

    // Count total for stable distribution
    const all = ids;
    for (let i = 0; i < all.length; i++) {
      const id = all[i];
      if (state.pos[id]) continue;
      const ang = (i / Math.max(1, all.length)) * Math.PI * 2;
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      state.pos[id] = [Math.round(x), Math.round(y)];
    }
  }

  const ZOOM_MIN = 0.4;
  const ZOOM_MAX = 2.5;
  const ZOOM_STEP = 1.2;
  let viewport = { scale: 1, tx: 0, ty: 0 };
  let viewportGroup = null;

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function applyViewportTransform() {
    if (!viewportGroup) return;
    viewportGroup.setAttribute("transform", `translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`);
  }

  function zoomAt(factor, centerX, centerY) {
    const nextScale = clamp(viewport.scale * factor, ZOOM_MIN, ZOOM_MAX);
    if (nextScale === viewport.scale) return;
    const worldX = (centerX - viewport.tx) / viewport.scale;
    const worldY = (centerY - viewport.ty) / viewport.scale;
    viewport.scale = nextScale;
    viewport.tx = centerX - worldX * viewport.scale;
    viewport.ty = centerY - worldY * viewport.scale;
    applyViewportTransform();
  }

  function zoomFromCenter(factor) {
    const rect = $svg.getBoundingClientRect();
    zoomAt(factor, Math.max(0, rect.width) / 2, Math.max(0, rect.height) / 2);
  }

  function prunePositions(diagram) {
    const live = new Set(diagram.nodes.keys());
    for (const id of Object.keys(state.pos)) {
      if (!live.has(id)) delete state.pos[id];
    }
  }

  function svgPointFromEvent(evt) {
    const pt = $svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = $svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const inv = ctm.inverse();
    const p = pt.matrixTransform(inv);
    return { x: p.x, y: p.y };
  }

  function diagramPointFromEvent(evt) {
    const p = svgPointFromEvent(evt);
    return {
      x: (p.x - viewport.tx) / viewport.scale,
      y: (p.y - viewport.ty) / viewport.scale,
    };
  }

  function applyEdgeStyle(style, colorName) {
    const color = COLORS[colorName] || COLORS.gray;
    const props = {
      stroke: color,
      "stroke-width": (style === "bold") ? 3.5 : 2.2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "stroke-dasharray": "",
    };
    if (style === "dashed") props["stroke-dasharray"] = "10 7";
    if (style === "dotted") props["stroke-dasharray"] = "2 7";
    return props;
  }

  function markerIdFor(colorName) {
    return `arrow-${colorName}`;
  }

  function buildMarkers(defsEl) {
    // Create one arrow marker per color name to match edge stroke.
    for (const name of Object.keys(COLORS)) {
      const col = COLORS[name];
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
      marker.setAttribute("id", markerIdFor(name));
      marker.setAttribute("markerWidth", "10");
      marker.setAttribute("markerHeight", "10");
      marker.setAttribute("refX", "9");
      marker.setAttribute("refY", "5");
      marker.setAttribute("orient", "auto");
      marker.setAttribute("markerUnits", "strokeWidth");

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
      path.setAttribute("fill", col);

      marker.appendChild(path);
      defsEl.appendChild(marker);
    }
  }

  function nodeRadius(shape, size) {
    // Rough collision/edge endpoint offset
    const sc = nodeScale(size);
    if (shape === "none") return 4 * sc;
    if (shape === "circle") return Math.max(NODE_W, NODE_H) * 0.32 * sc;
    if (shape === "triangle" || shape === "diamond" || shape === "hex") return Math.max(NODE_W, NODE_H) * 0.36 * sc;
    return Math.max(NODE_W, NODE_H) * 0.34 * sc; // square-ish
  }

  function edgeEndpoints(a, b, shapeA, sizeA, shapeB, sizeB) {
    const ax = a[0], ay = a[1];
    const bx = b[0], by = b[1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;

    const ra = nodeRadius(shapeA, sizeA);
    const rb = nodeRadius(shapeB, sizeB);

    const x1 = ax + ux * ra;
    const y1 = ay + uy * ra;
    const x2 = bx - ux * rb;
    const y2 = by - uy * rb;

    return { x1, y1, x2, y2, ux, uy, len };
  }

  function truncateLabel(s, n) {
    if (!s) return "";
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  function render(diagram) {
    // Setup svg coordinate system in pixels
    const rect = $svg.getBoundingClientRect();
    const W = Math.max(400, rect.width);
    const H = Math.max(300, rect.height);

    $svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    $svg.style.touchAction = "none";
    $svg.innerHTML = "";

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    buildMarkers(defs);
    $svg.appendChild(defs);

    // A subtle grid background
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", "0"); bg.setAttribute("y", "0");
    bg.setAttribute("width", W); bg.setAttribute("height", H);
    bg.setAttribute("fill", diagram.background ? COLORS[diagram.background] || "transparent" : "transparent");
    bg.style.cursor = "grab";
    bg.addEventListener("pointerdown", (ev) => startPan(ev));
    $svg.appendChild(bg);

    // Draw edges under nodes
    viewportGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const edgeLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const nodeLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    viewportGroup.appendChild(edgeLayer);
    viewportGroup.appendChild(nodeLayer);
    $svg.appendChild(viewportGroup);
    applyViewportTransform();

    // Edge rendering
    for (const e of diagram.edges) {
      const fromPos = state.pos[e.from];
      const toPos = state.pos[e.to];
      const fromNode = diagram.nodes.get(e.from);
      const toNode = diagram.nodes.get(e.to);
      if (!fromPos || !toPos || !fromNode || !toNode) continue;

      const { x1, y1, x2, y2, ux, uy } = edgeEndpoints(fromPos, toPos, fromNode.shape, fromNode.size, toNode.shape, toNode.size);

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");

      // Visible stroke
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", `M ${x1} ${y1} L ${x2} ${y2}`);

      const styleProps = applyEdgeStyle(e.style || "solid", e.color || "gray");
      for (const [k, v] of Object.entries(styleProps)) p.setAttribute(k, v);

      p.setAttribute("fill", "none");
      p.setAttribute("marker-end", `url(#${markerIdFor(e.color || "gray")})`);

      // Hover text
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      const tText = [
        `${e.from} -> ${e.to}`,
        e.text ? `text: ${e.text}` : "",
        e.url ? `link: ${e.url}` : ""
      ].filter(Boolean).join("\n");
      title.textContent = tText;
      p.appendChild(title);

      // Click overlay for edges (fatter invisible stroke)
      const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hit.setAttribute("d", `M ${x1} ${y1} L ${x2} ${y2}`);
      hit.setAttribute("fill", "none");
      hit.setAttribute("stroke", "transparent");
      hit.setAttribute("stroke-width", "14");
      hit.style.cursor = e.url ? "pointer" : "default";
      hit.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (e.url) safeOpen(e.url);
      });

      // Edge label (optional)
      if (e.text) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const edgeTextScale = nodeScale(e.size || "normal");
        // Offset label slightly perpendicular
        const px = -uy, py = ux;
        const tx = mx + px * 10;
        const ty = my + py * 10;

        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", tx);
        label.setAttribute("y", ty);
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("dominant-baseline", "middle");
        label.setAttribute("font-family", "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial");
        label.setAttribute("font-size", String(Math.max(10, Math.round(12 * edgeTextScale))));
        label.setAttribute("fill", "rgba(232,237,243,0.85)");
        label.setAttribute("paint-order", "stroke");
        label.setAttribute("stroke", "rgba(0,0,0,0.6)");
        label.setAttribute("stroke-width", "3");
        label.style.pointerEvents = "none";
        label.textContent = truncateLabel(e.text, 28);
        g.appendChild(label);
      }

      g.appendChild(p);
      g.appendChild(hit);
      edgeLayer.appendChild(g);
    }

    // Node rendering
    for (const [id, n] of diagram.nodes.entries()) {
      const pos = state.pos[id];
      if (!pos) continue;
      const x = pos[0], y = pos[1];

      const sc = nodeScale(n.size);
      const w = NODE_W * sc;
      const h = NODE_H * sc;

      const col = COLORS[n.color] || COLORS.gray;
      const fillCol = rgba(col, 0.18);
      const strokeCol = rgba(col, 0.85);
      const labelCol = luminance(col) < 0.38 ? "rgba(248,250,252,0.95)" : "rgba(15,23,42,0.92)";

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("data-node-id", id);
      g.style.cursor = "grab";

      // Hover text
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      const tText = [
        id,
        n.text ? `text: ${n.text}` : "",
        n.url ? `link: ${n.url}` : ""
      ].filter(Boolean).join("\n");
      title.textContent = tText;
      g.appendChild(title);

      // Shape
      const shape = (n.shape && NODE_SHAPES.includes(n.shape)) ? n.shape : "circle";
      let el;

      if (shape === "none") {
        el = null;
      } else if (shape === "circle") {
        el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        el.setAttribute("cx", x);
        el.setAttribute("cy", y);
        el.setAttribute("r", Math.min(w, h) * 0.42);
      } else if (shape === "square") {
        el = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        el.setAttribute("x", x - w / 2);
        el.setAttribute("y", y - h / 2);
        el.setAttribute("width", w);
        el.setAttribute("height", h);
        el.setAttribute("rx", 12 * sc);
      } else if (shape === "diamond") {
        el = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        const pts = [
          [x, y - h/2],
          [x + w/2, y],
          [x, y + h/2],
          [x - w/2, y],
        ].map(p => p.join(",")).join(" ");
        el.setAttribute("points", pts);
      } else if (shape === "triangle") {
        el = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        const pts = [
          [x, y - h/2],
          [x + w/2, y + h/2],
          [x - w/2, y + h/2],
        ].map(p => p.join(",")).join(" ");
        el.setAttribute("points", pts);
      } else if (shape === "hex") {
        el = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        const hw = w/2, hh = h/2;
        const pts = [
          [x - hw*0.55, y - hh],
          [x + hw*0.55, y - hh],
          [x + hw,      y],
          [x + hw*0.55, y + hh],
          [x - hw*0.55, y + hh],
          [x - hw,      y],
        ].map(p => p.join(",")).join(" ");
        el.setAttribute("points", pts);
      } else {
        // fallback
        el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        el.setAttribute("cx", x);
        el.setAttribute("cy", y);
        el.setAttribute("r", Math.min(w, h) * 0.42);
      }

      if (el) {
        el.setAttribute("fill", fillCol);
        el.setAttribute("stroke", strokeCol);
        el.setAttribute("stroke-width", "2.2");
        el.setAttribute("filter", "drop-shadow(0px 8px 18px rgba(0,0,0,0.45))");
        el.style.pointerEvents = "all";

        // Click to follow link
        if (n.url) {
          el.style.cursor = "pointer";
          el.addEventListener("click", (ev) => {
            // If dragging, ignore click (handled by drag logic)
            if (dragging && dragging.id === id) return;
            ev.stopPropagation();
            safeOpen(n.url);
          });
        }

        g.appendChild(el);
      } else {
        // Invisible hit target so "none" nodes remain draggable/clickable.
        const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        hit.setAttribute("x", x - w / 2);
        hit.setAttribute("y", y - h / 2);
        hit.setAttribute("width", w);
        hit.setAttribute("height", h);
        hit.setAttribute("fill", "transparent");
        hit.setAttribute("stroke", "none");
        hit.style.pointerEvents = "all";
        if (n.url) {
          hit.style.cursor = "pointer";
          hit.addEventListener("click", (ev) => {
            if (dragging && dragging.id === id) return;
            ev.stopPropagation();
            safeOpen(n.url);
          });
        }
        g.appendChild(hit);
      }

      // Label: prefer node text; fallback to id
      const labelText = n.text ? truncateLabel(n.text, 22) : id;
      const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
      textEl.setAttribute("x", x);
      textEl.setAttribute("y", y);
      textEl.setAttribute("text-anchor", "middle");
      textEl.setAttribute("dominant-baseline", "middle");
      textEl.setAttribute("font-family", "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial");
      textEl.setAttribute("font-size", String(Math.max(10, Math.round(13 * sc))));
      textEl.setAttribute("font-weight", "700");
      textEl.setAttribute("fill", (shape === "none") ? strokeCol : labelCol);
      textEl.style.pointerEvents = "none";
      textEl.textContent = labelText;

      g.appendChild(textEl);

      // Drag handlers
      g.addEventListener("pointerdown", (ev) => startDrag(ev, id));

      nodeLayer.appendChild(g);
    }
  }

  function safeOpen(url) {
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      location.href = url;
    }
  }

  let lastNavTime = 0;
  function openUrl(url) {
    if (!url) return;
    const now = performance.now();
    if (now - lastNavTime < 250) return;
    lastNavTime = now;
    safeOpen(url);
  }

  // -----------------------------
  // Dragging
  // -----------------------------
  let dragging = null;
  let dragMoved = false;
  let dragRaf = 0;
  let dragHashTimer = 0;
  let panning = null;

  function startDrag(ev, id) {
    // Only left click / primary pointer
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const p = diagramPointFromEvent(ev);
    const cur = state.pos[id] || [p.x, p.y];
    dragging = {
      id,
      dx: cur[0] - p.x,
      dy: cur[1] - p.y,
      pointerId: ev.pointerId
    };
    dragMoved = false;
    $svg.setPointerCapture(ev.pointerId);
    // Move immediately on down feels better
    moveDrag(ev);
  }

  function moveDrag(ev) {
    if (!dragging) return;
    const p = diagramPointFromEvent(ev);
    const nx = Math.round(p.x + dragging.dx);
    const ny = Math.round(p.y + dragging.dy);
    const id = dragging.id;

    const prev = state.pos[id] || [0,0];
    if (prev[0] !== nx || prev[1] !== ny) dragMoved = true;

    state.pos[id] = [nx, ny];

    // Throttle full render to animation frames
    if (!dragRaf) {
      dragRaf = requestAnimationFrame(() => {
        dragRaf = 0;
        renderAll();
      });
    }

    // Debounce hash updates while dragging (still all state in URL)
    clearTimeout(dragHashTimer);
    dragHashTimer = setTimeout(() => syncHash({ replace: true }), 120);
  }

  function startPan(ev) {
    if (ev.button !== 0 || dragging) return;
    ev.preventDefault();
    const p = svgPointFromEvent(ev);
    panning = {
      pointerId: ev.pointerId,
      startX: p.x,
      startY: p.y,
      tx: viewport.tx,
      ty: viewport.ty,
    };
    $svgWrap.classList.add("panning");
    $svg.setPointerCapture(ev.pointerId);
  }

  function movePan(ev) {
    if (!panning) return;
    const p = svgPointFromEvent(ev);
    viewport.tx = panning.tx + (p.x - panning.startX);
    viewport.ty = panning.ty + (p.y - panning.startY);
    applyViewportTransform();
  }

  function endPan() {
    if (!panning) return;
    try { $svg.releasePointerCapture(panning.pointerId); } catch {}
    panning = null;
    $svgWrap.classList.remove("panning");
  }

  function endDrag(ev) {
    if (!dragging) return;
    const finishedId = dragging.id;
    const finishedMoved = dragMoved;
    try { $svg.releasePointerCapture(dragging.pointerId); } catch {}
    dragging = null;
    if (finishedMoved) {
      syncHash({ replace: true });
    } else {
      const n = diagram && diagram.nodes ? diagram.nodes.get(finishedId) : null;
      if (n && n.url) openUrl(n.url);
    }
  }

  $svg.addEventListener("pointermove", (ev) => {
    moveDrag(ev);
    movePan(ev);
  });
  $svg.addEventListener("pointerup", (ev) => {
    endDrag(ev);
    endPan();
  });
  $svg.addEventListener("pointercancel", (ev) => {
    endDrag(ev);
    endPan();
  });

  $btnZoomOut.addEventListener("click", () => zoomFromCenter(1 / ZOOM_STEP));
  $btnZoomIn.addEventListener("click", () => zoomFromCenter(ZOOM_STEP));

  // -----------------------------
  // App state + rendering loop
  // -----------------------------
  let state = makeDefaultState();
  let diagram = null;
  let parseTimer = 0;

  function makeDefaultState() {
    return {
      src: [
        "# Diagram Editor — edit this text, then copy the URL",
        "",
        "# nodes (id  [size] [shape] [color] [url] [text...])",
        "n square red /google.com Node N",
        "m circle blue /wikipedia.org Node M",
        "t triangle green /example.com Triangle",
        "",
        "# edges (a -> b (-> c...)  [size] [lineStyle] [color] [url] [text...])",
        "n -> m solid purple /news.ycombinator.com N to M",
        "m -> t small dotted teal /slashdot.org Dotted link",
        "t -> n dashed orange /github.com Back edge",
        "",
        "# you can define nodes implicitly by referencing them in edges:",
        "a -> b -> c bold yellow /example.com Chain applies to each edge",
        "",
      ].join("\n"),
      pos: {}
    };
  }

  function applyState(newState, { replace = true, fromHash = false } = {}) {
    // Sanitize
    if (!newState || typeof newState !== "object") return;
    if (typeof newState.src !== "string") newState.src = "";
    if (!newState.pos || typeof newState.pos !== "object") newState.pos = {};
    state = newState;

    // Put src into editor (without retriggering too hard)
    if ($src.value !== state.src) $src.value = state.src;

    updateHashStatus();
  }

  function renderAll() {
    const parsed = parseSource(state.src);

    if (parsed.errors.length) {
      $parseStatus.textContent = "Parse errors";
      $parseStatus.className = "err";
      $errorBox.classList.add("show");
      $errorBox.textContent = parsed.errors.join("\n");
    } else {
      $parseStatus.textContent = "OK";
      $parseStatus.className = "ok";
      $errorBox.classList.remove("show");
      $errorBox.textContent = "";
    }

    diagram = { nodes: parsed.nodes, edges: parsed.edges, background: parsed.background };

    ensurePositions(diagram);
    prunePositions(diagram);

    render(diagram);
    updateHashStatus();
    updateSavedState();
  }

  // Editor input -> parse/render -> hash
  $src.addEventListener("input", () => {
    clearTimeout(parseTimer);
    parseTimer = setTimeout(() => {
      state.src = $src.value;
      renderAll();
      syncHash({ replace: true });
    }, 160);
  });

  window.addEventListener("resize", () => {
    // Re-render to match new SVG size; state unchanged
    renderAll();
  });

  // -----------------------------
  // Save dialog: each save is approved on hashbin.org
  // -----------------------------
  const $saveDialog = document.getElementById("saveDialog");
  const $saveForm = document.getElementById("saveForm");
  const $saveMessage = document.getElementById("saveMessage");
  const $btnSaveConfirm = document.getElementById("btnSaveConfirm");

  function dollars(cents) {
    return `$${(cents / 100).toFixed(2)}`;
  }

  function setSaveMessage(text, kind) {
    $saveMessage.textContent = text;
    $saveMessage.className = kind ? `saveMessage ${kind}` : "saveMessage";
  }

  function openSaveDialog(message, kind = "err") {
    if (!$saveDialog.open) $saveDialog.showModal();
    $btnSaveConfirm.disabled = !hb;
    if (message) setSaveMessage(message, kind);
    else setSaveMessage(hb ? "" : `${saveProblem}.`, hb ? "" : "err");
  }

  function savedMessage({ cid, cost_cents, expires_at }) {
    const expires = expires_at ? `Kept until ${new Date(expires_at).toLocaleDateString()}. ` : "";
    const cost = cost_cents ? `Charged ${dollars(cost_cents)}. ` : "";
    return `Saved. ${cost}${expires}The URL now loads it by CID:\n${cid}`;
  }

  // Runs synchronously in the click so the browser allows HashBin's approval window. If the window is
  // blocked, the SDK redirects instead and the save comes back through completeRedirectSave().
  function save() {
    const payload = savePayload(state);
    $btnSaveConfirm.disabled = true;
    setSaveMessage("Approve the save in the HashBin window…", "");
    hb.publish(payload, { contentType: "application/json", fileName: "diagram.json", clientState: { hash: location.hash, payload } })
      .finally(() => { $btnSaveConfirm.disabled = !hb; })
      .then((result) => {
        if (result.redirected) return;
        saved = { cid: result.cid, payload };
        syncHash({ replace: false });
        setSaveMessage(savedMessage(result), "ok");
      }, (error) => setSaveMessage(publishMessage(error), "err"));
  }

  document.getElementById("btnSave").addEventListener("click", () => openSaveDialog());
  document.getElementById("btnSaveCancel").addEventListener("click", () => $saveDialog.close());

  $saveForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (hb) save();
  });

  // -----------------------------
  // Boot from URL hash (if present)
  // -----------------------------
  function boot() {
    const cid = cidFromHash(location.hash);
    if (cid !== null) {
      return loadFromCid(cid);
    }
    const incoming = decodeState(location.hash);
    if (incoming) {
      applyState(incoming, { replace: true, fromHash: true });
    } else {
      applyState(makeDefaultState(), { replace: true });
      syncHash({ replace: true });
    }
    renderAll();
  }

  const booted = boot();

  // A save that redirected finishes once the diagram it left with is back
  Promise.resolve(booted).then(() => {
    if (publishReturn?.error) openSaveDialog(publishReturn.error);
    else if (publishReturn?.cid) {
      saved = { cid: publishReturn.cid, payload: publishReturn.payload };
      syncHash({ replace: true });
      openSaveDialog(savedMessage(publishReturn), "ok");
    }
  });
})();
