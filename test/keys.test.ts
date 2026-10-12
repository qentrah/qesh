import { expect, test } from 'bun:test';
import { encodeKey, type ShellKey } from '../src/keys';
const key = (name: string, overrides: Partial<ShellKey> = {}): ShellKey => ({ name, ctrl: false, shift: false, meta: false, option: false, source: 'raw', raw: name, sequence: name, ...overrides });
test('shell keys preserve controls, application arrows, modifiers, and text', () => {
  expect(encodeKey(key('c', { ctrl: true }))).toBe('\x03');
  expect(encodeKey(key('b', { ctrl: true }))).toBe('\x02');
  expect(encodeKey(key('up'), true)).toBe('\x1bOA');
  expect(encodeKey(key('left', { shift: true }))).toBe('\x1b[1;2D');
  expect(encodeKey(key('tab'))).toBe('\t');
  expect(encodeKey(key('backspace'))).toBe('\x7f');
  expect(encodeKey(key('é'))).toBe('é');
  expect(encodeKey(key('x', { meta: true }))).toBe('\x1bx');
});
