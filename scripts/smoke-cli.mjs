import pty from 'node-pty';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const cli = process.env.QENTRAH_SMOKE_CLI || fileURLToPath(new URL('../bin/qesh', import.meta.url));
const terminal = pty.spawn(cli, [], { cwd: process.cwd(), cols: 120, rows: 30, name: 'xterm-256color', env: { ...process.env, TERM: 'xterm-256color' } });
let output = '', exit;
terminal.onData(data => { output = (output + data).slice(-500000); });
terminal.onExit(event => { exit = event; });
async function until(predicate, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('CLI smoke test timed out');
    await new Promise(resolve => setTimeout(resolve, 30));
  }
}
try {
  await until(() => output.includes('Ctrl+B'));
  terminal.write("printf '\\nCLI-READY-%s\\n' $$\r");
  await until(() => /CLI-READY-\d+/.test(output));
  assert.ok(output.includes('Qesh'));
  terminal.write('\x02q');
  await until(() => output.includes('Quit Qesh?'));
  terminal.write('\t'); await new Promise(resolve => setTimeout(resolve, 80)); terminal.write('\r');
  await until(() => exit !== undefined);
  assert.equal(exit.exitCode, 0);
  assert.ok(output.includes('\x1b[?1049l'), 'Must restore host alternate screen');
  console.log('CLI smoke passed: launch, real shell, quit confirmation, exit 0, host screen restored.');
} catch (error) {
  console.error(output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, ''));
  try { process.kill(-terminal.pid, 'SIGHUP'); } catch {}
  try { terminal.kill(); } catch {}
  throw error;
}
