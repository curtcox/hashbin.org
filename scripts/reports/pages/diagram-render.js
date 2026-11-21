// Layout, SVG rendering and the pan/zoom viewport. The editor (diagram-oauth.js) owns the
// state and dragging and hands them over with bindRenderer before the first render.
import { NODE_SHAPES, COLORS } from "./diagram-dsl.js";

let app;

export function bindRenderer(context) {
  app = context;
}

// -----------------------------
// Layout + Rendering (SVG)
// -----------------------------
const NODE_W = 110;
const NODE_H = 64;

export function nodeScale(size) {
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

export function rgba(hex, a) {
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

export function ensurePositions(diagram) {
  const rect = app.$svg.getBoundingClientRect();
  const W = Math.max(400, rect.width);
  const H = Math.max(300, rect.height);

  const ids = Array.from(diagram.nodes.keys()).sort();
  const missing = ids.filter(id => !app.state.pos[id] || !Array.isArray(app.state.pos[id]));

  if (missing.length === 0) return;

  // Place missing nodes around a circle
  const cx = W * 0.5;
  const cy = H * 0.5;
  const r = Math.min(W, H) * 0.32;

  // Count total for stable distribution
  const all = ids;
  for (let i = 0; i < all.length; i++) {
    const id = all[i];
    if (app.state.pos[id]) continue;
    const ang = (i / Math.max(1, all.length)) * Math.PI * 2;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    app.state.pos[id] = [Math.round(x), Math.round(y)];
  }
}

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.5;
export const ZOOM_STEP = 1.2;
export let viewport = { scale: 1, tx: 0, ty: 0 };
let viewportGroup = null;

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function applyViewportTransform() {
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

export function zoomFromCenter(factor) {
  const rect = app.$svg.getBoundingClientRect();
  zoomAt(factor, Math.max(0, rect.width) / 2, Math.max(0, rect.height) / 2);
}

export function prunePositions(diagram) {
  const live = new Set(diagram.nodes.keys());
  for (const id of Object.keys(app.state.pos)) {
    if (!live.has(id)) delete app.state.pos[id];
  }
}

export function svgPointFromEvent(evt) {
  const pt = app.$svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const ctm = app.$svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const inv = ctm.inverse();
  const p = pt.matrixTransform(inv);
  return { x: p.x, y: p.y };
}

export function diagramPointFromEvent(evt) {
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

export function render(diagram) {
  // Setup svg coordinate system in pixels
  const rect = app.$svg.getBoundingClientRect();
  const W = Math.max(400, rect.width);
  const H = Math.max(300, rect.height);

  app.$svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  app.$svg.style.touchAction = "none";
  app.$svg.innerHTML = "";

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  buildMarkers(defs);
  app.$svg.appendChild(defs);

  // A subtle grid background
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", "0"); bg.setAttribute("y", "0");
  bg.setAttribute("width", W); bg.setAttribute("height", H);
  bg.setAttribute("fill", diagram.background ? COLORS[diagram.background] || "transparent" : "transparent");
  bg.style.cursor = "grab";
  bg.addEventListener("pointerdown", (ev) => app.startPan(ev));
  app.$svg.appendChild(bg);

  // Draw edges under nodes
  viewportGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const edgeLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const nodeLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  viewportGroup.appendChild(edgeLayer);
  viewportGroup.appendChild(nodeLayer);
  app.$svg.appendChild(viewportGroup);
  applyViewportTransform();

  // Edge rendering
  for (const e of diagram.edges) {
    const fromPos = app.state.pos[e.from];
    const toPos = app.state.pos[e.to];
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
    const pos = app.state.pos[id];
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
          if (app.dragging && app.dragging.id === id) return;
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
          if (app.dragging && app.dragging.id === id) return;
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
    g.addEventListener("pointerdown", (ev) => app.startDrag(ev, id));

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
export function openUrl(url) {
  if (!url) return;
  const now = performance.now();
  if (now - lastNavTime < 250) return;
  lastNavTime = now;
  safeOpen(url);
}
