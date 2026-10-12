import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { SessionManager } from './sessions';
import { Workspace } from './workspace';
import { Startup } from './ui/startup';
import { App } from './ui/app';
import { attachDesktopControl } from './desktop-control';
import { colors } from './ui/theme';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Qesh\n\nUsage: qesh [--help] (aliases: q-terminal, qentrah-terminal)\n\nStarts shells in the current folder. Ctrl+B then ? opens keyboard help.\nRequires macOS, Bun, and Node.js. Uses $SHELL, falling back to /bin/zsh.');
  process.exit(0);
}
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Qesh needs an interactive terminal. Run it directly in Terminal, iTerm2, or another terminal emulator.');
  process.exit(1);
}
const sessions = new SessionManager();
let renderer: Awaited<ReturnType<typeof createCliRenderer>> | undefined;
let quitting = false;
let detachControl = () => {};
async function quit(code = 0, error?: unknown) {
  if (quitting) return;
  quitting = true;
  detachControl();
  renderer?.destroy();
  await Promise.allSettled([sessions.shutdown(), renderer?.closed ?? Promise.resolve()]);
  if (error) console.error('Qesh:', error instanceof Error ? error.message : error);
  process.exit(code);
}
process.on('SIGINT', () => void quit());
process.on('SIGTERM', () => void quit());
process.on('SIGHUP', () => void quit());
process.on('uncaughtException', error => void quit(1, error));
process.on('unhandledRejection', error => void quit(1, error));
try {
  const workspace = new Workspace(sessions, process.cwd(), process.env.SHELL || '/bin/zsh');
  detachControl = attachDesktopControl(workspace);
  renderer = await createCliRenderer({ exitOnCtrlC: false, exitSignals: [], screenMode: 'alternate-screen', consoleMode: 'disabled', backgroundColor: colors.background, targetFps: 30, maxFps: 30, useMouse: true, enableMouseMovement: true, useKittyKeyboard: null, openConsoleOnError: false });
  renderer.on('render:error', ({ error }) => void quit(1, error));
  renderer.on('handler:error', ({ error }) => void quit(1, error));
  createRoot(renderer).render(<Startup><App workspace={workspace} onQuit={() => void quit()} /></Startup>);
} catch (error) { await quit(1, error); }
