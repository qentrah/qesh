const { app, BrowserWindow, ipcMain, Menu, dialog, shell, screen } = require('electron');
const { spawn, execFile, spawnSync } = require('node:child_process');
const { createInterface } = require('node:readline');
const { join, resolve, dirname } = require('node:path');
const { homedir } = require('node:os');
const { existsSync, appendFileSync, statSync, mkdirSync, copyFileSync, watchFile, unwatchFile } = require('node:fs');
const configuration = require('./config.cjs');
const bundled = existsSync(join(process.resourcesPath, 'runtime', 'bun'));
const root = bundled ? join(process.resourcesPath, 'terminal') : resolve(__dirname, '..');
const runtime = bundled ? join(process.resourcesPath, 'runtime') : null;
const {configPath,dataDir,databasePath}=require(join(root,'lib/paths.cjs'));
mkdirSync(dataDir,{recursive:true,mode:0o700});
const legacy=join(bundled?dirname(resolve(process.resourcesPath,'../..')):root,'qesh.config.json');
if(!existsSync(configPath)&&existsSync(join(dataDir,'config.json')))copyFileSync(join(dataDir,'config.json'),configPath);
if(!existsSync(configPath)&&existsSync(legacy))copyFileSync(legacy,configPath);
const windows = new Map(); let quitting = false;
const debug = value => { if (process.env.QENTRAH_DEBUG_LOG) appendFileSync(process.env.QENTRAH_DEBUG_LOG,`${value}\n`); };
function settings() { try { return configuration.load(configPath); } catch(error) { dialog.showErrorBox('Configuration error',`${error.message}\n\n${configPath}\nDefault settings will be used.`);return configuration.defaults; } }
const send = (record,message) => { if (record.host && !record.host.stdin.destroyed) record.host.stdin.write(JSON.stringify(message)+'\n'); };
const focused = () => windows.get(BrowserWindow.getFocusedWindow()?.id) || [...windows.values()][0];
async function closeWindow(record,confirmed=false) {
  if (!record || record.closing) return false; record.closing=true;
  if (!record.exited && !confirmed) {
    const result = await dialog.showMessageBox(record.window,{type:'question',title:'Close Qesh window?',message:'Close this window’s shell sessions?',detail:'Running commands will be stopped.',buttons:['Cancel','Close sessions'],defaultId:0,cancelId:0});
    if (result.response===0) {record.closing=false;return false;}
  }
  clearTimeout(record.uiTimer);if(record.config.storage.enabled)try{uiStore('save',collectUI(record));}catch{}
  send(record,{type:'shutdown'});
  await new Promise(resolve => { if (!record.host || record.host.exitCode!==null) return resolve(); const timer=setTimeout(() => {record.host.kill('SIGTERM');resolve();},4000);record.host.once('exit',() => {clearTimeout(timer);resolve();}); });
  record.allowClose=true;record.window.destroy();windows.delete(record.window.id);return true;
}
async function quitAll() {
  if (quitting) return;
  const records=[...windows.values()];
  if (records.some(record => !record.exited)) {
    const result=await dialog.showMessageBox(focused()?.window,{type:'question',title:'Quit Qesh?',message:'Close all windows and shell sessions?',buttons:['Cancel','Quit'],defaultId:0,cancelId:0});if(result.response===0)return;
  }
  quitting=true;await Promise.all(records.map(record=>closeWindow(record,true)));app.quit();
}
function uiStore(action,value){const result=spawnSync(runtime?join(runtime,'node'):process.env.QENTRAH_NODE||'node',[join(root,'lib/ui-state.mjs'),action,...(value?[JSON.stringify(value)]:[])],{encoding:'utf8',timeout:3000,env:process.env});if(result.status!==0)throw new Error('Could not save local window state.');return action==='load'?JSON.parse(result.stdout):value;}
function collectUI(record){const saved=uiStore('load'),bounds=record.window.isDestroyed()?{}:record.window.getNormalBounds();if(record.kind==='settings')return {...saved,settings:{width:bounds.width||820,height:bounds.height||700,page:record.ui.page||'appearance'}};return {...saved,...bounds,sidebarWidth:record.ui.sidebarWidth||saved.sidebarWidth||200,sidebarCollapsed:Boolean(record.ui.sidebarCollapsed),view:record.ui.view==='commands'?'commands':'terminal',metrics:{startupMs:record.startupMs||0,memoryMB:Math.round(process.memoryUsage().rss/1048576),sessions:record.sessions||0,updated:Date.now()}};}
function saveUI(record){clearTimeout(record.uiTimer);record.uiTimer=setTimeout(()=>{if(!record.config.storage.enabled)return;try{uiStore('save',collectUI(record));}catch(error){record.errors.push({time:Date.now(),message:error.message});record.errors=record.errors.slice(-30);}},500);}
function settingsWindow(owner,page){
 if(page&&!['appearance','terminal','storage','keyboard','commands','updates','about'].includes(page))page=undefined;
 owner=owner?.kind==='settings'?owner.owner:owner;if(!owner||owner.window.isDestroyed())owner=[...windows.values()].find(record=>record.kind==='shell');
 const existing=[...windows.values()].find(record=>record.kind==='settings'&&(record.owner===owner||(!owner&&record.owner?.window.isDestroyed())));if(existing){existing.window.show();existing.window.focus();if(page)existing.window.webContents.send('terminal:event',{type:'action',action:'settings-page',page});return existing;}
 const config=owner?.config||settings();let stored={};if(config.storage.enabled)try{stored=uiStore('load').settings||{};}catch{}
 const anchor=owner?.window.getBounds(),area=anchor?screen.getDisplayMatching(anchor).workArea:screen.getPrimaryDisplay().workArea,width=Math.min(area.width,Math.max(620,stored.width||820)),height=Math.min(area.height,Math.max(420,stored.height||700));
 const window=new BrowserWindow({width,height,x:Math.max(area.x,Math.min(area.x+area.width-width,(anchor?.x||area.x)+(anchor?.width||0)+12)),y:Math.max(area.y,Math.min(area.y+area.height-height,anchor?.y||area.y)),minWidth:620,minHeight:420,title:'Qesh Settings',backgroundColor:config.theme.background,titleBarStyle:'hiddenInset',trafficLightPosition:{x:16,y:16},show:false,webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
 const record={kind:'settings',owner,window,config,ui:{page:page||stored.page||'appearance'},errors:owner?.errors||[],exited:true,closing:false,allowClose:false};windows.set(window.id,record);
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());window.on('resize',()=>saveUI(record));window.on('close',()=>{clearTimeout(record.uiTimer);if(record.config.storage.enabled)try{uiStore('save',collectUI(record));}catch{}windows.delete(window.id);});window.once('ready-to-show',()=>{window.show();window.focus();});window.loadFile(join(__dirname,'settings.html'));return record;
}
function newWindow(startPath) {
  const config=settings();let cwd=startPath || configuration.expandPath(config.defaultPath);
  try {if(!statSync(cwd).isDirectory())throw new Error('Not a folder');}catch {dialog.showErrorBox('Starting folder unavailable',`${cwd}\n\nOpening your home folder instead.`);cwd=homedir();}
  let ui={};if(config.storage.enabled&&config.restore)try{ui=uiStore('load');}catch{}const area=screen.getPrimaryDisplay().workArea;
  const window=new BrowserWindow({width:Math.min(area.width,Math.max(520,Number(ui.width)||1150)),height:Math.min(area.height,Math.max(300,Number(ui.height)||740)),minWidth:520,minHeight:300,title:'Qesh',backgroundColor:config.theme.background,titleBarStyle:'hiddenInset',trafficLightPosition:{x:16,y:16},show:false,webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
  const record={kind:'shell',window,config,cwd,exited:false,closing:false,allowClose:false,errors:[],ui,startedAt:Date.now()};windows.set(window.id,record);
  record.host=spawn(runtime?join(runtime,'node'):process.env.QENTRAH_NODE||'node',[join(root,'desktop/host.mjs')],{stdio:'pipe',env:{...process.env,PATH:[join(root,'bin'),...(runtime?[runtime]:[]),process.env.PATH||'/usr/bin:/bin'].join(':'),QENTRAH_BUN:runtime?join(runtime,'bun'):process.env.QENTRAH_BUN||join(homedir(),'.bun/bin/bun'),QENTRAH_NODE:runtime?join(runtime,'node'):process.env.QENTRAH_NODE||'node',QENTRAH_START_DIR:cwd,QENTRAH_DESKTOP:'1',QESH_SCROLLBACK:String(config.scrollback),QESH_MAX_WORKSPACES:String(config.storage.maxWorkspaces),QESH_RESTORE:config.restore?'1':'0',QESH_STORE_OWNER:[...windows.values()].filter(record=>record.kind==='shell').length===1?'desktop':`desktop-window-${window.id}`,QENTRAH_THEME:JSON.stringify(config.theme),SHELL:config.shell}});
  const emit=message=>{if(message.type==='error'){record.errors.push({time:Date.now(),message:String(message.message).slice(0,1000)});record.errors=record.errors.slice(-30);}if(!window.isDestroyed())window.webContents.send('terminal:event',message);};
  createInterface({input:record.host.stdout}).on('line',line=>{try{const message=JSON.parse(line);if(message.type==='state'||message.type==='started')debug(`Host ${message.type}`);if(message.type==='exit')record.exited=true;if(message.type==='state')record.state=message;if(message.type==='state')record.sessions=(message.workspaces||[]).reduce((sum,space)=>sum+space.sessions,0);if(message.type==='started'){record.startupMs=Date.now()-record.startedAt;saveUI(record);}emit(message);}catch{emit({type:'error',message:'Invalid terminal response'});}});
  record.host.stderr.on('data',data=>{debug(String(data));emit({type:'error',message:String(data)});});record.host.on('error',error=>emit({type:'error',message:error.message}));record.host.on('exit',()=>{record.exited=true;});record.host.stdin.on('error',()=>{});
  window.webContents.on('console-message',(event,...args)=>debug(event.message||args.join(' ')));window.webContents.on('preload-error',(_event,_path,error)=>debug(error.message));
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
  window.on('resize',()=>saveUI(record));window.on('close',event=>{if(!record.allowClose){event.preventDefault();void closeWindow(record);}});window.once('ready-to-show',()=>{if(!process.env.QENTRAH_TEST_HEADLESS){window.show();window.focus();}});window.loadFile(join(__dirname,'index.html'));return record;
}
const controlActions=new Set(['new-tab','switch-tab','rename-tab','close-tab','split-right','split-down','help','new-group','group-tab','reorder-tab','dock-tab','detach-pane','focus-pane','dock-pane','new-workspace','switch-workspace','rename-workspace','color-workspace','close-workspace','color-tab','rename-pane','run-command','rename-group','close-pane','restart-pane','equalize','resize-split','resize-junction']);
ipcMain.on('terminal:command',(event,message)=>{
 const record=[...windows.values()].find(record=>record.window.webContents===event.sender);if(!record||!message||typeof message!=='object')return;
 debug(`Command ${message.type}`);
 if(message.type==='input'&&typeof message.data==='string'&&message.data.length<=1048576)send(record,{type:'input',data:message.data});
 else if(['start','resize'].includes(message.type)&&Number.isInteger(message.cols)&&Number.isInteger(message.rows))send(record,{type:message.type,cols:message.cols,rows:message.rows});
 else if(message.type==='ack'&&Number.isInteger(message.size)&&message.size>0)send(record,{type:'ack',size:message.size});
 else if(message.type==='control'&&controlActions.has(message.command?.action)){
  const command=message.command;if(!['close-pane','close-tab','close-workspace'].includes(command.action))send(record,{type:'control',command});else void(async()=>{
   const spaces=record.state?.workspaces||[],tabs=spaces.flatMap(space=>space.items||[]),sessions=command.action==='close-workspace'?spaces.find(space=>space.id===command.id)?.items.flatMap(tab=>tab.sessions)||[]:command.action==='close-tab'?tabs.find(tab=>tab.id===command.id)?.sessions||[]:tabs.flatMap(tab=>tab.sessions).filter(pane=>pane.id===command.id);
   if(sessions.some(session=>session.status==='running'||session.status==='starting')){const result=await dialog.showMessageBox(record.window,{type:'question',message:command.action==='close-workspace'?'Delete workspace and close its sessions?':command.action==='close-tab'?'Close tab and its sessions?':'Close this session?',detail:'Running commands will be stopped.',buttons:['Cancel','Close'],defaultId:0,cancelId:0});if(result.response===0)return;}
   send(record,{type:'control',command:{...command,confirmed:true}});
  })().catch(error=>{if(!record.window.isDestroyed())record.window.webContents.send('terminal:event',{type:'error',message:error.message});});
 }

});
ipcMain.handle('app:action',async(event,request)=>{
 const record=[...windows.values()].find(record=>record.window.webContents===event.sender);if(!record)return {error:'Window unavailable'};
 try {
  debug(`Action ${request.action}`);
  if(request.action==='settings')return {config:record.config,path:configPath,ui:record.ui};
  if(request.action==='open-settings'){settingsWindow(record,request.page);return {};}
  if(request.action==='save-ui'){const value=request.ui;if(value&&Number.isFinite(value.sidebarWidth))record.ui.sidebarWidth=Math.max(190,Math.min(400,value.sidebarWidth));if(typeof value?.sidebarCollapsed==='boolean')record.ui.sidebarCollapsed=value.sidebarCollapsed;if(['terminal','settings','commands'].includes(value?.view))record.ui.view=value.view;if(['appearance','terminal','storage','keyboard','commands','updates','about'].includes(value?.page))record.ui.page=value.page;saveUI(record);return {};}
  if(request.action==='configuration')return {text:JSON.stringify(configuration.load(configPath),null,2),path:configPath};
  if(request.action==='save-config') {const config=configuration.save(configPath,request.config||request.text);for(const r of windows.values()){r.config=config;r.window.setBackgroundColor(config.theme.background);r.window.webContents.send('terminal:event',{type:'config',config});send(r,{type:'control',command:{action:'configure',config}});}installMenu(config);return {config,path:configPath};}
  if(request.action==='report-error'&&typeof request.message==='string'){record.errors.push({time:Date.now(),message:request.message.slice(0,1000)});record.errors=record.errors.slice(-30);return {};}
  if(request.action==='diagnostics'){const owner=record.kind==='settings'?record.owner:record;return {errors:owner?.errors||[],metrics:{startupMs:owner?.startupMs||0,memoryMB:Math.round(process.memoryUsage().rss/1048576),sessions:owner?.sessions||0}};}
  if(request.action==='capture-shortcut'){record.window.webContents.setIgnoreMenuShortcuts(Boolean(request.active));return {};}
  if(request.action==='storage-info'){let bytes=0;for(const path of [databasePath,databasePath+'-wal',databasePath+'-shm'])try{bytes+=statSync(path).size;}catch{}return {path:databasePath,bytes};}
  if(request.action==='documentation'){await shell.openExternal('https://qentrah.com/docs/qesh/'+(request.page==='keyboard'?'keyboard':'configuration'));return {};}

  if(request.action==='open-config'){
    const editors=['/Applications/Visual Studio Code.app',join(homedir(),'Applications/Visual Studio Code.app'),'/Applications/Cursor.app','/Applications/Windsurf.app'];const editor=editors.find(existsSync);
    if(editor){await new Promise((resolve,reject)=>execFile('/usr/bin/open',['-a',editor,configPath],error=>error?reject(error):resolve()));return {};}
    const error=await shell.openPath(configPath);return error?{error}:{};
  }
  if(request.action==='new-window'){newWindow();return {};}
  if(request.action==='folder'){const result=await dialog.showOpenDialog(record.window,{title:'Open or create a folder',buttonLabel:'Open in new tab',properties:['openDirectory','createDirectory']});if(!result.canceled)send(record,{type:'control',command:{action:'new-tab',cwd:result.filePaths[0]}});return {};}
  if(request.action==='check-updates'){const {fetchReleases,selectRelease}=await import(require('node:url').pathToFileURL(join(root,'lib/releases.mjs')).href);const latest=selectRelease(await fetchReleases(),record.config.updateChannel);return {version:latest.tag_name,current:require(join(root,'package.json')).version};}
  if(request.action==='about-info')return {version:require(join(root,'package.json')).version};
  if(request.action==='about'){settingsWindow(record,'about');return {};}
 }catch(error){record.errors.push({time:Date.now(),message:error.message});record.errors=record.errors.slice(-30);return {error:error.message};}
 return {error:'Unknown action'};
});
function installMenu(config){
 const dispatch=action=>{const current=focused();if(action==='settings'||action==='help'){settingsWindow(current,action==='help'?'keyboard':undefined);return;}let target=current?.kind==='settings'?current.owner:current;if(target?.window.isDestroyed())target=undefined;if(!target)target=[...windows.values()].find(record=>record.kind==='shell');if(!target){newWindow();return;}if(target){target.window.show();target.window.focus();target.window.webContents.send('terminal:event',{type:'action',action});}};
 const item=(label,action)=>({label,accelerator:config.shortcuts[action]||undefined,click:()=>dispatch(action)});
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'Qesh',submenu:[item('About Qesh','about'),{role:'hide'},{role:'hideOthers'},{type:'separator'},{label:'Quit Qesh',accelerator:'Cmd+Q',click:quitAll}]},
  {label:'File',submenu:[item('New Tab','new-tab'),item('New Workspace','new-workspace'),item('New Window','new-window'),{type:'separator'},item('Settings…','settings'),{label:'Open Configuration JSON…',click:()=>dispatch('configure')},item('Commands','commands')]},
  {role:'editMenu'},{label:'View',submenu:[item('Split Right','split-right'),item('Split Down','split-down'),{role:'togglefullscreen'}]},{role:'windowMenu'},
  {label:'Help',submenu:[item('Keyboard Shortcuts','help')]},
 ]));
}
app.setName('Qesh');
app.setPath('userData',process.env.QENTRAH_TEST_PROFILE || join(app.getPath('appData'),'Qentrah','Qesh-Desktop'));
if(!app.requestSingleInstanceLock())app.quit();
else {
 app.on('second-instance',()=>{const record=focused();if(record){record.window.show();record.window.focus();}else newWindow();});
 app.whenReady().then(()=>{
  newWindow();installMenu(settings());
  watchFile(configPath,{interval:1000},()=>{try{const config=configuration.load(configPath);for(const record of windows.values()){if(JSON.stringify(config)===JSON.stringify(record.config))continue;record.config=config;record.window.setBackgroundColor(config.theme.background);record.window.webContents.send('terminal:event',{type:'config',config});send(record,{type:'control',command:{action:'configure',config}});}installMenu(config);}catch(error){for(const record of windows.values())record.window.webContents.send('terminal:event',{type:'error',message:'Configuration: '+error.message});}});app.once('will-quit',()=>unwatchFile(configPath));
 });
 app.on('activate',()=>{if(!windows.size)newWindow();});app.on('before-quit',event=>{if(!quitting&&windows.size){event.preventDefault();void quitAll();}});
}

process.on('SIGTERM',async()=>{quitting=true;await Promise.all([...windows.values()].map(record=>closeWindow(record,true)));app.exit(0);});
