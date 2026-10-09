# Windows 桌面版

采用 Electron 复用现有 `src/` 日历界面，macOS AppKit 版继续保留。安装器为 NSIS、当前用户安装、x64；没有远程页面、云同步、自动更新或后台常驻要求。

## 运行边界

- 固定版本 Electron / electron-builder 和 npm 锁文件，Windows CI 运行模型测试、桌面测试、打包后测试并生成 SHA256。
- `calendar-app://local` 只提供明确列出的本地静态文件；CSP 禁止远程脚本、网络请求、iframe 和表单提交。
- renderer 开启 sandbox / contextIsolation，禁用 Node；preload 只暴露 load / save / resourceIcon / contextMenu，主进程校验主窗口、主 frame 和确切 URL。
- 资料链接仅允许不含凭据的 HTTP(S)，交给默认浏览器；站点图标只读公开 HTTPS origin 的 `/favicon.ico`，不发送文档路径、Cookie，不跟随重定向，限制时长和响应大小，并在 DNS 解析后拒绝私网地址。
- 本机保存复用 `src/model.js` 校验，限 16 MB，临时文件 flush 后原子替换。保留 last-good、损坏原文与恢复前归档。单实例和保存前文件比对保护过期写入。

## Windows 提醒

安装器注册 `requirement-calendar` 协议。安装版首次运行时创建或更新用户开始菜单快捷方式，设置与 builder 一致的 AUMID `dev.11eleve.requirement-calendar` 和固定 stub ToastActivatorCLSID；仅使用 protocol activation，不依赖后台 COM 进程。点击通知的协议只接受对应主机和单个需求标识，不运行任何命令。

固定 `windows-reminders.ps1` 通过系统 Windows PowerShell 5.1 调用 WinRT。JSON 经 stdin 传入，XML 文本转义，需求内容不插入 shell 代码。保存完成后异步串行同步，最新数据优先；使用 16 字符稳定 ID 取消/替换旧安排。通知禁用或调度失败不会回滚文件保存，状态单独显示。程序不提供自动重试到无限次、休眠唤醒、关机补发或实时推送保证。

开发模式和 `--calendar-smoke-test` 不注册开始菜单、协议或真实系统提醒。测试模式始终使用新临时数据目录；打包后的同一测试检查实际安装包内的 preload、主进程、页面资源及 JSON 保存。

## 验收范围

自动化覆盖：数据往返、归档、外部修改冲突、写盘失败、错误导入、IPC 来源、协议解析、提醒同步次序、取消同步、时区转换、图标网络边界，以及真实 Electron 窗口内的创建/编辑/保存/恢复/重载和沙箱配置。Windows CI 还检查提醒脚本语法、WinRT 类型、快捷方式的通知标识，执行 NSIS 静默安装，确认开始菜单与协议注册后，再启动安装后的应用运行桌面测试。

以下需在 Windows 10/11 的登录桌面手动确认：

1. 用安装器安装，开始菜单与桌面图标可启动；更新后原记录保留。
2. 设置几分钟后的提醒，保存并退出，通知在到期时进入通知中心。
3. 更改、取消、删除及撤销删除后只保留相应安排。
4. 点击通知可从退出或运行状态打开对应需求；有草稿时先提示。
5. 禁用通知、勿扰、睡眠、时区变更与关机错过投递窗口时，状态和行为符合 README 的限制。
6. 未保存时退出，保存 / 不保存 / 继续编辑；保存失败不能关闭窗口。

## 依据

- [Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Windows 通知要求](https://www.electronjs.org/docs/latest/tutorial/notifications)
- [快捷方式 AUMID / ToastActivatorCLSID](https://www.electronjs.org/docs/latest/api/structures/shortcut-details)
- [Microsoft 定时通知与 5 分钟投递窗口](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/app-notifications-scheduled)
- [ScheduledToastNotification ID 的 16 字符限制](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.scheduledtoastnotification.id)
