# Qentrah CLI

Discover Qentrah projects, install supported CLIs, clone source, fork repositories, and report bugs from your terminal. Requires Node.js 22.13+. No desktop app or runtime dependencies are required.

## Install with npm or Bun

Download the standalone package from the latest tested GitHub release:

```sh
npm install --global https://github.com/qentrah/qesh/releases/latest/download/qentrah-qh.tgz
# Or:
bun add --global https://github.com/qentrah/qesh/releases/latest/download/qentrah-qh.tgz
qh help
```

If you already installed Qesh, its `qh` command includes these project commands. Use that existing command. Installing a second global `qh` may conflict with your managed launcher; do not force-overwrite it.

## Use

```sh
qh projects
qh projects music
qh projects --live
qh project Kyna
qh install Kyna --manager npm
qh install Kyna --manager bun
qh install DUI --manager bun
qh install kyna-music --source --dir ./music
qh clone qesh ./qesh-source
qh fork qesh
qh bugs qesh
qh bug qesh
qh bug qesh --title "Split resize issue" --body-file ./report.md
qh install latest --check
```

Append `--dry-run` to install, clone, fork, or bug commands to inspect the exact action. `qh bug` opens GitHub CLI's interactive issue editor; `--web` opens the repository issue form. Reports include only text you provide; the CLI does not upload logs, configuration, or diagnostics automatically.

Kyna uses its official preview npm package. Its Bun installation trusts the package's required native-install script. DUI uses its published CLI. Repositories without a published CLI are cloned from source, with their build instructions printed. The CLI does not guess dependency or build commands.

Source checkouts require Git. Forks and issues require [GitHub CLI](https://cli.github.com/) and `gh auth login`. Exit codes from Git, gh, npm, and Bun are preserved. Existing directories are never replaced. The bundled catalog includes public Qentrah repositories; `--live` fetches the current catalog from GitHub.

`qh install latest` installs the Qesh macOS desktop app and its bundled runtimes. For development, run `npm pack` in this directory; it builds the standalone package from the shared CLI sources.
