TermCN components, hooks, types, themes and provider are vendored from
https://github.com/shadcn-labs/termcn and https://www.termcn.dev/r/opentui/.
They retain the upstream MIT license in LICENSE.

Qentrah adaptations:
- Tabs are a controlled, mouse-enabled strip; shell arrow/Tab input is not intercepted.
- Dialog uses OpenTUI text background colors and mouse actions, defaulting to Cancel.
- Help uses compact rows that fit inside a scrollable overlay.
- Import paths are relative to this vendored directory.

The terminal surface and process/session architecture are implemented separately.
