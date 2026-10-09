#!/bin/zsh
# Live, optional network smoke test. Normal desktop checks keep networking off.
set -eu
ROOT="${0:A:h:h}"
APP="$ROOT/dist/需求日历.app/Contents/MacOS/RequirementCalendar"
OUTPUT="$ROOT/.build/site-icons-live"
if [[ ! -x "$APP" ]]; then
  print -u2 '请先运行 ./scripts/build-macos.sh 构建桌面版。'
  exit 1
fi
mkdir -p "$OUTPUT"
for APPEARANCE in light dark; do
  env -u CALENDAR_DATA_DIR -u CALENDAR_VERIFY_EMPTY -u CALENDAR_VERIFY_BROWSER_STORAGE \
    CALENDAR_VERIFY_SCRIPT="$ROOT/tests/desktop-site-icons-live.js" \
    CALENDAR_VERIFY_OUTPUT="$OUTPUT/$APPEARANCE.json" \
    CALENDAR_VERIFY_SNAPSHOT="$OUTPUT/$APPEARANCE.png" \
    CALENDAR_VERIFY_APPEARANCE="$APPEARANCE" \
    CALENDAR_VERIFY_SITE_ICONS=live \
    CALENDAR_VERIFY_FRAME_NAME="site-icons-$(uuidgen)" \
    "$APP"
  print "网站图标检查通过（系统外观偏好）：$APPEARANCE"
done
print "结果和截图：$OUTPUT"
