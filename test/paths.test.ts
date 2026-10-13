import {test,expect} from 'bun:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

test('QH imports legacy config and committed SQLite WAL data without moving installs',()=>{
 const home=mkdtempSync(join(tmpdir(),'qh-migration-'));
 const prefix=process.platform==='darwin'?'Library/Application Support/Qentrah':'.local/share';
 const old=join(home,prefix,process.platform==='darwin'?'Qesh':'qesh');
 const current=join(home,prefix,process.platform==='darwin'?'QH':'qh');
 const paths=join(import.meta.dir,'../lib/paths.cjs');
 try{
  mkdirSync(join(old,'versions'),{recursive:true});writeFileSync(join(old,'config.jsonc'),'// custom settings\n{"fontSize":18}');
  mkdirSync(join(current,'versions'),{recursive:true});
  const env:NodeJS.ProcessEnv={...process.env,HOME:home};delete env.QH_DATA_DIR;
  const script=`const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(${JSON.stringify(join(old,'workspaces.sqlite'))});db.exec("PRAGMA journal_mode=WAL; CREATE TABLE saved(name TEXT); INSERT INTO saved VALUES ('My workspace')");require(${JSON.stringify(paths)});const imported=new DatabaseSync(${JSON.stringify(join(current,'workspaces.sqlite'))});if(imported.prepare('SELECT name FROM saved').get().name!=='My workspace')throw new Error('Lost WAL data');imported.close();db.close();`;
  execFileSync('node',['-e',script],{env,stdio:'pipe'});
  expect(readFileSync(join(current,'config.jsonc'),'utf8')).toContain('fontSize');expect(existsSync(join(old,'versions'))).toBe(true);
  writeFileSync(join(current,'config.jsonc'),'{}');execFileSync('node',['-e',`require(${JSON.stringify(paths)})`],{env,stdio:'pipe'});
  expect(readFileSync(join(current,'config.jsonc'),'utf8')).toBe('{}');
 }finally{rmSync(home,{recursive:true,force:true});}
});

test('QH_DATA_DIR bypasses migration and isolates application data',()=>{
 const home=mkdtempSync(join(tmpdir(),'qh-isolation-'));const isolated=join(home,'isolated');
 try{
  const output=execFileSync('node',['-e',`console.log(require(${JSON.stringify(join(import.meta.dir,'../lib/paths.cjs'))}).dataDir)`],{env:{...process.env,HOME:home,QH_DATA_DIR:isolated},encoding:'utf8'});
  expect(output.trim()).toBe(isolated);expect(existsSync(isolated)).toBe(false);
 }finally{rmSync(home,{recursive:true,force:true});}
});
