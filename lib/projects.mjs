import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
export const projects=JSON.parse(readFileSync(new URL('./projects.json',import.meta.url),'utf8'));
export const projectCommands=['projects','project','clone','fork','bug','bugs'];
export function findProject(name){return projects.find(item=>item.name.toLowerCase()===String(name).toLowerCase());}
function quote(value){return "'"+String(value).replaceAll("'","'\\''")+"'";}
export function planProject(command,args,cwd=process.cwd()){
 const values=[...args],name=values.shift(),project=findProject(name);
 if(!project)throw new Error(`Unknown Qentrah project: ${name||'(missing)'}. Run qh projects.`);
 const dry=values.includes('--dry-run');if(dry)values.splice(values.indexOf('--dry-run'),1);
 const repo=`qentrah/${project.name}`,url=`https://github.com/${repo}`;
 let executable,argv;
 if(command==='clone'){
  if(values.length>1||values[0]?.startsWith('--'))throw new Error('Usage: qh clone PROJECT [DIRECTORY] [--dry-run]');
  const destination=resolve(cwd,values[0]||project.name);if(existsSync(destination))throw new Error(`Destination already exists: ${destination}`);
  executable='git';argv=['clone','--',url+'.git',destination];
 }else if(command==='fork'){
  if(values.length)throw new Error('Usage: qh fork PROJECT [--dry-run]');executable='gh';argv=['repo','fork',repo,'--clone=false','--remote=false'];
 }else if(command==='bugs'){
  if(values.length)throw new Error('Usage: qh bugs PROJECT [--dry-run]');executable='gh';argv=['issue','list','--repo',repo];
 }else if(command==='bug'){
  executable='gh';argv=['issue','create','--repo',repo];let body=false;
  while(values.length){const flag=values.shift();if(flag==='--web'){argv.push(flag);continue;}if(!['--title','--body','--body-file'].includes(flag)||!values.length)throw new Error('Usage: qh bug PROJECT [--web] [--title TITLE] [--body TEXT | --body-file FILE] [--dry-run]');if(flag.startsWith('--body')){if(body)throw new Error('Use either --body or --body-file.');body=true;}let value=values.shift();if(flag==='--body-file'){value=resolve(cwd,value);if(!existsSync(value))throw new Error(`Issue body file does not exist: ${value}`);}argv.push(`${flag}=${value}`);}
 }else if(command==='install'){
  let manager='npm',source=false,directory;
  while(values.length){const flag=values.shift();if(flag==='--source')source=true;else if(['--manager','--dir'].includes(flag)&&values.length){const value=values.shift();if(flag==='--manager')manager=value;else directory=value;}else throw new Error('Usage: qh install PROJECT [--manager npm|bun] [--source] [--dir DIRECTORY] [--dry-run]');}
  if(!['npm','bun'].includes(manager))throw new Error('Package manager must be npm or bun.');
  if(source||!project.package){const plan=planProject('clone',[project.name,...(directory?[directory]:[]),...(dry?['--dry-run']:[])],cwd);return {...plan,note:`Source checkout. Build instructions: ${url}#readme`};}
  if(directory)throw new Error('--dir applies to source checkouts; use --source.');
  executable=manager;argv=manager==='npm'?['install','--global',project.package]:['add','--global',...(project.trust?['--trust']:[]),project.package];
 }else throw new Error('Unknown project action.');
 return {executable,args:argv,dry,repo,url,preview:[executable,...argv].map(quote).join(' ')};
}
export async function runProjectCommand(command,args,{execute=spawnSync,log=console.log,cwd=process.cwd(),fetcher=fetch}={}){
 if(command==='projects'){
  const values=args.filter(x=>x!=='--live');if(values.some(x=>x.startsWith('--')))throw new Error('Usage: qh projects [SEARCH] [--live]');let items=projects;
  if(args.includes('--live')){items=[];for(let page=1;page<=10;page++){const response=await fetcher(`https://api.github.com/orgs/qentrah/repos?per_page=100&type=public&page=${page}`,{headers:{Accept:'application/vnd.github+json','User-Agent':'qentrah-qh'}});if(!response.ok)throw new Error(`GitHub catalog unavailable: HTTP ${response.status}. Run qh projects for the bundled catalog.`);const batch=await response.json();if(!Array.isArray(batch))throw new Error('Invalid GitHub catalog response.');items.push(...batch.filter(item=>!item.private));if(batch.length<100)break;}}
  const query=values.join(' ').toLowerCase();for(const item of items.filter(p=>(p.name+' '+p.description).toLowerCase().includes(query)))log(`${item.name.padEnd(28)} ${item.description||'Source repository'}\n${item.url?.startsWith('https://github.com/')?item.url:item.html_url||`https://github.com/qentrah/${item.name}`}`);return 0;
 }
 if(command==='project'){
  if(args.length!==1)throw new Error('Usage: qh project PROJECT');const project=findProject(args[0]);if(!project)throw new Error('Unknown project. Run qh projects.');log(`${project.name}\n${project.description||'Source repository'}\n${project.url}\nInstall: qh install ${project.name}${project.package?' --manager npm':' --source'}\nClone: qh clone ${project.name}\nFork: qh fork ${project.name}\nReport a bug: qh bug ${project.name}`);return 0;
 }
 const plan=planProject(command,args,cwd);if(plan.note)log(plan.note);log(plan.preview);if(plan.dry)return 0;
 const result=execute(plan.executable,plan.args,{cwd,stdio:'inherit',env:process.env});if(result.error){if(result.error.code==='ENOENT')throw new Error(`${plan.executable} is required. Install ${plan.executable}${plan.executable==='gh'?' and run gh auth login':''}, then retry.`);throw result.error;}return result.status??1;
}
