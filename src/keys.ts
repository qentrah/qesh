import type { KeyEvent } from '@opentui/core';
export type ShellKey = Pick<KeyEvent, 'name' | 'ctrl' | 'shift' | 'meta' | 'option' | 'raw' | 'sequence' | 'source'>;
export function encodeKey(key: ShellKey, applicationCursor = false): string {
  const arrow: Record<string, string> = { up: 'A', down: 'B', right: 'C', left: 'D', home: 'H', end: 'F' };
  if (arrow[key.name]) {
    const modifier = 1 + (key.shift ? 1 : 0) + (key.meta || key.option ? 2 : 0) + (key.ctrl ? 4 : 0);
    return modifier > 1 ? `\x1b[1;${modifier}${arrow[key.name]}` : `\x1b${applicationCursor ? 'O' : '['}${arrow[key.name]}`;
  }
  const special: Record<string, string> = {
    return: '\r', enter: '\r', linefeed: '\n', tab: key.shift ? '\x1b[Z' : '\t', backspace: '\x7f', escape: '\x1b',
    delete: '\x1b[3~', insert: '\x1b[2~', pageup: '\x1b[5~', pagedown: '\x1b[6~',
    f1: '\x1bOP', f2: '\x1bOQ', f3: '\x1bOR', f4: '\x1bOS', f5: '\x1b[15~', f6: '\x1b[17~',
    f7: '\x1b[18~', f8: '\x1b[19~', f9: '\x1b[20~', f10: '\x1b[21~', f11: '\x1b[23~', f12: '\x1b[24~',
  };
  let value = special[key.name];
  if (!value && key.ctrl) {
    const c = key.name === 'space' ? 0 : key.name.toUpperCase().charCodeAt(0) - 64;
    if (c >= 0 && c <= 31) value = String.fromCharCode(c);
  }
  if (!value) value = key.source === 'raw' ? key.raw || key.sequence : key.sequence;
  if (!value || (key.source === 'kitty' && /\x1b\[.*u$/.test(value))) {
    value = key.name.length === 1 ? (key.shift ? key.name.toUpperCase() : key.name) : key.name === 'space' ? ' ' : '';
  }
  return (key.meta || key.option) && !value.startsWith('\x1b') ? '\x1b' + value : value;
}
export const KEYMAP = {
  'c': 'New tab', 'n / p': 'Next / previous tab', '% / "': 'Split side-by-side / stacked',
  'Arrows': 'Focus pane', 'Shift + arrows': 'Resize pane', 'r': 'Rename tab', 'x / w': 'Close pane / tab',
  'Page Up / Down': 'Scroll history', 'y': 'Copy selection', 'Enter': 'Restart exited shell',
  'Ctrl+B': 'Send literal Ctrl+B', 'q': 'Quit workspace',
};
