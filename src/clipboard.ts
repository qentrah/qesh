import { spawn } from 'node:child_process';
export function copyText(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const copy = spawn('pbcopy', [], { stdio: ['pipe', 'ignore', 'pipe'] });
    copy.on('error', () => reject(new Error('Clipboard unavailable: pbcopy could not start')));
    copy.stdin.on('error', () => reject(new Error('Clipboard write failed')));
    copy.on('exit', code => code === 0 ? resolve() : reject(new Error('Clipboard write failed')));
    copy.stdin.end(text);
  });
}
