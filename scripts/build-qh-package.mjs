import {cpSync,mkdirSync,chmodSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url)),pkg=join(root,'packages/qh'),dist=join(pkg,'dist');
mkdirSync(dist,{recursive:true});
for(const name of ['projects.mjs','projects.json','releases.mjs'])cpSync(join(root,'lib',name),join(dist,name));
cpSync(join(pkg,'qh.mjs'),join(dist,'qh.mjs'));chmodSync(join(dist,'qh.mjs'),0o755);cpSync(join(root,'LICENSE'),join(pkg,'LICENSE'));
const manifest=JSON.parse(readFileSync(join(pkg,'package.json'),'utf8'));manifest.version=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;writeFileSync(join(pkg,'package.json'),JSON.stringify(manifest,null,2)+'\n');
