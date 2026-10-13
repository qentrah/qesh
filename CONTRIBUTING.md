# Contributing to Qesh

Open an issue to describe a bug or proposed change, then submit a focused pull request against `main`. Include the behavior before and after the change and the checks you ran. For bugs, include macOS version, architecture, Bun/Node versions, selected shell, and reproduction steps; remove private shell output before posting.

Install Bun 1.3.5+ and Node.js 22.13+ on macOS, clone the repository, and run `bun install`. Use `bun run start` for the CLI or `bun run desktop` for the standalone development window.

Run `bun run check`, `bun test`, and relevant smoke checks before submitting. Desktop UI changes should also build with `bun run build:desktop`. If Rams is available, run `quick_review` with `via=rules` where supported and fix its findings; report unavailable review capabilities honestly.

Preserve shell ownership across mounting, tab changes, grouping, docking, detaching, and resizing. Keep ordinary shell input intact. Confirm closing live sessions and clean up processes on exit. Do not store mutable files inside the signed app bundle.

Keep generated bundles, native app builds, dependency folders, logs, shell history, and credentials out of Git. New dependencies must retain their license notices. Contributions to original project code are made under the repository's MIT license.
