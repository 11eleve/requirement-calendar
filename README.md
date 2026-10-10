# 需求日历 0.5.3

本地 macOS 版本（已修复上滑漏判，保留跟手切月动画与透明图标）：上下滚动切换月份，JSON 导入导出，命令行操作。需求保存在本机文件中。汇总页已移除“待办时间节点”区域，已有需求中的节点数据保留在详情和 JSON 中。Excel 导出已移除。

## 下载与安装

普通用户从 [GitHub Releases](https://github.com/11eleve/requirement-calendar/releases/latest) 下载，无需编译源码。

| 系统 | 文件 | 安装方法 |
| --- | --- | --- |
| Mac：Apple Silicon，macOS 15+ | `RequirementCalendar-0.5.3-macOS-arm64.dmg` | 打开后将“需求日历”拖到 Applications |
| Mac：同上 | `RequirementCalendar-0.5.3-macOS-arm64.pkg` | 双击，按安装向导操作 |
| Windows x64 | `RequirementCalendar-0.5.3-x64-Setup.exe` | 双击，按安装向导操作 |

当前 Mac 包尚未做 Apple Developer ID 签名和公证；首次打开如被拦截，确认来源后按 [Apple 说明](https://support.apple.com/zh-cn/102445) 在“系统设置 → 隐私与安全性”中选择“仍要打开”。更新前先退出旧版，需求数据会保留。Intel Mac 暂不支持。

## 使用应用

打开 `dist/需求日历.app`。点击或拖动日期创建需求，编辑后点击“保存需求”。滚到月历顶部继续向上是上个月，滚到底部继续向下是下个月；小幅滚动先预览，未达到距离会回弹，达到距离后整页连续滑入下一月。反向滑动可直接切回，越过顶部或底部的距离会在同一次滚动中计入切月；惯性末尾的微小移动不会持续锁住下一次操作。系统启用“减少动态效果”时直接切换。点击年月可直接跳转。今天用紫色圆底标识，非本月日期置灰。

通过“文件”菜单或需求汇总页的“导入 JSON / 导出 JSON”操作文件。导出汇总页时仅导出当前所列需求，包含它们的全部已保存字段；未保存的草稿不包含在导出中。

导入支持单个需求、需求数组和版本化备份。先校验整份文件，再展示预览：

- **合并，重复 ID 跳过**：默认方式，保留当前记录。
- **合并，重复 ID 更新**：将重复 ID 对应的需求完整替换为导入记录。
- **全部作为新需求添加**：为每个需求生成新 ID。
- **恢复备份，替换全部需求**：明确显示替换数量，并将原数据独立归档。

无效日期、重叠阶段、重复 ID、不支持的版本会在写入之前拒绝。JSON 文件上限 16 MB。

## 命令行

Mac 应用包内自带编译好的 `Contents/MacOS/reqcal`，使用时不需要 Node 或 Python。DMG 安装后直接执行：

```sh
"/Applications/需求日历.app/Contents/MacOS/reqcal" schema
"/Applications/需求日历.app/Contents/MacOS/reqcal" list
```

它不会自动安装到系统 PATH。源码构建后可通过 `bin/reqcal` 使用下列指令；便携包的启动脚本放在应用旁边时使用 `./reqcal`：

```sh
./reqcal --help
./reqcal schema
./reqcal list --from 2026-10-01 --to 2026-10-31
./reqcal get REQUIREMENT_ID
./reqcal create --file examples/requirement.json
./reqcal update REQUIREMENT_ID --json '{"note":"接口已确认"}'
./reqcal shift REQUIREMENT_ID --days 3
./reqcal preview-import requirements.json
./reqcal import requirements.json
./reqcal export --output requirements.json
```

应用未运行时，命令行会尝试在后台启动同一包中的应用。更新后应先退出旧版；请让启动脚本和新版应用位于同一目录。也可直接调用应用包内的二进制。

`create / update` 支持 `--json` 或 `--file`；`--file -` 从标准输入读取。导入默认合并并跳过重复 ID；用 `--mode update / copy / replace` 明确选择其他行为。`update` 的普通字段按补丁更新，数组字段需提供完整数组；更新 `tasks` 时同时提供等长的 `done`。

每次成功操作输出 JSON，包含 `ok`、`revision`、`changed` 和 `data`。`schema` 返回字段、默认值说明、JSON Schema 和样例，便于 AI 构造指令。命令成功返回前已写入磁盘，日历同步刷新。

### 并发与错误

读取返回 `revision`。写入时通过 `--if-revision REVISION` 要求数据仍为刚才读取的版本。替换全部需求必须提供该参数。

```sh
./reqcal status
./reqcal update REQUIREMENT_ID --file patch.json --if-revision '返回的 revision'
./reqcal import backup.json --mode replace --if-revision '返回的 revision'
```

未保存的编辑存在时，写入返回 `DRAFT_DIRTY`；版本已变化时返回 `REVISION_CONFLICT`；正在保存或打开导入预览时返回 `BUSY`。读取始终针对已提交的数据。遇到连接中断，不要盲目重复新建，应先查询已有 ID；为新需求提供稳定 ID 可避免重试产生重复记录。

命令通过当前用户专用的 Unix socket 调用应用的统一操作层，不直接改写数据文件，也不执行请求中的代码。入口文件权限为 0600，并校验连接双方的用户身份。第一版命令行适用于 macOS 原生应用；Electron 的界面和 JSON 功能已同步更新，尚未提供 Windows 命令行包。

退出码：0 成功，2 参数或校验错误，3 草稿、版本或忙碌冲突，4 连接或保存失败。`request --file command.json` 可提交结构化指令，例如：

```json
{"action":"update","id":"REQUIREMENT_ID","data":{"note":"接口已确认"},"expectedRevision":"刚才读取的 revision"}
```

## JSON 示例

最少提供名称和起止日期；未提供 ID 时生成新 ID，其余空栏目自动补齐。

```json
{
  "id": "login-improvement",
  "title": "登录优化",
  "start": "2026-10-12",
  "end": "2026-10-16",
  "tasks": ["实现登录接口", "验收"],
  "note": "等待接口确认"
}
```

备份导出格式仍为 `{ "version": 7, "anchor": "YYYY-MM-DD", "requirements": [...] }`，读取既有 v4–v6 记录时会迁移。

## 持久化

macOS 原生应用保存到 `~/Library/Application Support/RequirementCalendar/`：

- `calendar.json`：当前需求。
- `calendar.last-good.json`：上一份有效记录。
- `calendar.before-restore-*.json`：替换全部需求前的独立归档。

文件独立于应用包，更新应用后继续使用原数据。采用原子写入、进程锁和过期写入检查。当前仍需主动保存编辑表单，未保存草稿只在内存中。

Windows Electron 界面的数据目录为 `%APPDATA%\RequirementCalendar\data\`。浏览器版使用同一浏览器、同一地址的 localStorage；桌面和浏览器不自动同步。

## 项目结构

```text
index.html          前端入口源码
src/
  main.js           启动和界面状态协调
  domain/           数据模型、排期规则、JSON 指令
  services/         存储桥接、网站图标服务
  components/       共用控件、图标和动画
  styles/           样式
desktop/
  macos/            Swift 原生宿主和 CLI
  electron/         Electron 宿主及 Windows 集成
assets/             发布资源
bin/                CLI 启动脚本
scripts/            开发、构建、打包工具
tests/              unit、e2e、macos 检查
docs/               架构说明、截图、历史验证、发布说明
dist/               生成文件，不提交 Git
```

当前前端使用原生 HTML/CSS/JavaScript。Mac 的 Swift 负责窗口、WebView、系统菜单、通知、文件保存和命令行通信；日历界面共用前端代码。详见 [项目架构](docs/ARCHITECTURE.md) 和 [命令行实现](docs/CLI.md)。

## 开发、构建与检查

```sh
npm run dev
npm run build
npm test
npm run test:build
npm run build:mac
npm run test:cli
npm run dist:mac
```

`dev` 打开本机端口 5173，刷新查看更改；`build` 生成 `dist/web/index.html`，用于离线加载。浏览器开发仅需 Node；前端构建需要 Python 3。Electron 开发和 Windows 打包先安装依赖：

```sh
npm ci
npm run desktop
npm run test:desktop
npm run dist:win
```

Mac 构建需要 Xcode Command Line Tools 和 Python 3。Node 测试与 Electron 开发环境需要 Node 22.12 或以上。原生 CLI 端到端测试使用独立临时数据，覆盖真实指令、备份、版本冲突和应用重启。

发布工作流会构建 Mac DMG / PKG 和 Windows 安装器，成功后上传到 GitHub Releases。开发过程的历史检查记录位于 docs 中；本次发布结果以 Releases 对应的构建为准。
