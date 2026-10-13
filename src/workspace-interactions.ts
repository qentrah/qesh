import type { Workspace } from './workspace';
import {
  geometry,
  leaves,
  minimum,
  resizeJunction,
  nearestDivider,
  neighbor,
  setRatio,
  type Rect,
  type Tree,
} from './layout';

export interface WorkspaceCommand {
  action: string;
  id?: string;
  ids?: string[];
  name?: string;
  group?: string;
  before?: string;
  edge?: string;
  target?: string;
  x?: number;
  y?: number;
  cwd?: string;
  color?: string;
  confirmed?: boolean;
  config?: {
    scrollback: number;
    storage: { maxWorkspaces: number };
    theme: Record<string, string>;
  };
}
export interface InteractionView {
  bounds(): Rect;
  isBlocked(): boolean;
  confirm(title: string, accept: () => void): void;
  rename(name: string, save: (name: string) => void): void;
  help(): void;
  notice(text: string): void;
  theme(theme: Record<string, string>): void;
  quit(): void;
  copy(): void;
  redraw(): void;
}

// Owns interaction policy; the view presents effects and SessionManager owns shells.
export class WorkspaceInteractions {
  private pending = new Set<() => void>();
  constructor(
    private workspace: Workspace,
    private view: InteractionView,
  ) {}

  dispatch(message: WorkspaceCommand) {
    const workspace = this.workspace;
    if (message.action === 'configure' && message.config) {
      workspace.sessions.setScrollback(message.config.scrollback);
      workspace.maxWorkspaces = message.config.storage.maxWorkspaces;
      this.view.theme(message.config.theme);
      workspace.emit('change');
      return;
    }
    if (this.view.isBlocked() || !workspace.spaces.length) return;
    if (
      message.action === 'run-command' &&
      message.name &&
      /^[a-z][a-z0-9-]{0,39}$/.test(message.name)
    )
      this.runCommand(message.name);
    else if (message.action === 'new-workspace') workspace.newSpace(message.name);
    else if (message.action === 'switch-workspace' && message.id) workspace.selectSpace(message.id);
    else if (message.action === 'rename-workspace' && message.id && message.name)
      workspace.renameSpace(message.id, message.name);
    else if (message.action === 'color-workspace' && message.id)
      workspace.colorSpace(message.id, message.color || '');
    else if (message.action === 'color-tab' && message.id)
      workspace.colorTab(message.id, message.color || '');
    else if (message.action === 'rename-pane' && message.id && message.name) {
      const session = workspace.sessions.sessions.get(message.id);
      if (session) {
        session.label = message.name.slice(0, 40);
        workspace.emit('change');
      }
    } else if (message.action === 'close-workspace' && message.id) {
      const space = workspace.spaces.find((space) => space.id === message.id);
      if (space)
        this.confirm(
          'Close workspace?',
          space.tabs.flatMap((tab) => leaves(tab.tree)),
          () => {
            workspace.closeSpace(space.id);
            if (!workspace.spaces.length) this.view.quit();
          },
          message.confirmed,
        );
    } else if (message.action === 'new-tab') {
      if (message.id) {
        if (!workspace.spaces.some((space) => space.id === message.id)) return;
        workspace.selectSpace(message.id);
      }
      workspace.newTab(message.cwd);
    } else if (message.action === 'switch-tab' && message.id) workspace.selectTab(message.id);
    else if (message.action === 'rename-tab' && message.id && message.name) {
      if (!workspace.selectTab(message.id)) return;
      workspace.rename(message.name);
    } else if (message.action === 'close-tab' && message.id) {
      if (!workspace.selectTab(message.id)) return;
      this.confirm(
        'Close tab?',
        leaves(workspace.tab.tree),
        () => this.closeTab(message.id!),
        message.confirmed,
      );
    } else if (message.action === 'close-pane' && message.id) {
      if (!workspace.activatePane(message.id)) return;
      this.confirm(
        'Close this shell?',
        [message.id],
        () => this.closePane(message.id!),
        message.confirmed,
      );
    } else if (message.action === 'resize-junction' && message.ids && workspace.tab) {
      const current = workspace.tab;
      const next = resizeJunction(
        current.tree,
        this.view.bounds(),
        current.focused,
        message.ids,
        message.x!,
        message.y!,
      );
      if (next !== current.tree) {
        current.tree = next;
        workspace.emit('change');
      }
    } else if (
      message.action === 'resize-split' &&
      message.id &&
      Number.isFinite(message.x) &&
      Number.isFinite(message.y)
    ) {
      this.resizeDivider(message.id, message.x!, message.y!);
    } else if (message.action === 'equalize') workspace.equalize();
    else if (message.action === 'restart-pane' && message.id)
      workspace.sessions.restart(message.id);
    else if (message.action === 'split-right') {
      if (message.id && !workspace.activatePane(message.id)) return;
      workspace.split('horizontal');
    } else if (message.action === 'split-down') {
      if (message.id && !workspace.activatePane(message.id)) return;
      workspace.split('vertical');
    } else if (message.action === 'help') this.view.help();
    else if (message.action === 'rename-group' && message.group && message.name) {
      if (message.id) {
        if (!workspace.spaces.some((space) => space.id === message.id)) return;
        workspace.selectSpace(message.id);
      }
      workspace.renameGroup(message.group, message.name);
    } else if (message.action === 'new-group' && message.name) workspace.addGroup(message.name);
    else if (message.action === 'group-tab' && message.id)
      workspace.groupTab(message.id, message.group);
    else if (message.action === 'reorder-tab' && message.id && message.before)
      workspace.reorderTab(message.id, message.before);
    else if (message.action === 'dock-tab' && message.id && message.edge)
      workspace.dockTab(message.id, message.edge, message.target);
    else if (message.action === 'focus-pane' && message.id) workspace.activatePane(message.id);
    else if (message.action === 'dock-pane' && message.id && message.edge)
      workspace.dockPane(message.id, message.edge, message.target);
    else if (message.action === 'detach-pane' && message.id) workspace.detachPane(message.id);
  }

