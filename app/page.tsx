"use client";

import { useMemo, useRef, useState } from "react";
import SectionView from "./SectionView";
import AxonView from "./AxonView";
import {useDrawingViewport,DrawingScale,ViewportExportBounds} from "./DrawingViewport";
import {clipGuide} from "./walls";
import {useWallEditor,WallPlan} from "./WallEditor";
import {composeFaces,colorGraph} from "./composition";
import SectionLines, { type SectionLine } from "./SectionLines";
import { translateSection, alignEndpoint, sectionLabel, type SectionAlignment } from "./section-geometry";

type Region = { x: number; y: number; w: number; h: number; color: number };
type Point = { x: number; y: number };
type ArcSpec = { center: Point; radius: number; start: number; sweep: number; clockwise: boolean; color: number };
type CenterKind = "intersection" | "line" | "edge" | "extension";
type CenterChoice = { point: Point; label: string };
type DivisionLine = { axis: "vertical" | "horizontal"; value: number; from: number; to: number };
type ArcSide = "right" | "down" | "left" | "up";
type PaperPreset = { label: string; short: string; width: number; height: number };
type RatioModule = { value: number; label: string; weight: number };
type TreeArrayShape = { columns: number; rows: number };
type PlantingType = "array" | "row" | "single";
type RowGuide = "split" | "arc" | "edge";
type TreePoint = Point & { type: PlantingType };
type PlantingPlacementMode = "array" | "single" | null;

const papers: PaperPreset[] = [
  { label: "1 : √1 = 1 : 1｜29.7 × 29.7 cm", short: "1 : √1", width: 29.7, height: 29.7 },
  { label: "1 : √2 = 1 : 1.414｜21.0 × 29.7 cm", short: "1 : √2", width: 21, height: 29.7 },
  { label: "1 : √3 = 1 : 1.732｜17.1 × 29.7 cm", short: "1 : √3", width: 29.7 / Math.sqrt(3), height: 29.7 },
  { label: "1 : √4 = 1 : 2｜14.9 × 29.7 cm", short: "1 : √4", width: 14.85, height: 29.7 },
  { label: "1 : √5 = 1 : 2.236｜13.3 × 29.7 cm", short: "1 : √5", width: 29.7 / Math.sqrt(5), height: 29.7 },
  { label: "1 : √6 = 1 : 2.449｜12.1 × 29.7 cm", short: "1 : √6", width: 29.7 / Math.sqrt(6), height: 29.7 },
];
const ratioModules: RatioModule[] = [
  { value: 1, label: "1 : √1", weight: 1 },
  { value: 2, label: "1 : √2", weight: Math.sqrt(2) },
  { value: 3, label: "1 : √3", weight: Math.sqrt(3) },
  { value: 4, label: "1 : √4", weight: 2 },
  { value: 5, label: "1 : √5", weight: Math.sqrt(5) },
  { value: 6, label: "1 : √6", weight: Math.sqrt(6) },
];
const palettes = [
  { name: "蒙德里安", colors: ["#0a4f8a", "#f1cf21", "#c83b2d"] },
  { name: "Sunset Bliss", colors: ["#f6a192", "#f06489", "#f8c5c8"] },
  { name: "Sea Escape", colors: ["#0ea5c6", "#00789f", "#b8e3ea"] },
  { name: "Forest Gold", colors: ["#194c57", "#279d83", "#d5b645"] },
  { name: "Soft Harmony", colors: ["#f6a56b", "#2c9f87", "#e56f55"] },
  { name: "Vintage Flame", colors: ["#d61b2c", "#f57c00", "#b9d0e2"] },
  { name: "Midnight Luxe", colors: ["#111e3a", "#36537b", "#8192ad"] },
  { name: "Winter Chill", colors: ["#111e3a", "#f49b15", "#bfc6cc"] },
  { name: "Pastel Pop", colors: ["#f08c98", "#f9bf9a", "#f7e76d"] },
  { name: "Tropical Punch", colors: ["#f03a42", "#f5782e", "#76b65c"] },
  { name: "Antique Glow", colors: ["#7258b1", "#f2b544", "#f6dca8"] },
  { name: "City Lights", colors: ["#2f247d", "#6a63e8", "#f2b800"] },
  { name: "Autumn Spice", colors: ["#b5302c", "#ee7517", "#e3b778"] },
  { name: "Beachside Calm", colors: ["#21aac8", "#76d8e4", "#b9e7ee"] },
  { name: "Citrus Blaze", colors: ["#f04d55", "#f6c315", "#5cc46d"] },
  { name: "Petal Romance", colors: ["#d9c3ba", "#a88ca6", "#4b4b5b"] },
];
const plantingOptions: { id: PlantingType; label: string; weight: number; minimum: number }[] = [
  { id: "array", label: "樹陣", weight: 6, minimum: 4 },
  { id: "row", label: "樹列", weight: 4, minimum: 3 },
  { id: "single", label: "孤植", weight: 1, minimum: 1 },
];

