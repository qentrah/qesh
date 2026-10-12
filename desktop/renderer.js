import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
const $=id=>document.getElementById(id);
const terminal=new Terminal({fontFamily:'Menlo, Monaco, monospace',fontSize:14,lineHeight:1.2,cursorBlink:false,scrollback:5000,macOptionIsMeta:true,theme:{background:'#0e0d11',foreground:'#d4d4d4',cursor:'#9cdcfe',selectionBackground:'#264f78'}});
const fit=new FitAddon();terminal.loadAddon(fit);terminal.open($('terminal'));
let state={tabs:[],groups:[]},config,editorSave,dragged,noticeTimer,connected=false,startTimer;
const control=command=>window.qTerminal.send({type:'control',command});
function notice(text){$('status').textContent=text;$('status').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('status').hidden=true,6000);}
function applyConfig(value){config=value;for(const [key,color]of Object.entries(value.theme))document.documentElement.style.setProperty(`--${key}`,color);document.body.classList.toggle('top-tabs',value.tabsPosition==='top');terminal.options.fontFamily=value.fontFamily;terminal.options.fontSize=value.fontSize;terminal.options.theme={background:value.theme.background,foreground:value.theme.foreground,cursor:value.theme.primary,selectionBackground:value.theme.selection};fit.fit();}
window.addEventListener('error',event=>notice(`Workspace error: ${event.message}`));
window.qTerminal.subscribe(message=>{
 if(message.type==='output')terminal.write(message.data,()=>window.qTerminal.send({type:'ack',size:message.data.length}));
 else if(message.type==='state'){connected=true;clearInterval(startTimer);$('status').hidden=true;state=message;renderTabs();}
 else if(message.type==='started'){connected=true;clearInterval(startTimer);$('status').hidden=true;}
 else if(message.type==='config')applyConfig(message.config);
 else if(message.type==='action')void action(message.action);
 else if(message.type==='exit')notice('Workspace closed. You can close this window.');
 else if(message.type==='error')notice(message.message);
});
terminal.onData(data=>window.qTerminal.send({type:'input',data}));terminal.onResize(({cols,rows})=>window.qTerminal.send({type:'resize',cols,rows}));
new ResizeObserver(()=>fit.fit()).observe($('terminal'));window.addEventListener('focus',()=>{if(!$('editor').open&&!$('command-dialog').open)terminal.focus();});
function button(label,handler,className){const element=document.createElement('button');element.textContent=label;element.type='button';if(className)element.className=className;element.addEventListener('click',handler);return element;}
function drag(element,item){element.draggable=true;element.addEventListener('dragstart',event=>{dragged=item;event.dataTransfer.setData('text/plain',item.id);event.dataTransfer.effectAllowed='move';$('drop-zones').hidden=false;});element.addEventListener('dragend',()=>{dragged=null;$('drop-zones').hidden=true;});}
function drop(element,handler){element.addEventListener('dragover',event=>{if(dragged){event.preventDefault();event.dataTransfer.dropEffect='move';}});element.addEventListener('drop',event=>{if(!dragged)return;event.preventDefault();handler(dragged);dragged=null;$('drop-zones').hidden=true;});}
const collapsed=new Set();
function renderTabs(){
 $('tabs').replaceChildren();
 for(const group of [undefined,...state.groups]){
  const section=document.createElement('section');
  const heading=button(group||'Tabs',()=>{collapsed.has(group)?collapsed.delete(group):collapsed.add(group);renderTabs();},'group-title');heading.setAttribute('aria-expanded',String(!collapsed.has(group)));if(group)section.append(heading);
  drop(heading,item=>{if(item.kind==='tab')control({action:'group-tab',id:item.id,group});});
  if(!collapsed.has(group))for(const tab of state.tabs.filter(tab=>tab.group===group)){
   const row=document.createElement('div');row.className=`tab-row ${tab.id===state.active?'active':''}`;
   const select=button(tab.name,()=>{control({action:'switch-tab',id:tab.id});terminal.focus();});select.setAttribute('aria-pressed',String(tab.id===state.active));select.addEventListener('dblclick',()=>editText('Rename Tab',tab.name,value=>control({action:'rename-tab',id:tab.id,name:value})));
   row.append(select,button('×',()=>control({action:'close-tab',id:tab.id}),'tab-close'));row.lastChild.setAttribute('aria-label',`Close ${tab.name}`);drag(row,{kind:'tab',id:tab.id});drop(row,item=>{if(item.kind==='tab'){control({action:'group-tab',id:item.id,group});control({action:'reorder-tab',id:item.id,before:tab.id});}else control({action:'detach-pane',id:item.id});});section.append(row);
   if(tab.id===state.active)for(const pane of tab.sessions||[]){const paneRow=document.createElement('div');paneRow.className='pane-row';const label=button(`Shell ${pane.id}${pane.status==='running'?'':` · ${pane.status}`}`,()=>{control({action:'focus-pane',id:pane.id});terminal.focus();},'pane-label');label.title=pane.pid?`Shell PID ${pane.pid}`:'Shell starting';paneRow.append(label);if(tab.sessions.length>1){const detach=button('Tab',()=>control({action:'detach-pane',id:pane.id}));detach.setAttribute('aria-label','Move shell to a new tab');paneRow.append(detach);}drag(paneRow,{kind:'pane',id:pane.id});section.append(paneRow);}
  }
  $('tabs').append(section);
 }
}
for(const zone of $('drop-zones').children)drop(zone,item=>control({action:item.kind==='tab'?'dock-tab':'dock-pane',id:item.id,edge:zone.dataset.edge}));
drop($('tabs'),item=>{if(item.kind==='pane')control({action:'detach-pane',id:item.id});});
const menu=$('menu'),more=$('more');function closeMenu(focus=false){menu.hidden=true;more.setAttribute('aria-expanded','false');if(focus)more.focus();}
more.addEventListener('click',()=>{menu.hidden=!menu.hidden;more.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)menu.querySelector('button').focus();});
menu.addEventListener('click',event=>{const target=event.target.closest('button');if(target){closeMenu();void action(target.dataset.action);}});
menu.addEventListener('keydown',event=>{const items=[...menu.querySelectorAll('button')];const index=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}if(event.key==='Escape'){event.preventDefault();closeMenu(true);}});
document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target)&&event.target!==more)closeMenu();});$('add-tab').addEventListener('click',()=>action('new-tab'));
function editText(title,value,onSave){$('editor-title').textContent=title;$('editor-description').textContent='';$('editor-label').textContent='Name';$('editor-input').value=value;$('editor-input').style.height='70px';$('open-config').hidden=true;$('editor-error').textContent='';editorSave=async text=>{if(!text.trim())throw new Error('Enter a name.');onSave(text.trim());};$('editor').showModal();$('editor-input').focus();$('editor-input').select();}
async function configure(){if($('editor').open){$('editor-input').focus();return;}const response=await window.qTerminal.action({action:'configuration'});if(response.error)return notice(response.error);$('editor-title').textContent='Configure Qesh';$('editor-description').textContent=`${response.path}\nStarting folder, shell, and terminal theme apply to new windows. Font and tab position update now.`;$('editor-label').textContent='Configuration JSON';$('editor-input').value=response.text;$('editor-input').style.height='';$('open-config').hidden=false;$('editor-error').textContent='';editorSave=async text=>{const result=await window.qTerminal.action({action:'save-config',text});if(result.error)throw new Error(result.error);notice('Configuration saved. Open a new window to use the new starting folder and terminal theme.');};$('editor').showModal();$('editor-input').focus();}
$('editor-form').addEventListener('submit',async event=>{event.preventDefault();try{await editorSave($('editor-input').value);$('editor').close();terminal.focus();}catch(error){$('editor-error').textContent=error.message;}});
$('editor-input').addEventListener('keydown',event=>{if(event.metaKey&&event.key==='s'){event.preventDefault();$('editor-form').requestSubmit();}});
$('cancel-editor').addEventListener('click',()=>$('editor').close());$('open-config').addEventListener('click',async()=>{const result=await window.qTerminal.action({action:'open-config'});if(result.error)$('editor-error').textContent=result.error;});$('editor').addEventListener('close',()=>terminal.focus());
const commands={'new-tab':'New tab','new-window':'New window',config:'Configure JSON','split-right':'Split right','split-down':'Split down',group:'New group',folder:'Open or create folder',help:'Keyboard shortcuts',about:'About Qentrah'};
function listCommands(){const query=$('command-input').value.replace(/^\//,'').toLowerCase();$('command-list').replaceChildren();for(const [name,label]of Object.entries(commands))if(name.includes(query)||label.toLowerCase().includes(query))$('command-list').append(button(`/${name} — ${label}`,()=>{$('command-dialog').close();void action(name==='config'?'configure':name);}));}
$('command-input').addEventListener('input',listCommands);$('command-form').addEventListener('submit',event=>{event.preventDefault();const name=$('command-input').value.trim().replace(/^\//,'');if(commands[name]){$('command-dialog').close();void action(name==='config'?'configure':name);}else $('command-error').textContent='Choose a listed command.';});$('close-commands').addEventListener('click',()=>$('command-dialog').close());$('command-dialog').addEventListener('close',()=>terminal.focus());
async function action(name){
 if(['new-tab','split-right','split-down','help'].includes(name)){control({action:name});terminal.focus();}
 else if(name==='configure')await configure();
 else if(name==='group')editText('New Group','',value=>control({action:'new-group',name:value}));
 else if(name==='commands'){$('command-input').value='';$('command-error').textContent='';listCommands();$('command-dialog').showModal();$('command-input').focus();}
 else {const result=await window.qTerminal.action({action:name});if(result?.error)notice(result.error);}
}
let resizing=false;const divider=$('sidebar-divider');function setSidebar(width){width=Math.max(140,Math.min(360,width));document.documentElement.style.setProperty('--sidebar-width',`${width}px`);divider.setAttribute('aria-valuenow',String(width));}
divider.addEventListener('pointerdown',event=>{resizing=true;divider.setPointerCapture(event.pointerId);});divider.addEventListener('pointermove',event=>{if(resizing)setSidebar(event.clientX);});divider.addEventListener('pointerup',()=>resizing=false);divider.addEventListener('pointercancel',()=>resizing=false);divider.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();setSidebar(Number(divider.getAttribute('aria-valuenow'))+(event.key==='ArrowRight'?10:-10));}});
function startWorkspace(){try{fit.fit();window.qTerminal.send({type:'start',cols:terminal.cols,rows:terminal.rows});}catch(error){notice(`Starting workspace: ${error.message}`);}}
void (async()=>{try{const initial=await window.qTerminal.action({action:'settings'});if(initial.config)applyConfig(initial.config);}catch(error){notice(error.message);}finally{startWorkspace();if(!connected)startTimer=setInterval(startWorkspace,500);terminal.focus();}})();
