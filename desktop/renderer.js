import readyThemes from './theme-presets.cjs';
import {settingsUI,presets} from './settings.js';
import {identify} from './identity.cjs';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
const $=id=>document.getElementById(id);
const terminal=new Terminal({fontFamily:'Menlo, Monaco, monospace',fontSize:14,lineHeight:1.2,cursorBlink:false,scrollback:5000,macOptionIsMeta:true,theme:{background:'#0e0d11',foreground:'#d4d4d4',cursor:'#9cdcfe',selectionBackground:'#264f78'}});
const fit=new FitAddon();terminal.loadAddon(fit);terminal.open($('terminal'));
let state={tabs:[],groups:[],workspaces:[]},config,dragged,noticeTimer,connected=false,startTimer,view='terminal',pendingGroup='',settingsPage='appearance',uiSaveTimer,stateKey='';
const control=command=>window.qTerminal.send({type:'control',command});
function notice(text){$('status').replaceChildren();$('status').append(document.createTextNode(text));$('status').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('status').hidden=true,6000);}
function applyConfig(value){config=value;for(const [key,color]of Object.entries(value.theme))document.documentElement.style.setProperty(`--${key}`,color);document.body.classList.toggle('top-tabs',value.tabsPosition==='top');terminal.options.fontFamily=value.fontFamily;terminal.options.fontSize=value.fontSize;terminal.options.scrollback=value.scrollback;terminal.options.theme={background:value.theme.background,foreground:value.theme.foreground,cursor:value.theme.primary,selectionBackground:value.theme.selection};if(view==='terminal')fit.fit();updateMenuShortcuts();}
window.addEventListener('error',event=>{notice(`Workspace error: ${event.message}`);void window.qTerminal.action({action:'report-error',message:event.message});});
window.qTerminal.subscribe(message=>{
 if(message.type==='output')terminal.write(message.data,()=>window.qTerminal.send({type:'ack',size:message.data.length}));
 else if(message.type==='state'){connected=true;clearInterval(startTimer);const key=JSON.stringify(message);if(key!==stateKey){stateKey=key;state=message;renderTabs();}}
 else if(message.type==='started'){connected=true;clearInterval(startTimer);$('status').hidden=true;}
 else if(message.type==='config')applyConfig(message.config);
 else if(message.type==='action')void action(message.action);
 else if(message.type==='exit'){notice('Workspace stopped. Open a new window to start again.');const retry=button('New window',()=>action('new-window'));$('status').append(retry);}
 else if(message.type==='error'||message.type==='notice')notice(message.message);
});
terminal.onData(data=>window.qTerminal.send({type:'input',data}));terminal.onResize(({cols,rows})=>window.qTerminal.send({type:'resize',cols,rows}));
new ResizeObserver(()=>{if(view==='terminal')fit.fit();}).observe($('terminal'));window.addEventListener('focus',()=>{if(view==='terminal'&&!activeEdit&&!document.activeElement?.closest('#menu,#context-menu'))terminal.focus();});
function button(label,handler,className){const element=document.createElement('button');element.textContent=label;element.type='button';if(className)element.className=className;element.addEventListener('click',handler);return element;}
function drag(element,item){element.draggable=true;element.addEventListener('dragstart',event=>{if(item.space&&item.space!==state.workspace){event.preventDefault();notice('Select this workspace before dragging its tabs or sessions.');return;}dragged=item;event.dataTransfer.setData('text/plain',item.id);event.dataTransfer.effectAllowed='move';$('drop-zones').hidden=false;});element.addEventListener('dragend',()=>{dragged=null;$('drop-zones').hidden=true;});}
function drop(element,handler){element.addEventListener('dragover',event=>{if(dragged){event.preventDefault();event.dataTransfer.dropEffect='move';}});element.addEventListener('drop',event=>{if(!dragged)return;event.preventDefault();handler(dragged);dragged=null;$('drop-zones').hidden=true;});}
let activeEdit=null;
const collapsed=new Set();
function inlineName(target,value,onSave){
 if(activeEdit)activeEdit.finish(true);
 const input=document.createElement('input');input.type='text';input.className='inline-name';input.value=value;input.maxLength=40;input.setAttribute('aria-label','Rename in sidebar');let finished=false;
 const finish=save=>{if(finished)return;finished=true;activeEdit=null;const name=input.value.trim();if(save&&name&&name!==value)onSave(name);renderTabs();terminal.focus();};activeEdit={finish};target.replaceWith(input);input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();finish(true);}else if(event.key==='Escape'){event.preventDefault();finish(false);}});input.addEventListener('blur',()=>finish(true));input.focus();input.select();
}

