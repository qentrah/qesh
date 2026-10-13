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

test('wheel reaches mouse-enabled CLIs and alternate-screen pagers instead of disappearing',async()=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const folder=mkdtempSync(join(tmpdir(),'qh-wheel-')),script=join(folder,'mouse.cjs');
 writeFileSync(script,"process.stdin.setRawMode(true);process.stdin.resume();process.stdout.write('\\x1b[?1049h\\x1b[?1000h\\x1b[?1006hREADY');process.stdin.on('data',data=>{if(data[0]===3){process.stdout.write('\\x1b[?1049l\\x1b[?1000l\\x1b[?1006l');process.exit();}if(data.toString()==='P'){process.stdout.write('\\x1b[?1000l\\x1b[?1006l\\x1b[?1hPAGER');return;}if(data.toString()==='L'){process.stdout.write('\\x1b[?1000h\\x1b[?1006lLEGACY');return;}process.stdout.write('INPUT:'+data.toString('hex')+'\\r\\n');});");
 const setup=await createTestRenderer({width:100,height:30,exitOnCtrlC:false,useKittyKeyboard:null,useMouse:true,enableMouseMovement:true}),manager=new SessionManager(),workspace=new Workspace(manager,folder,'/bin/zsh');
 try{createRoot(setup.renderer).render(<App workspace={workspace} onQuit={()=>{}}/>);const session=manager.sessions.get(workspace.tab.focused)!;await until(()=>session.status==='running');manager.input(session.id,`node '${script}'\r`);await until(()=>session.terminal.modes.mouseTrackingMode==='vt200'&&text(session).includes('READY'));await setup.flush();await setup.mockMouse.scroll(2,4,'up');const wheel=Buffer.from('\x1b[<64;3;2M').toString('hex');await until(()=>text(session).includes('INPUT:'+wheel));expect(session.scroll).toBe(0);
 manager.input(session.id,'P');await until(()=>session.terminal.modes.mouseTrackingMode==='none'&&text(session).includes('PAGER'));await setup.mockMouse.scroll(2,4,'down');await until(()=>text(session).includes(Buffer.from('\x1bOB'.repeat(3)).toString('hex')));
 manager.input(session.id,'L');await until(()=>session.terminal.modes.mouseTrackingMode==='vt200'&&text(session).includes('LEGACY'));manager.wheel(session.id,'up',160,9);await until(()=>text(session).includes(Buffer.from([27,91,77,96,132,42]).toString('hex')));
 manager.input(session.id,'\x03');await until(()=>session.terminal.buffer.active.type==='normal'&&session.status==='running');expect(session.status).toBe('running');
 }finally{setup.renderer.destroy();await manager.shutdown();rmSync(folder,{recursive:true,force:true});}
},15000);

test('desktop actions target IDs across workspaces and ignore stale close/rename requests',async()=>{const setup=await createTestRenderer({width:100,height:30,exitOnCtrlC:false,useKittyKeyboard:null}),manager=new SessionManager(),workspace=new Workspace(manager,process.cwd(),'/bin/zsh');try{createRoot(setup.renderer).render(<App workspace={workspace} onQuit={()=>{}}/>);await setup.flush();const firstSpace=workspace.space.id,firstTab=workspace.tab.id,firstPane=workspace.tab.focused;workspace.newSpace('Code');workspace.newSpace('Code');expect(workspace.space.name).toBe('Code 2');const otherTab=workspace.tab.id,otherPane=workspace.tab.focused;await until(()=>[...manager.sessions.values()].every(session=>session.status==='running'));const pid=manager.sessions.get(otherPane)!.pid;workspace.emit('desktop-command',{action:'rename-tab',id:firstTab,name:'First'});expect(workspace.space.id).toBe(firstSpace);expect(workspace.tab.name).toBe('First');workspace.selectTab(otherTab);workspace.emit('desktop-command',{action:'split-right',id:firstPane});expect(workspace.space.id).toBe(firstSpace);expect(workspace.tab.tree.kind).toBe('split');workspace.selectTab(otherTab);workspace.emit('desktop-command',{action:'close-pane',id:firstPane,confirmed:true});expect(manager.sessions.has(firstPane)).toBe(false);expect(manager.sessions.get(otherPane)!.pid).toBe(pid);workspace.selectTab(otherTab);workspace.emit('desktop-command',{action:'close-tab',id:'missing',confirmed:true});workspace.emit('desktop-command',{action:'close-pane',id:'missing',confirmed:true});workspace.emit('desktop-command',{action:'rename-tab',id:'missing',name:'Wrong'});expect(workspace.tab.id).toBe(otherTab);expect(workspace.tab.name).not.toBe('Wrong');expect(manager.sessions.get(otherPane)!.status).toBe('running');}finally{setup.renderer.destroy();await manager.shutdown();}},15000);

test('desktop split resizing follows the current tab and rejects stale or invalid coordinates',async()=>{
 const original=process.env.QENTRAH_DESKTOP;process.env.QENTRAH_DESKTOP='1';const setup=await createTestRenderer({width:121,height:41,exitOnCtrlC:false,useKittyKeyboard:null}),manager=new SessionManager(),workspace=new Workspace(manager,process.cwd(),'/bin/zsh');try{
 createRoot(setup.renderer).render(<App workspace={workspace} onQuit={()=>{}}/>);await setup.flush();const first=workspace.tab;workspace.newTab();workspace.split('horizontal');const right=workspace.tab.focused;workspace.split('vertical');await until(()=>[...manager.sessions.values()].every(session=>session.status==='running'));await setup.flush();const pids=[...manager.sessions.values()].map(s=>s.pid),layout=geometry(workspace.tab.tree,{x:0,y:0,width:121,height:41},workspace.tab.focused),outer=layout.dividers.find(d=>d.axis==='horizontal')!,inner=layout.dividers.find(d=>d.axis==='vertical')!;
 workspace.emit('desktop-command',{action:'resize-split',id:outer.id,x:45,y:0});await setup.flush();workspace.emit('desktop-command',{action:'resize-split',id:inner.id,x:60,y:12});await setup.flush();const after=geometry(workspace.tab.tree,{x:0,y:0,width:121,height:41},right);expect(after.dividers.find(d=>d.id===outer.id)!.x).toBe(45);expect(after.dividers.find(d=>d.id===inner.id)!.y).toBe(12);expect(first.tree.kind).toBe('pane');const before=JSON.stringify(workspace.tab.tree);workspace.emit('desktop-command',{action:'resize-split',id:'missing',x:60,y:12});workspace.emit('desktop-command',{action:'resize-split',id:outer.id,x:NaN,y:12});expect(JSON.stringify(workspace.tab.tree)).toBe(before);expect([...manager.sessions.values()].map(s=>s.pid)).toEqual(pids);
 }finally{if(original===undefined)delete process.env.QENTRAH_DESKTOP;else process.env.QENTRAH_DESKTOP=original;setup.renderer.destroy();await manager.shutdown();}
},15000);
