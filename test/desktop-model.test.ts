import {test,expect} from 'bun:test';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {Workspace} from '../src/workspace';
import {leaves} from '../src/layout';
import type {SessionManager} from '../src/sessions';
const require=createRequire(import.meta.url);
const config=require('../desktop/config.cjs');
test('configuration validates settings and preserves the previous JSON on invalid edits',()=>{
 const folder=mkdtempSync(join(tmpdir(),'q-config-'));const path=join(folder,'qesh.config.json');
 try{expect(config.load(path).defaultPath).toBe('~');config.save(path,JSON.stringify({defaultPath:'/tmp',fontSize:18,tabsPosition:'top',theme:{primary:'#abcdef'}}));expect(config.load(path).theme.primary).toBe('#abcdef');const before=readFileSync(path,'utf8');expect(()=>config.save(path,'{"fontSize":99}')).toThrow();expect(readFileSync(path,'utf8')).toBe(before);expect(()=>config.validate({theme:{background:'red'}})).toThrow();expect(()=>config.validate({defaultPath:'relative'})).toThrow();}finally{rmSync(folder,{recursive:true,force:true});}
});
test('group, reorder, dock and detach keep the same shell owners',()=>{
 const manager=Object.assign(new EventEmitter(),{sessions:new Map()}) as unknown as SessionManager;const created:string[]=[];manager.create=((id:string,cwd:string)=>{created.push(id);manager.sessions.set(id,{cwd,pid:Number(id)+100} as any);return manager.sessions.get(id)!;}) as any;
 const workspace=new Workspace(manager,'/tmp','/bin/zsh');const first=workspace.tab;workspace.newTab('/var');const second=workspace.tab;const owners=[...manager.sessions.keys()];workspace.addGroup('Projects');workspace.groupTab(second.id,'Projects');workspace.reorderTab(second.id,first.id);expect(workspace.tab.id).toBe(second.id);expect(second.group).toBe('Projects');workspace.selectTab(first.id);workspace.dockTab(second.id,'right');expect(workspace.tabs.length).toBe(1);expect(leaves(workspace.tab.tree).sort()).toEqual(owners.sort());workspace.detachPane(owners[1]!);expect(workspace.tabs.length).toBe(2);workspace.selectTab(first.id);workspace.dockPane(owners[1]!,'bottom');expect(workspace.tabs.length).toBe(1);expect([...manager.sessions.keys()].sort()).toEqual(owners.sort());expect(created.length).toBe(2);
});
test('JSONC saves preserve editor comments and reject conflicting GUI shortcuts and storage limits',()=>{
 const folder=mkdtempSync(join(tmpdir(),'qh-jsonc-')),path=join(folder,'config.jsonc');try{
  const {writeFileSync}=require('node:fs');writeFileSync(path,'// My local note\n{\n  "fontSize": 14, // monospace size\n  "restore": true,\n}\n');const loaded=config.load(path);expect(loaded.shortcuts['new-tab']).toBe('Cmd+T');config.save(path,{...loaded,fontSize:16});const text=readFileSync(path,'utf8');expect(text).toContain('// My local note');expect(text).toContain('// monospace size');expect(text).toContain('https://qentrah.com/docs/qesh/keyboard');expect(config.load(path).fontSize).toBe(16);
  const before=readFileSync(path,'utf8');expect(()=>config.save(path,{...loaded,shortcuts:{...loaded.shortcuts,commands:'Cmd+T'}})).toThrow('Duplicate');expect(readFileSync(path,'utf8')).toBe(before);expect(()=>config.validate({shortcuts:{'new-tab':'Ctrl+C'}})).toThrow('reserved');expect(()=>config.validate({storage:{saveDelayMs:0}})).toThrow();expect(()=>config.validate({scrollback:100000})).toThrow();expect(config.validate({shortcuts:{commands:''},storage:{enabled:false}}).storage.enabled).toBe(false);
 }finally{rmSync(folder,{recursive:true,force:true});}
});

test('saved custom themes validate complete palettes without changing built-in colors',()=>{const themes=require('../desktop/theme-presets.cjs');const palette={...themes.Midnight,primary:'#abcdef'};const value=config.validate({themes:{MyTheme:palette},theme:palette});expect(value.themes.MyTheme.primary).toBe('#abcdef');expect(themes.Midnight.primary).toBe('#82aaff');expect(()=>config.validate({themes:{Bad:{primary:'#000000'}}})).toThrow();expect(()=>config.validate({themes:{Bad:{...palette,foreground:'blue'}}})).toThrow();});

test('GUI save repairs unknown keys left by an invalid editor edit',()=>{const folder=mkdtempSync(join(tmpdir(),'qh-repair-')),path=join(folder,'config.jsonc');try{const {writeFileSync}=require('node:fs');const last=config.load(path);writeFileSync(path,'// Keep this note\n{ "fontSize":14, "typoSetting":true }');expect(()=>config.load(path)).toThrow('Unknown setting');config.save(path,{...last,fontSize:15});expect(config.load(path).fontSize).toBe(15);expect(readFileSync(path,'utf8')).toContain('// Keep this note');expect(readFileSync(path,'utf8')).not.toContain('typoSetting');expect(()=>config.validate({constructor:{}})).toThrow('Unknown setting');}finally{rmSync(folder,{recursive:true,force:true});}});
