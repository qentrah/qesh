import {spawn} from 'node:child_process';
import {stripVTControlCharacters} from 'node:util';
import {isAbsolute} from 'node:path';
import {findProject,planProject} from './projects.mjs';
export function guiProjectArgs(request){
 const project=findProject(request.project);if(!project)throw new Error('Select a Qentrah project.');
 const command=request.command;if(!['install','clone','fork','bug','bugs'].includes(command))throw new Error('Unknown project action.');
 if(command==='install'&&project.name==='qesh')return ['install','qesh'];
 let args=[project.name];
 if(command==='clone'||command==='install'&&!project.package){if(typeof request.directory!=='string'||!isAbsolute(request.directory))throw new Error('Choose a destination folder.');if(command==='clone')args.push(request.directory);else args.push('--source','--dir',request.directory);}
 else if(command==='install'){if(!['npm','bun'].includes(request.manager))throw new Error('Choose npm or Bun.');args.push('--manager',request.manager);}
 else if(command==='bug'){if(typeof request.title!=='string'||!request.title.trim()||request.title.length>200||typeof request.body!=='string'||!request.body.trim()||request.body.length>12000)throw new Error('Add a title and description (up to 200 and 12,000 characters).');args.push('--title',request.title.trim(),'--body',request.body.trim());}
 planProject(command,args);return [command,...args];
}
export function createProjectRunner({node,cli,env,onUpdate,spawnChild=spawn}){
 let busy=false;
 return {get busy(){return busy;},async run(request){
  if(busy)throw new Error('A project action is already running in this window.');
  const args=guiProjectArgs(request),label=`${request.command} · ${findProject(request.project).name}`;
  busy=true;let output='';const update=status=>onUpdate({type:'project-job',label,status,output});update('running');
  try{return await new Promise(resolve=>{
   let child,settled=false;const finish=(code,error)=>{if(settled)return;settled=true;busy=false;if(error)output=(output+'\n'+error).slice(-12000);update(code===0?'success':'error');resolve({code,output,error:code===0?undefined:error||`Action exited with ${code}. See output for details.`});};
   try{child=spawnChild(node,[cli,...args],{env,stdio:['ignore','pipe','pipe']});}catch(error){finish(1,error.message);return;}
   const append=chunk=>{output=(output+stripVTControlCharacters(String(chunk))).slice(-12000);update('running');};child.stdout.on('data',append);child.stderr.on('data',append);child.once('error',error=>finish(1,error.message));child.once('close',code=>finish(code??1));
  });}finally{busy=false;}
 }};
}
