import { expect, test } from 'bun:test';
import { createTestRenderer } from '@opentui/core/testing';
import { createRoot } from '@opentui/react';
import { SessionManager } from '../src/sessions';
import { Workspace } from '../src/workspace';
import { App } from '../src/ui/app';
import { until, text } from './support';
import { geometry } from '../src/layout';

// OpenTUI 0.6.1's mock drag emits lowercase SGR m (release). Real motion uses M.
async function drag(setup: Awaited<ReturnType<typeof createTestRenderer>>, x: number, y: number, endX: number, endY: number) {
  await setup.mockMouse.pressDown(x, y);
  setup.renderer.stdin.emit('data', Buffer.from(`\x1b[<32;${endX + 1};${endY + 1}M`));
  await Bun.sleep(30);
  await setup.mockMouse.release(endX, endY);
}


test('workspace renders real shell cells, routes controls and protects modal input', async () => {
  const setup = await createTestRenderer({ width: 100, height: 30, exitOnCtrlC: false, useKittyKeyboard: null, useMouse: true, enableMouseMovement: true });
  const manager = new SessionManager();
  const workspace = new Workspace(manager, process.cwd(), '/bin/zsh');
  let quit = false;
  try {
    createRoot(setup.renderer).render(<App workspace={workspace} onQuit={() => { quit = true; }} />);
    const session = manager.sessions.get(workspace.tab.focused)!;
    await until(() => session.status === 'running');
    await setup.flush();
    await setup.mockInput.typeText("printf '\\nUI-RENDER-OK\\n'"); setup.mockInput.pressEnter();
    await until(() => text(session).split('UI-RENDER-OK').length > 2);
    await setup.flush();
    expect(setup.captureCharFrame()).toContain('Qesh');
    expect(setup.captureCharFrame()).toContain('UI-RENDER-OK');
    await setup.mockInput.typeText('echo cursor');
    await until(() => text(session).includes('echo cursor'));
    await setup.flush();
    expect(setup.renderer.getCursorState().x).toBe(session.terminal.buffer.active.cursorX + 1);
    expect(setup.renderer.getCursorState().y).toBe(session.terminal.buffer.active.cursorY + 4);
    setup.mockInput.pressKey('u', { ctrl: true });

    // Ctrl+B c adds a tab; ordinary Tab/arrow input never changes tabs.
    setup.mockInput.pressKey('b', { ctrl: true }); setup.mockInput.pressKey('c');
    await setup.flush(); expect(workspace.tabs.length).toBe(2);
    setup.mockInput.pressTab(); setup.mockInput.pressArrow('left');
    await setup.flush(); expect(workspace.active).toBe(1);
    setup.mockInput.pressKey('b', { ctrl: true }); setup.mockInput.pressKey('%');
    await setup.flush(); expect(manager.sessions.size).toBe(3);
    const focusedId = workspace.tab.focused;
    await until(() => manager.sessions.get(focusedId)?.status === 'running');
    const pid = manager.sessions.get(focusedId)?.pid;
    setup.resize(30, 12); await setup.flush();
    expect(setup.captureCharFrame()).not.toContain('shell 1');
    setup.resize(100, 30); await setup.flush();
    expect(manager.sessions.get(focusedId)?.pid).toBe(pid);
    setup.mockInput.pressKey('b', { ctrl: true }); setup.mockInput.pressKey('?');
    await Bun.sleep(30); await setup.waitForFrame(frame => frame.includes('Keyboard help')); expect(setup.captureCharFrame()).toContain('Keyboard help');
    setup.mockInput.pressEscape(); await Bun.sleep(30); await setup.flush();
    setup.mockInput.pressKey('b', { ctrl: true }); setup.mockInput.pressKey('q');
    await Bun.sleep(30); await setup.waitForFrame(frame => frame.includes('Quit Qesh?')); expect(setup.captureCharFrame()).toContain('Quit Qesh?');
    setup.mockInput.pressEnter(); await Bun.sleep(30); await setup.flush(); expect(quit).toBe(false); // Cancel is the default.
    expect(workspace.tabs.length).toBe(2);
  } finally { setup.renderer.destroy(); await manager.shutdown(); }
}, 20000);


