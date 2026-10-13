import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename } from 'node:path';
import { SessionManager } from './sessions';
import { leaves, remove, split, type Axis, type Tree } from './layout';
export interface Tab { id: string; name: string; tree: Tree; focused: string; group?: string; color?: string }
export interface Space { id: string; name: string; color?: string; tabs: Tab[]; active: number; groups: string[] }
export class Workspace extends EventEmitter {
  revision = 0; spaces: Space[] = []; selected = 0; private serial = 0;
  get space() { return this.spaces[this.selected]!; }
  get tabs() { return this.space?.tabs || []; } set tabs(value: Tab[]) { this.space.tabs=value; }
  get active() { return this.space?.active || 0; } set active(value: number) { this.space.active=value; }
  get groups() { return this.space?.groups || []; } set groups(value: string[]) { this.space.groups=value; }
  constructor(readonly sessions: SessionManager, readonly cwd: string, readonly shell: string) {
    super(); this.on('change', () => { this.revision++; }); sessions.on('change', () => this.emit('change')); this.newSpace('Workspace');
  }
  maxWorkspaces=Number(process.env.QH_MAX_WORKSPACES)||30;
  newSpace(name='Workspace') { if(this.spaces.length>=this.maxWorkspaces){this.emit('notice','Workspace limit reached. Change it in Settings → Storage.');return;} const base=cleanName(name);let unique=base,n=2;while(this.spaces.some(space=>space.name===unique))unique=base.slice(0,35)+' '+n++;this.spaces.push({id:randomUUID(),name:unique,tabs:[],active:0,groups:[]});this.selected=this.spaces.length-1;this.newTab(); }
  selectSpace(id:string) { const index=this.spaces.findIndex(space=>space.id===id);if(index>=0){this.selected=index;this.emit('change');} }
  renameSpace(id:string,name:string) { const space=this.spaces.find(space=>space.id===id);if(space){space.name=cleanName(name);this.emit('change');} }
  colorSpace(id:string,color:string) { const space=this.spaces.find(space=>space.id===id);if(space&&validColor(color)){space.color=color||undefined;this.emit('change');} }
  colorTab(id:string,color:string) { const tab=this.spaces.flatMap(space=>space.tabs).find(tab=>tab.id===id);if(tab&&validColor(color)){tab.color=color||undefined;this.emit('change');} }
  closeSpace(id:string) { const index=this.spaces.findIndex(space=>space.id===id),selected=this.space?.id;if(index<0)return;for(const tab of this.spaces[index]!.tabs)for(const pane of leaves(tab.tree))this.sessions.close(pane);this.spaces.splice(index,1);this.selected=selected!==id?Math.max(0,this.spaces.findIndex(space=>space.id===selected)):Math.max(0,Math.min(index,this.spaces.length-1));this.emit('change'); }
  snapshot() { return {version:1,selected:this.space?.id,spaces:this.spaces.map(space=>({...space,tabs:space.tabs.map(tab=>({...tab,sessions:leaves(tab.tree).map(id=>{const s=this.sessions.sessions.get(id);return {id,cwd:s?.cwd||this.cwd,shell:s?.shell||this.shell,label:s?.label};})}))}))}; }
  restore(value:any) {
    if(value?.version!==1||!Array.isArray(value.spaces)||!value.spaces.length)return false;
    const spaces:Space[]=[],spawn:{id:string;cwd:string;shell:string;label?:string}[]=[],used=new Set<string>();
    const tree=(node:any,depth=0):Tree=>{if(depth>12||!node||typeof node.id!=='string'||used.has(node.id))throw new Error('Invalid saved layout');used.add(node.id);this.serial=Math.max(this.serial,Number(node.id)||0);if(node.kind==='pane')return {kind:'pane',id:node.id};if(node.kind!=='split'||!['horizontal','vertical'].includes(node.axis))throw new Error('Invalid saved split');return {kind:'split',id:node.id,axis:node.axis,ratio:Math.max(.05,Math.min(.95,Number(node.ratio)||.5)),first:tree(node.first,depth+1),second:tree(node.second,depth+1)};};
    try {for(const raw of value.spaces.slice(0,100)){if(!Array.isArray(raw.tabs)||!raw.tabs.length)continue;const tabs:Tab[]=[];for(const t of raw.tabs.slice(0,50)){if(typeof t.id!=='string')throw new Error('Invalid saved tab');this.serial=Math.max(this.serial,Number(t.id)||0);const layout=tree(t.tree),ids=leaves(layout);for(const id of ids){const saved=t.sessions?.find((s:any)=>s.id===id);let cwd=saved?.cwd||this.cwd;try{if(!existsSync(cwd)||!statSync(cwd).isDirectory())cwd=homedir();}catch{cwd=homedir();}spawn.push({id,cwd,shell:typeof saved?.shell==='string'&&saved.shell.startsWith('/')?saved.shell:this.shell,label:typeof saved?.label==='string'?saved.label.slice(0,40):undefined});}tabs.push({id:t.id,name:cleanName(t.name),tree:layout,focused:ids.includes(t.focused)?t.focused:ids[0]!,group:t.group,color:validColor(t.color)?t.color:undefined});}spaces.push({id:typeof raw.id==='string'?raw.id:randomUUID(),name:cleanName(raw.name),color:validColor(raw.color)?raw.color:undefined,tabs,active:Math.max(0,Math.min(tabs.length-1,raw.active|0)),groups:Array.isArray(raw.groups)?raw.groups.filter((g:unknown)=>typeof g==='string').slice(0,50):[]});}if(!spaces.length)return false;}catch{return false;}
    for(const id of [...this.sessions.sessions.keys()])this.sessions.close(id);this.spaces=spaces;this.selected=Math.max(0,spaces.findIndex(s=>s.id===value.selected));for(const saved of spawn){const session=this.sessions.create(saved.id,saved.cwd,saved.shell);session.label=saved.label;}this.emit('change');return true;
  }
  get tab() { return this.tabs[this.active]!; }
  private id() { return String(++this.serial); }
  newTab(cwd?:string) {
    cwd=cwd||this.sessions.sessions.get(this.tab?.focused)?.cwd||this.cwd;
    const base=(basename(cwd)||'Shell').slice(0,40);let name=base,n=2;while(this.tabs.some(tab=>tab.name===name))name=base.slice(0,35)+' '+n++;
    const pane = this.id(); this.sessions.create(pane, cwd, this.shell);
    this.tabs.push({ id: this.id(), name, tree: { kind: 'pane', id: pane }, focused: pane });
    this.active = this.tabs.length - 1; this.emit('change');
  }
  switchTab(index: number) { this.active = (index + this.tabs.length) % this.tabs.length; this.emit('change'); }
  focus(id: string) { if (leaves(this.tab.tree).includes(id)) { this.tab.focused = id; this.emit('change'); } }
  split(axis: Axis) {
    const id = this.id(); this.sessions.create(id, this.sessions.sessions.get(this.tab.focused)?.cwd || this.cwd, this.shell);
    this.tab.tree = split(this.tab.tree, this.tab.focused, id, axis, this.id());
    this.tab.focused = id; this.emit('change');
  }
  equalize(){const walk=(tree:Tree):Tree=>tree.kind==='pane'?tree:{...tree,ratio:.5,first:walk(tree.first),second:walk(tree.second)};this.tab.tree=walk(this.tab.tree);this.emit('change');}
  rename(name: string) { this.tab.name = name.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 40) || 'Shell'; this.emit('change'); }
  selectTab(id: string) {for(let spaceIndex=0;spaceIndex<this.spaces.length;spaceIndex++){const space=this.spaces[spaceIndex]!,index=space.tabs.findIndex(tab=>tab.id===id);if(index>=0){this.selected=spaceIndex;space.active=index;this.emit('change');return true;}}return false;}
  activatePane(id:string){for(const space of this.spaces)for(const tab of space.tabs)if(leaves(tab.tree).includes(id)){this.selectTab(tab.id);tab.focused=id;this.emit('change');return true;}return false;}
  renameGroup(from:string,to:string){to=cleanName(to);if(!this.groups.includes(from)||this.groups.includes(to))return;this.groups=this.groups.map(name=>name===from?to:name);for(const tab of this.tabs)if(tab.group===from)tab.group=to;this.emit('change');}
  addGroup(name: string) { name = name.trim().slice(0, 40); if (name && !this.groups.includes(name)) { this.groups.push(name); this.emit('change'); } }
  groupTab(id: string, group?: string) { const space=this.spaces.find(space=>space.tabs.some(tab=>tab.id===id)),tab=space?.tabs.find(tab=>tab.id===id); if (tab && (!group || space!.groups.includes(group))) { tab.group = group; this.emit('change'); } }
  reorderTab(id: string, before: string) {
    const tab = this.tabs.find(tab => tab.id === id), active = this.tab?.id;
    if (!tab || id === before || !this.tabs.some(tab => tab.id === before)) return;
    this.tabs = this.tabs.filter(tab => tab.id !== id); this.tabs.splice(this.tabs.findIndex(tab => tab.id === before), 0, tab);
    this.active = this.tabs.findIndex(tab => tab.id === active); this.emit('change');
  }
  dockTab(id: string, edge: string, targetId?:string) {
    const source = this.tabs.find(tab => tab.id === id), target = targetId?this.tabs.find(tab=>leaves(tab.tree).includes(targetId)):this.tab;
    if (!source || !target || source === target || !['left','right','top','bottom'].includes(edge)) return;
    const insert = (tree: Tree): Tree => tree.kind === 'pane' ? tree.id === (targetId||target.focused) ? { kind: 'split', id: this.id(), axis: ['left','right'].includes(edge) ? 'horizontal' : 'vertical', ratio: .5, first: ['left','top'].includes(edge) ? source.tree : tree, second: ['left','top'].includes(edge) ? tree : source.tree } : tree : { ...tree, first:insert(tree.first), second:insert(tree.second) };
    target.tree = insert(target.tree); target.focused = source.focused;
    this.tabs = this.tabs.filter(tab => tab !== source); this.active = this.tabs.indexOf(target); this.emit('change');
  }
  dockPane(id: string, edge: string, targetId?:string) {
    const source = this.tabs.find(tab => leaves(tab.tree).includes(id)), target = targetId?this.tabs.find(tab=>leaves(tab.tree).includes(targetId)):this.tab;
    if (!source || !target || (targetId||target.focused) === id || !['left','right','top','bottom'].includes(edge)) return;
    const remaining = remove(source.tree,id);
    if (remaining) { source.tree=remaining; if(source.focused===id)source.focused=leaves(remaining)[0]!; }
    else this.tabs=this.tabs.filter(tab=>tab!==source);
    const pane: Tree = {kind:'pane',id};
    const insert = (tree: Tree): Tree => tree.kind === 'pane' ? tree.id === (targetId||target.focused) ? {kind:'split',id:this.id(),axis:['left','right'].includes(edge)?'horizontal':'vertical',ratio:.5,first:['left','top'].includes(edge)?pane:tree,second:['left','top'].includes(edge)?tree:pane} : tree : {...tree,first:insert(tree.first),second:insert(tree.second)};
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

function cleanName(value:unknown){return String(value||"Workspace").replace(/[\x00-\x1f\x7f]/g,"").trim().slice(0,40)||"Workspace";}
function validColor(value:unknown){return typeof value==="string"&&(value===""||/^#[\da-f]{6}$/i.test(value));}
