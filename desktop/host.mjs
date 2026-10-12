import pty from 'node-pty';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let terminal, stopping = false, pending = 0;
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const controlDirectory = mkdtempSync(join(tmpdir(), 'q-terminal-control-')); chmodSync(controlDirectory, 0o700);
const controlPath = join(controlDirectory, 'workspace.sock');
let control, queued = [];
const server = createServer(socket => {
  if (control) { socket.destroy(); return; } control = socket;
  createInterface({input:socket}).on('line',line => { try { send(JSON.parse(line)); } catch {} });
  socket.on('error',() => {}); socket.on('close',() => { control = undefined; });
  for (const message of queued) socket.write(JSON.stringify(message)+'\n'); queued=[];
});
await new Promise((resolve,reject) => { server.once('error',reject);server.listen(controlPath,resolve); });
async function shutdown() {
  if (stopping) return; stopping = true;
  if (terminal) {
    const exited = new Promise(resolve => terminal.onExit(resolve));
    try { terminal.kill('SIGHUP'); } catch {}
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
  }
  control?.destroy(); server.close(); rmSync(controlDirectory,{recursive:true,force:true});
  process.exit(0);
}
createInterface({ input: process.stdin }).on('line', line => {
  try {
    const message = JSON.parse(line);
    if (message.type === 'start' && !terminal) {
      terminal = pty.spawn(process.env.QENTRAH_BUN || 'bun', [resolve(root, 'src/index.tsx')], {
        cwd: process.env.QENTRAH_START_DIR || process.env.HOME || root,
        cols: Math.max(20, Math.min(1000, message.cols | 0)), rows: Math.max(5, Math.min(500, message.rows | 0)),
        name: 'xterm-256color', env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', QENTRAH_DESKTOP: process.env.QENTRAH_DESKTOP || '0', QENTRAH_CONTROL_SOCKET: controlPath },
      });
      send({type:'started',pid:terminal.pid});
      terminal.onData(data => { pending += data.length; send({ type: 'output', data }); if (pending > 262144) terminal.pause(); });
      terminal.onExit(event => { send({ type: 'exit', code: event.exitCode });  });
    } else if (message.type === 'control') { if (control) control.write(JSON.stringify(message.command)+'\n'); else if (queued.length < 100) queued.push(message.command); }
    else if (message.type === 'input' && typeof message.data === 'string') terminal?.write(message.data);
    else if (message.type === 'resize' && terminal) terminal.resize(Math.max(20, Math.min(1000, message.cols | 0)), Math.max(5, Math.min(500, message.rows | 0)));
    else if (message.type === 'ack') { pending = Math.max(0, pending - Math.max(0, message.size | 0)); if (pending < 131072) terminal?.resume(); }
    else if (message.type === 'shutdown') void shutdown();
  } catch (error) { send({ type: 'error', message: error.message }); }
}).on('close', shutdown);
process.on('SIGTERM', shutdown); process.on('SIGHUP', shutdown); process.stdout.on('error', shutdown);
