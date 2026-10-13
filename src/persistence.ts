import {Database} from 'bun:sqlite';
import {createRequire} from 'node:module';
import type {Workspace} from './workspace';
const require=createRequire(import.meta.url);
export function persist(workspace:Workspace){
 const {databasePath,configPath}=require('../lib/paths.cjs'),{createStore}=require('../lib/store.cjs'),configuration=require('../desktop/config.cjs');
 const options=()=>{try{return configuration.load(configPath);}catch{return configuration.defaults;}};
 let store:ReturnType<typeof createStore>|undefined;
 const db=()=>store||(store=createStore(databasePath,Database));
 const owner=process.env.QH_STORE_OWNER||(process.env.QENTRAH_DESKTOP==='1'?'desktop':'cli');
 const initial=options();workspace.maxWorkspaces=initial.storage.maxWorkspaces;
 if(initial.storage.enabled&&process.env.QH_RESTORE!=='0'&&initial.restore)workspace.restore(db().load(owner)||(process.env.QH_WORKSPACE_NAME?db().list().map((row:any)=>db().load(row.owner)).find((saved:any)=>saved.spaces?.some((space:any)=>space.name===process.env.QH_WORKSPACE_NAME)):null));
 let timer:ReturnType<typeof setTimeout>|undefined,closed=false,last='';
 const flush=()=>{clearTimeout(timer);if(closed||!options().storage.enabled)return;const snapshot=workspace.snapshot(),body=JSON.stringify(snapshot);if(body!==last){db().save(owner,snapshot);last=body;}};
 const changed=()=>{clearTimeout(timer);const config=options();workspace.maxWorkspaces=config.storage.maxWorkspaces;if(config.storage.enabled)timer=setTimeout(flush,config.storage.saveDelayMs);};
 workspace.on('change',changed);flush();
 return()=>{flush();closed=true;workspace.off('change',changed);store?.close();};
}
