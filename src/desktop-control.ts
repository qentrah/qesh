import { createConnection } from 'node:net';
import { createInterface } from 'node:readline';
import type { Workspace } from './workspace';
export function attachDesktopControl(workspace: Workspace) {
  const path = process.env.QENTRAH_CONTROL_SOCKET; if (!path) return () => {};
  const socket = createConnection(path);
  const publish = () => { if (!socket.destroyed) socket.write(JSON.stringify({ type: 'state', active: workspace.tab?.id, groups: workspace.groups, tabs: workspace.tabs.map(tab => ({ id:tab.id,name:tab.name,group:tab.group,focused:tab.focused,panes:count(tab.tree),tree:tab.tree,sessions: ids(tab.tree).map(id => { const session=workspace.sessions.sessions.get(id); return {id,pid:session?.pid,status:session?.status}; }) })) })+'\n'); };
  function ids(tree: typeof workspace.tab.tree): string[] { return tree.kind === 'pane' ? [tree.id] : [...ids(tree.first),...ids(tree.second)]; }
  function count(tree: typeof workspace.tab.tree): number { return tree.kind === 'pane' ? 1 : count(tree.first)+count(tree.second); }
  socket.on('connect', publish); socket.on('error', () => {});
  workspace.on('change',publish);
  createInterface({input:socket}).on('line',line => { try { const command=JSON.parse(line); workspace.emit('desktop-command',command); } catch {} });
  return () => { workspace.off('change',publish); socket.destroy(); };
}
