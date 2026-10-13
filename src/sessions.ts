import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import Xterm from '@xterm/headless';
import type { Terminal } from '@xterm/headless';
import {mouseSequence,mouseModifierBits,type MouseModifiers} from './mouse';
import type { Request, Response } from './protocol';

export interface Session {
  id: string; generation: number; terminal: Terminal; cwd: string; shell: string;
  status: 'starting' | 'running' | 'exited' | 'error';
  mouseEncoding:'sgr'|'utf8'|'legacy';alternateScroll:boolean; lastOutputBase:number;cursorVisible: boolean; title?: string; label?: string; process?: string; pid?: number; exitCode?: number; error?: string; scroll: number;
}
export class SessionManager extends EventEmitter {
  readonly sessions = new Map<string, Session>();
  private host: ChildProcessWithoutNullStreams;
  private closing = false;
  private lastError = '';
  private generation = 0;
  constructor() {
    super();
    this.host = spawn(process.env.QENTRAH_NODE ?? 'node', [fileURLToPath(new URL('./pty-host.mjs', import.meta.url))], { stdio: 'pipe' });
    createInterface({ input: this.host.stdout }).on('line', line => {
      try { this.receive(JSON.parse(line) as Response); } catch (error) { this.fail(`Invalid PTY response: ${error}`); }
    });
    this.host.stderr.on('data', chunk => { this.lastError = (this.lastError + chunk).slice(-2000); });
    this.host.on('error', error => this.fail(`Cannot launch Node.js: ${error.message}`));
    this.host.on('exit', code => {
      if (!this.closing) this.fail(`PTY helper stopped (${code}). ${this.lastError}`);
    });
    this.host.stdin.on('error', error => { if (!this.closing) this.fail(error.message); });
  }
  private fail(message: string) {
    this.lastError = message;
    for (const session of this.sessions.values()) {
      if (session.status === 'starting' || session.status === 'running') {
        session.status = 'error'; session.error = message;
      }
    }
    this.emit('change');
  }
  private send(message: Request) {
    if('id' in message&&message.type!=='spawn'&&message.generation===undefined)message={...message,generation:this.sessions.get(message.id)?.generation};
    if (!this.closing && !this.host.stdin.destroyed) this.host.stdin.write(JSON.stringify(message) + '\n');
  }
  scrollback=Math.max(100,Math.min(50000,Number(process.env.QESH_SCROLLBACK)||5000));
  setScrollback(value:number){this.scrollback=value;for(const session of this.sessions.values())session.terminal.options.scrollback=value;}
  create(id: string, cwd: string, shell: string, cols = 80, rows = 24) {
    const terminal = new Xterm.Terminal({ cols, rows, scrollback: this.scrollback, allowProposedApi: true });
    const session: Session = { id, generation:++this.generation, terminal, cwd, shell, status: 'starting', scroll: 0, lastOutputBase:0,cursorVisible: true,mouseEncoding:'legacy',alternateScroll:true };
    this.sessions.set(id, session);
    for (const final of ['h', 'l']) terminal.parser.registerCsiHandler({ prefix: '?', final }, params => {
      if(params.includes(1006))session.mouseEncoding=final==='h'?'sgr':'legacy';
      if(params.includes(1005)&&session.mouseEncoding!=='sgr')session.mouseEncoding=final==='h'?'utf8':'legacy';
      if(params.includes(1007))session.alternateScroll=final==='h';
      if (params.includes(25)) session.cursorVisible = final === 'h';
      return false;
    });
    terminal.onData(data => {if(this.sessions.get(id)===session)this.input(id, data);}); // Device-status responses from the emulator.
    terminal.onTitleChange(title => {session.title=title.slice(0,120);this.emit('change');});
    this.send({ type: 'spawn', id, generation:session.generation, cwd, shell, args: ['-l'], cols, rows });
    return session;
  }
  private receive(message: Response) {
    const session = this.sessions.get(message.id);
    if (!session || (message.generation!==undefined && message.generation!==session.generation)) return;
    if (message.type === 'output') {
      // Headless xterm processes escape sequences rather than stripping them.
      session.terminal.write(message.data, () => { this.send({ type: 'ack', id: session.id, generation:session.generation, size: message.data.length });if(this.sessions.get(session.id)!==session)return;const base=session.terminal.buffer.active.baseY;if(session.scroll>0&&session.terminal.buffer.active.type==='normal')session.scroll=Math.min(base,session.scroll+Math.max(0,base-session.lastOutputBase));session.lastOutputBase=base;this.emit('output', session.id); });
      return;
    }
    if (message.type === 'info') {session.cwd=message.cwd||session.cwd;session.process=message.process;this.emit('change');}
    if (message.type === 'spawned') { session.pid = message.pid; session.status = 'running'; }
    if (message.type === 'exit') { session.status = 'exited'; session.exitCode = message.code; }
    if (message.type === 'error') { session.status = 'error'; session.error = message.message; }
    this.emit('change');
  }
  input(id: string, data: string, encoding?:'latin1') {
    const session = this.sessions.get(id);
    if (session?.status !== 'running') return;
    session.scroll = 0;
    this.send({ type: 'input', id, data,encoding });
    this.emit('output', id);
  }
  paste(id: string, data: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    const bracketed = session.terminal.modes.bracketedPasteMode;
    this.input(id, bracketed ? `\x1b[200~${data}\x1b[201~` : data);
  }
  resize(id: string, cols: number, rows: number) {
    const session = this.sessions.get(id);
    if(!Number.isFinite(cols)||!Number.isFinite(rows))return;
    cols = Math.max(2,Math.min(1000, Math.floor(cols))); rows = Math.max(1,Math.min(500, Math.floor(rows)));
    if (!session || (session.terminal.cols === cols && session.terminal.rows === rows)) return;
    session.terminal.resize(cols, rows);session.lastOutputBase=session.terminal.buffer.active.baseY;
    if (session.status === 'running' || session.status === 'starting') this.send({ type: 'resize', id, cols, rows });
    this.emit('output', id);
  }
  mouse(id:string,phase:'down'|'up'|'drag'|'move',button:number,x:number,y:number,modifiers:MouseModifiers={}){
    const session=this.sessions.get(id);if(!session||session.status!=='running'||(modifiers.shift&&phase!=='up')||session.terminal.modes.mouseTrackingMode==='none')return false;
    const mode=session.terminal.modes.mouseTrackingMode;if(phase==='up'&&mode==='x10')return true;if(phase==='drag'&&!['drag','any'].includes(mode))return true;if(phase==='move'&&mode!=='any')return false;
    const code=(phase==='move'?3:Math.max(0,Math.min(2,button)))+mouseModifierBits(modifiers)+(phase==='drag'||phase==='move'?32:0);
    this.input(id,mouseSequence(code,Math.min(session.terminal.cols,x+1),Math.min(session.terminal.rows,y+1),session.mouseEncoding,phase==='up'),session.mouseEncoding==='legacy'?'latin1':undefined);return true;
  }
  wheel(id:string,direction:'up'|'down'|'left'|'right',x:number,y:number,delta=1,modifiers:MouseModifiers={}){
    const session=this.sessions.get(id);if(!session)return;delta=Math.max(1,Math.min(10,Math.round(Math.abs(delta)||1)));
    if(session.status==='running'&&!modifiers.shift&&session.terminal.modes.mouseTrackingMode!=='none'){
      const code=({up:64,down:65,left:66,right:67})[direction]+mouseModifierBits(modifiers);this.input(id,mouseSequence(code,Math.min(session.terminal.cols,x+1),Math.min(session.terminal.rows,y+1),session.mouseEncoding).repeat(delta),session.mouseEncoding==='legacy'?'latin1':undefined);return;
    }
    if(session.status==='running'&&!modifiers.shift&&session.terminal.buffer.active.type==='alternate'&&session.alternateScroll){const key=({up:'A',down:'B',left:'D',right:'C'})[direction];this.input(id,(`\x1b${session.terminal.modes.applicationCursorKeysMode?'O':'['}${key}`).repeat(3*delta));return;}
    if(direction==='up'||direction==='down')this.scroll(id,(direction==='up'?1:-1)*3*delta);
  }
  scroll(id: string, amount: number) {
    const session = this.sessions.get(id);
    if (!session) return;
    session.scroll = session.terminal.buffer.active.type === 'alternate' ? 0 :
      Math.max(0, Math.min(session.terminal.buffer.active.baseY, session.scroll + amount));
    this.emit('output', id);
  }
  restart(id: string) {
    const old = this.sessions.get(id);
    if (!old || old.status === 'running' || old.status === 'starting') return;
    const { cwd, shell, terminal, label } = old;
    const { cols, rows } = terminal;
    this.close(id); const replacement=this.create(id, cwd, shell, cols, rows); replacement.label=label; this.emit('change');
  }
  close(id: string) {
    this.send({ type: 'close', id });
    this.sessions.get(id)?.terminal.dispose(); this.sessions.delete(id);
  }
  async shutdown() {
    if (this.closing) return;
    this.send({ type: 'shutdown' }); this.closing = true;
    await new Promise<void>(resolve => {
      if (this.host.exitCode !== null) return resolve();
      const timeout = setTimeout(() => { this.host.kill('SIGTERM'); resolve(); }, 2000);
      this.host.once('exit', () => { clearTimeout(timeout); resolve(); });
    });
    for (const session of this.sessions.values()) session.terminal.dispose();
    this.sessions.clear();
  }
}
