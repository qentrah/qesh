import {test,expect} from 'bun:test';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
const require=createRequire(import.meta.url),{guiProjectArgs,createProjectRunner}=require('../lib/project-jobs.mjs');
test('GUI actions validate project targets and keep report text as literal arguments',()=>{
 expect(guiProjectArgs({project:'qh',command:'install'})).toEqual(['install','qh']);expect(guiProjectArgs({project:'Kyna',command:'install',manager:'bun'})).toEqual(['install','Kyna','--manager','bun']);expect(()=>guiProjectArgs({project:'unknown',command:'fork'})).toThrow('Select');expect(()=>guiProjectArgs({project:'qh',command:'execute'})).toThrow('Unknown');expect(()=>guiProjectArgs({project:'qh',command:'clone',directory:'relative'})).toThrow('destination');expect(()=>guiProjectArgs({project:'qh',command:'bug',title:'',body:'Steps'})).toThrow('title');
 const title='$(touch hidden); `whoami`';expect(guiProjectArgs({project:'qh',command:'bug',title,body:'Only this text'})).toEqual(['bug','qh','--title',title,'--body','Only this text']);
});
test('GUI runner streams bounded plain output, prevents duplicate jobs, and preserves failures for retry',async()=>{
 const events:any[]=[],calls:any[]=[];let child:any;const runner=createProjectRunner({node:'/runtime/node',cli:'/app/bin/qh',env:{PATH:'/runtime'},onUpdate:(event:any)=>events.push(event),spawnChild:(...args:any[])=>{calls.push(args);child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();return child;}});
 const first=runner.run({project:'qh',command:'fork'});expect(runner.busy).toBe(true);await expect(runner.run({project:'qh',command:'fork'})).rejects.toThrow('already running');expect(calls[0][1]).toEqual(['/app/bin/qh','fork','qh']);expect(calls[0][2].stdio[0]).toBe('ignore');child.stdout.emit('data','\x1b[31mProgress\x1b[0m\n');expect(events.at(-1).output).toBe('Progress\n');child.stderr.emit('data','x'.repeat(13000));expect(events.at(-1).output.length).toBe(12000);child.emit('close',7);expect((await first).code).toBe(7);expect(events.at(-1).status).toBe('error');expect(runner.busy).toBe(false);
 const second=runner.run({project:'qh',command:'bugs'});child.stdout.emit('data','No issues');child.emit('close',0);expect((await second).code).toBe(0);expect(events.at(-1).output).toBe('No issues');expect(events.at(-1).status).toBe('success');
});
test('GUI runner reports missing runtimes without leaving the panel stuck busy',async()=>{
 const events:any[]=[];const runner=createProjectRunner({node:'missing',cli:'qh',env:{},onUpdate:(event:any)=>events.push(event),spawnChild:()=>{const child:any=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();queueMicrotask(()=>child.emit('error',new Error('Runtime missing')));return child;}});const result=await runner.run({project:'qh',command:'bugs'});expect(result.code).toBe(1);expect(result.output).toContain('Runtime missing');expect(runner.busy).toBe(false);expect(events.at(-1).status).toBe('error');
});
