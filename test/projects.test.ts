import {test,expect} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {projects,planProject,runProjectCommand}=await import('../lib/projects.mjs');
test('public project catalog supports packages and source checkouts without guessed build commands',()=>{
 expect(projects.length).toBeGreaterThan(20);expect(planProject('install',['kyna','--manager','bun','--dry-run']).args).toEqual(['add','--global','--trust','@kyna-language/cli@preview']);expect(planProject('install',['DUI','--dry-run']).args).toEqual(['install','--global','@qentrah/dui@latest']);expect(planProject('install',['kyna-music','--dry-run']).executable).toBe('git');expect(planProject('clone',['qesh','folder with spaces','--dry-run']).args.at(-1)).toBe(join(process.cwd(),'folder with spaces'));expect(()=>planProject('clone',['not-a-repo'])).toThrow('Unknown');expect(()=>planProject('install',['DUI','--manager','wrong'])).toThrow('Package manager');
 const folder=mkdtempSync(join(tmpdir(),'qh-clone-'));try{expect(()=>planProject('clone',['qesh',folder])).toThrow('already exists');}finally{rmSync(folder,{recursive:true,force:true});}
});
test('fork and bug plans preserve literal text and dry runs never publish or execute',async()=>{
 let calls=0;const execute=()=>{calls++;return {status:7};},log=()=>{};
 expect(planProject('fork',['qesh']).args).toEqual(['repo','fork','qentrah/qesh','--clone=false']);const title='$(touch /tmp/should-not-exist); `whoami`';expect(planProject('bug',['qesh','--title',title,'--body','literal']).args).toContain('--title='+title);
 expect(await runProjectCommand('bug',['qesh','--dry-run'],{execute,log})).toBe(0);expect(calls).toBe(0);expect(await runProjectCommand('bugs',['qesh'],{execute,log})).toBe(7);expect(calls).toBe(1);
 await expect(runProjectCommand('fork',['qesh'],{execute:()=>({error:Object.assign(new Error('missing'),{code:'ENOENT'})}),log})).rejects.toThrow('gh auth login');expect(()=>planProject('bug',['qesh','--body-file','/missing-report'])).toThrow('does not exist');expect(()=>planProject('bug',['qesh','--body','one','--body-file','two'])).toThrow('either');
});
test('live catalog gives actionable errors without running installation commands',async()=>{
 await expect(runProjectCommand('projects',['--live'],{fetcher:async()=>new Response('{}',{status:403}),log:()=>{}})).rejects.toThrow('HTTP 403');const rows:string[]=[];await runProjectCommand('projects',['qesh','--live'],{fetcher:async()=>new Response(JSON.stringify([{name:'qesh',description:'Terminal',html_url:'https://github.com/qentrah/qesh',private:false}])),log:(text:string)=>rows.push(text)});expect(rows.join('')).toContain('https://github.com/qentrah/qesh');
});
