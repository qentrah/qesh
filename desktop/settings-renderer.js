import {settingsUI} from './settings.js';
const $=id=>document.getElementById(id);let config,page='appearance',timer,saveTimer;
function notice(text){$('status').textContent=text;$('status').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('status').hidden=true,6000);}
function apply(value){config=value;for(const [key,color]of Object.entries(value.theme))document.documentElement.style.setProperty(`--${key}`,color);}
async function action(name){
 if(name==='configure'){const result=await window.qTerminal.action({action:'open-config'});if(result.error)notice(result.error);}
 else if(name==='docs'||name==='keyboard-docs'){const result=await window.qTerminal.action({action:'documentation',page:name==='keyboard-docs'?'keyboard':'configuration'});if(result.error)notice(result.error);}
 else if(name==='check-updates'){notice('Checking releases…');const result=await window.qTerminal.action({action:'check-updates'});notice(result.error||`Installed ${result.current}; available ${result.version||'none'}. Use qh update for a managed install.`);}
}
const ui=settingsUI({getConfig:()=>config,onPage:value=>{page=value;clearTimeout(saveTimer);saveTimer=setTimeout(()=>void window.qTerminal.action({action:'save-ui',ui:{page}}),250);},save:async next=>{const result=await window.qTerminal.action({action:'save-config',config:next});if(result.config)apply(result.config);return result;},notice,action});
window.qTerminal.subscribe(message=>{if(message.type==='config'){apply(message.config);if(!document.activeElement?.matches('input'))ui.render(page);}else if(message.type==='action'&&message.action==='settings-page')ui.render(message.page);else if(message.type==='error')notice(message.message);});
$('settings-json').onclick=()=>action('configure');$('settings-docs').onclick=()=>action('docs');window.addEventListener('error',event=>notice(event.message));
void(async()=>{try{const initial=await window.qTerminal.action({action:'settings'});if(initial.error)throw new Error(initial.error);apply(initial.config);page=initial.ui?.page||'appearance';ui.render(page);}catch(error){notice(error.message);$('settings-content').textContent='Settings could not load. Close this window and open Settings again.';}})();
