import { expect, test } from 'bun:test';
import { SessionManager } from '../src/sessions';
import { Workspace } from '../src/workspace';
import { text, until } from './support';

test('real PTYs survive tabs and resizing, and isolate input/output', async () => {
  const manager = new SessionManager();
  try {
    const workspace = new Workspace(manager, process.cwd(), '/bin/zsh');
    const first = manager.sessions.get(workspace.tab.focused)!;
    await until(() => first.status === 'running');
    manager.input(first.id, "printf '\\nFIRST-%s\\n' $$\r");
    await until(() => text(first).includes(`FIRST-${first.pid}`));
    const pid = first.pid;
    workspace.newTab(); const second = manager.sessions.get(workspace.tab.focused)!;
    await until(() => second.status === 'running');
    manager.input(second.id, "printf '\\nSECOND-%s\\n' $$\r");
    await until(() => text(second).includes(`SECOND-${second.pid}`));
    workspace.switchTab(0); manager.resize(first.id, 42, 13);
    manager.input(first.id, "printf '\\nSIZE:'; stty size\r");
    await until(() => text(first).includes('SIZE:13 42'));
    expect(first.pid).toBe(pid); expect(second.pid).not.toBe(pid);
    expect(text(first)).not.toContain(`SECOND-${second.pid}`);
    // An inactive shell continues producing output.
    manager.input(second.id, "sleep 0.1; printf '\\nBACKGROUND-DONE\\n'\r");
    await until(() => text(second).includes('\nBACKGROUND-DONE\n'));
    expect(workspace.tab.focused).toBe(first.id);
    manager.input(first.id, 'exit 7\r'); await until(() => first.status === 'exited');
    expect(first.exitCode).toBe(7); expect(text(first)).toContain('SIZE:13 42');
    manager.restart(first.id); const restarted = manager.sessions.get(first.id)!;
    await until(() => restarted.status === 'running'); expect(restarted.pid).not.toBe(pid);
  } finally { await manager.shutdown(); }
  expect(manager.sessions.size).toBe(0);
}, 20000);

test('ANSI, Unicode, alternate screen, cursor visibility and bracketed paste', async () => {
  const manager = new SessionManager();
  try {
    const session = manager.create('vt', process.cwd(), '/bin/zsh', 80, 24);
    await until(() => session.status === 'running');
    const write = (data: string) => new Promise<void>(resolve => session.terminal.write(data, resolve));
    await write('\x1b[2J\x1b[H\x1b[31mRED\x1b[0m 界 é\x1b[?25l');
    expect(session.terminal.buffer.active.getLine(0)?.getCell(0)?.getFgColor()).toBe(1);
    expect(session.terminal.buffer.active.getLine(0)?.getCell(4)?.getWidth()).toBe(2);
    expect(session.cursorVisible).toBe(false);
    await write('\x1b[?1049h\x1b[HAlternate\x1b[?2004h');
    expect(session.terminal.buffer.active.type).toBe('alternate');
    expect(session.terminal.modes.bracketedPasteMode).toBe(true);
    await write('\x1b[?1049l\x1b[?25h');
    expect(session.terminal.buffer.active.type).toBe('normal');
    expect(session.cursorVisible).toBe(true);
    expect(text(session)).toContain('RED 界 é');
  } finally { await manager.shutdown(); }
}, 15000);

test('failed shell reports an error and shutdown terminates session processes', async () => {
  const manager = new SessionManager();
  const invalid = manager.create('invalid', process.cwd(), '/does/not/exist');
  const valid = manager.create('valid', process.cwd(), '/bin/zsh');
  await until(() => invalid.status === 'error' && valid.status === 'running');
  expect(invalid.error).toBeTruthy();
  const pid = valid.pid!;
  await manager.shutdown();
  await until(() => { try { process.kill(pid, 0); return false; } catch { return true; } });
}, 15000);

test('zsh history, completion, multiline paste, interruption, vim and top', async () => {
  const manager = new SessionManager();
  const session = manager.create('interactive', process.cwd(), '/bin/zsh', 90, 28);
  try {
    await until(() => session.status === 'running');
    manager.input(session.id, "printf '\\nHISTORY-%s\\n' $$\r");
    const marker = `HISTORY-${session.pid}`;
    await until(() => text(session).includes(marker));
    manager.input(session.id, '\x1b[A\r');
    await until(() => text(session).split(marker).length >= 3);
    manager.input(session.id, "printf '\\nCOMPLETE:'; ls /bin/zs");
    await Bun.sleep(80); manager.input(session.id, '\t'); await Bun.sleep(120); manager.input(session.id, '\r');
    await until(() => text(session).includes('COMPLETE:/bin/zsh'));
    await until(() => session.terminal.modes.bracketedPasteMode);
    manager.paste(session.id, "printf '\\nPASTE-A\\n'\nprintf 'PASTE-B\\n'");
    manager.input(session.id, '\r');
    await until(() => text(session).includes('\nPASTE-A\nPASTE-B\n'));
    manager.input(session.id, 'sleep 30\r'); await Bun.sleep(100);
    manager.input(session.id, '\x03');
    manager.input(session.id, "printf '\\nINTERRUPTED-%s\\n' $$\r");
    await until(() => text(session).includes(`INTERRUPTED-${session.pid}`));
    manager.input(session.id, "vim -u NONE -i NONE -n\r");
    await until(() => session.terminal.buffer.active.type === 'alternate');
    const pid = session.pid; manager.resize(session.id, 72, 18);
    manager.input(session.id, 'iQentrah vim test\x1b'); await Bun.sleep(100);
    expect(text(session)).toContain('Qentrah vim test');
    manager.input(session.id, ':q!\r');
    await until(() => session.terminal.buffer.active.type === 'normal');
    expect(session.pid).toBe(pid);
    manager.input(session.id, 'top -l 1 -n 1\r');
    await until(() => text(session).includes('Processes:'));
    expect(session.status).toBe('running');
  } catch (error) { console.error(text(session)); throw error; } finally { await manager.shutdown(); }
}, 20000);

