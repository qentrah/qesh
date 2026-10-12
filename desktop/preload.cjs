const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('qTerminal',{
 send:message=>ipcRenderer.send('terminal:command',message),
 action:request=>ipcRenderer.invoke('app:action',request),
 subscribe:callback=>{const listener=(_event,message)=>callback(message);ipcRenderer.on('terminal:event',listener);return()=>ipcRenderer.removeListener('terminal:event',listener);},
});
