import { EventEmitter } from 'node:events';
import { basename } from 'node:path';
import { SessionManager } from './sessions';
import { leaves, remove, split, type Axis, type Tree } from './layout';
export interface Tab { id: string; name: string; tree: Tree; focused: string; group?: string }
export class Workspace extends EventEmitter {
  groups: string[] = []; revision = 0; tabs: Tab[] = []; active = 0; private serial = 0;
  constructor(readonly sessions: SessionManager, readonly cwd: string, readonly shell: string) {
    super(); this.on('change', () => { this.revision++; }); sessions.on('change', () => this.emit('change')); this.newTab();
  }
  get tab() { return this.tabs[this.active]!; }
  private id() { return String(++this.serial); }
  newTab(cwd = this.cwd) {
    const pane = this.id(); this.sessions.create(pane, cwd, this.shell);
    this.tabs.push({ id: this.id(), name: basename(cwd) || 'Shell', tree: { kind: 'pane', id: pane }, focused: pane });
    this.active = this.tabs.length - 1; this.emit('change');
  }
  switchTab(index: number) { this.active = (index + this.tabs.length) % this.tabs.length; this.emit('change'); }
  focus(id: string) { if (leaves(this.tab.tree).includes(id)) { this.tab.focused = id; this.emit('change'); } }
  split(axis: Axis) {
    const id = this.id(); this.sessions.create(id, this.sessions.sessions.get(this.tab.focused)?.cwd || this.cwd, this.shell);
    this.tab.tree = split(this.tab.tree, this.tab.focused, id, axis, this.id());
    this.tab.focused = id; this.emit('change');
  }
  rename(name: string) { this.tab.name = name.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 40) || 'Shell'; this.emit('change'); }
  selectTab(id: string) { const index = this.tabs.findIndex(tab => tab.id === id); if (index >= 0) this.switchTab(index); }
  addGroup(name: string) { name = name.trim().slice(0, 40); if (name && !this.groups.includes(name)) { this.groups.push(name); this.emit('change'); } }
  groupTab(id: string, group?: string) { const tab = this.tabs.find(tab => tab.id === id); if (tab && (!group || this.groups.includes(group))) { tab.group = group; this.emit('change'); } }
  reorderTab(id: string, before: string) {
    const tab = this.tabs.find(tab => tab.id === id), active = this.tab?.id;
    if (!tab || id === before || !this.tabs.some(tab => tab.id === before)) return;
    this.tabs = this.tabs.filter(tab => tab.id !== id); this.tabs.splice(this.tabs.findIndex(tab => tab.id === before), 0, tab);
    this.active = this.tabs.findIndex(tab => tab.id === active); this.emit('change');
  }
  dockTab(id: string, edge: string) {
    const source = this.tabs.find(tab => tab.id === id), target = this.tab;
    if (!source || !target || source === target || !['left','right','top','bottom'].includes(edge)) return;
    const insert = (tree: Tree): Tree => tree.kind === 'pane' ? tree.id === target.focused ? { kind: 'split', id: this.id(), axis: ['left','right'].includes(edge) ? 'horizontal' : 'vertical', ratio: .5, first: ['left','top'].includes(edge) ? source.tree : tree, second: ['left','top'].includes(edge) ? tree : source.tree } : tree : { ...tree, first:insert(tree.first), second:insert(tree.second) };
    target.tree = insert(target.tree); target.focused = source.focused;
    this.tabs = this.tabs.filter(tab => tab !== source); this.active = this.tabs.indexOf(target); this.emit('change');
  }
  dockPane(id: string, edge: string) {
    const source = this.tabs.find(tab => leaves(tab.tree).includes(id)), target = this.tab;
    if (!source || !target || target.focused === id || !['left','right','top','bottom'].includes(edge)) return;
    const remaining = remove(source.tree,id);
    if (remaining) { source.tree=remaining; if(source.focused===id)source.focused=leaves(remaining)[0]!; }
    else this.tabs=this.tabs.filter(tab=>tab!==source);
    const pane: Tree = {kind:'pane',id};
    const insert = (tree: Tree): Tree => tree.kind === 'pane' ? tree.id === target.focused ? {kind:'split',id:this.id(),axis:['left','right'].includes(edge)?'horizontal':'vertical',ratio:.5,first:['left','top'].includes(edge)?pane:tree,second:['left','top'].includes(edge)?tree:pane} : tree : {...tree,first:insert(tree.first),second:insert(tree.second)};
    target.tree=insert(target.tree);target.focused=id;this.active=this.tabs.indexOf(target);this.emit('change');
  }
  detachPane(id: string) {
    const source = this.tabs.find(tab => leaves(tab.tree).includes(id)); if (!source || leaves(source.tree).length < 2) return;
    source.tree = remove(source.tree,id)!; source.focused = leaves(source.tree)[0]!;
    this.tabs.push({ id:this.id(),name:'Shell',tree:{kind:'pane',id},focused:id,group:source.group }); this.active=this.tabs.length-1;this.emit('change');
  }
  closePane() {
    const id = this.tab.focused; const tree = remove(this.tab.tree, id); this.sessions.close(id);
    if (tree) { this.tab.tree = tree; this.tab.focused = leaves(tree)[0]!; }
    else { this.tabs.splice(this.active, 1); this.active = Math.max(0, this.active - 1); }
    this.emit('change');
  }
  closeTab() {
    for (const id of leaves(this.tab.tree)) this.sessions.close(id);
    this.tabs.splice(this.active, 1); this.active = Math.max(0, this.active - 1); this.emit('change');
  }
}
