#!/bin/zsh
set -eu
ROOT="${0:A:h:h}"
APP="$ROOT/dist/需求日历.app"
if [[ ! -d "$APP" ]]; then
  print -u2 "Build the application with scripts/build-macos.sh first."
  exit 1
fi
VERSION=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")
STAGING="$ROOT/.build/installer-$VERSION"
mkdir -p "$STAGING/root" "$STAGING/packages" "$STAGING/resources"
codesign --verify --deep --strict "$APP"
ditto "$APP" "$STAGING/root/需求日历.app"
pkgbuild --analyze --root "$STAGING/root" "$STAGING/components.plist"
"${PYTHON:-python3}" - "$STAGING" "$VERSION" <<'PY'
from pathlib import Path
import plistlib,sys
root=Path(sys.argv[1]);version=sys.argv[2]
p=root/'components.plist';components=plistlib.loads(p.read_bytes())
for component in components:
    component.update(BundleIsRelocatable=False,BundleIsVersionChecked=True,BundleHasStrictIdentifier=True,BundleOverwriteAction='upgrade')
p.write_bytes(plistlib.dumps(components))
(root/'requirements.plist').write_bytes(plistlib.dumps({'os':['15.0'],'arch':['arm64'],'home':False}))
style='<meta charset="utf-8"><style>body{font:14px -apple-system,sans-serif;line-height:1.7;padding:12px}h1{font-size:22px}code{font-size:12px}</style>'
(root/'resources/welcome.html').write_text('<!doctype html><html lang="zh-CN">'+style+'<h1>安装需求日历 '+version+'</h1><p>请先退出正在运行的旧版需求日历，再继续安装。</p><p>应用会安装到“应用程序”文件夹。此版本包含应用内 AI 对话、细粒度操作权限、本机 API、JSON 导入导出与命令行工具。</p><p>安装只替换应用，需求数据仍保存在你自己的用户资料目录中。</p><p>支持 Apple Silicon Mac，macOS 15 或以上。</p></html>')
(root/'resources/conclusion.html').write_text('<!doctype html><html lang="zh-CN">'+style+'<h1>安装完成</h1><p>从“应用程序”打开“需求日历”。</p><p>在终端中运行以下指令可以查看命令行帮助：</p><p><code>"/Applications/需求日历.app/Contents/MacOS/reqcal" --help</code></p><p>若 Dock 保留旧图标，可移除旧快捷图标后从新应用重新添加。</p></html>')
PY
pkgbuild --root "$STAGING/root" --component-plist "$STAGING/components.plist" --identifier dev.11eleve.requirement-calendar.installer --version "$VERSION" --install-location /Applications --ownership recommended "$STAGING/packages/RequirementCalendar.pkg"
productbuild --synthesize --product "$STAGING/requirements.plist" --package "$STAGING/packages/RequirementCalendar.pkg" "$STAGING/Distribution.xml"
"${PYTHON:-python3}" - "$STAGING/Distribution.xml" "$VERSION" <<'PY'
from pathlib import Path
import sys,xml.etree.ElementTree as ET
p=Path(sys.argv[1]);root=ET.parse(p).getroot()
ET.SubElement(root,'title').text='需求日历 '+sys.argv[2]
ET.SubElement(root,'welcome',{'file':'welcome.html','mime-type':'text/html'})
ET.SubElement(root,'conclusion',{'file':'conclusion.html','mime-type':'text/html'})
options=root.find('options');options.set('customize','never');options.set('require-scripts','false')
p.write_text('<?xml version="1.0" encoding="utf-8"?>\n'+ET.tostring(root,encoding='unicode')+'\n')
PY
productbuild --distribution "$STAGING/Distribution.xml" --package-path "$STAGING/packages" --resources "$STAGING/resources" "$ROOT/dist/需求日历-$VERSION-安装包.pkg"
