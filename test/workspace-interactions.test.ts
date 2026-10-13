import { expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { Workspace } from '../src/workspace';
import { WorkspaceInteractions, type InteractionView } from '../src/workspace-interactions';
import { geometry, leaves } from '../src/layout';
import type { SessionManager } from '../src/sessions';

function fixture() {
  const sessions = Object.assign(new EventEmitter(), {
    sessions: new Map(),
  }) as unknown as SessionManager;
  let status = 'running',
    blocked = false,
    quits = 0,
    scrollback = 0;
  let accept: () => void = () => {},
    save: (name: string) => void = () => {};
  const writes: string[] = [],
    notices: string[] = [];
  let bounds = { x: 0, y: 0, width: 100, height: 30 };
  sessions.create = ((id: string, cwd: string) => {
    const session = {
      cwd,
      status,
      pid: Number(id) + 100,
      terminal: { rows: 30 },
    };
    sessions.sessions.set(id, session as any);
    return session;
  }) as any;
  sessions.close = (id) => {
    sessions.sessions.delete(id);
    sessions.emit('change');
  };
  sessions.input = (id, text) => {
    writes.push(`${id}:${text}`);
  };
  sessions.setScrollback = (value) => {
    scrollback = value;
  };
  const workspace = new Workspace(sessions, '/tmp', '/bin/zsh');
  const view: InteractionView = {
    bounds: () => bounds,
    isBlocked: () => blocked,
    confirm: (_title, action) => {
      blocked = true;
      accept = action;
    },
    rename: (_name, action) => {
      blocked = true;
      save = action;
    },
    help: () => {
      blocked = true;
    },
    notice: (text) => notices.push(text),
    theme: () => {},
    quit: () => {
      quits++;
    },
    copy: () => {},
    redraw: () => {},
  };
  const interactions = new WorkspaceInteractions(workspace, view);
  return {
    sessions,
    workspace,
    interactions,
    writes,
    notices,
    status: (value: string) => {
      status = value;
    },
    bounds: (width: number) => {
      bounds = { ...bounds, width };
    },
    accept: () => {
      blocked = false;
      accept();
    },
    save: (name: string) => {
      blocked = false;
      save(name);
    },
    get quits() {
      return quits;
    },
    get scrollback() {
      return scrollback;
    },
  };
}

test('delayed closes retain their pane target and remove only its empty workspace', () => {
  const f = fixture(),
    target = f.workspace.tab.focused;
  f.interactions.prefix({ name: 'x' });
  f.workspace.newSpace('Other');
  const other = f.workspace.tab.focused;
  f.accept();
  expect(f.sessions.sessions.has(target)).toBe(false);
  expect(f.sessions.sessions.has(other)).toBe(true);
  expect(f.workspace.spaces).toHaveLength(1);
  expect(f.quits).toBe(0);
  f.interactions.dispatch({
    action: 'close-tab',
    id: f.workspace.tab.id,
    confirmed: true,
  });
  expect(f.quits).toBe(1);
});

test('rename retains its tab and stale confirmations do not close a replacement', () => {
  const f = fixture(),
    original = f.workspace.tab;
  f.interactions.prefix({ name: 'r' });
  f.workspace.newTab();
  const other = f.workspace.tab;
  f.save('Original');
  expect(original.name).toBe('Original');
  expect(other.name).not.toBe('Original');
  f.interactions.dispatch({ action: 'close-tab', id: original.id });
  f.workspace.closeTab();
  f.workspace.selectTab(other.id);
  f.accept();
  expect(f.workspace.tab.id).toBe(other.id);
  expect(f.sessions.sessions.size).toBe(1);
});

test('configuration applies while dialogs block workspace commands', () => {
  const f = fixture();
  f.interactions.dispatch({ action: 'help' });
  f.interactions.dispatch({ action: 'new-tab' });
  expect(f.workspace.tabs).toHaveLength(1);
  f.interactions.dispatch({
    action: 'configure',
    config: { scrollback: 700, storage: { maxWorkspaces: 2 }, theme: {} },
  });
  expect(f.scrollback).toBe(700);
  expect(f.workspace.maxWorkspaces).toBe(2);
});

test('resize uses current geometry and stale dividers cannot mutate another tab', () => {
  const f = fixture();
  f.workspace.split('horizontal');
  const first = f.workspace.tab;
  const divider = geometry(first.tree, { x: 0, y: 0, width: 100, height: 30 }, first.focused)
    .dividers[0]!;
  f.bounds(200);
  f.interactions.dispatch({
    action: 'resize-split',
    id: divider.id,
    x: 150,
    y: 0,
  });
  expect(first.tree.kind === 'split' && first.tree.ratio).toBeCloseTo(150 / 199);
  f.workspace.newTab();
  const tree = f.workspace.tab.tree;
  f.interactions.dispatch({
    action: 'resize-split',
    id: divider.id,
    x: 10,
    y: 0,
  });
  expect(f.workspace.tab.tree).toBe(tree);
});

test('named commands wait once and dispose releases pending listeners without closing shells', () => {
  const f = fixture();
  f.status('starting');
  const baseline = f.sessions.listenerCount('change');
  f.interactions.dispatch({ action: 'run-command', name: 'doctor' });
  const id = f.workspace.tab.focused;
  expect(f.writes).toEqual([]);
  f.sessions.sessions.get(id)!.status = 'running';
  f.sessions.emit('change');
  f.sessions.emit('change');
  expect(f.writes).toEqual([`${id}:qh doctor\r`]);
  expect(f.sessions.listenerCount('change')).toBe(baseline);
  f.interactions.dispatch({ action: 'run-command', name: 'settings' });
  const owners = [...f.sessions.sessions.keys()];
  f.interactions.dispose();
  expect(f.sessions.listenerCount('change')).toBe(baseline);
  expect([...f.sessions.sessions.keys()]).toEqual(owners);
  f.sessions.sessions.get(f.workspace.tab.focused)!.status = 'running';
  f.sessions.emit('change');
  expect(f.writes).toHaveLength(1);
});

test('failed command shells stop waiting; invalid command names create no shells', () => {
  const f = fixture();
  f.status('starting');
  const baseline = f.sessions.listenerCount('change');
  f.interactions.dispatch({ action: 'run-command', name: 'doctor' });
  f.sessions.sessions.get(f.workspace.tab.focused)!.status = 'error';
  f.sessions.emit('change');
  expect(f.sessions.listenerCount('change')).toBe(baseline);
  expect(f.writes).toEqual([]);
  const count = f.sessions.sessions.size;
  f.interactions.dispatch({ action: 'run-command', name: 'doctor; exit' });
  expect(f.sessions.sessions.size).toBe(count);
});

test('prefix split respects minimum size and collapsed focus preserves shell owners', () => {
  const f = fixture();
  f.bounds(30);
  f.interactions.prefix({ name: '%', sequence: '%' });
  expect(f.sessions.sessions.size).toBe(1);
  expect(f.notices).toHaveLength(1);
  f.interactions.dispatch({ action: 'split-right' });
  const owners = [...f.sessions.sessions.values()].map((s) => s.pid);
  const ids = leaves(f.workspace.tab.tree);
  f.interactions.prefix({ name: 'right' });
  expect(f.workspace.tab.focused).toBe(ids[0]!);
  expect([...f.sessions.sessions.values()].map((s) => s.pid)).toEqual(owners);
});
