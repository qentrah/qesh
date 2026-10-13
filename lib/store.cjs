const {mkdirSync,chmodSync}=require('node:fs');const {dirname}=require('node:path');
function createStore(path,Driver){
 mkdirSync(dirname(path),{recursive:true,mode:0o700});chmodSync(dirname(path),0o700);
 const Database=Driver||require('node:sqlite').DatabaseSync;const db=new Database(path);
 db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS snapshots (owner TEXT PRIMARY KEY, body TEXT NOT NULL, updated INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);');
 return {load(owner){const row=db.prepare('SELECT body FROM snapshots WHERE owner=?').get(owner);return row?JSON.parse(row.body):null;},save(owner,value){db.prepare('INSERT INTO snapshots VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET body=excluded.body, updated=excluded.updated').run(owner,JSON.stringify(value),Date.now());},list(){return db.prepare('SELECT owner,updated FROM snapshots ORDER BY updated DESC').all();},close(){db.close();}};
}
module.exports={createStore};