test('high-volume output drains with bounded scrollback', async () => {
  const manager = new SessionManager();
  const session = manager.create('volume', process.cwd(), '/bin/zsh');
  try {
    await until(() => session.status === 'running');
    manager.input(session.id, "awk 'BEGIN {for (i=0;i<25000;i++) print \"bounded-output\"; print \"QENTRAH-DRAIN-DONE\"}'\r");
    await until(() => text(session).includes('\nQENTRAH-DRAIN-DONE\n'));
    expect(session.terminal.buffer.active.length).toBeLessThanOrEqual(5024);
    expect(session.status).toBe('running');
  } finally { await manager.shutdown(); }
}, 15000);

test('Qentrah zsh customization preserves startup files and has an opt-out', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const folder = mkdtempSync(join(tmpdir(), 'qentrah-zsh-test-'));
  for (const [name, letter] of [['.zshenv','A'],['.zprofile','B'],['.zshrc','C'],['.zlogin','D']]) {
    writeFileSync(join(folder, name!), `QENTRAH_DOTFILES_ORDER=\${QENTRAH_DOTFILES_ORDER}${letter}\n${name === '.zshrc' ? "PROMPT='ORIGINAL-PROMPT> '\n" : ''}`);
  }
  const originalDir = process.env.ZDOTDIR, originalStyle = process.env.QENTRAH_SHELL_STYLE;
  let manager: SessionManager | undefined;
  try {
    process.env.ZDOTDIR = folder;
    manager = new SessionManager();
    const session = manager.create('custom', process.cwd(), '/bin/zsh');
    await until(() => session.status === 'running' && session.terminal.modes.bracketedPasteMode);
    manager.input(session.id, "printf '\\nORDER:%s\\n' $QENTRAH_DOTFILES_ORDER; printf 'PLUGIN:%s\\n' $ZSH_HIGHLIGHT_VERSION\r");
    await until(() => text(session).includes('ORDER:ABCD'));
    expect(text(session)).toMatch(/PLUGIN:\d/);
    manager.input(session.id, "printf '\\nHISTORY:%s\\n' \"$HISTFILE\"\r");
    await until(() => text(session).replaceAll('\n', '').includes(`HISTORY:${join(folder, '.zsh_history')}`));
    expect(text(session).replaceAll('\n', '')).toContain(`HISTORY:${join(folder, '.zsh_history')}`);
    await manager.shutdown();
    process.env.QENTRAH_SHELL_STYLE = 'original'; manager = new SessionManager();
    const original = manager.create('original', process.cwd(), '/bin/zsh');
    await until(() => text(original).includes('ORIGINAL-PROMPT>'));
    manager.input(original.id, "printf '\\nORDER:%s\\n' $QENTRAH_DOTFILES_ORDER\r");
    await until(() => text(original).includes('ORDER:ABCD'));
  } finally {
    if (originalDir === undefined) delete process.env.ZDOTDIR; else process.env.ZDOTDIR = originalDir;
    if (originalStyle === undefined) delete process.env.QENTRAH_SHELL_STYLE; else process.env.QENTRAH_SHELL_STYLE = originalStyle;
    await manager?.shutdown(); rmSync(folder, { recursive: true, force: true });
  }
}, 15000);

test('wrong commands stay in the shell and invalid resize requests preserve the live process',async()=>{
 const manager=new SessionManager();try{const session=manager.create('errors',process.cwd(),'/bin/zsh');await until(()=>session.status==='running');const pid=session.pid;manager.input(session.id,'qh_this_command_does_not_exist_123\r');await until(()=>text(session).includes('command not found'));expect(session.status).toBe('running');expect(session.pid).toBe(pid);const cols=session.terminal.cols,rows=session.terminal.rows;manager.resize(session.id,NaN,20);manager.resize(session.id,80,Infinity);expect(session.terminal.cols).toBe(cols);expect(session.terminal.rows).toBe(rows);manager.resize(session.id,-1,0);expect(session.terminal.cols).toBe(2);expect(session.terminal.rows).toBe(1);manager.resize(session.id,81,22);manager.input(session.id,"printf '\\nRESIZE:'; stty size\r");await until(()=>text(session).includes('RESIZE:22 81'));expect(session.pid).toBe(pid);manager.setScrollback(100);expect(session.terminal.options.scrollback).toBe(100);}finally{await manager.shutdown();}
});
