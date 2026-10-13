import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{databasePath}=require('./paths.cjs');
const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(databasePath);
try{db.exec('PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);');const key='desktop-ui';if(process.argv[2]==='save'){const value=JSON.parse(process.argv[3]);db.prepare('INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));}else{const row=db.prepare('SELECT value FROM meta WHERE key=?').get(key);console.log(row?.value||'{}');}}finally{db.close();}
