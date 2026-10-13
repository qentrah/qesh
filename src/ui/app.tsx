import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { useKeyboard, usePaste, useTerminalDimensions } from '@opentui/react';
import { copyText } from '../clipboard';
import { basename, sep } from 'node:path';
import { homedir } from 'node:os';
import type { Workspace } from '../workspace';
import { geometry, type Divider } from '../layout';
import { WorkspaceInteractions, type WorkspaceCommand } from '../workspace-interactions';
import { encodeKey, KEYMAP } from '../keys';
import { Tabs } from '../termcn/ui/tabs';
import { Dialog } from '../termcn/ui/dialog';
import { Help } from '../termcn/ui/help';
import { ThemeProvider } from '../termcn/providers/theme-provider';
import { colors, qentrahTheme, applyTheme } from './theme';
import './terminal-surface';

type Modal = { kind: 'confirm'; title: string; action: () => void } | { kind: 'rename'; save: (name: string) => void } | { kind: 'help' } | null;
export function App({ workspace, onQuit, clipboard = copyText }: { workspace: Workspace; onQuit: () => void; clipboard?: (text: string) => Promise<void> }) {
  const { width, height } = useTerminalDimensions();
  const [, update] = useReducer(n => n + 1, 0);
  const [modal, setModalState] = useState<Modal>(null), modalRef = useRef<Modal>(null);
  const [prefix, setPrefix] = useState(false), prefixRef = useRef(false);
  const [hoverDivider,setHoverDivider]=useState('');
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
  useEffect(()=>{if(desktop)workspace.emit('desktop-layout',layout?{cols:width,rows:height,panes:[...layout.panes].map(([id,rect])=>({id,...rect})),dividers:layout.dividers,collapsed:layout.collapsed}:null);},[width,height,tab?.tree,tab?.focused,workspace.revision,footerRows]);
  const paneHeader = (id: string) => !desktop || (layout?.panes.size || 0) > 1 || workspace.sessions.sessions.get(id)?.status !== 'running' ? 1 : 0;
  useEffect(() => {
    if (!layout) return;
    for (const [id, rect] of layout.panes) workspace.sessions.resize(id, rect.width, Math.max(1, rect.height - paneHeader(id)));
  }, [width, height, tab?.tree, tab?.focused, workspace, workspace.revision, footerRows]);
  const callbacks = useRef({ bounds, onQuit, copy: () => copySelection() });
  callbacks.current = { bounds, onQuit, copy: () => copySelection() };
  const interactions = useMemo(() => new WorkspaceInteractions(workspace, {
    bounds: () => callbacks.current.bounds,
    isBlocked: () => !!modalRef.current,
    confirm: (title, action) => setModal({ kind: 'confirm', title, action }),
    rename: (name, save) => { setRename(name); setModal({ kind: 'rename', save }); },
    help: () => setModal({ kind: 'help' }),
    notice: setNotice,
    theme: theme => applyTheme(theme as typeof colors),
    quit: () => callbacks.current.onQuit(),
    copy: () => callbacks.current.copy(),
    redraw: update,
  }), [workspace]);
  useEffect(() => {
    const command = (message: WorkspaceCommand) => interactions.dispatch(message);
    workspace.on('desktop-command', command);
    return () => { workspace.off('desktop-command', command); interactions.dispose(); };
  }, [workspace, interactions]);
  function resizeDivider(divider: Divider, x: number, y: number) {
    interactions.dispatch({ action: 'resize-split', id: divider.id, x, y });
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
    interactions.prefix(key);
  });
  if (!tab || !layout) return <text>Closing QH…</text>;
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
        <text fg={colors.foreground}><b>{' QH '}</b></text>
        <Tabs width={Math.max(1, width - 6)} tabs={workspace.tabs.map(t => ({ key: t.id, label: t.name }))} activeTab={tab.id} onTabChange={id => { if (!modalRef.current) workspace.switchTab(workspace.tabs.findIndex(t => t.id === id)); }} />
      </box>
      <text height={1} wrapMode="none" fg={colors.muted}>{` ${basename(focusedSession?.shell ?? workspace.shell)} · ${displayCwd}${layout.collapsed ? ' · Focused pane only — enlarge to restore splits' : ''}`}</text></>}
      <box height={bounds.height} width={width} position="relative" overflow="hidden">
        {paneEntries.map(([id, rect]) => {
          const session = workspace.sessions.sessions.get(id), active = tab.focused === id;
          const label = `${desktop ? '' : active ? '› ' : '  '}${session?.label||basename(session?.shell ?? workspace.shell)+(desktop&&layout.panes.size>1?' '+([...layout.panes.keys()].indexOf(id)+1):'')}${session?.status === 'starting' ? ' · starting' : ''}${session?.status === 'exited' ? ` (${session.exitCode}) · Ctrl+B Enter restart` : session?.status === 'error' ? ` · ${session.error}` : ''}`;
          return <box key={id} position="absolute" left={rect.x} top={rect.y} width={rect.width} height={rect.height} flexDirection="column">
            {!!paneHeader(id) && <text height={1} wrapMode="none" bg={colors.background} fg={session?.status === 'error' ? colors.error : active ? colors.primary : colors.muted} onMouseDown={() => { if (!modalRef.current) workspace.focus(id); }}>{label}</text>}
            <terminal-surface manager={workspace.sessions} sessionId={id} active={active} obscured={!!modal} width={rect.width} height={Math.max(1, rect.height - paneHeader(id))} onActivate={() => workspace.focus(id)} onSelected={text => selections.current.set(id, text)} />
          </box>;
        })}
        {(!desktop?layout.dividers:[]).map(divider => <box key={divider.id} id={`divider-${divider.id}`} position="absolute" left={divider.x} top={divider.y} width={divider.width} height={divider.height} backgroundColor={colors.background}
          onMouseOver={()=>setHoverDivider(divider.id)} onMouseOut={()=>setHoverDivider('')}
          onMouseDrag={event => resizeDivider(divider, event.x, event.y - topChrome)}
          onMouseDown={event => { draggingDivider.current = divider; resizeDivider(divider, event.x, event.y - topChrome); }}>
          <text fg={desktop ? (hoverDivider===divider.id?colors.muted:colors.surface) : colors.border} wrapMode="none">{divider.axis === 'horizontal' ? Array.from({ length: divider.height }, () => '│').join('\n') : '─'.repeat(divider.width)}</text>
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
          <input focused value={rename} onInput={setRename} onSubmit={value => { const save = modal.save; setModal(null); save(typeof value === 'string' ? value : rename); }} placeholder="Tab name" width="100%" />
          <text fg={colors.muted}>Enter saves · Esc cancels</text>
        </box>}
        {modal.kind === 'help' && <box flexDirection="column" padding={1}>
          <text fg={colors.primary}><b>QH · Keyboard help</b></text>
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
