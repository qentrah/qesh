const { readFileSync, writeFileSync, existsSync, renameSync } = require('node:fs');
const { join, isAbsolute } = require('node:path');
const { homedir } = require('node:os');
let jsonc;try{jsonc=require('jsonc-parser');}catch{jsonc=require('../terminal/node_modules/jsonc-parser');}
const shortcuts={'new-tab':'Cmd+T','new-window':'Cmd+N','new-workspace':'Cmd+Shift+N',settings:'Cmd+,',commands:'Cmd+Shift+P','split-right':'Cmd+Alt+Right','split-down':'Cmd+Alt+Down',help:'Cmd+Shift+/'};
const defaults = { defaultPath: '~', shell: '/bin/zsh', fontFamily: 'Menlo, Monaco, monospace', fontSize: 14, tabsPosition: 'left', theme: { background: '#0e0d11', surface: '#141318', foreground: '#d4d4d4', muted: '#a09ca8', border: '#45414e', primary: '#9cdcfe', error: '#f48771', selection: '#264f78' }, commands: {}, updates: {}, apps: {codex:{name:'Codex',match:'codex',icon:'codex'},claude:{name:'Claude',match:'claude',icon:'claude'},opencode:{name:'OpenCode',match:'opencode',icon:'opencode'},pi:{name:'Pi',match:'pi',icon:'pi'},gemini:{name:'Gemini',match:'gemini',icon:'gemini'},aider:{name:'Aider',match:'aider',icon:'aider'},gh:{name:'GitHub CLI',match:'gh',icon:'terminal'},node:{name:'Node.js',match:'node',icon:'terminal'},python:{name:'Python',match:'python',icon:'terminal'}}, themes:{}, shortcuts, scrollback:5000, storage:{enabled:true,saveDelayMs:250,maxWorkspaces:30}, restore: true, updateChannel: 'preview' };
function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuration must be a JSON object.');
  for (const key of Object.keys(value)) if (!Object.hasOwn(defaults,key)) throw new Error(`Unknown setting: ${key}`);
  if(value.apps!==undefined&&(!value.apps||typeof value.apps!=='object'||Array.isArray(value.apps)))throw new Error('apps must be an object.');
  const config = { ...defaults, ...value, apps:{...defaults.apps,...value.apps}, theme: { ...defaults.theme, ...value.theme }, shortcuts:{...shortcuts,...value.shortcuts},storage:{...defaults.storage,...value.storage} };
  if (typeof config.defaultPath !== 'string' || (!isAbsolute(config.defaultPath) && config.defaultPath !== '~' && !config.defaultPath.startsWith('~/'))) throw new Error('defaultPath must be an absolute path or begin with ~/');
  if (typeof config.shell !== 'string' || !isAbsolute(config.shell)) throw new Error('shell must be an absolute path.');
  if (typeof config.fontFamily !== 'string' || !config.fontFamily.trim() || config.fontFamily.length > 100) throw new Error('fontFamily must be a font name.');
  if (!Number.isInteger(config.fontSize) || config.fontSize < 10 || config.fontSize > 28) throw new Error('fontSize must be between 10 and 28.');
  if (!['left','top'].includes(config.tabsPosition)) throw new Error('tabsPosition must be left or top.');
  if (value.theme !== undefined && (!value.theme || typeof value.theme !== 'object' || Array.isArray(value.theme))) throw new Error('theme must be an object.');
  for (const [key, color] of Object.entries(config.theme)) if (!Object.hasOwn(defaults.theme,key) || typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color)) throw new Error(`Invalid theme color: ${key}; use #RRGGBB.`);
  for(const key of ['commands','updates']) {
    if(!config[key]||typeof config[key]!=='object'||Array.isArray(config[key]))throw new Error(`${key} must be an object.`);
    for(const [name,item] of Object.entries(config[key])) {
      if(!/^[a-z][a-z0-9-]{0,39}$/.test(name)||['projects','project','clone','fork','bug','bugs','install','diagnostics','settings','search','completions','config','update','update-all','workspace','help','start','version','new-tab','new-window','new-workspace','check-updates','split-right','split-down','group','folder','about'].includes(name))throw new Error(`Invalid or reserved command name: ${name}`);
      if(!item||typeof item!=='object'||typeof item.command!=='string'||!item.command.trim()||item.command.length>8192)throw new Error(`Command ${name} needs a command string.`);
      if(item.cwd!==undefined&&(typeof item.cwd!=='string'||(!isAbsolute(item.cwd)&&item.cwd!=='~'&&!item.cwd.startsWith('~/'))))throw new Error(`Invalid command folder: ${name}`);
      if(item.description!==undefined&&typeof item.description!=='string')throw new Error(`Invalid description: ${name}`);
    }
  }
  if(!config.apps||typeof config.apps!=='object'||Array.isArray(config.apps))throw new Error('apps must be an object.');
  for(const [key,item]of Object.entries(config.apps)){if(!/^[a-z][a-z0-9-]{0,39}$/.test(key)||!item||typeof item.name!=='string'||!item.name.trim()||item.name.length>40||typeof item.match!=='string'||!item.match.trim()||item.match.length>80||!['codex','claude','opencode','pi','gemini','aider','terminal','shell'].includes(item.icon))throw new Error(`Invalid app identity: ${key}`);}
  if(typeof config.restore!=='boolean')throw new Error('restore must be true or false.');
  if(!['preview','stable'].includes(config.updateChannel))throw new Error('updateChannel must be preview or stable.');
  if(!config.themes||typeof config.themes!=='object'||Array.isArray(config.themes)||Object.keys(config.themes).length>20)throw new Error('themes must be an object with up to 20 named themes.');
  for(const [name,theme]of Object.entries(config.themes)){if(!name.trim()||name.length>40||!theme||typeof theme!=='object'||Array.isArray(theme))throw new Error('Invalid saved theme.');for(const key of Object.keys(defaults.theme))if(typeof theme[key]!=='string'||!/^#[\da-f]{6}$/i.test(theme[key]))throw new Error(`Theme ${name} needs all theme colors as #RRGGBB.`);for(const key of Object.keys(theme))if(!Object.hasOwn(defaults.theme,key))throw new Error(`Unknown theme color: ${key}`);}
  if(!Number.isInteger(config.scrollback)||config.scrollback<100||config.scrollback>50000)throw new Error('scrollback must be between 100 and 50000 lines.');
  for(const key of ['storage','shortcuts'])if(value[key]!==undefined&&(!value[key]||typeof value[key]!=='object'||Array.isArray(value[key])))throw new Error(`${key} must be an object.`);
  for(const key of Object.keys(config.storage))if(!Object.hasOwn(defaults.storage,key))throw new Error(`Unknown storage setting: ${key}`);
  if(typeof config.storage.enabled!=='boolean'||!Number.isInteger(config.storage.saveDelayMs)||config.storage.saveDelayMs<100||config.storage.saveDelayMs>5000||!Number.isInteger(config.storage.maxWorkspaces)||config.storage.maxWorkspaces<1||config.storage.maxWorkspaces>100)throw new Error('Storage needs enabled, saveDelayMs (100–5000) and maxWorkspaces (1–100).');
  const used=new Set();for(const [key,combo]of Object.entries(config.shortcuts)){
    if(!Object.hasOwn(shortcuts,key)||typeof combo!=='string')throw new Error(`Unknown keyboard action: ${key}`);
    if(combo==='')continue;
    if(!/^(?:(?:Cmd|Ctrl|Alt|Shift)\+)+(?:[A-Z0-9]|,|\/|Right|Left|Up|Down|Enter|Space|F(?:[1-9]|1[0-2]))$/.test(combo))throw new Error(`Invalid shortcut: ${combo}`);
    const parts=combo.split('+'),keyName=parts.pop(),mods=parts.sort();if(new Set(mods).size!==mods.length)throw new Error('Repeated shortcut modifier.');
    const normalized=[...mods,keyName].join('+');if(used.has(normalized))throw new Error(`Duplicate shortcut: ${combo}`);used.add(normalized);
    if((mods.length===1&&mods[0]==='Cmd'&&['C','V','X','Z','A','Q'].includes(keyName))||(mods.includes('Ctrl')&&['B','C'].includes(keyName)))throw new Error(`${combo} is reserved for editing or shell input.`);
  }
  return config;
}
function expandPath(path) { return path === '~' ? homedir() : path.startsWith('~/') ? join(homedir(),path.slice(2)) : path; }
const header='// QH configuration · changes in Settings are saved here.\n// Configuration: https://qentrah.com/docs/qh/configuration\n// GUI keyboard shortcuts: https://qentrah.com/docs/qh/keyboard\n// Ctrl+B terminal commands are separate from GUI shortcuts.\n';
function parse(text){const errors=[];const value=jsonc.parse(text,errors,{allowTrailingComma:true});if(errors.length)throw new Error(`Invalid JSON: ${jsonc.printParseErrorCode(errors[0].error)}`);return value;}
function load(path) { if (!existsSync(path)) writeFileSync(path,header+JSON.stringify(defaults,null,2)+'\n',{mode:0o600}); const text=readFileSync(path,'utf8'),config=validate(parse(text));if(!text.includes('https://qentrah.com/docs/qh/configuration'))writeFileSync(path,header+text,{mode:0o600});return config; }
function save(path,text) {
 const config=validate(typeof text==='string'?parse(text):text);
 let source=existsSync(path)?readFileSync(path,'utf8'):header+'{}\n';
 // Patch changed root keys so editor comments and untouched formatting survive GUI saves.
 try{const old=parse(source);for(const key of Object.keys(old))if(!Object.hasOwn(defaults,key))source=jsonc.applyEdits(source,jsonc.modify(source,[key],undefined,{formattingOptions:{insertSpaces:true,tabSize:2}}));for(const [key,value]of Object.entries(config))if(JSON.stringify(old[key])!==JSON.stringify(value))source=jsonc.applyEdits(source,jsonc.modify(source,[key],value,{formattingOptions:{insertSpaces:true,tabSize:2}}));}catch{source=header+JSON.stringify(config,null,2)+'\n';}
 if(!source.includes('https://qentrah.com/docs/qh/configuration'))source=header+source;
 const temporary=path+'.tmp';writeFileSync(temporary,source,{mode:0o600});renameSync(temporary,path);return config;
}
module.exports={defaults,validate,expandPath,load,save,parse};
