#!/bin/zsh
set -eu
ROOT="${0:A:h:h}"
APP="$ROOT/dist/需求日历.app"
VERSION=$("${PYTHON:-python3}" -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$ROOT/package.json")
NODE_BINARY="${NODE_BINARY:-node}"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
# Python 3 is needed only to rebuild the portable interface, not to launch the app.
"${PYTHON:-python3}" "$ROOT/scripts/build.py"
"$NODE_BINARY" "$ROOT/scripts/build-ai-runtime.cjs" --node
mkdir -p "$APP/Contents/Resources/ai"
ditto "$ROOT/.build/ai-runtime" "$APP/Contents/Resources/ai"
codesign --force --sign - "$APP/Contents/Resources/ai/node"
mkdir -p "$ROOT/.build/module-cache"
swiftc -parse-as-library -O -target "$(uname -m)-apple-macos15.0" -module-cache-path "$ROOT/.build/module-cache" -framework AppKit -framework WebKit -framework UserNotifications -framework Security "$ROOT/desktop/macos/AIService.swift" "$ROOT/desktop/macos/CommandServer.swift" "$ROOT/desktop/macos/App.swift" "$ROOT/desktop/macos/LinkPolicy.swift" "$ROOT/desktop/macos/DataStore.swift" "$ROOT/desktop/macos/Reminders.swift" "$ROOT/desktop/macos/ResourceIcons.swift" -o "$APP/Contents/MacOS/RequirementCalendar"
swiftc -O -target "$(uname -m)-apple-macos15.0" -module-cache-path "$ROOT/.build/module-cache" "$ROOT/desktop/macos/CLI.swift" -o "$APP/Contents/MacOS/reqcal"
cp "$ROOT/dist/web/index.html" "$APP/Contents/Resources/index.html"
cp "$ROOT/THIRD_PARTY_NOTICES.md" "$APP/Contents/Resources/THIRD_PARTY_NOTICES.md"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.11eleve.requirement-calendar</string>
<key>CFBundleName</key><string>需求日历</string>
<key>CFBundleExecutable</key><string>RequirementCalendar</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$VERSION</string>
<key>CFBundleVersion</key><string>15</string>
<key>LSMinimumSystemVersion</key><string>15.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
# Preserve real alpha around rounded icons; opaque corners appear as black edges in Finder/Dock.
ICON_ALPHA=$(sips -g hasAlpha "$ROOT/assets/app-icon.png")
if [[ "$ICON_ALPHA" != *"hasAlpha: yes"* ]]; then
  print -u2 "App icon must contain alpha transparency."
  exit 1
fi
ICONSET="$ROOT/.build/AppIcon.iconset"
mkdir -p "$ICONSET"
for SIZE in 16 32 128 256 512; do
  sips -z "$SIZE" "$SIZE" "$ROOT/assets/app-icon.png" --out "$ICONSET/icon_${SIZE}x${SIZE}.png" >/dev/null
  DOUBLE=$((SIZE * 2))
  sips -z "$DOUBLE" "$DOUBLE" "$ROOT/assets/app-icon.png" --out "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon-11.icns"
/usr/libexec/PlistBuddy -c 'Add :CFBundleIconFile string AppIcon-11.icns' "$APP/Contents/Info.plist"
codesign --force --sign - "$APP"
touch "$APP"
print "Built $APP"
