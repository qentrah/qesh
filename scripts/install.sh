#!/bin/sh
set -eu
if [ "$(uname -s)" != Darwin ]; then echo 'Qesh currently requires macOS.' >&2; exit 1; fi
arch=$(uname -m)
case "$arch" in arm64) arch=arm64 ;; x86_64) arch=x64 ;; *) echo 'Unsupported Mac processor.' >&2; exit 1 ;; esac
version=${1:-}
if [ -z "$version" ]; then
 version=$(curl -fsSL https://api.github.com/repos/qentrah/qesh/releases | /usr/bin/plutil -extract 0.tag_name raw -o - -)
fi
if ! printf '%s' "$version" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+([-.][A-Za-z0-9.-]+)?$'; then echo 'Invalid release version.' >&2; exit 1; fi
install_dir=${QESH_INSTALL_DIR:-"$HOME/Library/Application Support/Qentrah/Qesh/versions"}
bin_dir=${QESH_BIN_DIR:-"$HOME/.local/bin"}
mkdir -p "$install_dir" "$bin_dir"
temporary=$(mktemp -d "${TMPDIR:-/tmp}/qesh-install.XXXXXXXX")
trap 'rm -rf "$temporary"' EXIT INT TERM
asset="Qesh-macOS-$arch.zip"
base="https://github.com/qentrah/qesh/releases/download/$version"
curl -fL "$base/$asset" -o "$temporary/$asset"
curl -fsSL "$base/Qesh-macOS-$arch.sha256" -o "$temporary/checksum"
(cd "$temporary" && shasum -a 256 -c checksum)
ditto -x -k "$temporary/$asset" "$temporary/unpack"
codesign --verify --deep --strict "$temporary/unpack/Qesh.app"
node="$temporary/unpack/Qesh.app/Contents/Resources/runtime/node"
root="$temporary/unpack/Qesh.app/Contents/Resources/terminal"
if [ ! -f "$root/bin/qh" ]; then echo 'This release does not include qh; install version 0.4.0 or newer.' >&2; exit 1; fi
"$node" "$root/bin/qh" version
final="$install_dir/$version-$arch-$(date +%s)"
if [ -e "$final" ]; then echo 'Installation path already exists. Try again.' >&2; exit 1; fi
mv "$temporary/unpack" "$final"
"$final/Qesh.app/Contents/Resources/runtime/node" --input-type=commonjs - "$final" "$bin_dir" "$install_dir" <<'JS'
const fs=require('node:fs'),path=require('node:path');
const [folder,bin,install]=process.argv.slice(2),runtime=path.join(folder,'Qesh.app/Contents/Resources/runtime'),root=path.join(folder,'Qesh.app/Contents/Resources/terminal');
const quote=value=>"'"+value.replace(/'/g,"'\\''")+"'";
const text=['#!/bin/sh',`export QENTRAH_NODE=${quote(path.join(runtime,'node'))}`,`export QENTRAH_BUN=${quote(path.join(runtime,'bun'))}`,`export QESH_BIN_DIR=${quote(bin)}`,`export QESH_INSTALL_DIR=${quote(install)}`,'export QESH_MANAGED=1',`export PATH=${quote(root+'/bin:'+runtime)}:$PATH`,`exec ${quote(path.join(runtime,'node'))} ${quote(path.join(root,'bin/qh'))} "$@"`,''].join('\n');
for(const name of ['qh','qesh']){const target=path.join(bin,name);if(fs.existsSync(target)&&!fs.readFileSync(target,'utf8').includes('QESH_MANAGED=1'))throw new Error(`Refusing to overwrite unrelated command: ${target}`);}
for(const name of ['qh','qesh']){const target=path.join(bin,name);fs.writeFileSync(target+'.tmp',text,{mode:0o755});fs.renameSync(target+'.tmp',target);}
JS
printf '\nInstalled %s. Run: %s/qh\n' "$version" "$bin_dir"
printf 'If that folder is not on PATH, add it in your shell profile.\nApp: %s/Qesh.app\n' "$final"
