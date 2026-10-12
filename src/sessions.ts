import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import Xterm from '@xterm/headless';
import type { Terminal } from '@xterm/headless';
import type { Request, Response } from './protocol';

export interface Session {
  id: string; terminal: Terminal; cwd: string; shell: string;
  status: 'starting' | 'running' | 'exited' | 'error';
  cursorVisible: boolean; pid?: number; exitCode?: number; error?: string; scroll: number;
}
export class SessionManager extends EventEmitter {
  readonly sessions = new Map<string, Session>();
  private host: ChildProcessWithoutNullStreams;
  private closing = false;
  private lastError = '';
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
    if (!this.closing && !this.host.stdin.destroyed) this.host.stdin.write(JSON.stringify(message) + '\n');
  }
  create(id: string, cwd: string, shell: string, cols = 80, rows = 24) {
    const terminal = new Xterm.Terminal({ cols, rows, scrollback: 5000, allowProposedApi: true });
    const session: Session = { id, terminal, cwd, shell, status: 'starting', scroll: 0, cursorVisible: true };
    this.sessions.set(id, session);
    for (const final of ['h', 'l']) terminal.parser.registerCsiHandler({ prefix: '?', final }, params => {
      if (params.includes(25)) session.cursorVisible = final === 'h';
      return false;
    });
    terminal.onData(data => this.input(id, data)); // Device-status responses from the emulator.
    terminal.onTitleChange(() => this.emit('change'));
    this.send({ type: 'spawn', id, cwd, shell, args: ['-l'], cols, rows });
    return session;
  }
  private receive(message: Response) {
    const session = this.sessions.get(message.id);
    if (!session) return;
    if (message.type === 'output') {
      // Headless xterm processes escape sequences rather than stripping them.
      session.terminal.write(message.data, () => { this.send({ type: 'ack', id: session.id, size: message.data.length }); this.emit('output', session.id); });
      return;
    }
    if (message.type === 'spawned') { session.pid = message.pid; session.status = 'running'; }
    if (message.type === 'exit') { session.status = 'exited'; session.exitCode = message.code; }
    if (message.type === 'error') { session.status = 'error'; session.error = message.message; }
    this.emit('change');
  }
  input(id: string, data: string) {
    const session = this.sessions.get(id);
    if (session?.status !== 'running') return;
    session.scroll = 0;
    this.send({ type: 'input', id, data });
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
    cols = Math.max(2, Math.floor(cols)); rows = Math.max(1, Math.floor(rows));
    if (!session || (session.terminal.cols === cols && session.terminal.rows === rows)) return;
    session.terminal.resize(cols, rows);
    if (session.status === 'running' || session.status === 'starting') this.send({ type: 'resize', id, cols, rows });
    this.emit('output', id);
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
    const { cwd, shell, terminal } = old;
    const { cols, rows } = terminal;
    this.close(id); this.create(id, cwd, shell, cols, rows); this.emit('change');
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