function seededRandom(seed: number) {
  let value = seed % 2147483647;
  return () => ((value = (value * 16807) % 2147483647) - 1) / 2147483646;
}
function getTreeArrayShape(count: number, siteWidth: number, siteHeight: number): TreeArrayShape {
  // A tree array should read as deliberate rows and columns.  Use the site's
  // proportion to find a compact matrix, while keeping 16 trees as a clear 4 × 4
  // reference arrangement rather than creating a long, accidental-looking row.
  const targetRatio = siteWidth / siteHeight;
  const columns = Math.max(3, Math.floor(Math.sqrt(count * targetRatio)));
  return { columns, rows: Math.ceil(count / columns) };
}
function makeRegions(seed: number, count = 8, focus: Point = { x: 500, y: 350 }, selectedModules: number[] = [1, 3, 6]): Region[] {
  const random = seededRandom(seed);
  const fx = Math.max(250, Math.min(750, focus.x));
  const fy = Math.max(175, Math.min(525, focus.y));
  const weights = selectedModules.map(value => ratioModules.find(module => module.value === value)?.weight ?? 1);
  const colorShift = Math.floor(random() * 3);
  // The primary cross-axis establishes four unequal fields. Secondary cuts then grow
  // from those fields, creating a deliberate hierarchy rather than a checkerboard.
  const regions: Region[] = [
    { x: 0, y: 0, w: fx, h: fy, color: colorShift },
    { x: fx, y: 0, w: 1000 - fx, h: fy, color: (colorShift + 1) % 3 },
    { x: 0, y: fy, w: fx, h: 700 - fy, color: (colorShift + 2) % 3 },
    { x: fx, y: fy, w: 1000 - fx, h: 700 - fy, color: colorShift },
  ];
  const phase = Math.floor(random() * weights.length);
  while (regions.length < count) {
    const candidates = regions
      .map((region, index) => ({ region, index, priority: region.w * region.h * (0.84 + random() * 0.26) }))
      .filter(({ region }) => Math.max(region.w, region.h) > 220)
      .sort((a, b) => b.priority - a.priority);
    const selected = candidates[0];
    if (!selected) break;
    const { region, index } = selected;
    const moduleWeight = weights[(regions.length + phase) % weights.length];
    const rawShare = moduleWeight / (1 + moduleWeight);
    const share = Math.max(0.27, Math.min(0.73, random() > 0.52 ? rawShare : 1 - rawShare));
    const aspect = region.w / region.h;
    const minFactor = Math.min(share, 1 - share);
    const canSplitVertical = region.w * minFactor >= 58;
    const canSplitHorizontal = region.h * minFactor >= 58;
    if (!canSplitVertical && !canSplitHorizontal) break;
    let vertical = aspect > 1.28 ? true : aspect < 0.78 ? false : random() > 0.48;
    // Periodically make a band across a dominant field; otherwise use the direction
    // that keeps the child rectangles substantial and visually calm.
    if ((regions.length + phase) % 4 === 0) vertical = !vertical;
    if (vertical && !canSplitVertical) vertical = false;
    if (!vertical && !canSplitHorizontal) vertical = true;
    const isVertical = vertical;
    const split = isVertical ? region.w * share : region.h * share;
    const first: Region = isVertical
      ? { ...region, w: split, color: (region.color + 1) % 3 }
      : { ...region, h: split, color: (region.color + 1) % 3 };
    const second: Region = isVertical
      ? { ...region, x: region.x + split, w: region.w - split, color: (region.color + 2) % 3 }
      : { ...region, y: region.y + split, h: region.h - split, color: region.color };
    regions.splice(index, 1, first, second);
  }
  return assignDistinctNeighbourColors(regions, seed);
}
function shareBoundary(a: Region, b: Region) {
  const overlap = (firstStart: number, firstEnd: number, secondStart: number, secondEnd: number) => Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart) > .5;
  const verticalContact = Math.abs(a.x + a.w - b.x) < .5 || Math.abs(b.x + b.w - a.x) < .5;
  const horizontalContact = Math.abs(a.y + a.h - b.y) < .5 || Math.abs(b.y + b.h - a.y) < .5;
  return (verticalContact && overlap(a.y, a.y + a.h, b.y, b.y + b.h)) || (horizontalContact && overlap(a.x, a.x + a.w, b.x, b.x + b.w));
}
function assignDistinctNeighbourColors(regions: Region[], seed: number) {
  const neighbours = regions.map((region, index) => regions.reduce<number[]>((items, candidate, candidateIndex) => {
    if (index !== candidateIndex && shareBoundary(region, candidate)) items.push(candidateIndex);
    return items;
  }, []));
  const tieBreaker = seededRandom(seed + 991);
  const order = regions.map((_, index) => ({ index, tie: tieBreaker() }))
    .sort((a, b) => neighbours[b.index].length - neighbours[a.index].length || a.tie - b.tie)
    .map(item => item.index);
  const colors = Array<number>(regions.length).fill(-1);
  const paint = (orderIndex: number): boolean => {
    if (orderIndex === order.length) return true;
    const regionIndex = order[orderIndex];
    const used = new Set(neighbours[regionIndex].map(index => colors[index]).filter(color => color >= 0));
    const preferred = [regions[regionIndex].color, (regions[regionIndex].color + 1) % 3, (regions[regionIndex].color + 2) % 3];
    for (const color of preferred) {
      if (used.has(color)) continue;
      colors[regionIndex] = color;
      if (paint(orderIndex + 1)) return true;
    }
    colors[regionIndex] = -1;
    return false;
  };
  if(!paint(0)) colors.splice(0,colors.length,...colorGraph(neighbours,regions.map(r=>r.color)));
  return regions.map((region, index) => ({ ...region, color: colors[index] >= 0 ? colors[index] : region.color }));
}
function compositionScore(regions: Region[]) {
  const total = 1000 * 700;
  const areas = regions.map(region => region.w * region.h / total);
  const smallest = Math.min(...areas);
  const average = 1 / regions.length;
  const largest = Math.max(...areas);
  const narrowestAspect = Math.max(...regions.map(region => Math.max(region.w / region.h, region.h / region.w)));
  const hierarchy = largest / average;
  // Prefer a visible main field, secondary fields, and a few narrow bands—but never
  // choose a sliver that reads as an accidental leftover.
  return smallest * 175 + Math.min(hierarchy, 3.5) * 7 - Math.max(0, narrowestAspect - 5.8) * 3;
}
function makeBestRegions(seed: number, count: number, focus: Point, selectedModules: number[]) {
  const ranked = Array.from({ length: 36 }, (_, candidate) => makeRegions(seed + candidate * 47, count, focus, selectedModules))
    .sort((a, b) => compositionScore(b) - compositionScore(a));
  const signature = (regions: Region[]) => regions.map(region => `${Math.round(region.x)}:${Math.round(region.y)}:${Math.round(region.w)}:${Math.round(region.h)}`).join("|");
  const distinct = ranked.filter((regions, index) => ranked.findIndex(candidate => signature(candidate) === signature(regions)) === index);
  // Keep only high-quality candidates, then rotate among distinct compositions so a
  // fresh selection visibly changes while staying within the same design criteria.
  const finalists = distinct.slice(0, Math.min(8, distinct.length));
  const choice = Math.floor(seededRandom(seed * 31 + 19)() * finalists.length);
  return finalists[choice] ?? ranked[0];
}
function arcSectorPath(arc: ArcSpec) {
  const direction = arc.clockwise ? 1 : -1;
  const endAngle = arc.start + direction * arc.sweep;
  const toPoint = (radius: number, degree: number) => ({ x: arc.center.x + radius * Math.cos(degree * Math.PI / 180), y: arc.center.y + radius * Math.sin(degree * Math.PI / 180) });
  const start = toPoint(arc.radius, arc.start), end = toPoint(arc.radius, endAngle);
  // SVG cannot draw a full 360° arc with one A command. Two aligned half-arcs
  // keep the result as one complete, solid circular colour field.
  if (arc.sweep === 360) {
    const middle = toPoint(arc.radius, arc.start + direction * 180);
    return `M ${arc.center.x} ${arc.center.y} L ${start.x} ${start.y} A ${arc.radius} ${arc.radius} 0 0 ${arc.clockwise ? 1 : 0} ${middle.x} ${middle.y} A ${arc.radius} ${arc.radius} 0 0 ${arc.clockwise ? 1 : 0} ${start.x} ${start.y} Z`;
  }
  return `M ${arc.center.x} ${arc.center.y} L ${start.x} ${start.y} A ${arc.radius} ${arc.radius} 0 ${arc.sweep > 180 ? 1 : 0} ${arc.clockwise ? 1 : 0} ${end.x} ${end.y} Z`;
}
function makeArcCenterChoices(regions: Region[], xOffset: number, yOffset: number, width: number, height: number): Record<CenterKind, CenterChoice[]> {
  const sx = width / 1000, sy = height / 700;
  const choices: Record<CenterKind, CenterChoice[]> = { intersection: [], line: [], edge: [], extension: [] };
  const add = (kind: CenterKind, point: Point, label: string) => {
    const exists = choices[kind].some(item => Math.abs(item.point.x - point.x) < 1 && Math.abs(item.point.y - point.y) < 1);
    if (!exists) choices[kind].push({ point, label });
  };
  const inPaperX = (x: number) => x > xOffset + 1 && x < xOffset + width - 1;
  const inPaperY = (y: number) => y > yOffset + 1 && y < yOffset + height - 1;
  const verticals = new Set<number>(), horizontals = new Set<number>();
  regions.forEach(region => {
    const left = xOffset + region.x * sx, right = xOffset + (region.x + region.w) * sx;
    const top = yOffset + region.y * sy, bottom = yOffset + (region.y + region.h) * sy;
    [[left, top], [right, top], [left, bottom], [right, bottom]].forEach(([x, y]) => {
      if (inPaperX(x) && inPaperY(y)) add("intersection", { x, y }, "分割交點");
    });
    if (inPaperX(left)) { verticals.add(left); [0.28, 0.5, 0.72].forEach(t => add("line", { x: left, y: top + (bottom - top) * t }, "垂直分割線")); }
    if (inPaperX(right)) { verticals.add(right); [0.28, 0.5, 0.72].forEach(t => add("line", { x: right, y: top + (bottom - top) * t }, "垂直分割線")); }
    if (inPaperY(top)) { horizontals.add(top); [0.28, 0.5, 0.72].forEach(t => add("line", { x: left + (right - left) * t, y: top }, "水平分割線")); }
    if (inPaperY(bottom)) { horizontals.add(bottom); [0.28, 0.5, 0.72].forEach(t => add("line", { x: left + (right - left) * t, y: bottom }, "水平分割線")); }
  });
  const corners = [{ x: xOffset, y: yOffset }, { x: xOffset + width, y: yOffset }, { x: xOffset, y: yOffset + height }, { x: xOffset + width, y: yOffset + height }];
  corners.forEach(point => add("edge", point, "底紙端點"));
  [0.25, 0.5, 0.75].forEach(t => {
    add("edge", { x: xOffset + width * t, y: yOffset }, "底紙上邊");
    add("edge", { x: xOffset + width * t, y: yOffset + height }, "底紙下邊");
    add("edge", { x: xOffset, y: yOffset + height * t }, "底紙左邊");
    add("edge", { x: xOffset + width, y: yOffset + height * t }, "底紙右邊");
  });
  const outerTop = yOffset - 54, outerBottom = yOffset + height + 54;
  const outerLeft = xOffset - 54, outerRight = xOffset + width + 54;
  verticals.forEach(x => { add("extension", { x, y: outerTop }, "垂直分割延長線（外部）"); add("extension", { x, y: outerBottom }, "垂直分割延長線（外部）"); });
  horizontals.forEach(y => { add("extension", { x: outerLeft, y }, "水平分割延長線（外部）"); add("extension", { x: outerRight, y }, "水平分割延長線（外部）"); });
  return choices;
}
function makeDivisionLines(regions: Region[], xOffset: number, yOffset: number, width: number, height: number): DivisionLine[] {
  const sx = width / 1000, sy = height / 700;
  const lines: DivisionLine[] = [];
  const add = (axis: DivisionLine["axis"], value: number, from: number, to: number) => {
    const start = Math.min(from, to), end = Math.max(from, to);
    if (!lines.some(line => line.axis === axis && Math.abs(line.value - value) < 1 && Math.abs(line.from - start) < 1 && Math.abs(line.to - end) < 1)) lines.push({ axis, value, from: start, to: end });
  };
  regions.forEach(region => {
    const left = xOffset + region.x * sx, right = xOffset + (region.x + region.w) * sx;
    const top = yOffset + region.y * sy, bottom = yOffset + (region.y + region.h) * sy;
    add("vertical", left, top, bottom); add("vertical", right, top, bottom);
    add("horizontal", top, left, right); add("horizontal", bottom, left, right);
  });
  return lines;
}
const arcSides: { id: ArcSide; label: string; angle: number }[] = [
  { id: "right", label: "向右", angle: 0 }, { id: "down", label: "向下", angle: 90 },
  { id: "left", label: "向左", angle: 180 }, { id: "up", label: "向上", angle: 270 },
];
function downloadSvgAsPng(svg: SVGSVGElement | null, filename: string) {
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const paper = (clone.querySelector("[data-export-viewport]") ?? clone.querySelector("[data-export-bounds]") ?? clone.querySelector("[data-paper-bounds]")) as SVGRectElement | null;
  if (!paper) return;
  const x = Number(paper.getAttribute("x")), y = Number(paper.getAttribute("y")), width = Number(paper.getAttribute("width")), height = Number(paper.getAttribute("height"));
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
  clone.querySelector("[data-export-background]")?.remove();
  clone.querySelectorAll("[data-editor-overlay]").forEach(element => element.remove());
  clone.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  const longSide = 2400, outputWidth = width >= height ? longSide : Math.round(longSide * width / height), outputHeight = width >= height ? Math.round(longSide * height / width) : longSide;
  clone.setAttribute("width", String(outputWidth)); clone.setAttribute("height", String(outputHeight));
  const source = new XMLSerializer().serializeToString(clone);
  const image = new Image(), url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
  image.onload = () => {
    const canvas = document.createElement("canvas"); canvas.width = outputWidth; canvas.height = outputHeight;
    const context = canvas.getContext("2d"); if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url);
    const link = document.createElement("a"); link.download = filename; link.href = canvas.toDataURL("image/png"); link.click();
  };
  image.src = url;
}
function ControlRow({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return <label className="control-row">
<span>
<b>{label}</b>{value && <em>{value}</em>}</span>{children}</label>;
}

function DimensionOverlay({ regions, paper, x, y, width, height, unit = "cm" }: { regions: Region[]; paper: PaperPreset; x: number; y: number; width: number; height: number; unit?: "cm" | "m" }) {
  const sx = width / 1000, sy = height / 700;
  const tick = (px: number, py: number) => `M ${px - 5} ${py + 5} L ${px + 5} ${py - 5}`;
  return <g className="cad-dimensions" pointerEvents="none">
    <g className="cad-overall">
      <line x1={x} y1={y - 26} x2={x + width} y2={y - 26} />
      <line x1={x} y1={y - 34} x2={x} y2={y - 5} />
<line x1={x + width} y1={y - 34} x2={x + width} y2={y - 5} />
      <path d={tick(x, y - 26)} />
<path d={tick(x + width, y - 26)} />
      <text x={x + width / 2} y={y - 33} textAnchor="middle">{paper.width.toFixed(1)} {unit}</text>
      <line x1={x - 26} y1={y} x2={x - 26} y2={y + height} />
      <line x1={x - 34} y1={y} x2={x - 5} y2={y} />
<line x1={x - 34} y1={y + height} x2={x - 5} y2={y + height} />
      <path d={tick(x - 26, y)} />
<path d={tick(x - 26, y + height)} />
      <text x={x - 34} y={y + height / 2} textAnchor="middle" transform={`rotate(-90 ${x - 34} ${y + height / 2})`}>{paper.height.toFixed(1)} {unit}</text>
    </g>
    {regions.map((r, i) => {
      const rx = x + r.x * sx, ry = y + r.y * sy, rw = r.w * sx, rh = r.h * sy;
      const realW = paper.width * r.w / 1000, realH = paper.height * r.h / 700;
      const horizontalY = ry + Math.min(18, Math.max(10, rh * .24));
      const verticalX = rx + Math.min(18, Math.max(10, rw * .18));
      return <g key={i} className="cad-region-dim">
        {rw > 58 && <>
<line x1={rx + 7} y1={horizontalY} x2={rx + rw - 7} y2={horizontalY} />
<path d={tick(rx + 7, horizontalY)} />
<path d={tick(rx + rw - 7, horizontalY)} />
<text x={rx + rw / 2} y={horizontalY - 5} textAnchor="middle">{realW.toFixed(1)}</text>
</>}
        {rh > 62 && <>
<line x1={verticalX} y1={ry + 8} x2={verticalX} y2={ry + rh - 8} />
<path d={tick(verticalX, ry + 8)} />
<path d={tick(verticalX, ry + rh - 8)} />
<text x={verticalX - 5} y={ry + rh / 2} textAnchor="middle" transform={`rotate(-90 ${verticalX - 5} ${ry + rh / 2})`}>{realH.toFixed(1)}</text>
</>}
      </g>;
    })}
  </g>;
}

function ArcDimensionOverlay({ arcs, preview, paper, displayWidth }: { arcs: ArcSpec[]; preview?: ArcSpec; paper: PaperPreset; displayWidth: number }) {
  const annotationArcs = preview ? [...arcs, preview] : arcs;
  const scale = paper.width / displayWidth;
  const toPoint = (arc: ArcSpec, degree: number, radius = arc.radius) => ({ x: arc.center.x + radius * Math.cos(degree * Math.PI / 180), y: arc.center.y + radius * Math.sin(degree * Math.PI / 180) });
  const miniArc = (arc: ArcSpec, radius: number) => {
    const direction = arc.clockwise ? 1 : -1;
    const start = toPoint(arc, arc.start, radius);
    if (arc.sweep === 360) return `M ${arc.center.x + radius} ${arc.center.y} A ${radius} ${radius} 0 1 1 ${arc.center.x - radius} ${arc.center.y} A ${radius} ${radius} 0 1 1 ${arc.center.x + radius} ${arc.center.y}`;
    const end = toPoint(arc, arc.start + direction * arc.sweep, radius);
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${arc.sweep > 180 ? 1 : 0} ${arc.clockwise ? 1 : 0} ${end.x} ${end.y}`;
  };
  return <g className="arc-dimensions" pointerEvents="none">
    {annotationArcs.map((arc, index) => {
      const direction = arc.clockwise ? 1 : -1;
      const guideAngle = arc.sweep === 360 ? arc.start : arc.start + direction * arc.sweep / 2;
      const radiusEnd = toPoint(arc, guideAngle);
      const radiusText = toPoint(arc, guideAngle, Math.max(34, arc.radius * .53));
      const angleText = toPoint(arc, guideAngle, Math.min(Math.max(46, arc.radius * .22), 78));
      const radiusCm = arc.radius * scale;
      return <g key={`arc-dimension-${index}`} className={preview && index === annotationArcs.length - 1 ? "arc-dimension-preview" : ""}>
        <line x1={arc.center.x} y1={arc.center.y} x2={radiusEnd.x} y2={radiusEnd.y}/>
        <path d={miniArc(arc, Math.min(Math.max(24, arc.radius * .16), 42))}/>
        <circle cx={arc.center.x} cy={arc.center.y} r="3.5"/>
        <text x={radiusText.x} y={radiusText.y - 5} textAnchor="middle">R {radiusCm.toFixed(1)} cm</text>
        <text x={angleText.x} y={angleText.y + 13} textAnchor="middle">{arc.sweep}°</text>
      </g>;
    })}
  </g>;
}

function TreeSpacingOverlay({ trees, siteWidth, siteHeight, x, y, width, height }: { trees: TreePoint[]; siteWidth: number; siteHeight: number; x: number; y: number; width: number; height: number }) {
  const annotations = (["array", "row"] as PlantingType[]).flatMap(type => {
    const candidates = trees.filter(tree => tree.type === type);
    if (candidates.length < 2) return [];
    let pair: [TreePoint, TreePoint] | undefined;
    let distance = Number.POSITIVE_INFINITY;
    for (let first = 0; first < candidates.length; first += 1) {
      for (let second = first + 1; second < candidates.length; second += 1) {
        const dx = (candidates[second].x - candidates[first].x) / width * siteWidth;
        const dy = (candidates[second].y - candidates[first].y) / height * siteHeight;
        const nextDistance = Math.hypot(dx, dy);
        if (nextDistance > .05 && nextDistance < distance) {
          distance = nextDistance;
          pair = [candidates[first], candidates[second]];
        }
      }
    }
    return pair ? [{ type, pair, distance }] : [];
  });
  return <g className="tree-dimensions" pointerEvents="none">
    {annotations.map(({ type, pair, distance }) => {
      const [first, second] = pair;
      const dx = second.x - first.x, dy = second.y - first.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / length * 16, ny = dx / length * 16;
      const x1 = Math.max(x + 7, Math.min(x + width - 7, first.x + nx));
      const y1 = Math.max(y + 7, Math.min(y + height - 7, first.y + ny));
      const x2 = Math.max(x + 7, Math.min(x + width - 7, second.x + nx));
      const y2 = Math.max(y + 7, Math.min(y + height - 7, second.y + ny));
      return <g key={type}>
        <line x1={first.x} y1={first.y} x2={x1} y2={y1}/>
        <line x1={second.x} y1={second.y} x2={x2} y2={y2}/>
        <line x1={x1} y1={y1} x2={x2} y2={y2}/>
        <circle cx={x1} cy={y1} r="3"/><circle cx={x2} cy={y2} r="3"/>
        <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 7} textAnchor="middle">樹距 {distance.toFixed(1)} m</text>
      </g>;
    })}
  </g>;
}

export default function Home() {
  const [step, setStep] = useState(1), [paperIndex, setPaperIndex] = useState(0), [paletteIndex, setPaletteIndex] = useState(0);
  const [seed, setStoredSeed] = useState(27), [showDimensions, setShowDimensions] = useState(true);
  const setSeed = (_request?: React.SetStateAction<number>) => setStoredSeed(previous => {
    const next = Math.floor(Math.random() * 2147480000) + 1;
    return next === previous ? next - 1 : next;
  });
  const [focus, setFocus] = useState<Point>({ x: 440, y: 315 }), [focusEditing, setFocusEditing] = useState(false);
  const [customColors, setCustomColors] = useState(["#315c72", "#d68b32", "#8a3f4d"]);
  const paletteOptions = [...palettes, { name: "自選三色", colors: customColors }];
  const [splitCount, setSplitCount] = useState(8);
  const [activeModules, setActiveModules] = useState<number[]>([1, 3, 6]);
  const [centerKind, setCenterKind] = useState<CenterKind>("intersection"), [centerIndex, setCenterIndex] = useState(0), [radius, setRadius] = useState(220), [startSide, setStartSide] = useState<ArcSide>("right"), [sweep, setSweep] = useState(180), [clockwise, setClockwise] = useState(true);
  const [arcEditorLocked,setArcEditorLocked]=useState(false);
  const [editingArc,setEditingArc]=useState<number|null>(null),[editCenter,setEditCenter]=useState<Point|null>(null);
  const [lockedArcs,setLockedArcs]=useState<number[]>([]);
  const [viewTab,setViewTab]=useState<"plan"|"section"|"axon">("plan");
  const [controlTab,setControlTab]=useState("plant");
  const [plantPanel,setPlantPanel]=useState<PlantingType>("array");
  const [rowAlong,setRowAlong]=useState(0);
  const rowDrag=useRef<{pointerId:number;x:number;y:number;offset:number;along:number}|null>(null);
  const [arcs, setArcs] = useState<ArcSpec[]>([]), [pickCenter, setPickCenter] = useState(false), [showArcPreview, setShowArcPreview] = useState(true);
  const [siteWidth, setSiteWidth] = useState(29.7), [siteHeight, setSiteHeight] = useState(29.7);
  const wallEditor=useWallEditor(siteWidth,siteHeight);
  const wallEditing=step===4&&controlTab==="wall";
  const [crownHeight, setCrownHeight] = useState(8), [trunkHeight, setTrunkHeight] = useState(3), [plantingTypes, setPlantingTypes] = useState<PlantingType[]>(["array"]);
  const [arrayRows, setArrayRows] = useState(3), [arrayColumns, setArrayColumns] = useState(4), [arrayRowSpacing, setArrayRowSpacing] = useState(4), [arrayColumnSpacing, setArrayColumnSpacing] = useState(4);
  const [arrayAnchor, setArrayAnchor] = useState<Point>({ x: .38, y: .38 });
  const [rowRows, setRowRows] = useState(1), [rowColumns, setRowColumns] = useState(6), [rowRowSpacing, setRowRowSpacing] = useState(4), [rowColumnSpacing, setRowColumnSpacing] = useState(4);
  const [singlePositions, setSinglePositions] = useState<Point[]>([{ x: .72, y: .62 }]), [selectedSingleIndex, setSelectedSingleIndex] = useState(0), [plantingPlacementMode, setPlantingPlacementMode] = useState<PlantingPlacementMode>(null);
  const [rowGuide, setRowGuide] = useState<RowGuide>("split"), [rowGuideIndex, setRowGuideIndex] = useState(0), [rowOffset, setRowOffset] = useState(0);
  const [layerLocks,setLayerLocks]=useState({array:false,row:false,single:false,section:false});
  const [lockedTrees,setLockedTrees]=useState<Partial<Record<PlantingType,Point[]>>>({});
  const plantDrag=useRef<{type:"array"|"single";index:number;pointerId:number}|null>(null);
  const anyPlantLocked=layerLocks.array || layerLocks.row || layerLocks.single;
  const anyLayerLocked=anyPlantLocked || layerLocks.section || wallEditor.walls.length>0;
  const [sectionLines, setSectionLines] = useState<SectionLine[]>([]);
  const [selectedSection, setSelectedSection] = useState<number|null>(null);
  const [draftSection, setDraftSection] = useState<Point[]>([]);
  const [alignment, setAlignment] = useState<SectionAlignment>("auto");
  const nextSectionId = useRef(0);
  const sectionDrag = useRef<{id:number;index:number;pointerId:number;origin:Point;points:Point[]}|null>(null);
  const selectedLine = sectionLines.find(line => line.id === selectedSection);
  const sectionLine = selectedLine?.points ?? [];
  const setSectionLine = (update: React.SetStateAction<Point[]>) => {if(layerLocks.section) return;setSectionLines(lines => lines.map(line => line.id === selectedSection ? {...line,points:typeof update === "function" ? update(line.points) : update} : line));};
  const [drawingSection, setDrawingSection] = useState(false);
  const sectionDirection = 1;
  const [sectionDepth, setSectionDepth] = useState(15);
  const [sectionMessage, setSectionMessage] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const paper = papers[paperIndex];
  const pixelsPerCentimeter = 21.5;
  const rawDisplayWidth = paper.width * pixelsPerCentimeter;
  const rawDisplayHeight = paper.height * pixelsPerCentimeter;
  const isTallPaper = paper.height / paper.width > 1.9;
  // Portrait sheets retain their exact aspect ratio, but use a compact presentation
  // scale so 1:√4–1:√6 do not dominate the full working surface.
  const previewScale = isTallPaper ? Math.min(1, 540 / rawDisplayHeight) : 1;
  const paperDisplayWidth = rawDisplayWidth * previewScale;
  const paperDisplayHeight = rawDisplayHeight * previewScale;
  const paperXOffset = (1000 - paperDisplayWidth) / 2;
  // Keep a protected band above the sheet for the overall width dimension.
  // A centred A4-square preview leaves only ~31 units at the top, while the
  // dimension text needs 34 units; it was therefore clipped by the SVG edge.
  const paperYOffset = Math.min(700 - paperDisplayHeight - 4, Math.max(58, (700 - paperDisplayHeight) / 2));
  // STEP 03 uses the selected STEP 01/02 sheet dimensions as metres at 1/100.
  // This keeps the exact 1:√n proportion while enlarging the composition into a site.
  const isStepThree = step >= 3;
  const sitePreviewScale = Math.min(900 / siteWidth, 580 / siteHeight);
  const siteDisplayWidth = siteWidth * sitePreviewScale, siteDisplayHeight = siteHeight * sitePreviewScale;
  const displayWidth = isStepThree ? siteDisplayWidth : paperDisplayWidth;
  const displayHeight = isStepThree ? siteDisplayHeight : paperDisplayHeight;
  const xOffset = isStepThree ? (1000 - displayWidth) / 2 : paperXOffset;
  const yOffset = isStepThree ? Math.max(58, (700 - displayHeight) / 2) : paperYOffset;
  const focusBounds = { minX: 250, maxX: 750, minY: 175, maxY: 525 };
  const activeFocus = { x: Math.max(focusBounds.minX, Math.min(focusBounds.maxX, focus.x)), y: Math.max(focusBounds.minY, Math.min(focusBounds.maxY, focus.y)) };
  const regions = useMemo(() => makeBestRegions(seed, splitCount, activeFocus, activeModules), [seed, splitCount, activeFocus.x, activeFocus.y, activeModules]), palette = paletteOptions[paletteIndex] ?? paletteOptions[0];
  const centerChoices = useMemo(() => makeArcCenterChoices(regions, xOffset, yOffset, displayWidth, displayHeight), [regions, xOffset, yOffset, displayWidth, displayHeight]);
  const divisionLines = useMemo(() => makeDivisionLines(regions, xOffset, yOffset, displayWidth, displayHeight), [regions, xOffset, yOffset, displayWidth, displayHeight]);
  const currentChoices = centerChoices[centerKind];
  const center = editCenter ?? currentChoices[centerIndex % currentChoices.length]?.point ?? { x: 500, y: 350 };
  const centerLabel = currentChoices[centerIndex % currentChoices.length]?.label ?? "分割交點";
  const activeSide = arcSides.find(side => side.id === startSide) ?? arcSides[0];
  const mathStart=(360-activeSide.angle)%360;
  const mathEnd=(mathStart+(clockwise?-sweep:sweep)+720)%360;
  const arcInputLocked=arcEditorLocked||(editingArc!==null&&lockedArcs.includes(editingArc));
  const activeArc: ArcSpec = { center, radius, start: activeSide.angle, sweep, clockwise, color: arcs.length % 3 };
  const displayArcs = useMemo(() => {
    if (!isStepThree) return arcs;
    const scale = Math.min(displayWidth / paperDisplayWidth, displayHeight / paperDisplayHeight);
    return arcs.map(arc => ({ ...arc,
      center: {
        x: xOffset + (arc.center.x - paperXOffset) / paperDisplayWidth * displayWidth,
        y: yOffset + (arc.center.y - paperYOffset) / paperDisplayHeight * displayHeight,
      },
      radius: arc.radius * scale,
    }));
  }, [arcs, isStepThree, displayWidth, displayHeight, xOffset, yOffset, paperDisplayWidth, paperDisplayHeight, paperXOffset, paperYOffset]);
  const sameArc=(a:ArcSpec,b:ArcSpec)=>Math.abs(a.center.x-b.center.x)<.001&&Math.abs(a.center.y-b.center.y)<.001&&Math.abs(a.radius-b.radius)<.001&&a.sweep===b.sweep&&(a.sweep===360||(a.start===b.start&&a.clockwise===b.clockwise));
  const colorFaces=useMemo(()=>{
    const visible=step===1?[]:step===2&&showArcPreview?(editingArc!==null?arcs.map((arc,i)=>i===editingArc?activeArc:arc):arcs.some(a=>sameArc(a,activeArc))?arcs:[...arcs,activeArc]):arcs;
    return composeFaces(regions,visible,{x:paperXOffset,y:paperYOffset,width:paperDisplayWidth,height:paperDisplayHeight});
  },[regions,arcs,editingArc,step,step===2&&showArcPreview,step===2?center.x:0,step===2?center.y:0,step===2?radius:0,step===2?activeSide.angle:0,step===2?sweep:0,step===2?clockwise:false,paperXOffset,paperYOffset,paperDisplayWidth,paperDisplayHeight]);
  const siteEdges: DivisionLine[] = [
    { axis: "horizontal", value: yOffset, from: xOffset, to: xOffset + displayWidth },
    { axis: "horizontal", value: yOffset + displayHeight, from: xOffset, to: xOffset + displayWidth },
    { axis: "vertical", value: xOffset, from: yOffset, to: yOffset + displayHeight },
    { axis: "vertical", value: xOffset + displayWidth, from: yOffset, to: yOffset + displayHeight },
  ];
  const internalDivisionLines = divisionLines.filter(line => !(line.axis === "horizontal" && (Math.abs(line.value - yOffset) < 1 || Math.abs(line.value - (yOffset + displayHeight)) < 1)) && !(line.axis === "vertical" && (Math.abs(line.value - xOffset) < 1 || Math.abs(line.value - (xOffset + displayWidth)) < 1)));
  const effectiveRowGuide: RowGuide = rowGuide === "arc" && displayArcs.length === 0 ? "split" : rowGuide;
  const extendedDivisionLines=internalDivisionLines.filter((line,i,all)=>all.findIndex(other=>other.axis===line.axis&&Math.abs(other.value-line.value)<.5)===i).map(line=>({...line,from:line.axis==="vertical"?yOffset:xOffset,to:line.axis==="vertical"?yOffset+displayHeight:xOffset+displayWidth}));
  const selectedRowLineSource = effectiveRowGuide === "edge" ? siteEdges : extendedDivisionLines;
  const selectedRowLine = selectedRowLineSource[rowGuideIndex % Math.max(1, selectedRowLineSource.length)];
  const selectedRowArc = displayArcs[rowGuideIndex % Math.max(1, displayArcs.length)];
  const wallGuides = [...[...internalDivisionLines,...siteEdges].map((l,i)=>({label:`${i<internalDivisionLines.length?'分割線':'邊界線'} ${i<internalDivisionLines.length?i+1:i-internalDivisionLines.length+1}・${l.axis==='horizontal'?'水平':'垂直'}`,a:l.axis==='horizontal'?{x:(l.from-xOffset)/sitePreviewScale,y:(l.value-yOffset)/sitePreviewScale}:{x:(l.value-xOffset)/sitePreviewScale,y:(l.from-yOffset)/sitePreviewScale},b:l.axis==='horizontal'?{x:(l.to-xOffset)/sitePreviewScale,y:(l.value-yOffset)/sitePreviewScale}:{x:(l.value-xOffset)/sitePreviewScale,y:(l.to-yOffset)/sitePreviewScale}})), ...arcs.flatMap((arc,i)=>{const points=Array.from({length:Math.max(2,Math.ceil(arc.sweep)+1)},(_,j)=>{const angle=(arc.start+(arc.clockwise?1:-1)*arc.sweep*j/Math.ceil(arc.sweep))*Math.PI/180;return{x:(arc.center.x+arc.radius*Math.cos(angle)-paperXOffset)/paperDisplayWidth*siteWidth,y:(arc.center.y+arc.radius*Math.sin(angle)-paperYOffset)/paperDisplayHeight*siteHeight};});return clipGuide(points,siteWidth,siteHeight).map((path,j)=>({a:path[0],b:path[path.length-1],path,label:`弧線 ${i+1}・曲牆${j?'・段 '+(j+1):''}`}));})];
  const printArea = siteWidth * siteHeight;
  const minimumSiteArea = paper.width * paper.height;
  const siteValid = siteWidth >= paper.width && siteHeight >= paper.height;
  const plantingLabel = plantingOptions.filter(option => plantingTypes.includes(option.id)).map(option => option.label).join("＋") || "尚未配置";
  const trees = useMemo(() => {
    const points: TreePoint[] = (["array","row","single"] as PlantingType[]).flatMap(type=>layerLocks[type] ? (lockedTrees[type]??[]).map(p=>({x:xOffset+p.x*displayWidth,y:yOffset+p.y*displayHeight,type})) : []);
    const crownRadius = Math.max(14, 2 / siteWidth * displayWidth);
    const full = { left: xOffset + crownRadius + 9, right: xOffset + displayWidth - crownRadius - 9, top: yOffset + crownRadius + 9, bottom: yOffset + displayHeight - crownRadius - 9 };
    const add = (x: number, y: number, type: PlantingType, clampToSite = true) => {
      if (points.length >= 20) return false;
      if (type === "row" && effectiveRowGuide === "edge") {
        if (x < xOffset-1e-8 || x > xOffset+displayWidth+1e-8 || y < yOffset-1e-8 || y > yOffset+displayHeight+1e-8) return false;
        points.push({x,y,type}); return true;
      }
      const inside = x >= full.left && x <= full.right && y >= full.top && y <= full.bottom;
      if (!inside && !clampToSite) return false;
      points.push({ x: Math.max(full.left, Math.min(full.right, x)), y: Math.max(full.top, Math.min(full.bottom, y)), type });
      return true;
    };
    if (plantingTypes.includes("array") && !layerLocks.array) {
      const gapX = Math.min(arrayColumnSpacing / siteWidth * displayWidth, (full.right - full.left) / Math.max(1, arrayColumns - 1));
      const gapY = Math.min(arrayRowSpacing / siteHeight * displayHeight, (full.bottom - full.top) / Math.max(1, arrayRows - 1));
      const totalWidth = gapX * (arrayColumns - 1), totalHeight = gapY * (arrayRows - 1);
      const requestedCenterX = xOffset + arrayAnchor.x * displayWidth, requestedCenterY = yOffset + arrayAnchor.y * displayHeight;
      const centerX = Math.max(full.left + totalWidth / 2, Math.min(full.right - totalWidth / 2, requestedCenterX));
      const centerY = Math.max(full.top + totalHeight / 2, Math.min(full.bottom - totalHeight / 2, requestedCenterY));
      const startX = centerX - totalWidth / 2, startY = centerY - totalHeight / 2;
      for (let row = 0; row < arrayRows; row += 1) {
        for (let column = 0; column < arrayColumns; column += 1) add(startX + column * gapX, startY + row * gapY, "array");
      }
    }
    if (plantingTypes.includes("row") && !layerLocks.row) {
      if (effectiveRowGuide === "arc" && selectedRowArc) {
          const direction = selectedRowArc.clockwise ? 1 : -1;
          for (let row = 0; row < rowRows; row += 1) {
            const rowShift = (row - (rowRows - 1) / 2) * rowRowSpacing + rowOffset;
            const offsetRadius = Math.max(crownRadius + 4, selectedRowArc.radius + rowShift / siteWidth * displayWidth);
            const realRadius = offsetRadius / displayWidth * siteWidth;
            const effectiveSpacing = Math.max(4, rowColumnSpacing);
            const angleStep = effectiveSpacing >= realRadius * 2 ? Number.POSITIVE_INFINITY : 2 * Math.asin(effectiveSpacing / (2 * realRadius));
            const availableAngle = selectedRowArc.sweep * Math.PI / 180;
            const capacity = Number.isFinite(angleStep) ? Math.max(1, Math.floor(availableAngle / angleStep) + 1) : 1;
            const usedColumns = Math.min(rowColumns, capacity, 20 - points.length);
            const usedSweep = usedColumns <= 1 ? 0 : angleStep * 180 / Math.PI * (usedColumns - 1);
            const startDegree = selectedRowArc.start + direction * ((selectedRowArc.sweep - usedSweep) / 2 + Math.max(-(selectedRowArc.sweep-usedSweep)/2,Math.min((selectedRowArc.sweep-usedSweep)/2,rowAlong/realRadius*180/Math.PI)));
            for (let column = 0; column < usedColumns; column += 1) {
              const t = usedColumns === 1 ? .5 : column / (usedColumns - 1);
              const degree = startDegree + direction * usedSweep * t;
              add(selectedRowArc.center.x + Math.cos(degree * Math.PI / 180) * offsetRadius, selectedRowArc.center.y + Math.sin(degree * Math.PI / 180) * offsetRadius, "row", false);
            }
          }
        } else if (selectedRowLine) {
          const isVertical = selectedRowLine.axis === "vertical";
          const isEdge = effectiveRowGuide === "edge";
          const safeFrom = isEdge ? selectedRowLine.from : Math.max(selectedRowLine.from, isVertical ? full.top : full.left);
          const safeTo = isEdge ? selectedRowLine.to : Math.min(selectedRowLine.to, isVertical ? full.bottom : full.right);
          const span = safeTo - safeFrom;
          const axisScale = isVertical ? displayWidth / siteWidth : displayHeight / siteHeight;
          const nearEdge = isVertical ? xOffset : yOffset;
          const inward = Math.abs(selectedRowLine.value - nearEdge) < 1 ? 1 : -1;
          const edgeBase = selectedRowLine.value;
          const effectiveSpacing = Math.max(4, rowColumnSpacing);
          const requestedGap = isVertical ? effectiveSpacing / siteHeight * displayHeight : effectiveSpacing / siteWidth * displayWidth;
          const capacity = span < 0 ? 0 : Math.floor(span / Math.max(1, requestedGap)) + 1;
          const usedColumns = Math.min(rowColumns, capacity, 20 - points.length);
          const start = Math.max(safeFrom,Math.min(safeTo-requestedGap*(usedColumns-1),(safeFrom + safeTo - requestedGap * (usedColumns - 1)) / 2 + rowAlong*(isVertical?displayHeight/siteHeight:displayWidth/siteWidth)));
          for (let row = 0; row < rowRows; row += 1) {
            const rowShift = (row - (rowRows - 1) / 2) * rowRowSpacing + rowOffset;
            const offset = rowShift * axisScale;
            const rowPosition = isEdge
              ? edgeBase + inward * (row * rowRowSpacing + Math.max(0, rowOffset)) * axisScale
              : selectedRowLine.value + offset;
            for (let column = 0; column < usedColumns; column += 1) add(
              isVertical ? rowPosition : start + column * requestedGap,
              isVertical ? start + column * requestedGap : rowPosition,
              "row",
              false,
            );
          }
        }
    }
    if (plantingTypes.includes("single") && !layerLocks.single) {
      singlePositions.forEach(position => add(xOffset + position.x * displayWidth, yOffset + position.y * displayHeight, "single"));
    }
    return points;
  }, [layerLocks, lockedTrees, plantingTypes, arrayRows, arrayColumns, arrayRowSpacing, arrayColumnSpacing, arrayAnchor, rowRows, rowColumns, rowRowSpacing, rowColumnSpacing, singlePositions, siteWidth, siteHeight, displayWidth, displayHeight, xOffset, yOffset, effectiveRowGuide, selectedRowArc, selectedRowLine, rowOffset,rowAlong]);
  const exportTreeRadius=Math.max(14,2/siteWidth*displayWidth)+18;
  const wallExportMargin=step===4&&wallEditor.walls.length?sitePreviewScale*.1:0;
  const exportLeft=Math.min(xOffset-wallExportMargin,...trees.map(t=>t.x-exportTreeRadius));
  const exportTop=Math.min(yOffset-wallExportMargin,...trees.map(t=>t.y-exportTreeRadius));
  const exportRight=Math.max(xOffset+displayWidth+wallExportMargin,...trees.map(t=>t.x+exportTreeRadius));
  const exportBottom=Math.max(yOffset+displayHeight+wallExportMargin,...trees.map(t=>t.y+exportTreeRadius));
  const planViewLeft=Math.min(0,exportLeft),planViewTop=Math.min(0,exportTop);
  const planViewWidth=Math.max(1000,exportRight)-planViewLeft,planViewHeight=Math.max(700,exportBottom)-planViewTop;
  const paperViewLeft=Math.min(0,paperXOffset-90),paperViewTop=Math.min(0,paperYOffset-90);
  const planViewport=useDrawingViewport(step>=3?{x:planViewLeft,y:planViewTop,width:planViewWidth,height:planViewHeight+70}:{x:paperViewLeft,y:paperViewTop,width:Math.max(1000,paperXOffset+paperDisplayWidth+90)-paperViewLeft,height:Math.max(700,paperYOffset+paperDisplayHeight+90)-paperViewTop});
  const placedTreeCounts = trees.reduce<Record<PlantingType, number>>((counts, tree) => ({ ...counts, [tree.type]: counts[tree.type] + 1 }), { array: 0, row: 0, single: 0 });
  const requestedTreeCount = (plantingTypes.includes("array") ? arrayRows * arrayColumns : 0)
    + (plantingTypes.includes("row") ? rowRows * rowColumns : 0)
    + (plantingTypes.includes("single") ? singlePositions.length : 0);
  const treeCountMessage = trees.length === 0
    ? "尚未配置植栽。"
    : trees.length < 12
      ? `目前 ${trees.length} 棵，尚需增加 ${12 - trees.length} 棵才符合要求。`
      : requestedTreeCount > 20
        ? `設定共 ${requestedTreeCount} 棵，已依上限自動停止於 20 棵。`
        : `目前 ${trees.length} 棵，符合 12–20 棵作業範圍。`;
  function beginRowDrag(event:React.PointerEvent<SVGCircleElement>) {
    if(layerLocks.row) return;
    event.preventDefault();event.stopPropagation();
    const svg=svgRef.current,matrix=svg?.getScreenCTM();if(!svg||!matrix)return;
    const cursor=svg.createSVGPoint();cursor.x=event.clientX;cursor.y=event.clientY;const p=cursor.matrixTransform(matrix.inverse());
    rowDrag.current={pointerId:event.pointerId,x:p.x,y:p.y,offset:rowOffset,along:rowAlong};
    setDrawingSection(false);setDraftSection([]);setPlantingPlacementMode(null);setControlTab("plant");setPlantPanel("row");svg.setPointerCapture(event.pointerId);
  }
  function moveRow(event:React.PointerEvent<SVGSVGElement>) {
    const drag=rowDrag.current,matrix=event.currentTarget.getScreenCTM();if(!drag||!matrix||layerLocks.row||drag.pointerId!==event.pointerId)return;
    const cursor=event.currentTarget.createSVGPoint();cursor.x=event.clientX;cursor.y=event.clientY;const p=cursor.matrixTransform(matrix.inverse());
    const dx=(p.x-drag.x)/displayWidth*siteWidth,dy=(p.y-drag.y)/displayHeight*siteHeight;
    let normal=0,along=0;
    if(effectiveRowGuide==="arc" && selectedRowArc){const nx=drag.x-selectedRowArc.center.x,ny=drag.y-selectedRowArc.center.y,len=Math.hypot(nx,ny)||1;normal=(dx*nx+dy*ny)/len;along=(-dx*ny+dy*nx)/len*(selectedRowArc.clockwise?1:-1);}
    else if(selectedRowLine){normal=selectedRowLine.axis==="vertical"?dx:dy;along=selectedRowLine.axis==="vertical"?dy:dx;if(effectiveRowGuide==="edge" && Math.abs(selectedRowLine.value-(selectedRowLine.axis==="vertical"?xOffset:yOffset))>1)normal=-normal;}
    setRowOffset(Math.round(Math.max(effectiveRowGuide==="edge"?0:-6,Math.min(6,drag.offset+normal))*10)/10);
    setRowAlong(Math.round(Math.max(-Math.max(siteWidth,siteHeight),Math.min(Math.max(siteWidth,siteHeight),drag.along+along))*10)/10);
  }
  function chooseCenterKind(kind: CenterKind) { setEditCenter(null); setCenterKind(kind); setCenterIndex(0); setPickCenter(false); setShowArcPreview(true); }
  function cycleCenter(direction: number) {
    setEditCenter(null);
    const items = centerChoices[centerKind];
    if (!items.length) return;
    setCenterIndex(index => (index + direction + items.length) % items.length); setShowArcPreview(true);
  }
  function toggleLayer(type:PlantingType|"section") {
    if(type!=="section" && !layerLocks[type]) setLockedTrees(current=>({...current,[type]:trees.filter(t=>t.type===type).map(t=>({x:(t.x-xOffset)/displayWidth,y:(t.y-yOffset)/displayHeight}))}));
    setLayerLocks(current=>({...current,[type]:!current[type]}));
    setPlantingPlacementMode(null);setDrawingSection(false);setDraftSection([]);
    sectionDrag.current=null;plantDrag.current=null;rowDrag.current=null;
  }
  function updatePlantPosition(type:"array"|"single",index:number,p:Point) {
    if(layerLocks[type]) return;
    const radius=Math.max(14,2/siteWidth*displayWidth)+9;
    let hx=radius/displayWidth,hy=radius/displayHeight;
    if(type==="array") {hx=Math.min(.5,(arrayColumns-1)*arrayColumnSpacing/2/siteWidth+radius/displayWidth);hy=Math.min(.5,(arrayRows-1)*arrayRowSpacing/2/siteHeight+radius/displayHeight);}
    const value={x:Math.max(hx,Math.min(1-hx,p.x)),y:Math.max(hy,Math.min(1-hy,p.y))};
    if(type==="array") setArrayAnchor(value);else setSinglePositions(items=>items.map((old,i)=>i===index?value:old));
  }
  function beginPlantDrag(event:React.PointerEvent<SVGCircleElement>,type:"array"|"single",index:number) {
    if(layerLocks[type]) return;
    event.preventDefault();event.stopPropagation();
    setDrawingSection(false);setDraftSection([]);setPlantingPlacementMode(type);setSelectedSingleIndex(index);
    plantDrag.current={type,index,pointerId:event.pointerId};svgRef.current?.setPointerCapture(event.pointerId);
  }
  function movePlant(event:React.PointerEvent<SVGSVGElement>) {
    const drag=plantDrag.current,matrix=event.currentTarget.getScreenCTM();
    if(!drag || !matrix || drag.pointerId!==event.pointerId || layerLocks[drag.type]) return;
    const cursor=event.currentTarget.createSVGPoint();cursor.x=event.clientX;cursor.y=event.clientY;
    const p=cursor.matrixTransform(matrix.inverse());
    updatePlantPosition(drag.type,drag.index,{x:(p.x-xOffset)/displayWidth,y:(p.y-yOffset)/displayHeight});
  }
  function selectSection(id:number) {setSelectedSection(id);setDrawingSection(false);setDraftSection([]);setPlantingPlacementMode(null);}
  function beginSectionDrag(event:React.PointerEvent<SVGElement>,id:number,index:number) {
    if(layerLocks.section) return;
    event.preventDefault();event.stopPropagation();selectSection(id);
    const svg=svgRef.current, matrix=svg?.getScreenCTM();
    const line=sectionLines.find(item=>item.id===id);
    if(!svg || !matrix || !line) return;
    const cursor=svg.createSVGPoint();cursor.x=event.clientX;cursor.y=event.clientY;
    const p=cursor.matrixTransform(matrix.inverse());
    sectionDrag.current={id,index,pointerId:event.pointerId,origin:{x:(p.x-xOffset)/displayWidth,y:(p.y-yOffset)/displayHeight},points:line.points.map(p=>({...p}))};
    svgRef.current?.setPointerCapture(event.pointerId);
  }
  function moveSectionEndpoint(event:React.PointerEvent<SVGSVGElement>) {
    const drag=sectionDrag.current, matrix=event.currentTarget.getScreenCTM();
    if (!drag || !matrix || event.pointerId!==drag.pointerId || layerLocks.section) return;
    event.preventDefault();
    const cursor=event.currentTarget.createSVGPoint();cursor.x=event.clientX;cursor.y=event.clientY;
    const p=cursor.matrixTransform(matrix.inverse());
    setSectionLines(lines=>lines.map(line=>{
      if(line.id!==drag.id) return line;
      if(drag.index===-1) return {...line,points:translateSection(drag.points,{x:(p.x-xOffset)/displayWidth-drag.origin.x,y:(p.y-yOffset)/displayHeight-drag.origin.y})};
      const anchor=line.points[1-drag.index];
      const point=alignEndpoint(anchor,{x:(p.x-xOffset)/displayWidth,y:(p.y-yOffset)/displayHeight},alignment,siteWidth,siteHeight);
      if(Math.hypot((point.x-anchor.x)*siteWidth,(point.y-anchor.y)*siteHeight)<.5) return line;
      return {...line,points:line.points.map((old,i)=>i===drag.index?point:old)};
    }));
  }
  function endSectionDrag(event:React.PointerEvent<SVGSVGElement>) {
    if(sectionDrag.current?.pointerId!==event.pointerId) return;
    sectionDrag.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function changeAlignment(mode:SectionAlignment) {
    setAlignment(mode);
    if(!drawingSection && selectedLine && (mode==="horizontal" || mode==="vertical")) {
      const [a,b]=selectedLine.points;
      // Keep the line's centre and span while fitting the selected axis inside the site.
      const length=Math.hypot((b.x-a.x)*siteWidth,(b.y-a.y)*siteHeight);
      const horizontal=mode==="horizontal", span=Math.min(1,length/(horizontal?siteWidth:siteHeight));
      const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      const mid=Math.max(span/2,Math.min(1-span/2,horizontal?center.x:center.y));
      const sign=(horizontal?b.x-a.x:b.y-a.y)<0?-1:1;
      setSectionLine(horizontal?[{x:mid-sign*span/2,y:center.y},{x:mid+sign*span/2,y:center.y}]:[{x:center.x,y:mid-sign*span/2},{x:center.x,y:mid+sign*span/2}]);
    }
  }
  function handleCanvasClick(event: React.MouseEvent<SVGSVGElement>) {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const cursor = event.currentTarget.createSVGPoint();
    cursor.x = event.clientX; cursor.y = event.clientY;
    const point = cursor.matrixTransform(matrix.inverse());
    if (step >= 3 && drawingSection && !layerLocks.section) {
      let normalized = { x: (point.x - xOffset) / displayWidth, y: (point.y - yOffset) / displayHeight };
      if (normalized.x < 0 || normalized.x > 1 || normalized.y < 0 || normalized.y > 1) { setSectionMessage("請點選基地範圍內的位置。"); return; }
      if (draftSection.length) {
        normalized = alignEndpoint(draftSection[0], normalized, alignment, siteWidth, siteHeight);
        if (Math.hypot((normalized.x-draftSection[0].x)*siteWidth,(normalized.y-draftSection[0].y)*siteHeight)<.5) {setSectionMessage("兩端距離至少需 0.5 m。");return;}
        const id=nextSectionId.current++;
        setSectionLines(lines=>[...lines,{id,label:sectionLabel(id),points:[draftSection[0],normalized]}]);
        setSelectedSection(id); setDraftSection([]); setDrawingSection(false);
      } else setDraftSection([normalized]);
      setSectionMessage("");
      return;
    }
    if (step === 1 && focusEditing && !arcEditorLocked && !lockedArcs.length && !wallEditor.walls.length) {
      const compositionPoint = { x: (point.x - xOffset) / displayWidth * 1000, y: (point.y - yOffset) / displayHeight * 700 };
      setFocus({ x: Math.max(focusBounds.minX, Math.min(focusBounds.maxX, compositionPoint.x)), y: Math.max(focusBounds.minY, Math.min(focusBounds.maxY, compositionPoint.y)) });
      setFocusEditing(false);
      return;
    }
    if (!wallEditing && step >= 3 && plantingPlacementMode && !layerLocks[plantingPlacementMode]) {
      const normalized = {
        x: Math.max(.04, Math.min(.96, (point.x - xOffset) / displayWidth)),
        y: Math.max(.04, Math.min(.96, (point.y - yOffset) / displayHeight)),
      };
      updatePlantPosition(plantingPlacementMode,selectedSingleIndex,normalized);
      return;
    }
    if (step !== 2 || !pickCenter || arcInputLocked) return;
    const nearest = (Object.keys(centerChoices) as CenterKind[]).flatMap(kind => centerChoices[kind].map((choice, index) => ({ kind, index, choice, distance: Math.hypot(choice.point.x - point.x, choice.point.y - point.y) }))).sort((a, b) => a.distance - b.distance)[0];
    if (nearest) { setEditCenter(null); setCenterKind(nearest.kind); setCenterIndex(nearest.index); setShowArcPreview(true); }
    setPickCenter(false);
  }
  function clearArcs() {
    if(arcEditorLocked)return;
    setEditingArc(null);setEditCenter(null);
    setArcs(items=>items.filter((_,i)=>lockedArcs.includes(i)));setLockedArcs(items=>items.map((_,i)=>i)); setCenterKind("intersection"); setCenterIndex(0); setRadius(220); setStartSide("right"); setSweep(180); setClockwise(true); setPickCenter(false); setShowArcPreview(false);
  }
  function updateCustomColor(index: number, value: string) {
    const numeric = Number.parseInt(value.slice(1), 16);
    if (Number.isFinite(numeric) && (numeric >> 16) > 245 && ((numeric >> 8) & 255) > 245 && (numeric & 255) > 245) return;
    setCustomColors(colors => colors.map((color, i) => i === index ? value : color));
    setPaletteIndex(palettes.length);
  }
  function toggleRatioModule(value: number) {
    setActiveModules(items => items.includes(value) ? (items.length === 1 ? items : items.filter(item => item !== value)) : [...items, value].sort((a, b) => a - b));
  }
  function togglePlantingType(type: PlantingType) {
    setPlantPanel(type);
    if(layerLocks[type]) return;
    setPlantingTypes(items => items.includes(type)
      ? (items.length === 1 ? items : items.filter(item => item !== type))
      : [...items, type]);
  }
  function updateSingleCount(count: number) {
    setSinglePositions(items => Array.from({ length: count }, (_, index) => items[index] ?? {
      x: .18 + (index % 4) * .2,
      y: .22 + (Math.floor(index / 4) % 4) * .18,
    }));
    setSelectedSingleIndex(index => Math.min(index, count - 1));
  }
  function clearPlantings() {
    setPlantingTypes(items=>items.filter(type=>layerLocks[type]));
    setPlantingPlacementMode(null);
    setSelectedSingleIndex(0);
  }
  const placementPoint = plantingPlacementMode === "array" ? arrayAnchor : (singlePositions[selectedSingleIndex] ?? { x: .5, y: .5 });
  function choosePaper(index: number) {
    const nextPaper = papers[index];
    setPaperIndex(index);
    setSiteWidth(Number(nextPaper.width.toFixed(2)));
    setSiteHeight(Number(nextPaper.height.toFixed(2)));
  }
  function saveArc() {
    if(arcInputLocked||!showArcPreview)return;
    setArcs(items=>editingArc===null?(items.some(a=>sameArc(a,activeArc))?items:[...items,activeArc]):items.map((a,i)=>i===editingArc?activeArc:a));
    setShowArcPreview(false);setPickCenter(false);
  }
  function selectArc(i:number){
    if(i===editingArc)return;
    const a=arcs[i];setEditingArc(i);setEditCenter(a.center);setRadius(a.radius);setSweep(a.sweep);setClockwise(a.clockwise);setStartSide(arcSides.find(s=>s.angle===a.start)?.id??"right");
    const match=(Object.keys(centerChoices) as CenterKind[]).flatMap(kind=>centerChoices[kind].map((c,index)=>({kind,index,c}))).find(v=>Math.hypot(v.c.point.x-a.center.x,v.c.point.y-a.center.y)<1);
    if(match){setCenterKind(match.kind);setCenterIndex(match.index);}setShowArcPreview(false);setPickCenter(false);
  }
  function changeStep(nextStep: number) {
    if (nextStep!==2 && step===2)saveArc();
    setStep(nextStep);planViewport.reset();setViewTab("plan");setPlantingPlacementMode(null);setDrawingSection(false);setDraftSection([]);
    if(nextStep===4)setControlTab("wall");else if(controlTab==="wall")setControlTab("plant");
  }
  const exportImage = () => downloadSvgAsPng(svgRef.current, `景觀空間定義_作業一-${step}.png`);

  return <main>
    <header className="topbar">
<div className="brand-mark">空間<br />定義</div>
<div>
<p className="department">朝陽科技大學｜景觀及都市設計系</p>
<p>景觀設計（一）｜作業一</p>
<h1>景觀空間定義互動設計</h1>
</div>
<button className="export top-export" onClick={exportImage}>匯出平面 PNG</button>
</header>
    <nav className="steps" aria-label="作業階段">{[[1,"01","水平・垂直分割"],[2,"02","加入弧線分割"],[3,"03","基地平面配置"],[4,"04","牆體・空間架構"]].map(([number,no,label]) => <button key={number} className={step === number ? "active" : ""} onClick={() => changeStep(number as number)}>
<span>{no}</span>
<b>{label}</b>
</button>)}</nav>
    <section className="workspace">
      <aside className="controls">
        <div className="section-heading">
<span>STEP 0{step}</span>
<h2>{step === 1 ? "建立比例秩序" : step === 2 ? "以弧線改變動勢" : step===4 ? "以牆定義空間" : "把構圖轉為空間"}</h2>
<p>{step === 1 ? "先確立底紙與色彩，再由水平、垂直線建立清楚的主從關係。" : step === 2 ? "設定合法圓心、半徑、起點方向、轉過角度與旋轉方向，讓弧形完整切入既有秩序。" : "在 1/100 基地中，以同規格喬木測試空間容量、節奏與邊界。"}</p>
</div>
        {step === 1 && <>
{(arcEditorLocked||lockedArcs.length>0||wallEditor.walls.length>0)&&<p>底圖被弧線鎖定或牆體配置保護；請先解鎖弧線／清除牆體後修改。</p>}<fieldset disabled={arcEditorLocked||lockedArcs.length>0||wallEditor.walls.length>0} style={{border:0,padding:0,minWidth:0}}>
<ControlRow label="底紙比例" value={papers[paperIndex].short}>
<select value={paperIndex} onChange={e => choosePaper(Number(e.target.value))}>{papers.map((item,index) => <option value={index} key={item.label}>{item.label}</option>)}</select>
</ControlRow>
<ControlRow label="分割區域" value={`${splitCount} 區`}>
<input type="range" min="4" max="16" value={splitCount} onChange={e => setSplitCount(Number(e.target.value))}/>
</ControlRow>
<div className="module-composer">
<span>
<b>比例模組組合</b>
<em>{activeModules.length} 組已選</em>
</span>
<p>可多選 1 : √1 至 1 : √6；系統將其轉為主區塊、次區塊與帶狀節奏的比例。</p>
<div className="module-grid">{ratioModules.map(module => <button key={module.value} className={activeModules.includes(module.value) ? "selected" : ""} onClick={() => toggleRatioModule(module.value)}>{module.label}</button>)}</div>
</div>
<div className="fixed-rule">
<span>
<b>主分割規則</b>
<em>主軸階層延伸</em>
</span>
<p>先以十字焦點形成不等大的四個主區塊，再從較大區塊延伸次分割，形成主、次與細帶的節奏。</p>
</div>
<div className="axis-control">
<div>
<span>
<b>主軸十字焦點</b>
<em>X {Math.round(activeFocus.x)}・Y {Math.round(activeFocus.y)}</em>
</span>
<small>所有分割由同一個水平／垂直焦點組織</small>
</div>
<button className={focusEditing ? "selected" : ""} onClick={() => setFocusEditing(value => !value)}>{focusEditing ? "請點畫布" : "調整焦點"}</button>
</div>
<div className="control-row">
<span>
<b>三色色彩系統</b>
<em>不得留白</em>
</span>
<div className="palette-list">{paletteOptions.map((item,index) => <button key={item.name} className={paletteIndex === index ? "selected" : ""} onClick={() => setPaletteIndex(index)}>
<i>{item.colors.map(color => <small style={{background:color}} key={color}/>)}</i>{item.name}</button>)}</div>
</div>
<div className="custom-picker">
<span>
<b>自選三色</b>
<small>白色會被自動排除</small>
</span>
<div>{customColors.map((color,index) => <input key={index} type="color" value={color} onChange={e => updateCustomColor(index,e.target.value)} aria-label={`自選色 ${index+1}`}/>)}</div>
</div>
<label className="dimension-toggle">
<input type="checkbox" checked={showDimensions} onChange={e => setShowDimensions(e.target.checked)}/>
<span>
<b>顯示尺寸標註</b>
<small>匯出圖片時一併保留標註</small>
</span>
</label>
<button className="primary" onClick={() => setSeed(n => n + 17)}>重新選擇最佳方案 <span>↗</span>
</button>
</fieldset></>}
        {step === 2 && <>
<label className="dimension-toggle"><input type="checkbox" checked={arcEditorLocked} onChange={e=>{if(e.target.checked)saveArc();setArcEditorLocked(e.target.checked);setPickCenter(false);}}/>鎖定弧線編輯圖層</label>
<div className="arc-layer-list">{arcs.map((arc,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0"}}><button className={editingArc===i?"selected":""} onClick={()=>{saveArc();selectArc(i);}}>弧線 {i+1}・{arc.sweep}°</button><label><input type="checkbox" disabled={arcEditorLocked} checked={lockedArcs.includes(i)} onChange={()=>{if(editingArc===i)saveArc();setLockedArcs(items=>items.includes(i)?items.filter(v=>v!==i):[...items,i]);}}/>鎖定</label><button disabled={arcEditorLocked||lockedArcs.includes(i)} onClick={()=>{setArcs(items=>items.filter((_,j)=>j!==i));setLockedArcs(items=>items.filter(j=>j!==i).map(j=>j>i?j-1:j));setEditingArc(null);setEditCenter(null);setShowArcPreview(false);}}>刪除</button></div>)}</div>
<button className="secondary" disabled={arcEditorLocked} onClick={()=>{saveArc();setEditingArc(null);setEditCenter(null);setShowArcPreview(true);}}>＋ 新增弧形</button>
<p>{editingArc!==null?`目前選取弧線 ${editingArc+1}；${arcInputLocked?'已鎖定，解鎖後才能修改。':'修改後按「儲存修改」。'}`:'設定新弧形；鎖定圖層會先保存目前預覽。'}</p>
<fieldset disabled={arcInputLocked} style={{border:0,padding:0,margin:0,minWidth:0}}>
<div className="control-row">
<span>
<b>圓心吸附位置</b>
<em>{centerLabel}</em>
</span>
<div className="snap-kind-grid">
{([["intersection","分割交點"],["line","分割線"],["edge","底紙邊／端點"],["extension","外部延長線"]] as [CenterKind,string][]).map(([kind,label]) => <button key={kind} className={centerKind === kind ? "selected" : ""} onClick={() => chooseCenterKind(kind)}>{label}</button>)}
</div>
<div className="snap-navigator">
<button aria-label="上一個合法圓心位置" onClick={() => cycleCenter(-1)}>←</button>
<span>X {Math.round(center.x)}・Y {Math.round(center.y)}<small>{currentChoices.length} 個合法位置</small></span>
<button aria-label="下一個合法圓心位置" onClick={() => cycleCenter(1)}>→</button>
</div>
<button className={`snap-canvas ${pickCenter ? "selected" : ""}`} onClick={() => setPickCenter(true)}>點選畫布，自動吸附</button>
</div>
<ControlRow label="圓弧半徑" value={`${radius}`}>
<input type="range" min="80" max="650" value={radius} onChange={e => { setRadius(Number(e.target.value)); setShowArcPreview(true); }}/>
</ControlRow>
<div className="control-row">
<span><b>起點方向（數學角度）</b><em>{sweep===360?"完整圓形，不需起點":`${mathStart}°`}</em></span>
<div className="arc-side-grid">{arcSides.map(side=><button disabled={sweep===360} key={side.id} className={activeSide.id===side.id?"selected":""} onClick={()=>{setStartSide(side.id);setShowArcPreview(true);}}>{(360-side.angle)%360}° {side.label}</button>)}</div>
<svg viewBox="0 0 190 145" aria-label="數學角度方向示意" style={{width:'100%',height:145}}><path d="M30 72H160M95 15V130" stroke="#80958a"/><path d={arcSectorPath({...activeArc,center:{x:95,y:72},radius:40})} fill="#a8c5b0" stroke="#234c38"/><circle cx="95" cy="72" r="3" fill="#234c38"/><circle cx={95+40*Math.cos(activeSide.angle*Math.PI/180)} cy={72+40*Math.sin(activeSide.angle*Math.PI/180)} r="5" fill="#c87825"/><g fontSize="12" fill="#234c38" textAnchor="middle"><text x="95" y="12">90° 上</text><text x="170" y="69">0° 右</text><text x="23" y="69">180° 左</text><text x="95" y="144">270° 下</text></g></svg>
<p style={{fontSize:14}}>橘點是弧線起點。{sweep===360?'360° 形成完整圓。':`從 ${mathStart}° ${clockwise?'順時針（角度減少）':'逆時針（角度增加）'}轉 ${sweep}°，到 ${mathEnd}°。`}</p>
<div className="arc-side-grid">{[{label:'上半圓',side:'right',cw:false},{label:'下半圓',side:'right',cw:true},{label:'左半圓',side:'up',cw:false},{label:'右半圓',side:'up',cw:true}].map(p=><button key={p.label} onClick={()=>{setStartSide(p.side as ArcSide);setSweep(180);setClockwise(p.cw);setShowArcPreview(true);}}>{p.label}</button>)}</div>
</div>
<div className="control-row">
<span><b>轉過角度</b><em>{sweep}°</em></span>
<div className="arc-sweep-grid">{[90,180,270,360].map(value => <button key={value} className={sweep === value ? "selected" : ""} onClick={() => { setSweep(value); setShowArcPreview(true); }}>{value}°</button>)}</div>
</div>
<div className="control-row">
<span>
<b>旋轉方向</b>
</span>
<div className="segmented">
<button disabled={sweep===360} className={clockwise ? "selected" : ""} onClick={() => { setClockwise(true); setShowArcPreview(true); }}>順時針 ↻（−）</button>
<button disabled={sweep===360} className={!clockwise ? "selected" : ""} onClick={() => { setClockwise(false); setShowArcPreview(true); }}>逆時針 ↺（＋）</button>
</div>
</div>
<div className="arc-stack-note"><b>已加入 {arcs.length} 個弧形</b><small>圓心維持分割線吸附；起點用數學角度判斷。例：0° 起點＋逆時針 180°＝上半圓。</small></div>
<label className="dimension-toggle">
<input type="checkbox" checked={showDimensions} onChange={e => setShowDimensions(e.target.checked)}/>
<span>
<b>顯示尺寸標註</b>
<small>即時畫布與匯出 PNG 一併保留分割尺寸</small>
</span>
</label>
<div className="button-pair">
<button className="secondary" onClick={clearArcs}>清除未鎖定弧形</button>
<button className="primary" onClick={()=>{if(showArcPreview)saveArc();else setShowArcPreview(true);}}>{showArcPreview?(editingArc===null?"加入此弧形":"儲存修改"):"預覽修改"}</button>
</div>
</fieldset></>}
        {step >= 3 && <><div className="tool-tabs">{[...(step===4?[["wall","牆體"]]:[]),["plant","植栽"],["site","基地"],["section","剖面"],["layers","圖層"]].map(([id,label])=><button key={id} className={controlTab===id?"selected":""} onClick={()=>{setControlTab(id);setPlantingPlacementMode(null);setDrawingSection(false);setDraftSection([]);if(id==="plant"||id==="wall")setViewTab("plan");}}>{label}</button>)}</div>{step===4&&<div hidden={controlTab!=="wall"}>{wallEditor.controls(wallGuides,trees.map(t=>({x:(t.x-xOffset)/sitePreviewScale,y:(t.y-yOffset)/sitePreviewScale})))}</div>}<div hidden={controlTab!=="layers"}>
<div style={{borderBottom:"1px solid #c9d2ca",paddingBottom:16,marginBottom:16}}><b>圖層鎖定</b>{step===4&&<label><input type="checkbox" checked={wallEditor.locked} onChange={e=>wallEditor.setLocked(e.target.checked)}/> 圍牆圖層</label>}<p style={{fontSize:14}}>底圖承接 STEP 01／02。鎖定圖層仍顯示，位置與配置不受其他植栽調整影響；共用基地尺寸及樹木規格需解鎖後修改。</p>{([{id:"array",label:"樹陣"},{id:"row",label:"樹列"},{id:"single",label:"孤植"},{id:"section",label:"剖面線"}] as const).map(layer=><label key={layer.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",fontSize:16}}><span>{layer.label}</span><span><input type="checkbox" checked={layerLocks[layer.id]} onChange={()=>toggleLayer(layer.id)}/> {layerLocks[layer.id]?"已鎖定":"可編輯"}</span></label>)}<p style={{fontSize:14}}>直接拖曳藍色控制點即可選取植栽並持續定位；點選基地可連續移動目前植栽。「結束連續定位」或選取剖面即可切換操作。</p></div>
</div><div hidden={controlTab!=="site"}><div className={`validation ${siteValid ? "pass" : "fail"}`}>
<b>{siteValid ? `✓ 已承接 ${paper.short} 比例` : `! 基地小於 ${paper.short} 基準`}</b>
<span>STEP 01／02：{paper.width.toFixed(1)} × {paper.height.toFixed(1)} cm<br/>STEP 03（1/100）：{siteWidth.toFixed(1)} × {siteHeight.toFixed(1)} m・{printArea.toFixed(1)} m²／基準 {minimumSiteArea.toFixed(1)} m²</span>
</div>
<div className="dimension-grid">
<ControlRow label="基地寬度" value={`${siteWidth} m`}>
<input disabled={anyLayerLocked} type="number" min={paper.width.toFixed(2)} step="0.1" value={siteWidth} onChange={e => setSiteWidth(Math.max(paper.width,Number(e.target.value)||paper.width))}/>
</ControlRow>
<ControlRow label="基地深度" value={`${siteHeight} m`}>
<input disabled={anyLayerLocked} type="number" min={paper.height.toFixed(2)} step="0.1" value={siteHeight} onChange={e => setSiteHeight(Math.max(paper.height,Number(e.target.value)||paper.height))}/>
</ControlRow>
</div>
<ControlRow label="樹冠規格">
<select disabled={anyPlantLocked} value={crownHeight} onChange={e => setCrownHeight(Number(e.target.value))}>
<option value="4">4 × 4 × 4 m</option>
<option value="8">4 × 4 × 8 m</option>
<option value="12">4 × 4 × 12 m</option>
</select>
</ControlRow>
<ControlRow label="樹幹規格">
<select disabled={anyPlantLocked} value={trunkHeight} onChange={e => setTrunkHeight(Number(e.target.value))}>
<option value="1.5">幹徑 25 cm・枝下高 1.5 m</option>
<option value="3">幹徑 25 cm・枝下高 3.0 m</option>
<option value="4.5">幹徑 25 cm・枝下高 4.5 m</option>
</select>
</ControlRow>
</div><div hidden={controlTab!=="plant"}><div className="control-row">
<span>
<b>植栽配置模組</b>
<em>可複選組合</em>
</span>
<div className="planting-type-grid">{plantingOptions.map(option => <button disabled={layerLocks[option.id]} key={option.id} className={plantingTypes.includes(option.id) ? "selected" : ""} onClick={() => togglePlantingType(option.id)}>{option.label}</button>)}</div>
</div>
<div className="tool-tabs">{plantingOptions.map(option=><button key={option.id} className={plantPanel===option.id?"selected":""} onClick={()=>setPlantPanel(option.id)}>{option.label}設定</button>)}</div>
{plantingTypes.includes("array") && plantPanel==="array" && <fieldset disabled={layerLocks.array} style={{border:0,padding:0,margin:0,minWidth:0}}>
<div className="module-settings-title"><b>樹陣設定</b><em>{arrayRows} 行 × {arrayColumns} 列・實際 {placedTreeCounts.array} 棵</em></div>
<div className="dimension-grid">
<ControlRow label="行數" value={`${arrayRows}`}><input type="number" min="1" max="8" value={arrayRows} onChange={e => setArrayRows(Math.max(1, Math.min(8, Number(e.target.value))))}/></ControlRow>
<ControlRow label="列數" value={`${arrayColumns}`}><input type="number" min="1" max="10" value={arrayColumns} onChange={e => setArrayColumns(Math.max(1, Math.min(10, Number(e.target.value))))}/></ControlRow>
</div>
<div className="dimension-grid">
<ControlRow label="行距" value={`${arrayRowSpacing.toFixed(1)} m`}><input type="number" min="2" max="12" step="0.5" value={arrayRowSpacing} onChange={e => setArrayRowSpacing(Math.max(2, Math.min(12, Number(e.target.value))))}/></ControlRow>
<ControlRow label="列距" value={`${arrayColumnSpacing.toFixed(1)} m`}><input type="number" min="2" max="12" step="0.5" value={arrayColumnSpacing} onChange={e => setArrayColumnSpacing(Math.max(2, Math.min(12, Number(e.target.value))))}/></ControlRow>
</div>
<div className="placement-control"><span><b>樹陣位置</b><em>X {(arrayAnchor.x * siteWidth).toFixed(1)}・Y {(arrayAnchor.y * siteHeight).toFixed(1)} m</em><small>不受分割區限制，以整組樹陣中心定位。</small></span><button className={plantingPlacementMode === "array" ? "selected" : ""} onClick={() => { setDrawingSection(false); setDraftSection([]); setPlantingPlacementMode(plantingPlacementMode === "array" ? null : "array"); }}>{plantingPlacementMode === "array" ? "結束連續定位" : "啟用連續定位"}</button></div>
<div className="dimension-grid">{(["x","y"] as const).map(axis=><ControlRow key={axis} label={`${axis.toUpperCase()} 座標（m）`}><input type="number" step="0.1" min="0" max={axis==="x"?siteWidth:siteHeight} value={Number((arrayAnchor[axis]*(axis==="x"?siteWidth:siteHeight)).toFixed(2))} onChange={e=>updatePlantPosition("array",selectedSingleIndex,{...arrayAnchor,[axis]:Number(e.target.value)/(axis==="x"?siteWidth:siteHeight)})}/></ControlRow>)}</div></fieldset>}
{plantingTypes.includes("row") && plantPanel==="row" && <fieldset disabled={layerLocks.row} style={{border:0,padding:0,margin:0,minWidth:0}}>
<div className="module-settings-title"><b>樹列設定</b><em>{rowRows} 排 × {rowColumns} 株・實際 {placedTreeCounts.row} 棵</em></div>
<div className="dimension-grid">
<ControlRow label="排數" value={`${rowRows}`}><input type="number" min="1" max="5" value={rowRows} onChange={e => setRowRows(Math.max(1, Math.min(5, Number(e.target.value))))}/></ControlRow>
<ControlRow label="每排株數" value={`${rowColumns}`}><input type="number" min="1" max="20" value={rowColumns} onChange={e => setRowColumns(Math.max(1, Math.min(20, Number(e.target.value))))}/></ControlRow>
</div>
<div className="dimension-grid">
<ControlRow label="排距" value={`${rowRowSpacing.toFixed(1)} m`}><input type="number" min="2" max="12" step="0.5" value={rowRowSpacing} onChange={e => setRowRowSpacing(Math.max(2, Math.min(12, Number(e.target.value))))}/></ControlRow>
<ControlRow label="株距" value={`${rowColumnSpacing.toFixed(1)} m`}><input type="number" min="2" max="12" step="0.5" value={rowColumnSpacing} onChange={e => setRowColumnSpacing(Math.max(2, Math.min(12, Number(e.target.value))))}/></ControlRow>
</div>
<div className="control-row">
<span><b>樹列依附線（含基地內延伸線）</b><em>{effectiveRowGuide === "arc" ? `弧線 ${rowGuideIndex % Math.max(1, displayArcs.length) + 1}` : `${effectiveRowGuide === "split" ? "分割線" : "邊緣線"} ${rowGuideIndex % Math.max(1, selectedRowLineSource.length) + 1}`}</em></span>
<div className="row-guide-grid">{([["split","分割線"],["arc","分隔弧線"],["edge","邊緣線"]] as [RowGuide,string][]).map(([id,label]) => <button key={id} className={rowGuide === id ? "selected" : ""} onClick={() => { setRowGuide(id); setRowGuideIndex(0); }}>{label}</button>)}</div>
<select aria-label="直接指定樹列依附線" value={rowGuideIndex % Math.max(1,effectiveRowGuide==="arc"?displayArcs.length:selectedRowLineSource.length)} onChange={e=>setRowGuideIndex(Number(e.target.value))}>{Array.from({length:effectiveRowGuide==="arc"?displayArcs.length:selectedRowLineSource.length},(_,i)=><option key={i} value={i}>{effectiveRowGuide==="arc"?"弧線":"線段"} {i+1}</option>)}</select>
<div className="snap-navigator"><button aria-label="上一條依附線" onClick={() => setRowGuideIndex(index => Math.max(0, index - 1))}>←</button><span>選擇依附線<small>{effectiveRowGuide === "arc" ? `${displayArcs.length} 條可用弧線` : `${selectedRowLineSource.length} 條可用線段`}</small></span><button aria-label="下一條依附線" onClick={() => setRowGuideIndex(index => index + 1)}>→</button></div>
</div>
<ControlRow label={effectiveRowGuide === "edge" ? "額外向內偏移" : "樹列偏移"} value={`${(effectiveRowGuide === "edge" ? Math.max(0,rowOffset) : rowOffset).toFixed(1)} m`}>
<input type="range" min={effectiveRowGuide === "edge" ? 0 : -6} max="6" step="0.1" value={effectiveRowGuide === "edge" ? Math.max(0,rowOffset) : rowOffset} onChange={e => setRowOffset(Number(e.target.value))}/>
</ControlRow>
<ControlRow label="沿線微調" value={`${rowAlong.toFixed(1)} m`}><input type="number" step="0.1" min={-Math.max(siteWidth,siteHeight)} max={Math.max(siteWidth,siteHeight)} value={rowAlong} onChange={e=>setRowAlong(Math.max(-Math.max(siteWidth,siteHeight),Math.min(Math.max(siteWidth,siteHeight),Number(e.target.value)||0)))}/></ControlRow><p style={{fontSize:14}}>拖曳橘色樹列控制點可沿線微調與橫向偏移；圖層鎖定時無法拖曳。</p>
{effectiveRowGuide === "edge" && <p style={{fontSize:14}}>偏移 0 m 時第一排樹心位於基地邊緣，允許樹冠外伸並完整顯示。多排依排距向內排列；只檢查樹心是否位於基地內。PNG 會保留外伸樹冠，基地外透明。</p>}
</fieldset>}
{plantingTypes.includes("single") && plantPanel==="single" && <fieldset disabled={layerLocks.single} style={{border:0,padding:0,margin:0,minWidth:0}}>
<div className="module-settings-title"><b>孤植設定</b><em>設定 {singlePositions.length}・實際 {placedTreeCounts.single} 棵</em></div>
<ControlRow label="孤植株數" value={`${singlePositions.length} 棵`}><input type="range" min="1" max="20" value={singlePositions.length} onChange={e => updateSingleCount(Number(e.target.value))}/></ControlRow>
<div className="control-row"><span><b>孤植位置</b><em>第 {selectedSingleIndex + 1} 棵</em></span><div className="snap-navigator"><button aria-label="上一棵孤植" onClick={() => setSelectedSingleIndex(index => (index - 1 + singlePositions.length) % singlePositions.length)}>←</button><span>X {(singlePositions[selectedSingleIndex]?.x * siteWidth).toFixed(1)}・Y {(singlePositions[selectedSingleIndex]?.y * siteHeight).toFixed(1)} m<small>逐棵選取後指定位置</small></span><button aria-label="下一棵孤植" onClick={() => setSelectedSingleIndex(index => (index + 1) % singlePositions.length)}>→</button></div><button className={`snap-canvas ${plantingPlacementMode === "single" ? "selected" : ""}`} onClick={() => { setDrawingSection(false); setDraftSection([]); setPlantingPlacementMode(plantingPlacementMode === "single" ? null : "single"); }}>{plantingPlacementMode === "single" ? "結束連續定位" : "啟用連續定位"}</button></div>
<div className="dimension-grid">{(["x","y"] as const).map(axis=><ControlRow key={axis} label={`${axis.toUpperCase()} 座標（m）`}><input type="number" step="0.1" min="0" max={axis==="x"?siteWidth:siteHeight} value={Number(((singlePositions[selectedSingleIndex] ?? {x:.5,y:.5})[axis]*(axis==="x"?siteWidth:siteHeight)).toFixed(2))} onChange={e=>updatePlantPosition("single",selectedSingleIndex,{...(singlePositions[selectedSingleIndex] ?? {x:.5,y:.5}),[axis]:Number(e.target.value)/(axis==="x"?siteWidth:siteHeight)})}/></ControlRow>)}</div></fieldset>}
<div className="tree-array-note">
<b>{plantingLabel}・目前 {trees.length} 棵</b>
<small>{treeCountMessage}{plantingTypes.includes("row") && placedTreeCounts.row < rowRows * rowColumns ? ` 樹列因可用線段或弧長不足，僅配置 ${placedTreeCounts.row} 棵。` : ""} 樹木會維持冠幅與設定間距，超出基地時不再增加。</small>
</div>
<label className="dimension-toggle"><input type="checkbox" checked={showDimensions} onChange={e => setShowDimensions(e.target.checked)}/><span><b>顯示尺寸標註</b><small>顯示基地、分割區及樹間距，PNG 同步保留。</small></span></label>
<button className="secondary clear-plantings" onClick={clearPlantings}>清除未鎖定植栽</button>
</div><div hidden={controlTab!=="section"} className="section-controls" style={{marginTop:24,borderTop:"1px solid #c9d2ca",paddingTop:20}}>
<b>剖面線與剖立面</b><ControlRow label="選擇剖面"><select value={selectedSection ?? ""} onChange={e=>selectSection(Number(e.target.value))}><option value="" disabled>請新增剖面線</option>{sectionLines.map(line=><option key={line.id} value={line.id}>{line.label}–{line.label}′</option>)}</select></ControlRow><fieldset disabled={layerLocks.section} style={{border:0,padding:0,margin:0,minWidth:0}}>
<p style={{fontSize:14}}>拖曳線身可平移整條剖面，拖曳兩端圓點可修改端點；下方方向鍵可每次微調 0.1 m。</p>
<button className={drawingSection ? "primary" : "secondary"} onClick={() => {setViewTab("plan");setDraftSection([]);setDrawingSection(true);setPlantingPlacementMode(null);setPickCenter(false);setFocusEditing(false);setSectionMessage("");}}>{drawingSection ? (draftSection.length ? "請點選終點" : "請點選起點") : "＋ 新增剖面線"}</button>
{drawingSection && <button className="secondary" onClick={()=>{setDraftSection([]);setDrawingSection(false);}}>取消繪製</button>}

<ControlRow label="繪製／拖曳對齊"><select value={alignment} onChange={e=>changeAlignment(e.target.value as SectionAlignment)}><option value="auto">自動水平／垂直吸附</option><option value="horizontal">水平鎖定</option><option value="vertical">垂直鎖定</option><option value="free">自由方向</option></select></ControlRow>
<p style={{fontSize:14}}>自動模式會在接近水平或垂直時吸附；選擇鎖定可將目前剖面立即轉正。</p>
<div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>{([{label:"← 左",x:-.1,y:0},{label:"右 →",x:.1,y:0},{label:"↑ 上",x:0,y:-.1},{label:"↓ 下",x:0,y:.1}]).map(move=><button key={move.label} className="secondary" disabled={!selectedLine || drawingSection} onClick={()=>setSectionLine(points=>translateSection(points,{x:move.x/siteWidth,y:move.y/siteHeight}))}>{move.label} 0.1 m</button>)}</div>
<div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}><button className="secondary" disabled={!selectedLine || drawingSection} onClick={()=>setSectionLine(points=>[...points].reverse())}>反轉觀看方向</button><button className="secondary" disabled={!selectedLine} onClick={()=>{setSectionLines(lines=>lines.filter(line=>line.id!==selectedSection));setSelectedSection(sectionLines.find(line=>line.id!==selectedSection)?.id??null);}}>刪除選取剖面</button><button className="secondary" onClick={()=>{setSectionLines([]);setSelectedSection(null);setDraftSection([]);setDrawingSection(false);setSectionMessage("");}}>清除全部剖面</button></div>
</fieldset><ControlRow label="背景可視深度" value={`${sectionDepth} m`}><input type="range" min="0" max="60" step="1" value={sectionDepth} onChange={e => setSectionDepth(Number(e.target.value))}/></ControlRow>
<p role="status" style={{fontSize:14}}>{sectionMessage || (drawingSection ? "點選兩端後自動產生剖立面；清除可取消繪製。" : "剖面線與植栽位置、樹冠及枝下高連動。")}</p>
</div>
</>}
      </aside>
      <div className="canvas-column">
{step>=3&&<label style={{display:"block",fontSize:14,marginBottom:4}}><input type="checkbox" checked={showDimensions} onChange={e=>setShowDimensions(e.target.checked)}/> 顯示尺寸標註</label>}{step>=3 && <div className="tool-tabs view-tabs">{[["plan","基地平面"],["section","剖立面"],["axon","軸測圖"]].map(([id,label])=><button key={id} className={viewTab===id?"selected":""} onClick={()=>setViewTab(id as "plan"|"section"|"axon")}>{label}</button>)}</div>}<div hidden={step>=3&&viewTab!=="plan"}>
{planViewport.controls}<div className="canvas-meta">
<div>
<span>即時構圖畫布</span>
<b>{step === 1 ? `${paper.short}・${splitCount} 個分割區域・${activeModules.length} 組比例` : step === 2 ? `${arcs.length} 個已確認弧形` : `${trees.length} 棵・${plantingLabel}・${displayArcs.length} 條弧線`}</b>
</div>
<div className="legend">{palette.colors.map(color => <i style={{background:color}} key={color}/>)}<span>{palette.name}</span>
</div>
</div>
        <div className={`canvas-shell ${pickCenter || focusEditing || plantingPlacementMode || drawingSection ? "picking" : ""} ${step === 1 && isTallPaper ? "compact-portrait" : ""}`}>
<svg ref={svgRef} viewBox={planViewport.viewBox} onClick={handleCanvasClick} onPointerMove={e=>{moveSectionEndpoint(e);movePlant(e);moveRow(e);}} onPointerUp={e=>{if(rowDrag.current){rowDrag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}endSectionDrag(e);if(plantDrag.current){plantDrag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}} onPointerCancel={e=>{endSectionDrag(e);plantDrag.current=null;rowDrag.current=null;}} onLostPointerCapture={()=>{sectionDrag.current=null;plantDrag.current=null;rowDrag.current=null;}} style={{touchAction:step>=3?"none":"auto"}} xmlns="http://www.w3.org/2000/svg" aria-label="景觀構圖畫布">
<defs>
<pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
<path d="M 25 0 L 0 0 0 25" fill="none" stroke="#1f392e" strokeOpacity="0.08" strokeWidth="1"/>
</pattern>
<filter id="shadow">
<feDropShadow dx="0" dy="4" stdDeviation="5" floodOpacity="0.2"/>
</filter>
<clipPath id="paperClip">
<rect data-paper-bounds="true" x={xOffset} y={yOffset} width={displayWidth} height={displayHeight}/>
</clipPath>
{regions.map((region, index) => <clipPath id={`regionClip-${index}`} key={`clip-${index}`}>
<rect x={xOffset + region.x * (displayWidth / 1000) - .45} y={yOffset + region.y * (displayHeight / 700) - .45} width={region.w * (displayWidth / 1000) + .9} height={region.h * (displayHeight / 700) + .9}/>
</clipPath>)}
</defs>
<rect data-export-background="true" x={planViewport.bounds.x} y={planViewport.bounds.y} width={planViewport.bounds.width} height={planViewport.bounds.height} fill="#f3f0e8"/>
<ViewportExportBounds bounds={planViewport.bounds}/>
{step>=3 && <rect data-export-bounds="true" x={exportLeft} y={exportTop} width={exportRight-exportLeft} height={exportBottom-exportTop} fill="none" pointerEvents="none"/>}
<g clipPath="url(#paperClip)"><g transform={`translate(${xOffset} ${yOffset}) scale(${displayWidth/paperDisplayWidth} ${displayHeight/paperDisplayHeight}) translate(${-paperXOffset} ${-paperYOffset})`}>{colorFaces.map((face,i)=><path key={i} d={face.d} fill={palette.colors[face.color]} fillRule="evenodd" stroke={palette.colors[face.color]} strokeWidth=".15"/>)}</g></g>{step===1&&focusEditing&&<g data-editor-overlay="true" className="focus-marker" onClick={event => { event.stopPropagation(); setFocusEditing(true); }}>
<circle cx={xOffset + activeFocus.x*(displayWidth/1000)} cy={yOffset + activeFocus.y*(displayHeight/700)} r="24"/>
<path d={`M ${xOffset + activeFocus.x*(displayWidth/1000)-16} ${yOffset + activeFocus.y*(displayHeight/700)} H ${xOffset + activeFocus.x*(displayWidth/1000)+16} M ${xOffset + activeFocus.x*(displayWidth/1000)} ${yOffset + activeFocus.y*(displayHeight/700)-16} V ${yOffset + activeFocus.y*(displayHeight/700)+16}`}/>
</g>}
          {step>=3&&plantingPlacementMode&&<g data-editor-overlay="true" className="planting-marker" pointerEvents="none">
<circle cx={xOffset + placementPoint.x * displayWidth} cy={yOffset + placementPoint.y * displayHeight} r="22"/>
<path d={`M ${xOffset + placementPoint.x * displayWidth - 14} ${yOffset + placementPoint.y * displayHeight} H ${xOffset + placementPoint.x * displayWidth + 14} M ${xOffset + placementPoint.x * displayWidth} ${yOffset + placementPoint.y * displayHeight - 14} V ${yOffset + placementPoint.y * displayHeight + 14}`}/>
</g>}
          {(step===1||step===2)&&showDimensions&&<DimensionOverlay regions={regions} paper={paper} x={xOffset} y={yOffset} width={displayWidth} height={displayHeight}/>}
          {step===2&&showDimensions&&<ArcDimensionOverlay arcs={showArcPreview&&editingArc!==null?arcs.filter((_,i)=>i!==editingArc):arcs} preview={showArcPreview ? activeArc : undefined} paper={paper} displayWidth={displayWidth}/>}
          {step>=3&&showDimensions&&<DimensionOverlay regions={regions} paper={{ label: "1/100 A3 基地", short: "A3", width: siteWidth, height: siteHeight }} x={xOffset} y={yOffset} width={displayWidth} height={displayHeight} unit="m"/>}
          {step>=3&&<>
<rect x={xOffset} y={yOffset} width={displayWidth} height={displayHeight} fill="url(#grid)"/>{trees.map((tree,i)=>
<g key={i} transform={`translate(${tree.x} ${tree.y})`} filter="url(#shadow)">
<circle r={Math.max(14,2/siteWidth*displayWidth)} fill="#395f45" fillOpacity=".88" stroke="#f7f3e8" strokeWidth="4"/>
<circle r="5" fill="#16291e"/>
<path d="M -8 0 H 8 M 0 -8 V 8" stroke="#dbe5d6" strokeWidth="1.8" opacity=".8"/>
</g>)}
{showDimensions&&<TreeSpacingOverlay trees={trees} siteWidth={siteWidth} siteHeight={siteHeight} x={xOffset} y={yOffset} width={displayWidth} height={displayHeight}/>} 
</>}
          {step>=3 && plantingTypes.includes("row") && !layerLocks.row && !wallEditing && !drawingSection && !plantingPlacementMode && <g data-editor-overlay="true" pointerEvents="none" fill="none" stroke="#c96a12" strokeWidth="3" strokeDasharray="8 5">{effectiveRowGuide==="arc" && selectedRowArc ? <path d={arcSectorPath(selectedRowArc)}/> : selectedRowLine && <path d={selectedRowLine.axis==="vertical"?`M${selectedRowLine.value} ${selectedRowLine.from}V${selectedRowLine.to}`:`M${selectedRowLine.from} ${selectedRowLine.value}H${selectedRowLine.to}`}/>}</g>}
          {step>=3 && !drawingSection && !wallEditing && <g data-editor-overlay="true">
            {plantingTypes.includes("array") && !layerLocks.array && <circle cx={xOffset+arrayAnchor.x*displayWidth} cy={yOffset+arrayAnchor.y*displayHeight} r="16" fill="#e3f0ff" stroke="#1666ae" strokeWidth="3" style={{cursor:"grab",touchAction:"none"}} onClick={e=>e.stopPropagation()} onPointerDown={e=>beginPlantDrag(e,"array",0)}><title>拖曳樹陣中心；放開後可繼續點選基地定位</title></circle>}
            {plantingTypes.includes("single") && !layerLocks.single && trees.filter(t=>t.type==="single").map((t,i)=><circle key={i} cx={t.x} cy={t.y} r="12" fill="#e3f0ff" stroke="#1666ae" strokeWidth="2" style={{cursor:"grab",touchAction:"none"}} onClick={e=>e.stopPropagation()} onPointerDown={e=>beginPlantDrag(e,"single",i)}><title>拖曳第 {i+1} 棵孤植</title></circle>)}
          </g>}
          {step>=3 && !drawingSection && !wallEditing && !layerLocks.row && trees.some(t=>t.type==="row") && (()=>{const t=trees.find(t=>t.type==="row")!;return <circle data-editor-overlay="true" cx={t.x} cy={t.y} r="16" fill="#fff0d9" stroke="#c96a12" strokeWidth="3" style={{cursor:"grab",touchAction:"none"}} onClick={e=>e.stopPropagation()} onPointerDown={beginRowDrag}><title>拖曳整組樹列：沿線微調／垂直偏移</title></circle>;})()}
          {step===4&&<WallPlan guides={wallGuides} width={siteWidth} height={siteHeight} editor={wallEditor} x={xOffset} y={yOffset} scale={sitePreviewScale} dimensions={showDimensions} editable={wallEditing}/>}
          {step >= 3 && <SectionLines lines={sectionLines} selected={selectedSection} draft={draftSection} x={xOffset} y={yOffset} width={displayWidth} height={displayHeight} editable={!wallEditing && !layerLocks.section && !drawingSection && !plantingPlacementMode} select={selectSection} drag={beginSectionDrag}/>}
          {step===2&&showArcPreview&&<g data-editor-overlay="true" pointerEvents="none" stroke="#b96510" fill="#b96510"><path strokeDasharray="5 4" fill="none" d={`M${center.x} ${center.y}L${center.x+radius*Math.cos(activeSide.angle*Math.PI/180)} ${center.y+radius*Math.sin(activeSide.angle*Math.PI/180)}`}/><circle cx={center.x} cy={center.y} r="6"/><text x={center.x+10} y={center.y-10} stroke="white" strokeWidth="3" paintOrder="stroke" fontSize="14">圓心</text></g>}
          <DrawingScale bounds={planViewport.bounds} unitsPerSvg={step>=3?siteWidth/displayWidth:paper.width/displayWidth} unit={step>=3?'m':'cm'}/>
          </svg>{pickCenter&&<div className="canvas-hint">點選畫布後，圓心會自動吸附到合法位置</div>}{focusEditing&&<div className="canvas-hint">請點選新的十字焦點位置</div>}{plantingPlacementMode&&<div className="canvas-hint">可連續點選基地或拖曳調整{plantingPlacementMode === "array" ? "樹陣中心" : `第 ${selectedSingleIndex + 1} 棵孤植`}位置</div>}</div>
        <div className="canvas-footer">
<p>
<b>設計提示</b>{step===1?"避免所有分割線等距；保留主區域，讓色彩形成焦點與視覺重量。":step===2?"圓心僅能落在分割線、交點、底紙邊界／端點或外部延長線；弧形切到的每一個原有色塊，會改以三色系內的另一色呈現。":"樹陣不受色塊邊界限制，可自訂中心、行列數與雙向間距；樹列沿分割線、弧線或基地邊緣配置，孤植則逐棵定位。"}</p>
<button className="export" onClick={exportImage}>匯出平面 PNG</button>
</div>
</div><div hidden={viewTab!=="section"}>        {step >= 3 && sectionLine.length === 2 && <SectionView walls={step===4?wallEditor.walls:[]} stage={step} label={selectedLine?.label ?? "A"} a={{x:sectionLine[0].x*siteWidth,y:sectionLine[0].y*siteHeight}} b={{x:sectionLine[1].x*siteWidth,y:sectionLine[1].y*siteHeight}} trees={trees.map(t => ({x:(t.x-xOffset)/displayWidth*siteWidth,y:(t.y-yOffset)/displayHeight*siteHeight}))} direction={sectionDirection} depth={sectionDepth} crownHeight={crownHeight} trunkHeight={trunkHeight} dimensions={showDimensions} download={downloadSvgAsPng}/>}
        {step>=3 && sectionLine.length!==2 && <p style={{padding:16,border:"1px dashed #9eafa2"}}>剖立面：請先新增並選取一條剖面線，即可查看垂直標註與匯出 PNG。</p>}
</div><div hidden={viewTab!=="axon"}>        {step>=3 && <AxonView walls={step===4?wallEditor.walls:[]} stage={step} width={siteWidth} height={siteHeight} trees={trees.map(t=>({x:(t.x-xOffset)/displayWidth*siteWidth,y:(t.y-yOffset)/displayHeight*siteHeight}))} crownHeight={crownHeight} trunkHeight={trunkHeight} faces={colorFaces} colors={palette.colors} planBounds={{x:paperXOffset,y:paperYOffset,width:paperDisplayWidth,height:paperDisplayHeight}} download={downloadSvgAsPng}/>}
</div>      </div>
    </section>
    <footer>
<span>THE DEFINITION OF SPACE IN THE LANDSCAPE</span>
<p>從二維構圖，推演成可被行走與感知的空間秩序。</p>
<small>Designed by JerryHsu</small>
</footer>
  </main>;
}
