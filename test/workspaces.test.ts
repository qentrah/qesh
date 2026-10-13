import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {SessionManager} from '../src/sessions';
import {Workspace} from '../src/workspace';
import {leaves} from '../src/layout';
const require=createRequire(import.meta.url),{createStore}=require('../lib/store.cjs');
async function until(check:()=>boolean){const deadline=Date.now()+8000;while(!check()){if(Date.now()>deadline)throw new Error('Workspace test timed out');await Bun.sleep(30);}}
test('SQLite restores workspaces, tabs, splits, colors, labels and actual shell folders with fresh PIDs',async()=>{
 const folder=realpathSync(mkdtempSync(join(tmpdir(),'qesh-restore-'))),next=join(folder,'next');mkdirSync(next);
 const store=createStore(join(folder,'state.sqlite'),Database),sessions=new SessionManager(),workspace=new Workspace(sessions,folder,'/bin/zsh');let restored:SessionManager|undefined;
 try{
  await until(()=>[...sessions.sessions.values()].every(s=>s.status==='running'));
  workspace.renameSpace(workspace.space.id,'Code');workspace.colorSpace(workspace.space.id,'#abc123');workspace.rename('Editor');workspace.colorTab(workspace.tab.id,'#123abc');workspace.split('horizontal');workspace.tab.tree={...workspace.tab.tree,...(workspace.tab.tree.kind==='split'?{ratio:.37}:{})};
  await until(()=>[...sessions.sessions.values()].every(s=>s.status==='running'));
  const focused=workspace.tab.focused;sessions.sessions.get(focused)!.label='Server';sessions.input(focused,`cd '${next}'\r`);await until(()=>sessions.sessions.get(focused)?.cwd===next);
  const first=workspace.space.id,pids=[...sessions.sessions.values()].map(s=>s.pid);workspace.newSpace('Docs');workspace.selectSpace(first);expect([...sessions.sessions.values()].map(s=>s.pid).slice(0,2)).toEqual(pids);
  store.save('cli',workspace.snapshot());await sessions.shutdown();restored=new SessionManager();const reopened=new Workspace(restored,folder,'/bin/zsh');expect(reopened.restore(store.load('cli'))).toBe(true);await until(()=>[...restored!.sessions.values()].every(s=>s.status==='running'));
  expect(reopened.space.name).toBe('Code');expect(reopened.space.color).toBe('#abc123');expect(reopened.tab.name).toBe('Editor');expect(reopened.tab.color).toBe('#123abc');expect(leaves(reopened.tab.tree)).toHaveLength(2);expect(reopened.tab.tree.kind==='split'&&reopened.tab.tree.ratio).toBe(.37);expect(restored.sessions.get(focused)?.cwd).toBe(next);expect(restored.sessions.get(focused)?.label).toBe('Server');expect(reopened.spaces).toHaveLength(2);expect([...restored.sessions.values()].every(s=>!pids.includes(s.pid))).toBe(true);
  reopened.closeSpace(first);store.save('cli',reopened.snapshot());expect(store.load('cli').spaces.some((s:any)=>s.id===first)).toBe(false);
 }finally{await sessions.shutdown();await restored?.shutdown();store.close();rmSync(folder,{recursive:true,force:true});}
},15000);
test('Node CLI executes configured commands, previews updates, and stops after a failed updater',()=>{
 const folder=mkdtempSync(join(tmpdir(),'qh-command-')),output=join(folder,'result');
 try{
  writeFileSync(join(folder,'config.json'),JSON.stringify({commands:{hello:{command:`printf hello > '${output}'`,cwd:folder}},updates:{fail:{command:'exit 7'},never:{command:`printf wrong > '${output}'`}}}));
  const cli=join(import.meta.dir,'../bin/qh'),run=(args:string[])=>spawnSync(process.env.QENTRAH_NODE||'node',[cli,...args],{env:{...process.env,QESH_DATA_DIR:folder},encoding:'utf8'});
  expect(run(['hello']).status).toBe(0);expect(readFileSync(output,'utf8')).toBe('hello');expect(run(['hello','unexpected']).status).toBe(1);expect(run(['update-all','--dry-run']).status).toBe(0);expect(readFileSync(output,'utf8')).toBe('hello');expect(run(['update-all']).status).toBe(7);expect(readFileSync(output,'utf8')).toBe('hello');expect(run(['search','hello']).stdout).toContain('qh hello');expect(run(['search','update']).stdout).toContain('qh update-all');expect(run(['completions']).stdout).toContain('hello');expect(run(['config','validate']).stdout).toContain('Configuration valid');expect(run(['config','path']).stdout.trim()).toBe(join(folder,'config.json'));const inside=spawnSync(process.env.QENTRAH_NODE||'node',[cli],{env:{...process.env,QESH_DATA_DIR:folder,QENTRAH_TERMINAL:'1'},encoding:'utf8'});expect(inside.status).toBe(0);expect(inside.stdout).toContain('qh search');
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('SQLite files written by Bun are readable by the Node qh workspace command',()=>{
 const folder=mkdtempSync(join(tmpdir(),'qh-sqlite-'));try{const store=createStore(join(folder,'workspaces.sqlite'),Database);store.save('cli',{version:1,spaces:[{id:'x',name:'Research',tabs:[{}]}]});store.close();const result=spawnSync(process.env.QENTRAH_NODE||'node',[join(import.meta.dir,'../bin/qh'),'workspace','list'],{env:{...process.env,QESH_DATA_DIR:folder},encoding:'utf8'});expect(result.status).toBe(0);expect(result.stdout).toContain('Research\t1 tabs');}finally{rmSync(folder,{recursive:true,force:true});}
});

test('running-tool identities prefer foreground processes and ignore stale shell titles',()=>{const {identify}=require('../desktop/identity.cjs'),apps={codex:{name:'Codex',match:'codex',icon:'codex'},claude:{name:'Claude',match:'claude',icon:'claude'}};expect(identify({process:'codex'},apps)?.name).toBe('Codex');expect(identify({process:'node',title:'Claude Code'},apps)?.name).toBe('Claude');expect(identify({process:'zsh',title:'Claude Code'},apps)).toBeNull();expect(identify({process:'vim'},apps)).toBeNull();});
