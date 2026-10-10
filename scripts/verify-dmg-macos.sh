#!/bin/zsh
set -eu
ROOT="${0:A:h:h}"
APP="$ROOT/dist/需求日历.app"
VERSION=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")
DMG="$ROOT/dist/RequirementCalendar-$VERSION-macOS-arm64.dmg"
MOUNT=$(mktemp -d "$ROOT/.build/dmg-verify.XXXXXX")
ATTACHED=0
cleanup() {
  if [[ "$ATTACHED" == 1 ]]; then hdiutil detach "$MOUNT" >/dev/null || return; fi
  rmdir "$MOUNT"
}
trap cleanup EXIT
hdiutil verify "$DMG"
hdiutil attach "$DMG" -readonly -nobrowse -mountpoint "$MOUNT" >/dev/null
ATTACHED=1
[[ "$(readlink "$MOUNT/Applications")" == /Applications ]]
[[ -f "$MOUNT/安装说明.txt" ]]
codesign --verify --deep --strict "$MOUNT/需求日历.app"
python3 - "$APP" "$MOUNT/需求日历.app" <<'PY'
from pathlib import Path
import hashlib,sys

def manifest(root):
    root=Path(root)
    return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}
assert manifest(sys.argv[1])==manifest(sys.argv[2]), 'Disk image differs from the signed app'
print('DMG verified: signed app bytes match, Applications shortcut and instructions are present.')
PY
