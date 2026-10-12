import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { useKeyboard, usePaste, useTerminalDimensions } from '@opentui/react';
import { copyText } from '../clipboard';
import { basename, sep } from 'node:path';
import { homedir } from 'node:os';
import type { Workspace } from '../workspace';
import { geometry, leaves, minimum, nearestDivider, neighbor, setRatio, type Divider } from '../layout';
import { encodeKey, KEYMAP } from '../keys';
import { Tabs } from '../termcn/ui/tabs';
import { Dialog } from '../termcn/ui/dialog';
import { Help } from '../termcn/ui/help';
import { ThemeProvider } from '../termcn/providers/theme-provider';
import { colors, qentrahTheme } from './theme';
import './terminal-surface';

type Modal = { kind: 'confirm'; title: string; action: () => void } | { kind: 'rename' } | { kind: 'help' } | null;
export function App({ workspace, onQuit, clipboard = copyText }: { workspace: Workspace; onQuit: () => void; clipboard?: (text: string) => Promise<void> }) {
  const { width, height } = useTerminalDimensions();
  const [, update] = useReducer(n => n + 1, 0);
  const [modal, setModalState] = useState<Modal>(null), modalRef = useRef<Modal>(null);
  const [prefix, setPrefix] = useState(false), prefixRef = useRef(false);
  const [notice, setNotice] = useState(''), [rename, setRename] = useState('');
  const selections = useRef(new Map<string, string>());
  const draggingDivider = useRef<Divider | null>(null);
  const setModal = (value: Modal) => { modalRef.current = value; setModalState(value); };
  const setCommand = (value: boolean) => { prefixRef.current = value; setPrefix(value); };
  useSyncExternalStore(callback => { workspace.on('change', callback); return () => { workspace.off('change', callback); }; }, () => workspace.revision);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(timer); }, [notice]);
  const desktop = process.env.QENTRAH_DESKTOP === '1';
  const topChrome = desktop ? 0 : 2;
  const footerRows = desktop && !notice && !prefix ? 0 : 1;
  const home = homedir();
  const launchCwd = workspace.sessions.sessions.get(workspace.tabs[workspace.active]?.focused || '')?.cwd || workspace.cwd;
  const displayCwd = launchCwd === home ? '~' : launchCwd.startsWith(home + sep) ? '~' + launchCwd.slice(home.length) : launchCwd;
  const tab = workspace.tabs[workspace.active];
  const bounds = { x: 0, y: 0, width: Math.max(2, width), height: Math.max(2, height - topChrome - footerRows) };
  const layout = tab ? geometry(tab.tree, bounds, tab.focused) : null;
  const paneHeader = (id: string) => !desktop || (layout?.panes.size || 0) > 1 || workspace.sessions.sessions.get(id)?.status !== 'running' ? 1 : 0;
  useEffect(() => {
    if (!layout) return;
    for (const [id, rect] of layout.panes) workspace.sessions.resize(id, rect.width, Math.max(1, rect.height - paneHeader(id)));
  }, [width, height, tab?.tree, tab?.focused, workspace, workspace.revision, footerRows]);
  function confirm(title: string, ids: string[], action: () => void) {
    if (ids.some(id => ['running', 'starting'].includes(workspace.sessions.sessions.get(id)?.status ?? ''))) {
      setModal({ kind: 'confirm', title, action });
    } else action();
  }
  useEffect(() => {
    const command = (message: { action: string; id?: string; name?: string; group?: string; before?: string; edge?: string; cwd?: string }) => {
      if (modalRef.current) return;
      if (message.action === 'new-tab') workspace.newTab(message.cwd);
      else if (message.action === 'switch-tab' && message.id) workspace.selectTab(message.id);
      else if (message.action === 'rename-tab' && message.id && message.name) { workspace.selectTab(message.id); workspace.rename(message.name); }
      else if (message.action === 'close-tab' && message.id) { workspace.selectTab(message.id); confirm('Close tab?', leaves(workspace.tab.tree), closeTab); }
      else if (message.action === 'split-right') workspace.split('horizontal');
      else if (message.action === 'split-down') workspace.split('vertical');
      else if (message.action === 'help') setModal({kind:'help'});
      else if (message.action === 'new-group' && message.name) workspace.addGroup(message.name);
      else if (message.action === 'group-tab' && message.id) workspace.groupTab(message.id,message.group);
      else if (message.action === 'reorder-tab' && message.id && message.before) workspace.reorderTab(message.id,message.before);
      else if (message.action === 'dock-tab' && message.id && message.edge) workspace.dockTab(message.id,message.edge);
      else if (message.action === 'focus-pane' && message.id) workspace.focus(message.id);
      else if (message.action === 'dock-pane' && message.id && message.edge) workspace.dockPane(message.id,message.edge);
      else if (message.action === 'detach-pane' && message.id) workspace.detachPane(message.id);
    };
    workspace.on('desktop-command',command); return () => { workspace.off('desktop-command',command); };
  }, [workspace]);
  function closePane() { workspace.closePane(); if (!workspace.tabs.length) onQuit(); }
  function closeTab() { workspace.closeTab(); if (!workspace.tabs.length) onQuit(); }
  function resizeDivider(divider: Divider, x: number, y: number) {
    if (!tab || modalRef.current) return;
    const { parent, axis } = divider;
    const firstMin = minimumNode(divider.id, true), secondMin = minimumNode(divider.id, false);
    const size = (axis === 'horizontal' ? parent.width : parent.height) - 1;
    const distance = axis === 'horizontal' ? x - parent.x : y - parent.y;
    const low = axis === 'horizontal' ? firstMin.width : firstMin.height;
    const high = size - (axis === 'horizontal' ? secondMin.width : secondMin.height);
    tab.tree = setRatio(tab.tree, divider.id, Math.max(low, Math.min(high, distance)) / size);
    workspace.emit('change');
  }
  function minimumNode(id: string, first: boolean) {
    function find(tree: typeof workspace.tab.tree): ReturnType<typeof minimum> | undefined {
      if (tree.kind === 'pane') return;
      if (tree.id === id) return minimum(first ? tree.first : tree.second);
      return find(tree.first) ?? find(tree.second);
    }
    return find(workspace.tab.tree) ?? { width: 20, height: 5 };
  }
  function copySelection() {
    const text = selections.current.get(workspace.tab.focused);
    if (!text) { setNotice('Drag over shell text to select, then Ctrl+B y to copy'); return; }
    void clipboard(text).then(() => setNotice('Selection copied'), error => setNotice(error instanceof Error ? error.message : 'Clipboard write failed'));
  }
  usePaste(event => {
    if (modalRef.current || !workspace.tabs.length) return;
    event.preventDefault(); setCommand(false);
    workspace.sessions.paste(workspace.tab.focused, new TextDecoder().decode(event.bytes));
  });
  useKeyboard(key => {
    if (key.eventType === 'release') return;
    if (modalRef.current) {
      if (modalRef.current.kind === 'help') {
        if (['up', 'down', 'pageup', 'pagedown'].includes(key.name)) return;
        key.preventDefault(); if (key.name === 'escape' || key.name === 'q' || key.name === 'return') setModal(null);
      } else if (modalRef.current.kind === 'rename' && key.name === 'escape') { key.preventDefault(); setModal(null); }
      return; // Dialog/input consumes its keys; never forward modal input to a shell.
    }
    key.preventDefault();
    if (!workspace.tabs.length) return;
    const currentTab = workspace.tab, id = currentTab.focused, session = workspace.sessions.sessions.get(id);
    if (key.ctrl && key.name === 'b') {
      if (prefixRef.current) { setCommand(false); workspace.sessions.input(id, '\x02'); }
      else setCommand(true);
      return;
    }
    if (!prefixRef.current) { workspace.sessions.input(id, encodeKey(key, session?.terminal.modes.applicationCursorKeysMode)); return; }
    setCommand(false);
    const command = key.sequence || key.name;
    const currentLayout = geometry(currentTab.tree, bounds, id);
    if (key.name === 'escape') return;
    if (key.name === 'c') workspace.newTab();
    else if (key.name === 'n' || key.name === 'p') workspace.switchTab(workspace.active + (key.name === 'n' ? 1 : -1));
    else if (command === '%' || command === '"') {
      const axis = command === '%' ? 'horizontal' : 'vertical';
      const rect = currentLayout.panes.get(id)!;
      if (currentLayout.collapsed || (axis === 'horizontal' ? rect.width < 41 : rect.height < 11)) setNotice('Enlarge the terminal before splitting this pane');
      else workspace.split(axis);
    } else if (['left', 'right', 'up', 'down'].includes(key.name)) {
      if (!key.shift) {
        if (currentLayout.collapsed) {
          const ids = leaves(currentTab.tree), index = ids.indexOf(id);
          workspace.focus(ids[(index + (key.name === 'left' || key.name === 'up' ? ids.length - 1 : 1)) % ids.length]!);
        } else workspace.focus(neighbor(currentLayout.panes, id, key.name));
      } else {
        const axis = key.name === 'left' || key.name === 'right' ? 'horizontal' : 'vertical';
        const dividerId = nearestDivider(currentTab.tree, id, axis);
        const divider = currentLayout.dividers.find(d => d.id === dividerId);
        if (divider) resizeDivider(divider, divider.x + (key.name === 'left' ? -2 : key.name === 'right' ? 2 : 0), divider.y + (key.name === 'up' ? -1 : key.name === 'down' ? 1 : 0));
      }
    } else if (key.name === 'r') { setRename(currentTab.name); setModal({ kind: 'rename' }); }
    else if (key.name === 'x') confirm('Close this shell?', [id], closePane);
    else if (key.name === 'w') confirm('Close this tab and its shells?', leaves(currentTab.tree), closeTab);
    else if (key.name === 'q') confirm('Quit Qesh?', workspace.tabs.flatMap(t => leaves(t.tree)), onQuit);
    else if (key.name === 'pageup' || key.name === 'pagedown') { workspace.sessions.scroll(id, (key.name === 'pageup' ? 1 : -1) * Math.max(1, (session?.terminal.rows ?? 24) - 2)); update(); }
    else if (key.name === 'y') copySelection();
    else if (key.name === 'return' || key.name === 'enter') workspace.sessions.restart(id);
    else if (command === '?' || key.name === '?') setModal({ kind: 'help' });
    else setNotice(`Unknown workspace command. Ctrl+B ? opens help.`);
  });
  if (!tab || !layout) return <text>Closing Qesh…</text>;
  const paneEntries = [...layout.panes];
  const focusedSession = workspace.sessions.sessions.get(tab.focused);
  const modalWidth = Math.max(8, Math.min(width - 2, 68));
  return <ThemeProvider theme={qentrahTheme}>
    <box width={width} height={height} backgroundColor={colors.background} flexDirection="column" overflow="hidden" onMouse={event => {
      const divider = draggingDivider.current;
      if (!divider) return;
      if (event.type === 'drag' || event.type === 'drag-end') resizeDivider(divider, event.x, event.y - topChrome);
      if (event.type === 'up' || event.type === 'drag-end' || (event.type === 'down' && event.target?.id !== `divider-${divider.id}` && event.target?.parent?.id !== `divider-${divider.id}`)) draggingDivider.current = null;
    }}>
      {!desktop && <><box height={1} flexDirection="row" backgroundColor={colors.surface} overflow="hidden">
        <text fg={colors.foreground}><b>{' Qesh '}</b></text>
        <Tabs width={Math.max(1, width - 6)} tabs={workspace.tabs.map(t => ({ key: t.id, label: t.name }))} activeTab={tab.id} onTabChange={id => { if (!modalRef.current) workspace.switchTab(workspace.tabs.findIndex(t => t.id === id)); }} />
      </box>
      <text height={1} wrapMode="none" fg={colors.muted}>{` ${basename(focusedSession?.shell ?? workspace.shell)} · ${displayCwd}${layout.collapsed ? ' · Focused pane only — enlarge to restore splits' : ''}`}</text></>}
      <box height={bounds.height} width={width} position="relative" overflow="hidden">
        {paneEntries.map(([id, rect]) => {
          const session = workspace.sessions.sessions.get(id), active = tab.focused === id;
          const label = `${desktop ? '' : active ? '› ' : '  '}${basename(session?.shell ?? workspace.shell)}${session?.status === 'starting' ? ' · starting' : ''}${session?.status === 'exited' ? ` (${session.exitCode}) · Ctrl+B Enter restart` : session?.status === 'error' ? ` · ${session.error}` : ''}`;
          return <box key={id} position="absolute" left={rect.x} top={rect.y} width={rect.width} height={rect.height} flexDirection="column">
            {!!paneHeader(id) && <text height={1} wrapMode="none" bg={colors.background} fg={session?.status === 'error' ? colors.error : active ? colors.primary : colors.muted} onMouseDown={() => { if (!modalRef.current) workspace.focus(id); }}>{label}</text>}
            <terminal-surface manager={workspace.sessions} sessionId={id} active={active} obscured={!!modal} width={rect.width} height={Math.max(1, rect.height - paneHeader(id))} onActivate={() => workspace.focus(id)} onSelected={text => selections.current.set(id, text)} />
          </box>;
        })}
        {layout.dividers.map(divider => <box key={divider.id} id={`divider-${divider.id}`} position="absolute" left={divider.x} top={divider.y} width={divider.width} height={divider.height} backgroundColor={colors.background}
          onMouseDrag={event => resizeDivider(divider, event.x, event.y - topChrome)}
          onMouseDown={event => { draggingDivider.current = divider; resizeDivider(divider, event.x, event.y - topChrome); }}>
          <text fg={desktop ? colors.background : colors.border} wrapMode="none">{divider.axis === 'horizontal' ? Array.from({ length: divider.height }, () => '│').join('\n') : '─'.repeat(divider.width)}</text>
        </box>)}
      </box>
      {!!footerRows && <text height={1} wrapMode="none" bg={colors.surface} fg={prefix ? colors.primary : colors.muted}>
        {notice ? ` ${notice}` : prefix ? ' Command: c tab · % / " split · arrows focus · ? help · Esc cancel' : ` Ctrl+B then: c tab · % / " split · ? help${focusedSession?.scroll ? ` · History +${focusedSession.scroll}` : ''}`}
      </text>}
      {modal && <box position="absolute" top={Math.max(0, Math.floor((height - (modal.kind === 'help' ? 19 : 10)) / 2))} left={Math.max(0, Math.floor((width - modalWidth) / 2))} width={modalWidth} height={Math.min(height, modal.kind === 'help' ? 19 : modal.kind === 'rename' ? 6 : 10)} maxHeight={height} zIndex={20} backgroundColor={colors.surface} overflow="hidden">
        {modal.kind === 'confirm' && <Dialog key={modal.title} isOpen title={modal.title} variant="danger" confirmLabel="Close sessions" onCancel={() => setModal(null)} onConfirm={() => { const action = modal.action; setModal(null); action(); }}>
          <text fg={colors.foreground}>Running shells and their commands will end.</text>
          <text fg={colors.muted}>Tab selects an action · Enter accepts · Esc cancels</text>
        </Dialog>}
        {modal.kind === 'rename' && <box border borderStyle="rounded" borderColor={colors.primary} paddingX={1} flexDirection="column">
          <text fg={colors.primary}><b>Rename tab</b></text>
          <input focused value={rename} onInput={setRename} onSubmit={value => { workspace.rename(typeof value === 'string' ? value : rename); setModal(null); }} placeholder="Tab name" width="100%" />
          <text fg={colors.muted}>Enter saves · Esc cancels</text>
        </box>}
        {modal.kind === 'help' && <box flexDirection="column" padding={1}>
          <text fg={colors.primary}><b>Qesh · Keyboard help</b></text>
          <text fg={colors.muted}>Press Ctrl+B, release, then a command:</text>
          <scrollbox height={Math.max(1, Math.min(height - 5, 14))} scrollY focused>
            <Help keymap={KEYMAP} />
          </scrollbox>
          <text fg={colors.muted}>Drag text to select · wheel scrolls · Esc closes</text>
        </box>}
      </box>}
    </box>
  </ThemeProvider>;
}
