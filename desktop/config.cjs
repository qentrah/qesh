const { readFileSync, writeFileSync, existsSync, renameSync } = require('node:fs');
const { join, isAbsolute } = require('node:path');
const { homedir } = require('node:os');
const defaults = { defaultPath: '~', shell: '/bin/zsh', fontFamily: 'Menlo, Monaco, monospace', fontSize: 14, tabsPosition: 'left', theme: { background: '#0e0d11', surface: '#141318', foreground: '#d4d4d4', muted: '#a09ca8', border: '#45414e', primary: '#9cdcfe', error: '#f48771', selection: '#264f78' }, commands: {}, updates: {}, apps: {codex:{name:'Codex',match:'codex',icon:'codex'},claude:{name:'Claude',match:'claude',icon:'claude'},opencode:{name:'OpenCode',match:'opencode',icon:'opencode'}}, restore: true, updateChannel: 'preview' };
function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuration must be a JSON object.');
  for (const key of Object.keys(value)) if (!(key in defaults)) throw new Error(`Unknown setting: ${key}`);
  const config = { ...defaults, ...value, theme: { ...defaults.theme, ...value.theme } };
  if (typeof config.defaultPath !== 'string' || (!isAbsolute(config.defaultPath) && config.defaultPath !== '~' && !config.defaultPath.startsWith('~/'))) throw new Error('defaultPath must be an absolute path or begin with ~/');
  if (typeof config.shell !== 'string' || !isAbsolute(config.shell)) throw new Error('shell must be an absolute path.');
  if (typeof config.fontFamily !== 'string' || !config.fontFamily.trim() || config.fontFamily.length > 100) throw new Error('fontFamily must be a font name.');
  if (!Number.isInteger(config.fontSize) || config.fontSize < 10 || config.fontSize > 28) throw new Error('fontSize must be between 10 and 28.');
  if (!['left','top'].includes(config.tabsPosition)) throw new Error('tabsPosition must be left or top.');
  if (value.theme !== undefined && (!value.theme || typeof value.theme !== 'object' || Array.isArray(value.theme))) throw new Error('theme must be an object.');
  for (const [key, color] of Object.entries(config.theme)) if (!(key in defaults.theme) || typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color)) throw new Error(`Invalid theme color: ${key}; use #RRGGBB.`);
  for(const key of ['commands','updates']) {
    if(!config[key]||typeof config[key]!=='object'||Array.isArray(config[key]))throw new Error(`${key} must be an object.`);
    for(const [name,item] of Object.entries(config[key])) {
      if(!/^[a-z][a-z0-9-]{0,39}$/.test(name)||['search','completions','config','update','update-all','workspace','help','start','version','new-tab','new-window','new-workspace','check-updates','split-right','split-down','group','folder','about'].includes(name))throw new Error(`Invalid or reserved command name: ${name}`);
      if(!item||typeof item!=='object'||typeof item.command!=='string'||!item.command.trim()||item.command.length>8192)throw new Error(`Command ${name} needs a command string.`);
      if(item.cwd!==undefined&&(typeof item.cwd!=='string'||(!isAbsolute(item.cwd)&&item.cwd!=='~'&&!item.cwd.startsWith('~/'))))throw new Error(`Invalid command folder: ${name}`);
      if(item.description!==undefined&&typeof item.description!=='string')throw new Error(`Invalid description: ${name}`);
    }
  }
  if(!config.apps||typeof config.apps!=='object'||Array.isArray(config.apps))throw new Error('apps must be an object.');
  for(const [key,item]of Object.entries(config.apps)){if(!/^[a-z][a-z0-9-]{0,39}$/.test(key)||!item||typeof item.name!=='string'||!item.name.trim()||item.name.length>40||typeof item.match!=='string'||!item.match.trim()||item.match.length>80||!['codex','claude','opencode','shell'].includes(item.icon))throw new Error(`Invalid app identity: ${key}`);}
  if(typeof config.restore!=='boolean')throw new Error('restore must be true or false.');
  if(!['preview','stable'].includes(config.updateChannel))throw new Error('updateChannel must be preview or stable.');
  return config;
}
function expandPath(path) { return path === '~' ? homedir() : path.startsWith('~/') ? join(homedir(),path.slice(2)) : path; }
function load(path) { if (!existsSync(path)) writeFileSync(path,JSON.stringify(defaults,null,2)+'\n'); return validate(JSON.parse(readFileSync(path,'utf8'))); }
function save(path,text) { const config=validate(JSON.parse(text)); const temporary=path+'.tmp';writeFileSync(temporary,JSON.stringify(config,null,2)+'\n');renameSync(temporary,path);return config; }
module.exports={defaults,validate,expandPath,load,save};
