#!/bin/zsh
set -eu
ROOT="${0:A:h:h}"
APP="$ROOT/dist/需求日历.app"
[[ -d "$APP" ]] || { print -u2 'Build the app with scripts/build-macos.sh first.'; exit 1; }
VERSION=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")
ARCH=$(lipo -archs "$APP/Contents/MacOS/RequirementCalendar")
[[ "$ARCH" == arm64 ]] || { print -u2 'This disk image targets Apple Silicon.'; exit 1; }
codesign --verify --deep --strict "$APP"
STAGING=$(mktemp -d "$ROOT/.build/dmg-$VERSION.XXXXXX")
trap 'rm -rf "$STAGING"' EXIT
ditto "$APP" "$STAGING/需求日历.app"
ln -s /Applications "$STAGING/Applications"
cat > "$STAGING/安装说明.txt" <<'TXT'
需求日历 — Mac 安装说明

支持 Apple Silicon（M 系列芯片）Mac，macOS 15 或以上。

1. 退出正在运行的旧版需求日历。
2. 把“需求日历”拖到旁边的“Applications（应用程序）”。
3. 若提示替换旧版，确认替换。
4. 推出此磁盘映像，再从“应用程序”打开“需求日历”。

应用自带运行环境，无需安装 Node、Python 或其他开发工具。
更新只替换应用，用户原有需求数据会保留。

此版本尚未使用 Apple Developer ID 签名及公证。
如果首次打开被 macOS 拦截，请确认来自本项目的官方发布页；
然后进入“系统设置 → 隐私与安全性 → 仍要打开”。
请勿关闭系统的整体安全检查。

项目与新版下载：https://github.com/11eleve/requirement-calendar/releases
TXT
hdiutil create -volname "需求日历 $VERSION" -srcfolder "$STAGING" -fs HFS+ -format UDZO -ov "$ROOT/dist/RequirementCalendar-$VERSION-macOS-arm64.dmg"
print "Built $ROOT/dist/RequirementCalendar-$VERSION-macOS-arm64.dmg"