  prefix(key: { name: string; sequence?: string; shift?: boolean }) {
    const workspace = this.workspace;
    if (this.view.isBlocked() || !workspace.tab) return;
    const currentTab = workspace.tab,
      id = currentTab.focused,
      session = workspace.sessions.sessions.get(id);
    const command = key.sequence || key.name;
    const currentLayout = geometry(currentTab.tree, this.view.bounds(), id);
    if (key.name === 'escape') return;
    if (key.name === 'c') workspace.newTab();
    else if (key.name === 'n' || key.name === 'p')
      workspace.switchTab(workspace.active + (key.name === 'n' ? 1 : -1));
    else if (command === '%' || command === '"') {
      const axis = command === '%' ? 'horizontal' : 'vertical';
      const rect = currentLayout.panes.get(id)!;
      if (currentLayout.collapsed || (axis === 'horizontal' ? rect.width < 41 : rect.height < 11))
        this.view.notice('Enlarge the terminal before splitting this pane');
      else workspace.split(axis);
    } else if (['left', 'right', 'up', 'down'].includes(key.name)) {
      if (!key.shift) {
        if (currentLayout.collapsed) {
          const ids = leaves(currentTab.tree),
            index = ids.indexOf(id);
          workspace.focus(
            ids[
              (index + (key.name === 'left' || key.name === 'up' ? ids.length - 1 : 1)) % ids.length
            ]!,
          );
        } else workspace.focus(neighbor(currentLayout.panes, id, key.name));
      } else {
        const axis = key.name === 'left' || key.name === 'right' ? 'horizontal' : 'vertical';
        const dividerId = nearestDivider(currentTab.tree, id, axis);
        const divider = currentLayout.dividers.find((d) => d.id === dividerId);
        if (divider)
          this.resizeDivider(
            divider.id,
            divider.x + (key.name === 'left' ? -2 : key.name === 'right' ? 2 : 0),
            divider.y + (key.name === 'up' ? -1 : key.name === 'down' ? 1 : 0),
          );
      }
    } else if (key.name === 'r') {
      const target = currentTab.id;
      this.view.rename(currentTab.name, (name) => {
        if (workspace.selectTab(target)) workspace.rename(name);
      });
    } else if (key.name === 'x') this.confirm('Close this shell?', [id], () => this.closePane(id));
    else if (key.name === 'w')
      this.confirm('Close this tab and its shells?', leaves(currentTab.tree), () =>
        this.closeTab(currentTab.id),
      );
    else if (key.name === 'q')
      this.confirm(
        'Quit QH?',
        workspace.spaces.flatMap((space) => space.tabs.flatMap((t) => leaves(t.tree))),
        this.view.quit,
      );
    else if (key.name === 'pageup' || key.name === 'pagedown') {
      workspace.sessions.scroll(
        id,
        (key.name === 'pageup' ? 1 : -1) * Math.max(1, (session?.terminal.rows ?? 24) - 2),
      );
      this.view.redraw();
    } else if (key.name === 'y') this.view.copy();
    else if (key.name === 'return' || key.name === 'enter') workspace.sessions.restart(id);
    else if (command === '?' || key.name === '?') this.view.help();
    else this.view.notice(`Unknown workspace command. Ctrl+B ? opens help.`);
  }

