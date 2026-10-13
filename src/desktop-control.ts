import { createConnection } from 'node:net';
import { createInterface } from 'node:readline';
import type { Workspace } from './workspace';
export function attachDesktopControl(workspace: Workspace) {
  const path = process.env.QENTRAH_CONTROL_SOCKET; if (!path) return () => {};
  const socket = createConnection(path);
  const publish = () => { if (!socket.destroyed) socket.write(JSON.stringify({ type: 'state', active: workspace.tab?.id, groups: workspace.groups, workspace:workspace.space?.id,workspaces:workspace.spaces.map(space=>({id:space.id,name:space.name,color:space.color,tabs:space.tabs.length,active:space.tabs[space.active]?.id,groups:space.groups,items:space.tabs.map(tab=>({id:tab.id,name:tab.name,color:tab.color,group:tab.group,focused:tab.focused,tree:tab.tree,sessions:ids(tab.tree).map(id=>{const session=workspace.sessions.sessions.get(id);return {id,pid:session?.pid,status:session?.status,cwd:session?.cwd,title:session?.title,label:session?.label,process:session?.process};})})),sessions:space.tabs.reduce((count,tab)=>count+ids(tab.tree).length,0)})), tabs: workspace.tabs.map(tab => ({ id:tab.id,name:tab.name,group:tab.group,color:tab.color,focused:tab.focused,panes:count(tab.tree),tree:tab.tree,sessions: ids(tab.tree).map(id => { const session=workspace.sessions.sessions.get(id); return {id,pid:session?.pid,status:session?.status,cwd:session?.cwd,title:session?.title,label:session?.label,process:session?.process}; }) })) })+'\n'); };
  function ids(tree: typeof workspace.tab.tree): string[] { return tree.kind === 'pane' ? [tree.id] : [...ids(tree.first),...ids(tree.second)]; }
  function count(tree: typeof workspace.tab.tree): number { return tree.kind === 'pane' ? 1 : count(tree.first)+count(tree.second); }
  socket.on('connect', publish); socket.on('error', () => {});
  workspace.on('change',publish);
  const notice=(text:string)=>{if(!socket.destroyed)socket.write(JSON.stringify({type:'notice',message:text})+'\n');};workspace.on('notice',notice);
  const pending:unknown[]=[];
  const ready=(event:string)=>{if(event==='desktop-command')queueMicrotask(()=>{for(const command of pending.splice(0))workspace.emit('desktop-command',command);});};
  workspace.on('newListener',ready);
  createInterface({input:socket}).on('line',line => { try { const command=JSON.parse(line);if(workspace.listenerCount('desktop-command'))workspace.emit('desktop-command',command);else if(pending.length<100)pending.push(command); } catch {} });
  return () => { workspace.off('change',publish);workspace.off('notice',notice);workspace.off('newListener',ready); socket.destroy(); };
}
