import { describe, expect, test } from 'bun:test';
import { geometry, leaves, minimum, resizeJunction, nearestDivider, neighbor, remove, setRatio, split, type Tree } from '../src/layout';
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

test('center junction moves both aligned rows and the column together; individual lines stay local', () => {
  let tree = split(initial,'a','b','horizontal','column');
  tree = split(tree,'a','c','vertical','left');
  tree = split(tree,'b','d','vertical','right');
  const bounds = {x:0,y:0,width:121,height:41};
  const moved = resizeJunction(tree,bounds,'a',['column','left','right'],75,28);
  const dividers = geometry(moved,bounds,'a').dividers;
  expect(dividers.map(d=>[d.id,d.axis==='horizontal'?d.x:d.y])).toEqual([['column',75],['left',28],['right',28]]);
  expect(leaves(moved)).toEqual(leaves(tree));
  const local = geometry(setRatio(tree,'left',.7),bounds,'a').dividers;
  expect(local.find(d=>d.id==='right')!.y).toBe(20);
  expect(resizeJunction(tree,bounds,'a',['column','left'],75,28)).toBe(tree);
  expect(resizeJunction(tree,bounds,'a',['column','stale'],75,28)).toBe(tree);
  expect(resizeJunction(tree,bounds,'a',['column','left','right'],NaN,28)).toBe(tree);
  const clamped = geometry(resizeJunction(tree,bounds,'a',['column','left','right'],1000,-1000),bounds,'a');
  expect(clamped.dividers.filter(d=>d.axis==='vertical').map(d=>d.y)).toEqual([5,5]);
  for(const pane of clamped.panes.values()){expect(pane.width).toBeGreaterThanOrEqual(20);expect(pane.height).toBeGreaterThanOrEqual(5);}
});
test('junctions combine overlapping hit targets without joining separate row lines', () => {
  const {junctions} = require('../desktop/split-controls.cjs');
  let tree = split(split(split(initial,'a','b','horizontal','column'),'a','c','vertical','left'),'b','d','vertical','right');
  const bounds = {x:0,y:0,width:121,height:41};
  expect(junctions(geometry(tree,bounds,'a').dividers)).toEqual([{x:60,y:20,ids:['column','left','right'],id:'column:left:right'}]);
  tree = setRatio(tree,'right',.7);
  expect(junctions(geometry(tree,bounds,'a').dividers)).toHaveLength(2);
});