  private confirm(title: string, ids: string[], action: () => void, confirmed = false) {
    if (
      !confirmed &&
      ids.some((id) =>
        ['running', 'starting'].includes(this.workspace.sessions.sessions.get(id)?.status ?? ''),
      )
    ) {
      this.view.confirm(title, action);
    } else action();
  }

  private closePane(id: string) {
    if (!this.workspace.activatePane(id)) return;
    this.workspace.closePane();
    this.finishClose();
  }

  private closeTab(id: string) {
    if (!this.workspace.selectTab(id)) return;
    this.workspace.closeTab();
    this.finishClose();
  }

  private finishClose() {
    if (!this.workspace.tabs.length) this.workspace.closeSpace(this.workspace.space.id);
    if (!this.workspace.spaces.length) this.view.quit();
  }

  private resizeDivider(id: string, x: number, y: number) {
    const tab = this.workspace.tab;
    if (!tab || this.view.isBlocked() || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const divider = geometry(tab.tree, this.view.bounds(), tab.focused).dividers.find(
      (d) => d.id === id,
    );
    if (!divider) return;
    function find(tree: Tree): Extract<Tree, { kind: 'split' }> | undefined {
      if (tree.kind === 'pane') return;
      return tree.id === id ? tree : (find(tree.first) ?? find(tree.second));
    }
    const node = find(tab.tree)!;
    const first = minimum(node.first),
      second = minimum(node.second);
    const horizontal = divider.axis === 'horizontal';
    const size = (horizontal ? divider.parent.width : divider.parent.height) - 1;
    const distance = horizontal ? x - divider.parent.x : y - divider.parent.y;
    const low = horizontal ? first.width : first.height;
    const high = size - (horizontal ? second.width : second.height);
    tab.tree = setRatio(tab.tree, id, Math.max(low, Math.min(high, distance)) / size);
    this.workspace.emit('change');
  }

  private runCommand(name: string) {
    const sessions = this.workspace.sessions;
    this.workspace.newTab();
    const id = this.workspace.tab.focused;
    this.workspace.rename(name);
    const ready = () => {
      const session = sessions.sessions.get(id);
      if (!session || session.status === 'error' || session.status === 'exited') {
        cancel();
        return;
      }
      if (session.status === 'running') {
        cancel();
        sessions.input(id, `qh ${name}\r`);
      }
    };
    const cancel = () => {
      sessions.off('change', ready);
      this.pending.delete(cancel);
    };
    this.pending.add(cancel);
    sessions.on('change', ready);
    ready();
  }

  // Releasing an interaction adapter never shuts down its shells.
  dispose() {
    for (const cancel of this.pending) cancel();
  }
}
