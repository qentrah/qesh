# Terminal design notes

Reviewed Ghostty primary documentation and issue triage on 2026-10-13. These are comparisons and regression inputs, not claims that QH is faster or implements Ghostty's engine.

- [Shell integration](https://ghostty.org/docs/features/shell-integration) documents inheriting the previous focused shell's working directory. QH now uses its tracked cwd for new tabs and split sessions, with a real PTY regression test.
- [Configuration reference](https://ghostty.org/docs/config/reference) describes keeping its helper on PATH after shell initialization. QH restores bundled qh and Node after user zsh login files; tested against a dotfile that resets PATH.
- [Split actions](https://ghostty.org/docs/config/keybind/reference) include split resizing and equalization. QH preserves processes during resize, supports draggable and prefix-key dividers, and now offers Equalize Splits. Geometry tests cover narrow/expanded layouts.
- [Prompt resize report](https://github.com/ghostty-org/ghostty/discussions/13629) reports a specific Ghostty development-version regression with OSC 133 and powerlevel10k. QH uses xterm/headless and does not implement that Ghostty code. Its tests resize a live zsh prompt repeatedly and check input and PID survival; they do not certify powerlevel10k or every OSC 133 stream.
- [Keyboard-layout report](https://github.com/ghostty-org/ghostty/issues/11523) shows why physical and Unicode shortcuts can disagree. QH keeps GUI shortcuts separate from terminal controls and ignores IME composition while recording shortcuts. Non-Latin GUI shortcut layouts still need native testing; no universal IME fix is claimed.

QH's measurements report local startup time, Electron main-process memory, and shell count. They are diagnostics, not a benchmark against Ghostty. ANSI, Unicode, alternate screen, bracketed paste, zsh completion/history, vim, and top are exercised by the existing suite. Unsupported clipboard control sequences are not enabled merely to match another terminal.

QH now forwards wheel/click/drag/release events according to [xterm's mouse tracking modes](https://xtermjs.org/docs/api/terminal/interfaces/imodes/). Automated PTY/rendering tests verify SGR packets, legacy 8-bit coordinates, alternate-screen pager arrows, and Shift selection. A separate local check ran real `gh help environment` output and the same output in macOS `less`, scrolling both directions without changing the shell PID. Live theme changes also refresh terminal cell defaults instead of retaining cached startup colors.
