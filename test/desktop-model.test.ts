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