function detectApp(pane){return identify(pane,config?.apps);}
const context=$('context-menu');let contextTrigger;
function closeContext(focus=false){context.hidden=true;if(focus)contextTrigger?.focus();}
function showContext(trigger,items){contextTrigger=trigger;context.replaceChildren();for(const [label,handler] of items){const item=button(label,()=>{closeContext();handler();});item.setAttribute('role','menuitem');context.append(item);}const rect=trigger.getBoundingClientRect();context.style.left=`${Math.max(8,Math.min(innerWidth-210,rect.left))}px`;context.style.top=`${Math.max(8,Math.min(innerHeight-items.length*35-16,rect.bottom))}px`;context.hidden=false;context.querySelector('button').focus();}
context.addEventListener('keydown',event=>{const items=[...context.querySelectorAll('button')],index=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}if(event.key==='Escape'){event.preventDefault();closeContext(true);}});
document.addEventListener('pointerdown',event=>{if(!context.contains(event.target)&&!event.target.closest('.item-options'))closeContext();});
function editColor(trigger,value,onSave){
 contextTrigger=trigger;context.replaceChildren();const title=document.createElement('p');title.className='color-title';title.textContent='Tab color';context.append(title);
 for(const [name,color]of [['Default',''],...presets]){const item=button(name,()=>{onSave(color);closeContext();terminal.focus();});item.setAttribute('role','menuitemradio');item.setAttribute('aria-checked',String((value||'').toLowerCase()===color));const dot=document.createElement('span');dot.className='color-dot';dot.style.background=color||'var(--muted)';item.prepend(dot);context.append(item);}
 const label=document.createElement('label');label.className='custom-color';label.textContent='Custom…';const picker=document.createElement('input');picker.type='color';picker.value=value||'#9cdcfe';picker.setAttribute('aria-label','Custom tab color');picker.addEventListener('change',()=>{onSave(picker.value);closeContext();terminal.focus();});label.append(picker);context.append(label);
 const rect=trigger.getBoundingClientRect();context.style.left=`${Math.max(8,Math.min(innerWidth-210,rect.left))}px`;context.style.top=`${Math.max(8,Math.min(innerHeight-335,rect.bottom))}px`;context.hidden=false;context.querySelector('button').focus();
}

