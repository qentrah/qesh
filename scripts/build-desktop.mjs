import {cpSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
execFileSync('bun',['build','desktop/renderer.js','--target=browser','--outfile','desktop/renderer.bundle.js'],{cwd:root,stdio:'inherit'});
execFileSync('bun',['build','desktop/settings-renderer.js','--target=browser','--outfile','desktop/settings.bundle.js'],{cwd:root,stdio:'inherit'});
cpSync(new URL('../node_modules/@xterm/xterm/css/xterm.css',import.meta.url),new URL('../desktop/xterm.css',import.meta.url));
