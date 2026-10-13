#!/bin/sh
set -eu
if [ "$(uname -s)" != Darwin ]; then echo 'QH currently requires macOS.' >&2; exit 1; fi
arch=$(uname -m)
case "$arch" in arm64) arch=arm64 ;; x86_64) arch=x64 ;; *) echo 'Unsupported Mac processor.' >&2; exit 1 ;; esac
selector=${1:-latest}
metadata=$(mktemp "${TMPDIR:-/tmp}/qh-release.XXXXXXXX")
trap 'rm -f "$metadata"' EXIT INT TERM
case "$selector" in
 latest|stable)
  curl -fsSL --retry 2 https://api.github.com/repos/qentrah/qh/releases/latest -o "$metadata"
  version=$(/usr/bin/plutil -extract tag_name raw -o - "$metadata")
  ;;
 preview)
  curl -fsSL --retry 2 'https://api.github.com/repos/qentrah/qh/releases?per_page=100' -o "$metadata"
  index=0; version=''
  while candidate=$(/usr/bin/plutil -extract "$index.tag_name" raw -o - "$metadata" 2>/dev/null); do
   draft=$(/usr/bin/plutil -extract "$index.draft" raw -o - "$metadata")
   if [ "$draft" = false ]; then version=$candidate; break; fi
   index=$((index+1))
  done
  ;;
 v*) version=$selector ;;
 [0-9]*) version=v$selector ;;
 *) echo 'Usage: sh install.sh [latest|stable|preview|vVERSION]' >&2; exit 1 ;;
esac
rm -f "$metadata"
if ! printf '%s' "$version" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+([-.][A-Za-z0-9.-]+)?$'; then echo 'Invalid release version.' >&2; exit 1; fi
install_dir=${QH_INSTALL_DIR:-"$HOME/Library/Application Support/Qentrah/QH/versions"}
bin_dir=${QH_BIN_DIR:-"$HOME/.local/bin"}
mkdir -p "$install_dir" "$bin_dir"
temporary=$(mktemp -d "${TMPDIR:-/tmp}/qh-install.XXXXXXXX")
trap 'rm -rf "$temporary"' EXIT INT TERM
asset="QH-macOS-$arch.zip"
base="https://github.com/qentrah/qh/releases/download/$version"
curl -fL --retry 2 "$base/$asset" -o "$temporary/$asset"
curl -fsSL --retry 2 "$base/QH-macOS-$arch.sha256" -o "$temporary/checksum"
(cd "$temporary" && shasum -a 256 -c checksum)
ditto -x -k "$temporary/$asset" "$temporary/unpack"
codesign --verify --deep --strict "$temporary/unpack/QH.app"
node="$temporary/unpack/QH.app/Contents/Resources/runtime/node"
root="$temporary/unpack/QH.app/Contents/Resources/terminal"
if [ ! -f "$root/bin/qh" ]; then echo 'This release does not include qh; install version 0.4.0 or newer.' >&2; exit 1; fi
"$node" "$root/bin/qh" version
final="$install_dir/$version-$arch-$(date +%s)"
if [ -e "$final" ]; then echo 'Installation path already exists. Try again.' >&2; exit 1; fi
mv "$temporary/unpack" "$final"
"$final/QH.app/Contents/Resources/runtime/node" --input-type=commonjs - "$final" "$bin_dir" "$install_dir" <<'JS'
const fs=require('node:fs'),path=require('node:path');
const [folder,bin,install]=process.argv.slice(2),runtime=path.join(folder,'QH.app/Contents/Resources/runtime'),root=path.join(folder,'QH.app/Contents/Resources/terminal');
const quote=value=>"'"+value.replace(/'/g,"'\\''")+"'";
const text=['#!/bin/sh',`export QENTRAH_NODE=${quote(path.join(runtime,'node'))}`,`export QENTRAH_BUN=${quote(path.join(runtime,'bun'))}`,`export QH_BIN_DIR=${quote(bin)}`,`export QH_INSTALL_DIR=${quote(install)}`,'export QH_MANAGED=1',`export PATH=${quote(root+'/bin:'+runtime)}:$PATH`,`exec ${quote(path.join(runtime,'node'))} ${quote(path.join(root,'bin/qh'))} "$@"`,''].join('\n');
for(const name of ['qh']){const target=path.join(bin,name);if(fs.existsSync(target)&&!/(?:QH|QESH)_MANAGED=1/.test(fs.readFileSync(target,'utf8')))throw new Error(`Refusing to overwrite unrelated command: ${target}`);}
for(const name of ['qh']){const target=path.join(bin,name);fs.writeFileSync(target+'.tmp',text,{mode:0o755});fs.renameSync(target+'.tmp',target);}
const legacy=path.join(bin,'qesh');if(fs.existsSync(legacy)&&fs.readFileSync(legacy,'utf8').includes('QESH_MANAGED=1'))fs.unlinkSync(legacy);
JS
printf '\nInstalled %s. Run: %s/qh\n' "$version" "$bin_dir"
printf 'If that folder is not on PATH, add it in your shell profile.\nApp: %s/QH.app\n' "$final"