const foldedSpaces=new Set();
function withSpace(space,command){control({action:'switch-workspace',id:space.id});control(command);}
function renderTabs(){
 if(activeEdit)return;$('spaces').replaceChildren();$('tabs').replaceChildren();
 for(const space of state.workspaces||[]){
  const block=document.createElement('section');block.className='workspace-tree';const row=document.createElement('div');row.className=`space-row ${space.id===state.workspace?'selected':''}`;
  const fold=button(foldedSpaces.has(space.id)?'›':'⌄',()=>{foldedSpaces.has(space.id)?foldedSpaces.delete(space.id):foldedSpaces.add(space.id);renderTabs();},'tree-fold');const foldIcon=document.createElementNS('http://www.w3.org/2000/svg','svg');foldIcon.setAttribute('viewBox','0 0 24 24');foldIcon.setAttribute('aria-hidden','true');const foldPath=document.createElementNS('http://www.w3.org/2000/svg','path');foldPath.setAttribute('d','M9 5l7 7-7 7');foldIcon.append(foldPath);if(!foldedSpaces.has(space.id))foldIcon.style.transform='rotate(90deg)';fold.replaceChildren(foldIcon);fold.setAttribute('aria-label',`${foldedSpaces.has(space.id)?'Expand':'Collapse'} ${space.name}`);fold.setAttribute('aria-expanded',String(!foldedSpaces.has(space.id)));
  const select=button(space.name,()=>{showView('terminal');control({action:'switch-workspace',id:space.id});terminal.focus();},'workspace-name');select.setAttribute('aria-pressed',String(space.id===state.workspace));select.title=`${space.tabs} tabs · ${space.sessions} shells`;select.addEventListener('dblclick',()=>inlineName(select,space.name,name=>control({action:'rename-workspace',id:space.id,name})));if(space.color)select.style.color=space.color;
  const options=button('⋮',event=>showContext(event.currentTarget,[['New tab',()=>{showView('terminal');withSpace(space,{action:'new-tab'});}],['Rename',()=>inlineName(select,space.name,name=>control({action:'rename-workspace',id:space.id,name}))],['Color',()=>editColor(options,space.color||'',color=>control({action:'color-workspace',id:space.id,color}))],['Theme',()=>quickTheme(options)],['Settings',()=>showView('settings')],['Close workspace',()=>control({action:'close-workspace',id:space.id})]]),'item-options');options.setAttribute('aria-label',`Options for workspace ${space.name}`);options.setAttribute('aria-haspopup','menu');row.append(select,fold,options);block.append(row);
  if(!foldedSpaces.has(space.id)){
   const children=document.createElement('div');children.className='workspace-children';
   for(const group of [undefined,...(space.groups||[])]){
    const section=document.createElement('section'),key=space.id+':'+group;
    const heading=button(group||'Tabs',()=>{collapsed.has(key)?collapsed.delete(key):collapsed.add(key);renderTabs();},'group-title');heading.setAttribute('aria-expanded',String(!collapsed.has(key)));
    if(group){section.append(heading);heading.addEventListener('dblclick',()=>inlineName(heading,group,name=>withSpace(space,{action:'rename-group',group,name})));if(pendingGroup===group&&space.id===state.workspace){pendingGroup='';queueMicrotask(()=>inlineName(heading,group,name=>withSpace(space,{action:'rename-group',group,name})));}}
    drop(heading,item=>{if(item.kind==='tab'&&item.space===space.id)withSpace(space,{action:'group-tab',id:item.id,group});});
    if(!collapsed.has(key))for(const tab of (space.items||[]).filter(tab=>tab.group===group)){
     const row=document.createElement('div');row.className=`tab-row ${space.id===state.workspace&&tab.id===state.active?'active':''}`;
     const selectTab=()=>{showView('terminal');withSpace(space,{action:'switch-tab',id:tab.id});};
     const label=button(tab.name,selectTab);label.setAttribute('aria-pressed',String(space.id===state.workspace&&tab.id===state.active));label.addEventListener('dblclick',()=>inlineName(label,tab.name,name=>withSpace(space,{action:'rename-tab',id:tab.id,name})));if(tab.color||space.color)label.style.color=tab.color||space.color;
     const options=button('⋮',event=>showContext(event.currentTarget,[['Rename',()=>inlineName(label,tab.name,name=>withSpace(space,{action:'rename-tab',id:tab.id,name}))],['Color',()=>editColor(options,tab.color||'',color=>withSpace(space,{action:'color-tab',id:tab.id,color}))],['Split right',()=>{selectTab();control({action:'split-right'});} ],['Split down',()=>{selectTab();control({action:'split-down'});} ],['Close tab',()=>withSpace(space,{action:'close-tab',id:tab.id})]]),'item-options');options.setAttribute('aria-label',`Options for tab ${tab.name}`);options.setAttribute('aria-haspopup','menu');row.append(label,options);drag(row,{kind:'tab',id:tab.id,space:space.id});drop(row,item=>{if(item.space!==space.id){notice('Move tabs within their workspace.');return;}if(item.kind==='tab'){withSpace(space,{action:'group-tab',id:item.id,group});control({action:'reorder-tab',id:item.id,before:tab.id});}else withSpace(space,{action:'detach-pane',id:item.id});});section.append(row);
     const sessions=document.createElement('div');sessions.className='session-tree';
     for(const pane of tab.sessions||[]){const paneRow=document.createElement('div');paneRow.className='pane-row';const appName=detectApp(pane);const paneLabel=button(`${pane.label||appName?.name||'Shell'}${pane.status==='running'?'':` · ${pane.status}`}`,()=>{selectTab();control({action:'focus-pane',id:pane.id});terminal.focus();},'pane-label');paneLabel.setAttribute('aria-pressed',String(space.id===state.workspace&&tab.id===state.active&&pane.id===tab.focused));paneLabel.title=`${pane.pid?'Shell PID '+pane.pid:'Shell starting'} · ${pane.cwd||''}`;if(appName&&appName.icon!=='shell'){const icon=document.createElement('img');icon.src=`icons/${appName.icon}.svg`;icon.alt='';icon.width=14;icon.height=14;paneLabel.prepend(icon);}paneLabel.addEventListener('dblclick',()=>inlineName(paneLabel,pane.label||appName?.name||'Shell',name=>withSpace(space,{action:'rename-pane',id:pane.id,name})));paneRow.append(paneLabel);if(tab.sessions.length>1){const detach=button('↗',()=>withSpace(space,{action:'detach-pane',id:pane.id}));detach.setAttribute('aria-label','Move shell to a new tab');paneRow.append(detach);}drag(paneRow,{kind:'pane',id:pane.id,space:space.id});sessions.append(paneRow);}section.append(sessions);
    }
    children.append(section);
   }
   block.append(children);
  }
  $('spaces').append(block);
 }
}
for(const zone of $('drop-zones').children)drop(zone,item=>control({action:item.kind==='tab'?'dock-tab':'dock-pane',id:item.id,edge:zone.dataset.edge}));
drop($('tabs'),item=>{if(item.kind==='pane')control({action:'detach-pane',id:item.id});});
const menu=$('menu'),more=$('more');function closeMenu(focus=false){menu.hidden=true;more.setAttribute('aria-expanded','false');if(focus)more.focus();}
more.addEventListener('click',()=>{menu.hidden=!menu.hidden;more.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)menu.querySelector('button').focus();});
menu.addEventListener('click',event=>{const target=event.target.closest('button');if(target){closeMenu();void action(target.dataset.action);}});
menu.addEventListener('keydown',event=>{const items=[...menu.querySelectorAll('button')];const index=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}if(event.key==='Escape'){event.preventDefault();closeMenu(true);}});
document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target)&&event.target!==more)closeMenu();});$('add-tab').addEventListener('click',event=>showContext(event.currentTarget,[['New tab',()=>action('new-tab')],['New workspace',()=>action('new-workspace')],['New window',()=>action('new-window')],['Theme',()=>quickTheme(event.currentTarget)],['Open configuration JSON',()=>action('configure')]]));
const settings=settingsUI({getConfig:()=>config,onPage:page=>{settingsPage=page;saveUI();},save:async next=>{const result=await window.qTerminal.action({action:'save-config',config:next});if(result.config)applyConfig(result.config);return result;},notice,action});
function saveUI(){clearTimeout(uiSaveTimer);uiSaveTimer=setTimeout(()=>void window.qTerminal.action({action:'save-ui',ui:{view,page:settingsPage,sidebarWidth:Number(divider.getAttribute('aria-valuenow'))}}),300);}
async function quickTheme(trigger){showContext(trigger,Object.entries({...readyThemes,...config.themes}).map(([name,theme])=>[name,async()=>{const result=await window.qTerminal.action({action:'save-config',config:{...config,theme}});if(result.error)notice(result.error);else{applyConfig(result.config);notice('Saved');}}]));}
function showView(next,page=settingsPage){view=next;closeContext();closeMenu();$('workspace-browser').hidden=next!=='terminal';$('settings-nav').hidden=next!=='settings';$('commands-nav').hidden=next!=='commands';$('terminal').hidden=next!=='terminal';$('settings-view').hidden=next!=='settings';$('commands-view').hidden=next!=='commands';document.body.classList.toggle('settings-open',next!=='terminal');for(const name of ['terminal','commands','settings'])$('view-'+name).setAttribute('aria-pressed',String(name===next));if(next==='settings')settings.render(page);if(next==='commands'){listCommands();$('command-input').focus();}if(next==='terminal'){fit.fit();terminal.focus();}saveUI();}
$('view-terminal').onclick=()=>showView('terminal');$('view-commands').onclick=()=>showView('commands');$('view-settings').onclick=()=>showView('settings');$('close-settings').onclick=()=>showView('terminal');$('close-commands').onclick=()=>showView('terminal');$('add-workspace').onclick=event=>showContext(event.currentTarget,[['New workspace',()=>action('new-workspace')],['New tab',()=>action('new-tab')],['New window',()=>action('new-window')],['Theme',()=>quickTheme(event.currentTarget)],['Settings',()=>action('settings')]]);$('settings-json').onclick=()=>action('configure');$('settings-docs').onclick=()=>action('docs');
async function configure(){const result=await window.qTerminal.action({action:'open-config'});if(result.error)notice(result.error);}
const commands={'new-workspace':'New workspace','check-updates':'Check updates','new-tab':'New tab','new-window':'New window',config:'Open configuration JSON',settings:'Settings','split-right':'Split right','split-down':'Split down',group:'New group',folder:'Open folder',help:'Keyboard shortcuts'};
function listCommands(){const query=$('command-input').value.replace(/^(qh\s+|\/)/,'').toLowerCase();$('command-list').replaceChildren();for(const [name,label]of Object.entries(commands))if(name.includes(query)||label.toLowerCase().includes(query))$('command-list').append(button(label,()=>{showView('terminal');void action(name==='config'?'configure':name);}));for(const [name,item]of Object.entries(config?.commands||{}))if(name.includes(query)||(item.description||'').toLowerCase().includes(query)){const node=button(`qh ${name}`,()=>{showView('terminal');control({action:'run-command',name});});node.title=item.description||item.command;$('command-list').append(node);}}
$('command-input').addEventListener('input',listCommands);$('command-input').addEventListener('keydown',event=>{if(event.key==='Enter')$('command-list').querySelector('button')?.click();if(event.key==='Escape')showView('terminal');});
function updateMenuShortcuts(){for(const item of menu.querySelectorAll('button')){const key=config.shortcuts[item.dataset.action];const badge=item.querySelector('kbd');if(badge)badge.textContent=key?key.replaceAll('Cmd','⌘').replaceAll('Shift','⇧').replaceAll('Alt','⌥').replaceAll('Ctrl','⌃').replaceAll('+',''):'';}}
async function action(name){
 if(name==='new-workspace'){showView('terminal');control({action:'new-workspace',name:'Workspace'});terminal.focus();}
 else if(name==='check-updates'){notice('Checking Qesh releases…');const result=await window.qTerminal.action({action:'check-updates'});notice(result.error||`Installed ${result.current}; available ${result.version||'none'}. Run qh update for a managed CLI install.`);}
 else if(['new-tab','split-right','split-down'].includes(name)){showView('terminal');control({action:name});terminal.focus();}
 else if(name==='configure')await configure();
 else if(name==='group'){showView('terminal');pendingGroup='Group';let serial=2;while(state.groups.includes(pendingGroup))pendingGroup='Group '+serial++;control({action:'new-group',name:pendingGroup});}
 else if(name==='commands')showView('commands');
 else if(name==='settings')showView('settings');
 else if(name==='help')showView('settings','keyboard');
 else if(name==='docs'||name==='keyboard-docs'){const result=await window.qTerminal.action({action:'documentation',page:name==='keyboard-docs'?'keyboard':'configuration'});if(result.error)notice(result.error);}
 else {const result=await window.qTerminal.action({action:name});if(result?.error)notice(result.error);}
}
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&view!=='terminal'&&!event.target.closest('.shortcut-input,.theme-selector')){event.preventDefault();showView('terminal');}});
let resizing=false;const divider=$('sidebar-divider');function setSidebar(width){width=Math.max(160,Math.min(400,width));document.documentElement.style.setProperty('--sidebar-width',`${width}px`);divider.setAttribute('aria-valuenow',String(width));saveUI();}
divider.addEventListener('pointerdown',event=>{resizing=true;divider.setPointerCapture(event.pointerId);});divider.addEventListener('pointermove',event=>{if(resizing)setSidebar(event.clientX);});divider.addEventListener('pointerup',()=>resizing=false);divider.addEventListener('pointercancel',()=>resizing=false);divider.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();setSidebar(Number(divider.getAttribute('aria-valuenow'))+(event.key==='ArrowRight'?10:-10));}});
function startWorkspace(){try{fit.fit();window.qTerminal.send({type:'start',cols:terminal.cols,rows:terminal.rows});}catch(error){notice(`Starting workspace: ${error.message}`);}}
const iconPaths={terminal:'M3 5l5 5-5 5 M11 17h7',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',settings:'M9.5 3h5l.6 2.4 2 1.2 2.4-.7 2.5 4.3-1.8 1.8v2.4l1.8 1.8-2.5 4.3-2.4-.7-2 1.2-.6 2.4h-5L8.9 21l-2-1.2-2.4.7L2 16.2l1.8-1.8V12L2 10.2l2.5-4.3 2.4.7 2-1.2L9.5 3 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',add:'M12 4v16 M4 12h16'};
for(const [id,name]of [['view-terminal','terminal'],['view-commands','search'],['view-settings','settings'],['add-tab','add']]){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',iconPaths[name]);svg.append(path);$(id).replaceChildren(svg);}
void (async()=>{try{const initial=await window.qTerminal.action({action:'settings'});if(initial.config)applyConfig(initial.config);if(initial.ui?.sidebarWidth)setSidebar(initial.ui.sidebarWidth);if(initial.ui?.view)showView(initial.ui.view,initial.ui.page);}catch(error){notice(error.message);}finally{notice('Starting shell…');startWorkspace();let tries=0;if(!connected)startTimer=setInterval(()=>{if(++tries>20){clearInterval(startTimer);notice('Shell startup did not finish.');$('status').append(button('Retry',()=>{notice('Starting shell…');startWorkspace();}));}else startWorkspace();},500);if(view==='terminal')terminal.focus();}})();
