# Contributor instructions

After editing UI files, run Rams `quick_review` with `via=rules` where supported,
fix reported issues, and report any unavailable review capability accurately.

Keep shell ownership independent of UI mounting. Preserve shell PIDs when
switching tabs, docking, detaching, grouping, or resizing. Ordinary shell input
must not be consumed by workspace shortcuts except the Ctrl+B prefix.

Run `bun run check`, `bun test`, and the relevant CLI/desktop smoke checks.
Keep generated bundles, app builds, logs, shell history, and local credentials
out of Git. Config JSON and SQLite are local application data, never signed bundle contents. Tests must isolate QH_DATA_DIR or disable persistence.
