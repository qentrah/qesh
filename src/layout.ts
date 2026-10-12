export type Axis = 'horizontal' | 'vertical';
export type Tree = { kind: 'pane'; id: string } | { kind: 'split'; id: string; axis: Axis; ratio: number; first: Tree; second: Tree };
export interface Rect { x: number; y: number; width: number; height: number }
export interface Divider extends Rect { id: string; axis: Axis; parent: Rect }
export const MIN_COLS = 20;
export const MIN_ROWS = 5; // Includes a one-line pane header.
export function leaves(tree: Tree): string[] { return tree.kind === 'pane' ? [tree.id] : [...leaves(tree.first), ...leaves(tree.second)]; }
export function minimum(tree: Tree): { width: number; height: number } {
  if (tree.kind === 'pane') return { width: MIN_COLS, height: MIN_ROWS };
  const a = minimum(tree.first), b = minimum(tree.second);
  return tree.axis === 'horizontal' ? { width: a.width + b.width + 1, height: Math.max(a.height, b.height) } :
    { width: Math.max(a.width, b.width), height: a.height + b.height + 1 };
}
export function geometry(tree: Tree, bounds: Rect, focused: string) {
  const panes = new Map<string, Rect>(); const dividers: Divider[] = [];
  const min = minimum(tree);
  const collapsed = bounds.width < min.width || bounds.height < min.height;
  if (collapsed) { panes.set(focused, bounds); return { panes, dividers, collapsed }; }
  function visit(node: Tree, rect: Rect) {
    if (node.kind === 'pane') { panes.set(node.id, rect); return; }
    const horizontal = node.axis === 'horizontal';
    const size = (horizontal ? rect.width : rect.height) - 1;
    const a = minimum(node.first), b = minimum(node.second);
    const firstSize = Math.max(horizontal ? a.width : a.height,
      Math.min(size - (horizontal ? b.width : b.height), Math.round(size * node.ratio)));
    const first = { ...rect, ...(horizontal ? { width: firstSize } : { height: firstSize }) };
    const second = horizontal ? { ...rect, x: rect.x + firstSize + 1, width: size - firstSize } :
      { ...rect, y: rect.y + firstSize + 1, height: size - firstSize };
    dividers.push({ id: node.id, axis: node.axis, parent: rect, x: horizontal ? rect.x + firstSize : rect.x,
      y: horizontal ? rect.y : rect.y + firstSize, width: horizontal ? 1 : rect.width, height: horizontal ? rect.height : 1 });
    visit(node.first, first); visit(node.second, second);
  }
  visit(tree, bounds); return { panes, dividers, collapsed };
}
export function split(tree: Tree, target: string, id: string, axis: Axis, dividerId: string): Tree {
  if (tree.kind === 'pane') return tree.id === target ? { kind: 'split', id: dividerId, axis, ratio: .5, first: tree, second: { kind: 'pane', id } } : tree;
  return { ...tree, first: split(tree.first, target, id, axis, dividerId), second: split(tree.second, target, id, axis, dividerId) };
}
export function remove(tree: Tree, id: string): Tree | null {
  if (tree.kind === 'pane') return tree.id === id ? null : tree;
  const a = remove(tree.first, id), b = remove(tree.second, id);
  return !a ? b : !b ? a : { ...tree, first: a, second: b };
}
export function setRatio(tree: Tree, id: string, ratio: number): Tree {
  if (tree.kind === 'pane') return tree;
  return { ...tree, ratio: tree.id === id ? Math.max(.05, Math.min(.95, ratio)) : tree.ratio,
    first: setRatio(tree.first, id, ratio), second: setRatio(tree.second, id, ratio) };
}
export function nearestDivider(tree: Tree, pane: string, axis: Axis): string | undefined {
  if (tree.kind === 'pane') return;
  if (!leaves(tree).includes(pane)) return;
  return nearestDivider(tree.first, pane, axis) ?? nearestDivider(tree.second, pane, axis) ?? (tree.axis === axis ? tree.id : undefined);
}
export function neighbor(panes: Map<string, Rect>, active: string, direction: string) {
  const source = panes.get(active); if (!source) return active;
  const sx = source.x + source.width / 2, sy = source.y + source.height / 2;
  let best = active, distance = Infinity;
  for (const [id, r] of panes) {
    if (id === active) continue;
    const dx = r.x + r.width / 2 - sx, dy = r.y + r.height / 2 - sy;
    const along = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
    const across = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = along + across * 3;
    if (along > 0 && score < distance) { best = id; distance = score; }
  }
  return best;
}
