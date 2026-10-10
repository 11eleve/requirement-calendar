#!/bin/zsh
set -eu
ROOT="${0:A:h:h}"
APP="$ROOT/dist/需求日历.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
# Python 3 is needed only to rebuild the portable interface, not to launch the app.
"${PYTHON:-python3}" "$ROOT/scripts/build.py"
mkdir -p "$ROOT/.build/module-cache"
swiftc -parse-as-library -O -target "$(uname -m)-apple-macos15.0" -module-cache-path "$ROOT/.build/module-cache" -framework AppKit -framework WebKit -framework UserNotifications "$ROOT/native/App.swift" "$ROOT/native/LinkPolicy.swift" "$ROOT/native/DataStore.swift" "$ROOT/native/Reminders.swift" "$ROOT/native/ResourceIcons.swift" -o "$APP/Contents/MacOS/RequirementCalendar"
cp "$ROOT/index.html" "$APP/Contents/Resources/index.html"
cp "$ROOT/THIRD_PARTY_NOTICES.md" "$APP/Contents/Resources/THIRD_PARTY_NOTICES.md"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.11eleve.requirement-calendar</string>
<key>CFBundleName</key><string>需求日历</string>
<key>CFBundleExecutable</key><string>RequirementCalendar</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.4.0</string>
<key>CFBundleVersion</key><string>9</string>
<key>LSMinimumSystemVersion</key><string>15.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
ICONSET="$ROOT/.build/AppIcon.iconset"
mkdir -p "$ICONSET"
for SIZE in 16 32 128 256 512; do
  sips -z "$SIZE" "$SIZE" "$ROOT/assets/app-icon.png" --out "$ICONSET/icon_${SIZE}x${SIZE}.png" >/dev/null
  DOUBLE=$((SIZE * 2))
  sips -z "$DOUBLE" "$DOUBLE" "$ROOT/assets/app-icon.png" --out "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
/usr/libexec/PlistBuddy -c 'Add :CFBundleIconFile string AppIcon.icns' "$APP/Contents/Info.plist"
codesign --force --sign - "$APP"
touch "$APP"
print "Built $APP"
