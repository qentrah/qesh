import { createTestRenderer } from '@opentui/core/testing';
import { createRoot } from '@opentui/react';
import { SessionManager } from '../src/sessions';
import { Workspace } from '../src/workspace';
import { Startup } from '../src/ui/startup';
import { App } from '../src/ui/app';
const manager = new SessionManager();
const workspace = new Workspace(manager, '/tmp', '/bin/zsh');
const ui = await createTestRenderer({ width: 120, height: 30, exitOnCtrlC: false });
try {
  createRoot(ui.renderer).render(process.argv.includes('--startup') ? <Startup duration={10000}><App workspace={workspace} onQuit={() => {}} /></Startup> : <App workspace={workspace} onQuit={() => {}} />);
  workspace.rename('Development');
  workspace.newTab(); workspace.rename('Server'); workspace.switchTab(0); workspace.split('horizontal');
  await Bun.sleep(1200); await ui.flush();
  const ids = [...manager.sessions.keys()];
  manager.input(ids[0]!, "PS1='%~ % '; clear; printf '\\033[36mQH\\033[0m\\n\\n'; printf 'Project: QH\\n\\n'; printf 'README.md   src/   desktop/   test/\\n'\r");
  manager.input(workspace.tab.focused, "PS1='%~ % '; clear; printf '\\033[36mIndependent shell session\\033[0m\\n\\n'; printf 'Shell PID: %s\\n' $$; printf 'Pane size: '; stty size; printf '\\nReady to build.\\n'\r");
  await Bun.sleep(500);
  manager.input(ids[0]!, 'printf "%s\\n" "Hello, Qentrah"');
  await Bun.sleep(100); await ui.flush();
  await Bun.write(process.argv[2] ?? 'preview.json', JSON.stringify(ui.captureSpans(), null, 2));
  console.log(ui.captureCharFrame());
} finally { ui.renderer.destroy(); await manager.shutdown(); }
