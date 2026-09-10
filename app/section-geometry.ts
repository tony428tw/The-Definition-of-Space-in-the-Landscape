export type SectionPoint = { x: number; y: number };
export function projectSection(a: SectionPoint, b: SectionPoint, trees: SectionPoint[], direction: number, depth: number) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < .1) return { length, trees: [] };
  const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
  const projected = trees.map((p, id) => {
    const along = (p.x - a.x) * ux + (p.y - a.y) * uy;
    const distance = ((p.x - a.x) * -uy + (p.y - a.y) * ux) * direction;
    const cut = Math.abs(distance) < 2;
    const radius = cut ? Math.sqrt(4 - distance * distance) : 2;
    return { id, along, distance, cut, radius };
  }).filter(p => p.along + p.radius >= 0 && p.along - p.radius <= length && (p.cut || (p.distance >= 0 && p.distance <= depth)))
    .sort((a, b) => Number(a.cut) - Number(b.cut) || b.distance - a.distance);
  return { length, trees: projected };
}
export type SectionAlignment = "free" | "auto" | "horizontal" | "vertical";
export function alignEndpoint(anchor: SectionPoint, target: SectionPoint, mode: SectionAlignment, width: number, height: number) {
  const point = { x: Math.max(0, Math.min(1, target.x)), y: Math.max(0, Math.min(1, target.y)) };
  const dx = Math.abs(point.x - anchor.x) * width, dy = Math.abs(point.y - anchor.y) * height;
  if (mode === "horizontal" || (mode === "auto" && dy <= dx * .12)) point.y = anchor.y;
  else if (mode === "vertical" || (mode === "auto" && dx <= dy * .12)) point.x = anchor.x;
  return point;
}
export function sectionLabel(id: number): string {
  let label = "", value = id + 1;
  while (value > 0) { value--; label = String.fromCharCode(65 + value % 26) + label; value = Math.floor(value / 26); }
  return label;
}
export function translateSection(points: SectionPoint[], delta: SectionPoint) {
  const dx = Math.max(-Math.min(...points.map(p => p.x)), Math.min(1-Math.max(...points.map(p => p.x)), delta.x));
  const dy = Math.max(-Math.min(...points.map(p => p.y)), Math.min(1-Math.max(...points.map(p => p.y)), delta.y));
  return points.map(p => ({x:p.x+dx,y:p.y+dy}));
}
