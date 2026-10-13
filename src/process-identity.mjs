import {execFile} from 'node:child_process';
import {basename} from 'node:path';
const names=['codex','claude','opencode','pi','gemini','aider','gh','git','node','python','bun','npm','pnpm','yarn'];
export function classifyProcess(comm,args=''){
 const executable=basename(String(comm).trim()).toLowerCase(),tokens=String(args).trim().split(/\s+/);
 if(!['node','python','python3','bun','npm','pnpm','yarn'].includes(executable))return names.find(name=>executable===name||name==='codex'&&/^codex-(aarch64|x86_64)/.test(executable))||executable;
 if(tokens.some(token=>['-e','--eval','-c','--command'].includes(token)))return executable;
 const candidates=[executable,...tokens.slice(1).filter(token=>!token.startsWith('-')).slice(0,1).map(token=>token.replace(/^['"]|['"]$/g,'').toLowerCase())];
 for(const name of names){if(candidates.some(token=>{const base=basename(token);return base===name||base===name+'.js'||base===name+'.py'||name==='codex'&&/^codex-(aarch64|x86_64)/.test(base)||name==='pi'&&token.includes('/pi-coding-agent/')||name==='codex'&&token.includes('/@openai/codex/')||name==='claude'&&token.includes('/claude-code/')||name==='gemini'&&token.includes('/gemini-cli/')||name==='aider'&&token.includes('/aider/');}))return name;}
 return executable;
}
const run=args=>new Promise(resolve=>execFile('/bin/ps',args,{timeout:1000,maxBuffer:262144},(error,stdout)=>resolve(error?'':stdout)));
let listing,listingTime=0;
const processList=()=>{if(!listing||Date.now()-listingTime>300){listingTime=Date.now();listing=run(['-axo','pgid=,comm=,args=']);}return listing;};
export async function foregroundIdentity(shellPid,fallback){
 const group=Number(String(await run(['-p',String(shellPid),'-o','tpgid='])).trim());if(!Number.isInteger(group)||group<=0||group===shellPid)return fallback;
 const rows=String(await processList()).split('\n');
 for(const row of rows){const match=row.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/);if(match&&Number(match[1])===group){const name=classifyProcess(match[2],match[3]);if(name&&!['zsh','bash','fish','sh'].includes(name))return name;}}
 return fallback;
}
