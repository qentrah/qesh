import { describe, expect, test } from 'bun:test';
import { geometry, leaves, minimum, nearestDivider, neighbor, remove, setRatio, split, type Tree } from '../src/layout';
const initial: Tree = { kind: 'pane', id: 'a' };
describe('split geometry', () => {
  test('nested splits tile the viewport without overlap and respect minimums', () => {
    let tree = split(initial, 'a', 'b', 'horizontal', 'ab');
    tree = split(tree, 'b', 'c', 'vertical', 'bc');
    const result = geometry(setRatio(tree, 'ab', .99), { x: 0, y: 0, width: 101, height: 31 }, 'a');
    expect(result.collapsed).toBe(false);
    const area = [...result.panes.values(), ...result.dividers].reduce((sum, r) => sum + r.width * r.height, 0);
    expect(area).toBe(101 * 31);
    for (const r of result.panes.values()) { expect(r.width).toBeGreaterThanOrEqual(20); expect(r.height).toBeGreaterThanOrEqual(5); }
    expect(neighbor(result.panes, 'a', 'right')).toBe('b');
    expect(neighbor(result.panes, 'b', 'down')).toBe('c');
    expect(nearestDivider(tree, 'c', 'vertical')).toBe('bc');
  });
  test('small viewport reveals only focus and restores unchanged split ratios', () => {
    const tree = split(initial, 'a', 'b', 'horizontal', 'ab');
    expect(minimum(tree)).toEqual({ width: 41, height: 5 });
    expect([...geometry(tree, { x: 0, y: 0, width: 30, height: 10 }, 'b').panes.keys()]).toEqual(['b']);
    expect([...geometry(tree, { x: 0, y: 0, width: 100, height: 20 }, 'b').panes.keys()]).toEqual(['a', 'b']);
    expect(leaves(remove(tree, 'b')!)).toEqual(['a']);
    expect(remove(initial, 'a')).toBeNull();
  });
});
