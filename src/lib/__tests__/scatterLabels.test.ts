import { describe, expect, it } from "vitest";
import { overlaps, placeLabels, truncateLabel } from "../scatterLabels";

const bounds = { left: 0, top: 0, right: 400, bottom: 300 };

describe("truncateLabel", () => {
  it("keeps short text and cuts long text with an ellipsis", () => {
    expect(truncateLabel("Claude", 10)).toBe("Claude");
    expect(truncateLabel("A very long model name", 10)).toBe("A very lo…");
    expect(truncateLabel("A very long model name", 10)).toHaveLength(10);
  });
});

describe("placeLabels", () => {
  it("places a lone label to the right of its point", () => {
    const [l] = placeLabels([{ id: "a", x: 100, y: 100, text: "Model A" }], {
      bounds,
      obstacles: [{ x: 100, y: 100 }],
    });
    expect(l.anchor).toBe("start");
    expect(l.box.left).toBeGreaterThan(100);
  });

  it("flips to the left near the right edge", () => {
    const [l] = placeLabels([{ id: "a", x: 390, y: 100, text: "Model A" }], {
      bounds,
      obstacles: [{ x: 390, y: 100 }],
    });
    expect(l.anchor).toBe("end");
    expect(l.box.right).toBeLessThanOrEqual(400);
  });

  it("never overlaps labels and keeps every label inside the bounds", () => {
    // a tight cluster of points
    const pts = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      x: 150 + (i % 4) * 12,
      y: 120 + Math.floor(i / 4) * 10,
      text: `Model number ${i}`,
    }));
    const placed = placeLabels(pts, { bounds, obstacles: pts });
    expect(placed.length).toBeGreaterThan(0);
    expect(placed.length).toBeLessThan(pts.length); // some are dropped rather than overlapped
    for (const a of placed) {
      expect(a.box.left).toBeGreaterThanOrEqual(bounds.left);
      expect(a.box.right).toBeLessThanOrEqual(bounds.right);
      expect(a.box.top).toBeGreaterThanOrEqual(bounds.top);
      expect(a.box.bottom).toBeLessThanOrEqual(bounds.bottom);
      for (const b of placed) if (a !== b) expect(overlaps(a.box, b.box)).toBe(false);
    }
  });

  it("does not cover other points", () => {
    const pts = [
      { id: "a", x: 100, y: 100, text: "Alpha" },
      { id: "b", x: 125, y: 100, text: "Beta" }, // sits where a's right-hand label would go
    ];
    const placed = placeLabels(pts, { bounds, obstacles: pts });
    const a = placed.find((l) => l.id === "a")!;
    expect(a.anchor).not.toBe("start");
    const bBox = { left: 121, top: 96, right: 129, bottom: 104 };
    for (const l of placed) expect(overlaps(l.box, bBox) && l.id !== "b").toBe(false);
  });

  it("gives earlier points first pick", () => {
    const pts = [
      { id: "first", x: 100, y: 100, text: "First model" },
      { id: "second", x: 100, y: 100, text: "Second model" },
    ];
    const placed = placeLabels(pts, { bounds, obstacles: [] });
    expect(placed[0].id).toBe("first");
    expect(placed[0].anchor).toBe("start");
  });
});
