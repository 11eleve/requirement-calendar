# 命令行实现

目前提供 macOS 原生 CLI，尚未提供 Windows CLI。

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

## 从指令到保存

1. `desktop/macos/CLI.swift` 解析终端参数，生成 `{action, id, data, expectedRevision, ...}` 请求。应用未运行时，尝试后台启动同一应用包。
2. CLI 通过 `command.sock` 发送一行 JSON。客户端和服务端检查对方的用户身份；Socket 权限为 0600。
3. `desktop/macos/CommandServer.swift` 在应用进程接收请求，交给 `App.swift` 的 WebView 桥接。
4. `src/main.js` 的 `executeCommand` 检查未保存草稿、忙碌状态、revision；`src/domain/commands.js` 校验参数，返回只读结果或修改计划。
5. 写操作通过 `src/services/storage.js` 调用原生 `DataStore.swift`，完成原子保存和备份，再刷新界面并返回 JSON。

保存文件为 `~/Library/Application Support/RequirementCalendar/calendar.json`。读取针对已提交数据。成功的写指令返回前已完成持久化；CLI 不绕过正在编辑的草稿。

## 并发

`status`、`list` 等响应包含 `revision`；随后写入时传入 `--if-revision`。替换全部记录必须提供 revision，应用中的未保存草稿会使写操作返回 `DRAFT_DIRTY`。

```sh
"/Applications/需求日历.app/Contents/MacOS/reqcal" status
"/Applications/需求日历.app/Contents/MacOS/reqcal" update login-v2 --json '{"note":"接口已确认"}' --if-revision '读取返回的 revision'
```

退出码：0 成功，2 参数/校验失败，3 草稿/版本/忙碌冲突，4 连接/保存失败。完整支持 `list/get/create/update/shift/delete/preview-import/import/export/schema/status/request`，详细参数用 `--help` 查询。
