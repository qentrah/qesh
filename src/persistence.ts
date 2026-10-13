import {Database} from 'bun:sqlite';
import {createRequire} from 'node:module';
import type {Workspace} from './workspace';
const require=createRequire(import.meta.url);
export function persist(workspace:Workspace){
 const {databasePath}=require('../lib/paths.cjs'),{createStore}=require('../lib/store.cjs');
 const store=createStore(databasePath,Database),owner=process.env.QESH_STORE_OWNER||(process.env.QENTRAH_DESKTOP==='1'?'desktop':'cli');
 if(process.env.QESH_RESTORE!=='0')workspace.restore(store.load(owner)||(process.env.QESH_WORKSPACE_NAME?store.list().map((row:any)=>store.load(row.owner)).find((saved:any)=>saved.spaces?.some((space:any)=>space.name===process.env.QESH_WORKSPACE_NAME)):null));
 let timer:ReturnType<typeof setTimeout>|undefined,closed=false;
 const flush=()=>{if(!closed){clearTimeout(timer);store.save(owner,workspace.snapshot());}};
 const changed=()=>{clearTimeout(timer);timer=setTimeout(flush,250);};
 workspace.on('change',changed);flush();
 return()=>{flush();closed=true;workspace.off('change',changed);store.close();};
}
