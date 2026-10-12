import type { Session } from '../src/sessions';
export async function until(predicate: () => boolean, timeout = 7000) {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('Timed out waiting for shell state');
    await Bun.sleep(20);
  }
}
export function text(session: Session) {
  const b = session.terminal.buffer.active;
  return Array.from({ length: b.length }, (_, y) => b.getLine(y)?.translateToString(true) ?? '').join('\n');
}
