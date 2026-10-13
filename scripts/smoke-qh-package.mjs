import {execFileSync,spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,copyFileSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('..',import.meta.url)),temp=mkdtempSync(join(tmpdir(),'qh-package-')),dist=join(root,'dist');
try{
 const packed=JSON.parse(execFileSync('npm',['pack','--json','--pack-destination',temp],{cwd:join(root,'packages/qh'),encoding:'utf8'}));
 const tarball=join(temp,packed[0].filename);mkdirSync(dist,{recursive:true});copyFileSync(tarball,join(dist,'qentrah-qh.tgz'));
 writeFileSync(join(dist,'qentrah-qh.sha256'),`${createHash('sha256').update(readFileSync(tarball)).digest('hex')}  qentrah-qh.tgz\n`);
 execFileSync('npm',['install','--global','--prefix',join(temp,'installed'),'--ignore-scripts','--no-audit','--no-fund',tarball],{stdio:'pipe'});
 const entry=join(temp,'installed/lib/node_modules/@qentrah/qh/dist/qh.mjs');
 const run=args=>execFileSync(process.execPath,[entry,...args],{encoding:'utf8',cwd:temp});
 assert.match(run(['help']),/qh projects/);assert.match(run(['projects','qesh']),/qentrah\/qesh/);assert.match(run(['clone','qesh','--dry-run']),/git.*clone/);assert.match(run(['install','Kyna','--manager','bun','--dry-run']),/--trust.*@kyna-language\/cli@preview/);assert.match(run(['fork','qesh','--dry-run']),/--clone=false/);assert.match(run(['bug','qesh','--title','Smoke test','--body','No issue is submitted','--dry-run']),/issue.*create/);
 if(spawnSync('bun',['--version'],{stdio:'ignore'}).status===0){const bunRoot=join(temp,'bun');execFileSync('bun',['add','--global',tarball],{cwd:temp,env:{...process.env,BUN_INSTALL:bunRoot},stdio:'pipe'});assert.match(execFileSync(process.execPath,[join(bunRoot,'bin/qh'),'projects','Kyna'],{encoding:'utf8'}),/qentrah\/Kyna/);}
 console.log('Standalone CLI package smoke passed: real npm installation, catalog, clone, fork, npm/Bun plans, and issue plans.');
}finally{rmSync(temp,{recursive:true,force:true});}
