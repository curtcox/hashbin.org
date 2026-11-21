import { HashBinClient } from "./sdk/hashbin.js";
import { NODE_SIZES, NODE_SHAPES, EDGE_STYLES, COLORS, parseSource } from "./diagram-dsl.js";
import { bindRenderer, nodeScale, rgba, ensurePositions, ZOOM_STEP, viewport, applyViewportTransform, zoomFromCenter, prunePositions, svgPointFromEvent, diagramPointFromEvent, render, openUrl } from "./diagram-render.js";

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
  bindRenderer({
    $svg,
    get state() { return state; },
    get dragging() { return dragging; },
    startDrag,
    startPan,
  });
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
