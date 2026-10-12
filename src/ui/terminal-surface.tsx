import { Renderable, RGBA, TextAttributes, type RenderableOptions, type RenderContext, type OptimizedBuffer, type MouseEvent } from '@opentui/core';
import { extend } from '@opentui/react';
import type { IBufferCell } from '@xterm/headless';
import type { SessionManager } from '../sessions';
import { colors, ansiPalette } from './theme';

interface Options extends RenderableOptions {
  manager: SessionManager; sessionId: string; active: boolean; obscured: boolean;
  onActivate: () => void; onSelected: (text: string) => void;
}
type Point = { x: number; y: number };
const fgDefault = RGBA.fromHex(colors.foreground), bgDefault = RGBA.fromHex(colors.background);
const selectionBg = RGBA.fromHex(colors.selection);
const palette = new Map<string, RGBA>();
function color(cell: IBufferCell, foreground: boolean): RGBA {
  const n = foreground ? cell.getFgColor() : cell.getBgColor();
  const rgb = foreground ? cell.isFgRGB() : cell.isBgRGB();
  const indexed = foreground ? cell.isFgPalette() : cell.isBgPalette();
  if (!rgb && !indexed) return foreground ? fgDefault : bgDefault;
  const key = `${rgb ? 'r' : 'p'}${n}`;
  let result = palette.get(key);
  if (!result) { result = rgb ? RGBA.fromInts((n >> 16) & 255, (n >> 8) & 255, n & 255) : n < ansiPalette.length ? RGBA.fromHex(ansiPalette[n]!) : RGBA.fromIndex(n); palette.set(key, result); }
  return result;
}
export class TerminalSurface extends Renderable {
  private manager: SessionManager; private sessionId: string;
  private _active: boolean; private _obscured: boolean;
  private activate: () => void; private selected: (text: string) => void;
  private anchor?: Point; private end?: Point; private selectionBase = 0;
  private output = (id: string) => { if (id === this.sessionId) this.requestRender(); };
  constructor(ctx: RenderContext, options: Options) {
    super(ctx, { ...options, buffered: false });
    this.manager = options.manager; this.sessionId = options.sessionId;
    this._active = options.active; this._obscured = options.obscured;
    this.activate = options.onActivate; this.selected = options.onSelected;
    this.manager.on('output', this.output);
    this.onMouseDown = event => this.mouseDown(event);
    this.onMouseDrag = event => this.mouseDrag(event);
    this.onMouseUp = () => this.finishSelection();
    this.onMouseDragEnd = () => this.finishSelection();
    this.onMouseScroll = event => {
      if (this._obscured) return;
      this.manager.scroll(this.sessionId, event.scroll?.direction === 'up' ? 3 : -3);
      this.anchor = this.end = undefined; this.selected('');
    };
  }
  set active(value: boolean) { this._active = value; this.requestRender(); }
  get active() { return this._active; }
  set obscured(value: boolean) { this._obscured = value; this.requestRender(); }
  get obscured() { return this._obscured; }
  private point(event: MouseEvent): Point {
    return { x: Math.max(0, Math.min(this.width - 1, event.x - this.screenX)), y: Math.max(0, Math.min(this.height - 1, event.y - this.screenY)) };
  }
  private mouseDown(event: MouseEvent) {
    if (this._obscured || event.button !== 0) return;
    this.activate(); this.anchor = this.end = this.point(event);
    const session = this.manager.sessions.get(this.sessionId);
    this.selectionBase = Math.max(0, (session?.terminal.buffer.active.baseY ?? 0) - (session?.scroll ?? 0));
    this.selected(''); this.requestRender();
  }
  private mouseDrag(event: MouseEvent) {
    if (this._obscured || !this.anchor) return;
    this.end = this.point(event); this.requestRender();
  }
  private finishSelection() { if (this.anchor && this.end) this.selected(this.getSelectedText()); }
  private selectionRange() {
    if (!this.anchor || !this.end) return;
    const a = this.anchor.y * this.width + this.anchor.x, b = this.end.y * this.width + this.end.x;
    return [Math.min(a, b), Math.max(a, b)];
  }
  getSelectedText() {
    const range = this.selectionRange(), session = this.manager.sessions.get(this.sessionId);
    if (!range || !session || range[0] === range[1]) return '';
    const lines: string[] = [];
    const startRow = Math.floor(range[0] / this.width), endRow = Math.floor(range[1] / this.width);
    for (let y = startRow; y <= endRow; y++) {
      const line = session.terminal.buffer.active.getLine(this.selectionBase + y);
      const text = line?.translateToString(true, y === startRow ? range[0] % this.width : 0, y === endRow ? range[1] % this.width + 1 : this.width) ?? '';
      // Wrapped terminal lines belong to the same logical line.
      if (y > startRow && line?.isWrapped) lines[lines.length - 1] += text;
      else lines.push(text);
    }
    return lines.join('\n');
  }
  protected renderSelf(buffer: OptimizedBuffer) {
    const session = this.manager.sessions.get(this.sessionId); if (!session) return;
    const term = session.terminal, activeBuffer = term.buffer.active;
    const base = Math.max(0, activeBuffer.baseY - Math.min(session.scroll, activeBuffer.baseY));
    const range = this.selectionRange();
    for (let y = 0; y < this.height; y++) {
      const line = activeBuffer.getLine(base + y);
      for (let x = 0; x < this.width; x++) {
        const cell = line?.getCell(x);
        if (cell?.getWidth() === 0) continue;
        let fg = cell ? color(cell, true) : fgDefault, bg = cell ? color(cell, false) : bgDefault;
        if (cell?.isInverse()) [fg, bg] = [bg, fg];
        const pos = y * this.width + x;
        if (range && range[0] !== range[1] && base === this.selectionBase && pos >= range[0] && pos <= range[1]) bg = selectionBg;
        let attributes = 0;
        if (cell?.isBold()) attributes |= TextAttributes.BOLD;
        if (cell?.isItalic()) attributes |= TextAttributes.ITALIC;
        if (cell?.isDim()) attributes |= TextAttributes.DIM;
        if (cell?.isUnderline()) attributes |= TextAttributes.UNDERLINE;
        if (cell?.isStrikethrough()) attributes |= TextAttributes.STRIKETHROUGH;
        buffer.setCell(this.screenX + x, this.screenY + y, cell?.isInvisible() ? ' ' : cell?.getChars() || ' ', fg, bg, attributes);
      }
    }
    if (this._active) {
      // OpenTUI's host cursor uses one-based terminal coordinates; xterm uses zero-based cells.
      this.ctx.setCursorPosition(this.screenX + Math.min(activeBuffer.cursorX, this.width - 1) + 1, this.screenY + activeBuffer.cursorY + 1,
        !this._obscured && !session.scroll && session.status === 'running' && session.cursorVisible);
      this.ctx.setCursorStyle({ style: 'block', blinking: false });
      this.ctx.setCursorColor(RGBA.fromHex(colors.primary));
    }
  }
  protected destroySelf() { this.manager.off('output', this.output); super.destroySelf(); }
}
extend({ 'terminal-surface': TerminalSurface });
declare module '@opentui/react' { interface OpenTUIComponents { 'terminal-surface': typeof TerminalSurface } }