test('mouse pane focus, divider drag, rename and copying a selection', async () => {
  const setup = await createTestRenderer({ width: 100, height: 30, exitOnCtrlC: false, useKittyKeyboard: null, useMouse: true, enableMouseMovement: true });
  const manager = new SessionManager();
  const workspace = new Workspace(manager, process.cwd(), '/bin/zsh');
  let copied = '';
  try {
    createRoot(setup.renderer).render(<App workspace={workspace} onQuit={() => {}} clipboard={async value => { copied = value; }} />);
    await until(() => manager.sessions.get(workspace.tab.focused)?.status === 'running');
    await setup.flush(); workspace.split('horizontal');
    await until(() => manager.sessions.get(workspace.tab.focused)?.status === 'running');
    await Bun.sleep(30); await setup.flush();
    const bounds = { x: 0, y: 0, width: 100, height: 27 };
    const before = geometry(workspace.tab.tree, bounds, workspace.tab.focused);
    const divider = before.dividers[0]!;
    await drag(setup, divider.x, 5, divider.x + 6, 5);
    await Bun.sleep(30); await setup.flush();
    const after = geometry(workspace.tab.tree, bounds, workspace.tab.focused);
    expect(after.dividers[0]!.x).toBe(divider.x + 6);
    const [leftId, left] = [...after.panes][0]!;
    await setup.mockMouse.click(left.x + 2, 3);
    expect(workspace.tab.focused).toBe(leftId);
    const session = manager.sessions.get(leftId)!;
    await until(() => session.terminal.modes.bracketedPasteMode);
    await new Promise<void>(resolve => session.terminal.write('\x1b[2J\x1b[HSELECT-ME', resolve));
    await setup.flush();
    await drag(setup, left.x, 3, left.x + 8, 3);
    setup.mockInput.pressKey('b', { ctrl: true }); setup.mockInput.pressKey('y');
    await until(() => copied === 'SELECT-ME');
    setup.mockInput.pressKey('b', { ctrl: true }); setup.mockInput.pressKey('r');
    await Bun.sleep(30); await setup.flush();
    expect(setup.captureCharFrame()).toContain('Rename tab');
    expect(setup.renderer.getCursorState().visible).toBe(true);
    setup.mockInput.pressKey('a', { ctrl: true }); setup.mockInput.pressKey('k', { ctrl: true });
    await setup.mockInput.typeText('Named shell'); setup.mockInput.pressEnter();
    await Bun.sleep(30); await setup.flush(); expect(workspace.tab.name).toBe('Named shell');
  } finally {
    setup.renderer.destroy(); await manager.shutdown();
  }
}, 20000);

test('desktop terminal omits duplicate chrome and fills the available shell area', async () => {
  const original = process.env.QENTRAH_DESKTOP; process.env.QENTRAH_DESKTOP = '1';
  const setup = await createTestRenderer({width:100,height:25,exitOnCtrlC:false,useKittyKeyboard:null});
  const manager = new SessionManager(); const workspace = new Workspace(manager,process.cwd(),'/bin/zsh');
  try {
    createRoot(setup.renderer).render(<App workspace={workspace} onQuit={()=>{}} />);
    const session=manager.sessions.get(workspace.tab.focused)!;
    await until(()=>session.status==='running' && text(session).includes('❯'));await setup.flush();
    await setup.mockInput.typeText('echo clean');await until(()=>text(session).includes('echo clean'));await setup.flush();
    expect(setup.captureCharFrame()).not.toContain('Qesh');expect(setup.captureCharFrame()).not.toContain('Ctrl+B then:');
    expect(session.terminal.rows).toBe(25);expect(setup.renderer.getCursorState().y).toBe(session.terminal.buffer.active.cursorY+1);
  } finally { if(original===undefined)delete process.env.QENTRAH_DESKTOP;else process.env.QENTRAH_DESKTOP=original;setup.renderer.destroy();await manager.shutdown(); }
},15000);
