# 命令行实现

Mac 和 Windows 均提供原生控制台程序 `reqcal`，使用同一份 JavaScript 指令规则和 JSON 响应格式。用户不需要安装 Node 或 Python。

## Windows 安装后使用

Windows 安装器在应用旁提供 `reqcal.exe`，并将安装目录加入当前用户 PATH。安装后重新打开 PowerShell、Windows Terminal 或命令提示符：

```powershell
reqcal --help
reqcal schema
reqcal list
reqcal create --file requirement.json
reqcal update login-v2 --file patch.json
reqcal export --output backup.json
```

推荐用 UTF-8 JSON 文件传递复杂内容，避免不同终端对引号的处理差异；支持 UTF-8 BOM。`--file -` 从标准输入读取 UTF-8 JSON。已有终端不会自动更新 PATH，可重新打开，或直接调用安装目录里的 `reqcal.exe`。

应用未运行时，CLI 后台启动同目录的 `RequirementCalendar.exe`；以后正常打开应用会显示窗口。使用 `--no-launch` 禁用自动启动。卸载时只移除安装器自己添加的 PATH 项。

Windows `--data-dir DIR` 指向包含 `calendar.json` 的数据目录；默认 `%APPDATA%\RequirementCalendar\data`。自动启动时会传递该目录，并使用独立的 Electron 用户配置，方便隔离测试。它不会导入或复制默认目录的数据。

## 安装后使用

DMG 安装后，可直接运行应用包里的二进制：

```sh
"/Applications/需求日历.app/Contents/MacOS/reqcal" --help
"/Applications/需求日历.app/Contents/MacOS/reqcal" schema
"/Applications/需求日历.app/Contents/MacOS/reqcal" list
"/Applications/需求日历.app/Contents/MacOS/reqcal" create --json '{"id":"login-v2","title":"登录优化","start":"2026-10-12","end":"2026-10-16"}'
```

应用包不在 Applications 时替换路径。它不会自动在系统 PATH 中安装全局命令。源码构建后也可使用 `bin/reqcal` 启动脚本。

AI 通过执行上述命令读取/修改需求。`schema` 返回 JSON Schema 和样例；输入可以使用 `--json`、`--file` 或 `--file -` 标准输入，输出为机器可读 JSON。这是确定指令接口，没有嵌入大模型，也不接受任意 JavaScript 执行。

## Mac 从指令到保存

1. `desktop/macos/CLI.swift` 解析终端参数，生成 `{action, id, data, expectedRevision, ...}` 请求。应用未运行时，尝试后台启动同一应用包。
2. CLI 通过 `command.sock` 发送一行 JSON。客户端和服务端检查对方的用户身份；Socket 权限为 0600。
3. `desktop/macos/CommandServer.swift` 在应用进程接收请求，交给 `App.swift` 的 WebView 桥接。
4. `src/main.js` 的 `executeCommand` 检查未保存草稿、忙碌状态、revision；`src/domain/commands.js` 校验参数，返回只读结果或修改计划。
5. 写操作通过 `src/services/storage.js` 调用原生 `DataStore.swift`，完成原子保存和备份，再刷新界面并返回 JSON。

保存文件为 `~/Library/Application Support/RequirementCalendar/calendar.json`。读取针对已提交数据。成功的写指令返回前已完成持久化；CLI 不绕过正在编辑的草稿。

## Windows 从指令到保存

1. `desktop/windows/cli/Reqcal.cs` 编译成 `reqcal.exe`，解析相同的指令参数，生成 JSON 请求。
2. 应用启动 `reqcal.exe --serve` 作为私有管道宿主，通过继承的标准输入/输出接收请求和返回结果。宿主随应用退出，不是系统服务。
3. 命名管道名称由当前用户 SID 和数据目录生成；创建时限定当前用户访问，拒绝远程连接，且必须独占创建第一实例。CLI 连接后核对服务端可执行文件路径。
4. `desktop/electron/command-broker.cjs` 将 JSON 请求交给 `main.cjs`，再调用共享前端的 `executeCommand`。草稿、忙碌和 revision 检查与 Mac 相同。
5. `DataStore` 完成原子保存、备份和过期写入检查，界面刷新后返回 JSON。需求不会通过 CLI 直接改写。

管道使用 UTF-8 JSON 加换行作为消息边界；输入上限 16 MB，响应上限 64 MB。Windows 宿主在客户端读完响应后才断开连接，避免尚未读取的内容被系统丢弃。

该原生工具基于 Windows 自带的 .NET Framework 构建。构建工具见 `scripts/build-cli-windows.ps1`，安装器和发布流程会自动包含二进制；PowerShell 只参与开发编译及安装/卸载 PATH 设置，不参与日常请求。

## 并发

`status`、`list` 等响应包含 `revision`；随后写入时传入 `--if-revision`。替换全部记录必须提供 revision，应用中的未保存草稿会使写操作返回 `DRAFT_DIRTY`。

```sh
"/Applications/需求日历.app/Contents/MacOS/reqcal" status
"/Applications/需求日历.app/Contents/MacOS/reqcal" update login-v2 --json '{"note":"接口已确认"}' --if-revision '读取返回的 revision'
```

退出码：0 成功，2 参数/校验失败，3 草稿/版本/忙碌冲突，4 连接/保存失败。完整支持 `list/get/create/update/shift/delete/preview-import/import/export/schema/status/request`，详细参数用 `--help` 查询。
