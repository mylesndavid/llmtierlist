/**
 * Greedy label placement for scatter-plot points: each label tries a few
 * positions around its point and takes the first that stays inside the plot
 * and overlaps no placed label and no other point. Labels that fit nowhere
 * are dropped (the point stays hoverable). Pure; no DOM measurement.
 */

export interface LabelPoint {
  id: string;
  x: number;
  y: number;
  text: string;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PlacedLabel {
  id: string;
  text: string;
  /** text anchor position (SVG x / baseline y) */
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  box: Box;
}

export interface LabelOptions {
  bounds: Box;
  /** every point on the chart, so labels avoid covering them */
  obstacles: Array<{ x: number; y: number }>;
  fontSize?: number;
  /** average glyph width as a fraction of font size */
  charWidth?: number;
  pointRadius?: number;
  gap?: number;
  maxChars?: number;
}

export function truncateLabel(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

export function overlaps(a: Box, b: Box, pad = 0): boolean {
  return a.left < b.right + pad && b.left < a.right + pad && a.top < b.bottom + pad && b.top < a.bottom + pad;
}

function inside(a: Box, b: Box): boolean {
  return a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;
}

/** Place labels in the given order (earlier points get first pick). */
export function placeLabels(points: LabelPoint[], opts: LabelOptions): PlacedLabel[] {
  const fontSize = opts.fontSize ?? 11;
  const charW = (opts.charWidth ?? 0.56) * fontSize;
  const r = opts.pointRadius ?? 4;
  const gap = opts.gap ?? 5;
  const maxChars = opts.maxChars ?? 24;
  const h = fontSize + 2;
  // baseline sits ~a fifth of the box above its bottom edge
  const baseline = (top: number) => top + h - Math.round(fontSize * 0.25);

  const pointBoxes = opts.obstacles.map((p) => ({
    left: p.x - r,
    top: p.y - r,
    right: p.x + r,
    bottom: p.y + r,
  }));

  const placed: PlacedLabel[] = [];
  for (const p of points) {
    const text = truncateLabel(p.text, maxChars);
    const w = Math.ceil(text.length * charW);
    const d = r + gap;
    const candidates: Array<{ box: Box; x: number; anchor: PlacedLabel["anchor"] }> = [
      // right, left, above, below, then the four diagonals
      { box: { left: p.x + d, top: p.y - h / 2, right: p.x + d + w, bottom: p.y + h / 2 }, x: p.x + d, anchor: "start" },
      { box: { left: p.x - d - w, top: p.y - h / 2, right: p.x - d, bottom: p.y + h / 2 }, x: p.x - d, anchor: "end" },
      { box: { left: p.x - w / 2, top: p.y - d - h, right: p.x + w / 2, bottom: p.y - d }, x: p.x, anchor: "middle" },
      { box: { left: p.x - w / 2, top: p.y + d, right: p.x + w / 2, bottom: p.y + d + h }, x: p.x, anchor: "middle" },
      { box: { left: p.x + r, top: p.y - r - h, right: p.x + r + w, bottom: p.y - r }, x: p.x + r, anchor: "start" },
      { box: { left: p.x + r, top: p.y + r, right: p.x + r + w, bottom: p.y + r + h }, x: p.x + r, anchor: "start" },
      { box: { left: p.x - r - w, top: p.y - r - h, right: p.x - r, bottom: p.y - r }, x: p.x - r, anchor: "end" },
      { box: { left: p.x - r - w, top: p.y + r, right: p.x - r, bottom: p.y + r + h }, x: p.x - r, anchor: "end" },
    ];
    for (const c of candidates) {
      if (!inside(c.box, opts.bounds)) continue;
      if (placed.some((l) => overlaps(l.box, c.box, 2))) continue;
      if (pointBoxes.some((b) => overlaps(b, c.box))) continue;
      placed.push({ id: p.id, text, x: c.x, y: baseline(c.box.top), anchor: c.anchor, box: c.box });
      break;
    }
  }
  return placed;
}
