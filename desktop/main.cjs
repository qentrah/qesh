const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { join, resolve, dirname } = require('node:path');
const { homedir } = require('node:os');
const { existsSync, appendFileSync, statSync, mkdirSync, copyFileSync } = require('node:fs');
const configuration = require('./config.cjs');
const bundled = existsSync(join(process.resourcesPath, 'runtime', 'bun'));
const root = bundled ? join(process.resourcesPath, 'terminal') : resolve(__dirname, '..');
const runtime = bundled ? join(process.resourcesPath, 'runtime') : null;
const {configPath,dataDir}=require(join(root,'lib/paths.cjs'));
mkdirSync(dataDir,{recursive:true,mode:0o700});
const legacy=join(bundled?dirname(resolve(process.resourcesPath,'../..')):root,'qesh.config.json');
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
function newWindow(startPath) {
  const config=settings();let cwd=startPath || configuration.expandPath(config.defaultPath);
  try {if(!statSync(cwd).isDirectory())throw new Error('Not a folder');}catch {dialog.showErrorBox('Starting folder unavailable',`${cwd}\n\nOpening your home folder instead.`);cwd=homedir();}
  const window=new BrowserWindow({width:1150,height:740,minWidth:520,minHeight:300,title:'Qesh',backgroundColor:config.theme.background,titleBarStyle:'hiddenInset',trafficLightPosition:{x:16,y:16},show:false,webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
  const record={window,config,cwd,exited:false,closing:false,allowClose:false};windows.set(window.id,record);
  record.host=spawn(runtime?join(runtime,'node'):process.env.QENTRAH_NODE||'node',[join(root,'desktop/host.mjs')],{stdio:'pipe',env:{...process.env,PATH:[join(root,'bin'),...(runtime?[runtime]:[]),process.env.PATH||'/usr/bin:/bin'].join(':'),QENTRAH_BUN:runtime?join(runtime,'bun'):process.env.QENTRAH_BUN||join(homedir(),'.bun/bin/bun'),QENTRAH_NODE:runtime?join(runtime,'node'):process.env.QENTRAH_NODE||'node',QENTRAH_START_DIR:cwd,QENTRAH_DESKTOP:'1',QESH_RESTORE:config.restore?'1':'0',QESH_STORE_OWNER:windows.size===1?'desktop':`desktop-window-${window.id}`,QENTRAH_THEME:JSON.stringify(config.theme),SHELL:config.shell}});
  const emit=message=>{if(!window.isDestroyed())window.webContents.send('terminal:event',message);};
  createInterface({input:record.host.stdout}).on('line',line=>{try{const message=JSON.parse(line);if(message.type==='state'||message.type==='started')debug(`Host ${message.type}`);if(message.type==='exit')record.exited=true;emit(message);}catch{emit({type:'error',message:'Invalid terminal response'});}});
  record.host.stderr.on('data',data=>{debug(String(data));emit({type:'error',message:String(data)});});record.host.on('error',error=>emit({type:'error',message:error.message}));record.host.on('exit',()=>{record.exited=true;});record.host.stdin.on('error',()=>{});
  window.webContents.on('console-message',(event,...args)=>debug(event.message||args.join(' ')));window.webContents.on('preload-error',(_event,_path,error)=>debug(error.message));
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
  window.on('close',event=>{if(!record.allowClose){event.preventDefault();void closeWindow(record);}});window.once('ready-to-show',()=>{if(!process.env.QENTRAH_TEST_HEADLESS){window.show();window.focus();}});window.loadFile(join(__dirname,'index.html'));return record;
}
const controlActions=new Set(['new-tab','switch-tab','rename-tab','close-tab','split-right','split-down','help','new-group','group-tab','reorder-tab','dock-tab','detach-pane','focus-pane','dock-pane','new-workspace','switch-workspace','rename-workspace','color-workspace','close-workspace','color-tab','rename-pane','run-command']);
ipcMain.on('terminal:command',(event,message)=>{
 const record=[...windows.values()].find(record=>record.window.webContents===event.sender);if(!record||!message||typeof message!=='object')return;
 debug(`Command ${message.type}`);
 if(message.type==='input'&&typeof message.data==='string'&&message.data.length<=1048576)send(record,{type:'input',data:message.data});
 else if(['start','resize'].includes(message.type)&&Number.isInteger(message.cols)&&Number.isInteger(message.rows))send(record,{type:message.type,cols:message.cols,rows:message.rows});
 else if(message.type==='ack'&&Number.isInteger(message.size)&&message.size>0)send(record,{type:'ack',size:message.size});
 else if(message.type==='control'&&controlActions.has(message.command?.action))send(record,{type:'control',command:message.command});
});
ipcMain.handle('app:action',async(event,request)=>{
 const record=[...windows.values()].find(record=>record.window.webContents===event.sender);if(!record)return {error:'Window unavailable'};
 try {
  debug(`Action ${request.action}`);
  if(request.action==='settings')return {config:record.config,path:configPath};
  if(request.action==='configuration')return {text:JSON.stringify(configuration.load(configPath),null,2),path:configPath};
  if(request.action==='save-config') {const config=configuration.save(configPath,request.text);for(const r of windows.values()){r.config=config;r.window.webContents.send('terminal:event',{type:'config',config});}return {config,path:configPath};}
  if(request.action==='open-config'){const error=await shell.openPath(configPath);return error?{error}:{};}
  if(request.action==='new-window'){newWindow();return {};}
  if(request.action==='folder'){const result=await dialog.showOpenDialog(record.window,{title:'Open or create a folder',buttonLabel:'Open in new tab',properties:['openDirectory','createDirectory']});if(!result.canceled)send(record,{type:'control',command:{action:'new-tab',cwd:result.filePaths[0]}});return {};}
  if(request.action==='check-updates'){const result=await fetch('https://api.github.com/repos/qentrah/qesh/releases',{headers:{Accept:'application/vnd.github+json','User-Agent':'Qesh'}});if(!result.ok)throw new Error(`Release check failed: HTTP ${result.status}`);const releases=await result.json(),latest=releases.find(r=>!r.draft&&(record.config.updateChannel==='preview'||!r.prerelease));return {version:latest?.tag_name,current:require(join(root,'package.json')).version};}
  if(request.action==='about'){await dialog.showMessageBox(record.window,{title:'About Qesh',message:'Qesh · Qentrah',detail:'An OpenTUI shell workspace.\nhttps://qentrah.com/\nLocal shells, tabs and resizable split panes.',buttons:['OK']});return {};}
 }catch(error){return {error:error.message};}
 return {error:'Unknown action'};
});
app.setName('Qesh');
app.setPath('userData',process.env.QENTRAH_TEST_PROFILE || join(app.getPath('appData'),'Qentrah','Qesh-Desktop'));
if(!app.requestSingleInstanceLock())app.quit();
else {
 app.on('second-instance',()=>{const record=focused();if(record){record.window.show();record.window.focus();}else newWindow();});
 app.whenReady().then(()=>{
  newWindow();Menu.setApplicationMenu(Menu.buildFromTemplate([
   {label:'Qesh',submenu:[{label:'About Qesh',click:()=>focused()?.window.webContents.send('terminal:event',{type:'action',action:'about'})},{role:'hide'},{role:'hideOthers'},{type:'separator'},{label:'Quit Qesh',accelerator:'Cmd+Q',click:quitAll}]},
   {label:'File',submenu:[{label:'New Tab',accelerator:'Cmd+T',click:()=>{const r=focused();if(r)send(r,{type:'control',command:{action:'new-tab'}});}},{label:'New Window',accelerator:'Cmd+N',click:()=>newWindow()},{label:'Configure…',accelerator:'Cmd+,',click:()=>focused()?.window.webContents.send('terminal:event',{type:'action',action:'configure'})},{label:'Commands…',accelerator:'Cmd+Shift+P',click:()=>focused()?.window.webContents.send('terminal:event',{type:'action',action:'commands'})}]},
   {role:'editMenu'},{label:'View',submenu:[{role:'togglefullscreen'}]},{role:'windowMenu'},
   {label:'Help',submenu:[{label:'Keyboard shortcuts',click:()=>{const r=focused();if(r)send(r,{type:'control',command:{action:'help'}});}}]},
  ]));
 });
 app.on('activate',()=>{if(!windows.size)newWindow();});app.on('before-quit',event=>{if(!quitting&&windows.size){event.preventDefault();void quitAll();}});
}

process.on('SIGTERM',async()=>{quitting=true;await Promise.all([...windows.values()].map(record=>closeWindow(record,true)));app.exit(0);});
