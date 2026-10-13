import {fetchReleases,selectRelease,compareVersions} from './releases.mjs';
import {spawnSync,spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdirSync,existsSync,copyFileSync,writeFileSync,readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {configPath,databasePath,dataDir}=require('./paths.cjs'),configuration=require('../desktop/config.cjs');
mkdirSync(dataDir,{recursive:true,mode:0o700});
if(!existsSync(configPath)&&existsSync(join(dataDir,'config.json')))copyFileSync(join(dataDir,'config.json'),configPath);
if(!existsSync(configPath)&&existsSync(join(root,'qesh.config.json')))copyFileSync(join(root,'qesh.config.json'),configPath);
let config;try{config=configuration.load(configPath);}catch(error){console.error(`qh configuration: ${error.message}\n${configPath}`);process.exit(1);}
const version=JSON.parse(readFileSync(join(root,'package.json'))).version;
const args=process.argv.slice(2),name=args.shift()||(process.env.QENTRAH_TERMINAL==='1'?'help':'start');
function run(command,cwd){const result=spawnSync(config.shell,['-lc',command],{cwd:configuration.expandPath(cwd||process.cwd()),stdio:'inherit',env:process.env});if(result.error)throw result.error;return result.status??1;}
function help(){console.log(`Qesh ${version}\n\nqh                         Start workspace; show help inside Qesh\nqh start                   Start a terminal workspace\nqh search [text]           Find built-in and custom commands\nqh diagnostics             Check local configuration, storage and app metrics\nqh config                  Open global configuration JSON\nqh config path             Print configuration path\nqh config validate         Validate configuration\nqh install latest          Install the latest stable version\nqh install stable          Install a stable release\nqh install v0.6.3          Install a specific version\nqh update --check           Check Qesh releases\nqh update                  Update a managed Qesh installation\nqh update-all --dry-run     List configured CLI update commands\nqh update-all              Run configured updates, one at a time\nqh workspace list          List locally saved workspaces\nqh workspace NAME          Launch and select a saved workspace\nqh COMMAND                 Run a command from config.commands\n\nCustom commands: ${Object.keys(config.commands).join(', ')||'(none)'}\nConfiguration: ${configPath}\nSQLite: ${databasePath}\n`);}
try{
 if(['help','--help','-h'].includes(name))help();
 else if(name==='search'||name==='completions'){const entries=[['diagnostics','Check local configuration, storage and app metrics'],['help','Show available commands'],['search','Find commands'],['start','Start a terminal workspace'],['config open','Open global configuration'],['config path','Print configuration path'],['config validate','Validate configuration'],['config show','Print configuration JSON'],['install latest','Install latest stable Qesh'],['install stable','Install a stable release'],['install VERSION','Install a specific version'],['update stable','Update to stable Qesh'],['update --check','Check Qesh releases'],['update','Update managed installation'],['update-all --dry-run','Preview configured CLI updates'],['update-all','Run configured CLI updates'],['workspace list','List saved workspaces'],['workspace NAME','Open a named CLI workspace'],['version','Print version'],...Object.entries(config.commands).map(([key,item])=>[key,item.description||item.command])];if(name==='completions')console.log([...new Set(entries.map(([command])=>command.split(' ')[0]))].join('\n'));else{const query=args.join(' ').toLowerCase();for(const [command,description]of entries)if((command+' '+description).toLowerCase().includes(query))console.log(`qh ${command.padEnd(23)} ${description}`);}}
 else if(['version','--version','-v'].includes(name))console.log(version);
 else if(name==='diagnostics'){
  console.log(`Qesh ${version} · Node ${process.versions.node}\nConfiguration valid: ${configPath}\nLocal storage: ${databasePath}\nSaving: ${config.storage.enabled}; restore: ${config.restore}; scrollback: ${config.scrollback} lines`);
  if(existsSync(databasePath)){const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(databasePath);try{const row=db.prepare('SELECT value FROM meta WHERE key=?').get('desktop-ui');const ui=row?JSON.parse(row.value):{};if(ui.metrics)console.log(`Last app sample: startup ${ui.metrics.startupMs} ms; main process ${ui.metrics.memoryMB} MB; ${ui.metrics.sessions} sessions`);}finally{db.close();}}
 }
 else if(name==='config'){
  if(args.length>1||args[0]&&!['open','path','validate','show'].includes(args[0]))throw new Error('Usage: qh config [open|path|validate|show]');
  if(args[0]==='path')console.log(configPath);
  else if(args[0]==='validate')console.log('Configuration valid');
  else if(args[0]==='show')console.log(JSON.stringify(config,null,2));
  else{const result=spawnSync(process.platform==='darwin'?'/usr/bin/open':process.env.EDITOR||'vi',process.platform==='darwin'&&existsSync('/Applications/Visual Studio Code.app')?['-a','/Applications/Visual Studio Code.app',configPath]:[configPath],{stdio:'inherit'});if(result.error)throw result.error;process.exitCode=result.status||0;}
 }
 else if(name==='update-all'){
  if(args.length>1||args[0]&&args[0]!=='--dry-run')throw new Error('Usage: qh update-all [--dry-run]');
  const entries=Object.entries(config.updates);if(!entries.length)console.log(`No CLI updates configured. Add named command objects to updates in ${configPath}.`);
  for(const [key,item]of entries){console.log(`${key}: ${item.command}`);if(!args.includes('--dry-run')){const code=run(item.command,item.cwd);if(code){process.exitCode=code;console.error(`Stopped: ${key} exited with ${code}. Remaining updates were not run.`);break;}}}
 }
 else if(name==='update'||name==='install'){
  const check=args.includes('--check'),tokens=args.filter(arg=>arg!=='--check');if(name==='install'&&['version','versions'].includes(tokens[1]))tokens.pop();if(tokens.length>1||args.filter(arg=>arg==='--check').length>1)throw new Error('Usage: qh install [latest|stable|preview|vVERSION] [--check] or qh update [latest|stable|preview] [--check]');
  const selector=tokens[0]||(name==='install'?'latest':config.updateChannel);if(name==='update'&&!['latest','stable','preview'].includes(selector))throw new Error('Use qh install VERSION for a specific version.');
  const release=selectRelease(await fetchReleases(),selector);console.log(`Installed ${version}; available ${release.tag_name}`);
  if(!check&&name==='update'&&compareVersions(release.tag_name,version)<=0)console.log('Qesh is up to date for this release channel.');
  else if(!check){if(name==='update'&&!process.env.QESH_MANAGED)throw new Error('This is a source checkout. Run qh install latest for a managed installation.');const url=release.assets.find(asset=>asset.name==='install.sh')?.browser_download_url;const script=join(dataDir,'installer.tmp.sh');if(url){const response=await fetch(url);if(!response.ok)throw new Error(`Installer unavailable: HTTP ${response.status}`);writeFileSync(script,await response.text(),{mode:0o700});}else copyFileSync(join(root,'scripts/install.sh'),script);const result=spawnSync('/bin/sh',[script,release.tag_name],{stdio:'inherit',env:process.env});if(result.error)throw result.error;process.exitCode=result.status??1;}
 }
 else if(name==='workspace'&&args[0]==='list'){
  const {createStore}=require('./store.cjs'),store=createStore(databasePath);for(const owner of store.list()){const snapshot=store.load(owner.owner);for(const space of snapshot.spaces||[])console.log(`${owner.owner}\t${space.name}\t${space.tabs.length} tabs\t${space.id}`);}store.close();
 }
 else if(name==='start'||name==='workspace'){
  const bun=process.env.QENTRAH_BUN||'bun';const env={...process.env,PATH:[join(root,'bin'),process.env.PATH||''].join(':'),QENTRAH_THEME:JSON.stringify(config.theme),SHELL:config.shell,QESH_SCROLLBACK:String(config.scrollback),QESH_MAX_WORKSPACES:String(config.storage.maxWorkspaces),QESH_RESTORE:config.restore?'1':'0',QESH_CONFIG_PATH:configPath};if(name==='workspace')env.QESH_WORKSPACE_NAME=args.join(' ');
  const child=spawn(bun,[join(root,'src/index.tsx')],{stdio:'inherit',cwd:process.cwd(),env});for(const signal of ['SIGTERM','SIGHUP','SIGINT'])process.on(signal,()=>child.kill(signal));child.on('error',error=>{console.error(`Cannot start Bun: ${error.message}`);process.exitCode=1;});child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
 }
 else if(config.commands[name]){if(args.length)throw new Error('Custom commands do not accept extra arguments. Put arguments in the configured command.');const item=config.commands[name];process.exitCode=run(item.command,item.cwd);}
 else throw new Error(`Unknown command: ${name}. Run qh help.`);
}catch(error){console.error(`qh: ${error.message}`);process.exitCode=1;}
