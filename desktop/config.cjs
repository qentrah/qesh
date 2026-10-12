const { readFileSync, writeFileSync, existsSync, renameSync } = require('node:fs');
const { join, isAbsolute } = require('node:path');
const { homedir } = require('node:os');
const defaults = { defaultPath: '~', shell: '/bin/zsh', fontFamily: 'Menlo, Monaco, monospace', fontSize: 14, tabsPosition: 'left', theme: { background: '#0e0d11', surface: '#141318', foreground: '#d4d4d4', muted: '#a09ca8', border: '#45414e', primary: '#9cdcfe', error: '#f48771', selection: '#264f78' } };
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
  return config;
}
function expandPath(path) { return path === '~' ? homedir() : path.startsWith('~/') ? join(homedir(),path.slice(2)) : path; }
function load(path) { if (!existsSync(path)) writeFileSync(path,JSON.stringify(defaults,null,2)+'\n'); return validate(JSON.parse(readFileSync(path,'utf8'))); }
function save(path,text) { const config=validate(JSON.parse(text)); const temporary=path+'.tmp';writeFileSync(temporary,JSON.stringify(config,null,2)+'\n');renameSync(temporary,path);return config; }
module.exports={defaults,validate,expandPath,load,save};
