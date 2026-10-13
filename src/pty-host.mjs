// Native node-pty runs in Node, isolated from Bun's renderer process.
import pty from 'node-pty';
import {execFile} from 'node:child_process';
import { createInterface } from 'node:readline';
import { accessSync, constants } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const zshConfig = fileURLToPath(new URL('./shell/zsh', import.meta.url));
const sessions = new Map();
const generations = new WeakMap();
const live = new Set();
const pending = new Map();
const send = message => process.stdout.write(JSON.stringify(message) + '\n');
let shuttingDown = false;
const info=new Map();
const poll=setInterval(()=>{for(const [id,session] of sessions){if(info.get(id)?.busy)continue;const previous=info.get(id)||{};info.set(id,{...previous,busy:true});execFile('/usr/sbin/lsof',['-a','-p',String(session.pid),'-d','cwd','-Fn'],{timeout:1500},(_error,stdout)=>{if(sessions.get(id)!==session)return;const cwd=stdout?.split('\n').find(line=>line.startsWith('n'))?.slice(1);let processName;try{processName=session.process;}catch{}const next={cwd:cwd||previous.cwd,process:processName||previous.process,busy:false};info.set(id,next);if(next.cwd!==previous.cwd||next.process!==previous.process)send({type:'info',id,generation:generations.get(session),cwd:next.cwd,process:next.process});});}},1500);poll.unref();
function close(id) {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id); info.delete(id);
  try { process.kill(-session.pid, 'SIGHUP'); } catch {}
  try { session.kill(); } catch {}
  const timer = setTimeout(() => {
    if (!live.has(session)) return;
    try { process.kill(-session.pid, 'SIGKILL'); } catch {}
    try { session.kill('SIGKILL'); } catch {}
  }, 700);
  timer.unref();
}
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;clearInterval(poll);
  for (const id of [...sessions.keys()]) close(id);
  // Stay alive until node-pty's waitpid callbacks reap the children.
  const deadline = Date.now() + 900;
  while (live.size && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  for (const session of live) {
    try { process.kill(-session.pid, 'SIGKILL'); } catch {}
    try { session.kill('SIGKILL'); } catch {}
  }
  const killDeadline = Date.now() + 500;
  while (live.size && Date.now() < killDeadline) await new Promise(resolve => setTimeout(resolve, 20));
  process.exit(0);
}
createInterface({ input: process.stdin }).on('line', line => {
  let message;
  try {
    message = JSON.parse(line);
    if (message.type === 'shutdown') return shutdown();
    const { id } = message;
    if (message.type === 'spawn') {
      if (sessions.has(id)) throw new Error('Session already exists');
      accessSync(message.shell, constants.X_OK);
      accessSync(message.cwd, constants.R_OK);
      const session = pty.spawn(message.shell, message.args, {
        cwd: message.cwd, cols: message.cols, rows: message.rows,
        name: 'xterm-256color', env: { ...process.env, ...(basename(message.shell) === 'zsh' ? { ZDOTDIR: zshConfig, QENTRAH_USER_ZDOTDIR: process.env.ZDOTDIR || process.env.HOME } : {}), TERM: 'xterm-256color', COLORTERM: 'truecolor', QENTRAH_TERMINAL: '1' },
      });
      sessions.set(id, session);generations.set(session,message.generation);
      live.add(session);
      send({ type: 'spawned', id, generation:message.generation,pid: session.pid });
      pending.set(session, 0);
      session.onData(data => {
        if(sessions.get(id)!==session)return;
        pending.set(session, (pending.get(session) ?? 0) + data.length);
        send({ type: 'output', id, generation:generations.get(session),data });
        if (pending.get(session) > 262144) session.pause();
      });
      session.onExit(({ exitCode, signal }) => {
        live.delete(session);
        pending.delete(session);
        if (sessions.get(id) !== session) return;
        sessions.delete(id);
        send({ type: 'exit', id, generation:generations.get(session),code: exitCode, signal });
      });
    } else if (message.type === 'close') {const current=sessions.get(id);if(current&&(message.generation===undefined||message.generation===generations.get(current)))close(id);}
    else {
      const session = sessions.get(id);
      if (!session) { if (message.type === 'ack') return; throw new Error('Session is not running'); }
      if(message.generation!==undefined&&message.generation!==generations.get(session))return;
      if (message.type === 'ack') {
        const remaining = Math.max(0, (pending.get(session) ?? 0) - message.size);
        pending.set(session, remaining);
        if (remaining < 131072) session.resume();
      } else if (message.type === 'input') session.write(message.data);
      else if (message.type === 'resize') session.resize(message.cols, message.rows);
    }
  } catch (error) { send({ type: 'error', id: message?.id ?? '', generation:message?.generation,message: error.message }); }
}).on('close', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);
process.on('SIGINT', shutdown);
process.stdout.on('error', shutdown);
