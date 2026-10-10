import AppKit
import WebKit
import UniformTypeIdentifiers
import UserNotifications

@MainActor
final class CalendarApplication: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply, UNUserNotificationCenterDelegate {
    let commandBackground = CommandLine.arguments.contains("--command-background")
    var commandServer: CalendarCommandServer?
    var window: NSWindow!
    var webView: WKWebView!
    var latestRequirements: [[String: Any]] = []
    var dataLoaded = false
    var pendingNotificationID: String?
    lazy var notificationScheduler: any NotificationScheduling = {
        if verifyScript != nil || ProcessInfo.processInfo.environment["CALENDAR_EPHEMERAL"] == "1" {
            let scheduler = IsolatedNotificationScheduler()
            if ProcessInfo.processInfo.environment["CALENDAR_VERIFY_NOTIFICATION_PERMISSION"] == "denied" { scheduler.permission = .denied }
            if ProcessInfo.processInfo.environment["CALENDAR_VERIFY_NOTIFICATION_PERMISSION"] == "delayed" { scheduler.permissionDelay = 2_000_000_000 }
            return scheduler
        }
        return SystemNotificationScheduler()
    }()
    lazy var reminders = ReminderManager(scheduler: notificationScheduler)
    let resourceIcons = ResourceIconStore()
    let entry = Bundle.main.url(forResource: "index", withExtension: "html")!
    let verifyScript = ProcessInfo.processInfo.environment["CALENDAR_VERIFY_SCRIPT"]
    lazy var dataStore: CalendarDataStore = {
        let isolated = verifyScript != nil || ProcessInfo.processInfo.environment["CALENDAR_EPHEMERAL"] == "1"
        let directory: URL
        if isolated {
            directory = ProcessInfo.processInfo.environment["CALENDAR_DATA_DIR"].map { URL(fileURLWithPath: $0, isDirectory: true) } ?? FileManager.default.temporaryDirectory.appendingPathComponent("RequirementCalendar-\(UUID().uuidString)", isDirectory: true)
        } else {
            directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("RequirementCalendar", isDirectory: true)
        }
        return CalendarDataStore(directory: directory)
    }()
    let verifyOutput = ProcessInfo.processInfo.environment["CALENDAR_VERIFY_OUTPUT"]

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        if let url = Bundle.main.url(forResource: "AppIcon", withExtension: "icns"), let icon = NSImage(contentsOf: url) { NSApp.applicationIconImage = icon }
        createMenu()
        if verifyScript == nil && ProcessInfo.processInfo.environment["CALENDAR_EPHEMERAL"] != "1" { UNUserNotificationCenter.current().delegate = self }
        let config = WKWebViewConfiguration()
        if verifyScript == nil || ProcessInfo.processInfo.environment["CALENDAR_VERIFY_BROWSER_STORAGE"] != "1" { config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "calendar") }
        if (verifyScript != nil && ProcessInfo.processInfo.environment["CALENDAR_VERIFY_EMPTY"] != "1") || ProcessInfo.processInfo.environment["CALENDAR_DEMO"] == "1" {
            config.userContentController.addUserScript(WKUserScript(source: "window.__calendarDemo=true;", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        config.userContentController.addUserScript(WKUserScript(source: "document.documentElement.classList.add('native');", injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        // Verification runs never touch the user's persisted application data.
        if verifyScript != nil || ProcessInfo.processInfo.environment["CALENDAR_EPHEMERAL"] == "1" { config.websiteDataStore = .nonPersistent() }
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1160, height: 780), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "需求日历"
        window.minSize = NSSize(width: 920, height: 600)
        window.contentView = webView
        window.delegate = self
        window.isReleasedWhenClosed = false
        let isolated = verifyScript != nil || ProcessInfo.processInfo.environment["CALENDAR_EPHEMERAL"] == "1"
        let frameName = isolated ? (verifyScript != nil ? ProcessInfo.processInfo.environment["CALENDAR_VERIFY_FRAME_NAME"] : nil) : "RequirementCalendarWindow"
        if let frameName { window.setFrameAutosaveName(frameName); if !window.setFrameUsingName(frameName) { window.center() } }
        else { window.center() }
        window.appearance = NSAppearance(named: .aqua)
        if let appearance = ProcessInfo.processInfo.environment["CALENDAR_VERIFY_APPEARANCE"], verifyScript != nil { window.appearance = NSAppearance(named: appearance == "dark" ? .darkAqua : .aqua) }
        window.collectionBehavior.insert(.fullScreenPrimary)
        if !commandBackground { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
        webView.loadFileURL(entry, allowingReadAccessTo: entry.deletingLastPathComponent())
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window?.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true); return true
    }

    func createMenu() {
        let main = NSMenu()
        let application = NSMenuItem()
        let appMenu = NSMenu(title: "需求日历")
        appMenu.addItem(withTitle: "关于需求日历", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "隐藏需求日历", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "退出需求日历", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        application.submenu = appMenu
        main.addItem(application)
        let file = NSMenuItem()
        let fileMenu = NSMenu(title: "文件")
        for (title, action, key) in [("新建需求", #selector(newRequirement), "n"), ("保存需求", #selector(saveRequirement), "s"), ("关闭详情", #selector(closeDetail), "w")] {
            let item = fileMenu.addItem(withTitle: title, action: action, keyEquivalent: key)
            item.target = self
        }
        fileMenu.addItem(.separator())
        for (title, action) in [("导入需求 JSON…", #selector(importJSON)), ("导出需求 JSON…", #selector(exportJSON)), ("显示数据文件夹", #selector(showDataFolder))] {
            let item = fileMenu.addItem(withTitle: title, action: action, keyEquivalent: "")
            item.target = self
        }
        file.submenu = fileMenu
        main.addItem(file)
        let edit = NSMenuItem()
        let editMenu = NSMenu(title: "编辑")
        for (title, action, key) in [("撤销", #selector(performUndo), "z"), ("重做", Selector(("redo:")), "Z"), ("剪切", #selector(NSText.cut(_:)), "x"), ("拷贝", #selector(NSText.copy(_:)), "c"), ("粘贴", #selector(NSText.paste(_:)), "v"), ("全选", #selector(NSText.selectAll(_:)), "a")] {
            let item = editMenu.addItem(withTitle: title, action: action, keyEquivalent: key)
            if action == #selector(performUndo) { item.target = self }
        }
        edit.submenu = editMenu
        main.addItem(edit)
        let view = NSMenuItem()
        let viewMenu = NSMenu(title: "显示")
        for (title, action, key) in [("上个月", #selector(previousMonth), "\u{f702}"), ("下个月", #selector(nextMonth), "\u{f703}")] {
            let item = viewMenu.addItem(withTitle: title, action: action, keyEquivalent: key)
            item.keyEquivalentModifierMask = [.command, .option]
            item.target = self
        }
        viewMenu.addItem(.separator())
        let fullScreen = viewMenu.addItem(withTitle: "进入全屏", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fullScreen.keyEquivalentModifierMask = [.command,.control]
        view.submenu = viewMenu
        main.addItem(view)
        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "窗口")
        windowMenu.addItem(withTitle: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "缩放", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowItem.submenu = windowMenu
        main.addItem(windowItem)
        NSApp.mainMenu = main
        NSApp.windowsMenu = windowMenu
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url == entry, let body = message.body as? [String: Any], let action = body["action"] as? String else { replyHandler(nil, "消息来源无效。"); return }
        do {
            switch action {
            case "load":
                let result = dataStore.load()
                if let raw = result["raw"] as? String, let bytes = raw.data(using: .utf8), let value = try? CalendarDataStore.validate(bytes) { latestRequirements = value["requirements"] as? [[String: Any]] ?? [] }
                dataLoaded = true
                replyHandler(result, nil)
                refreshReminders()
                if let id = pendingNotificationID { pendingNotificationID = nil; openNotification(id) }
            case "save":
                guard let raw = body["raw"] as? String, let bytes = raw.data(using: .utf8) else { throw CalendarDataError(message: "保存内容无效。") }
                try dataStore.save(bytes, recovery: body["recovery"] as? Bool == true)
                latestRequirements = (try CalendarDataStore.validate(bytes))["requirements"] as? [[String: Any]] ?? []
                let snapshot = latestRequirements
                // File persistence completes independently of the OS permission prompt.
                // A suppressed or unanswered prompt must never lock the requirement editor.
                let pendingIssue: Any = ReminderPlan.make(snapshot).isEmpty ? NSNull() : "需求已保存，正在确认系统提醒状态…"
                replyHandler(["ok": true, "reminderIssue": pendingIssue], nil)
                Task { @MainActor in
                    let issue = await reminders.reconcile(snapshot, requestPermission: true)
                    webView.callAsyncJavaScript("await window.CalendarReady; while (window.CalendarApp.isSaving()) await new Promise(resolve => setTimeout(resolve, 10)); window.CalendarApp.setReminderIssue(issue)", arguments: ["issue": issue as Any? ?? NSNull()], in: nil, in: .page, completionHandler: nil)
                }
            case "exportJSON":
                exportJSONFile(scope: body["scope"] as? String ?? "all", completion: replyHandler)
            case "pickJSON":
                pickJSONFile(completion: replyHandler)
            case "resourceIcon":
                guard let raw = body["url"] as? String else { replyHandler(NSNull(), nil); return }
                if verifyScript != nil && ProcessInfo.processInfo.environment["CALENDAR_VERIFY_SITE_ICONS"] != "live" { replyHandler(NSNull(), nil); return }
                Task { @MainActor in replyHandler(await resourceIcons.icon(for: raw) as Any? ?? NSNull(), nil) }
            case "contextMenu":
                guard let id = body["id"] as? String else { throw CalendarDataError(message: "需求标识无效。") }
                let menu = requirementMenu(id)
                replyHandler(["items": menu.items.map(\.title)], nil)
                if verifyScript == nil || ProcessInfo.processInfo.environment["CALENDAR_VERIFY_SHOW_MENUS"] == "1" { DispatchQueue.main.async { menu.popUp(positioning: nil, at: NSEvent.mouseLocation, in: nil) } }
            case "verifyWindow":
                guard verifyScript != nil else { replyHandler(nil, "仅在隔离回归中可用。"); return }
                if let name = ProcessInfo.processInfo.environment["CALENDAR_VERIFY_FRAME_NAME"], body["save"] as? Bool == true {
                    window.setFrame(NSRect(x: 100,y: 100,width: 980,height: 700), display: true)
                    window.saveFrame(usingName: name); UserDefaults.standard.synchronize()
                }
                let bundleIcon = Bundle.main.url(forResource: "AppIcon", withExtension: "icns").flatMap { NSImage(contentsOf: $0) }
                if let directory = ProcessInfo.processInfo.environment["CALENDAR_VERIFY_ICON_DIR"] {
                    for (name, image) in [("bundle", bundleIcon), ("running", NSApp.applicationIconImage)] {
                        if let data = image?.tiffRepresentation, let bitmap = NSBitmapImageRep(data: data), let png = bitmap.representation(using: .png, properties: [:]) {
                            try? png.write(to: URL(fileURLWithPath: directory).appendingPathComponent(name + ".png"))
                        }
                    }
                }
                replyHandler(["applicationIconAvailable":NSApp.applicationIconImage?.isValid ?? false,"iconFile":Bundle.main.object(forInfoDictionaryKey: "CFBundleIconFile") as? String ?? "","width":window.frame.width,"height":window.frame.height,"fullScreenAvailable":window.collectionBehavior.contains(.fullScreenPrimary),"menus":NSApp.mainMenu?.items.compactMap { $0.submenu?.title } ?? []], nil)
            case "verifyReminders":
                guard verifyScript != nil, let scheduler = notificationScheduler as? IsolatedNotificationScheduler else { replyHandler(nil, "仅在隔离回归中可用。"); return }
                Task { @MainActor in
                    if body["wait"] as? Bool != false { _ = await reminders.waitUntilSettled() }
                    replyHandler(["ids": Array(scheduler.plans.keys), "permissionRequests": scheduler.requests], nil)
                }
            default: replyHandler(nil, "未知操作。")
            }
        } catch { replyHandler(nil, error.localizedDescription) }
    }
    func applicationDidBecomeActive(_ notification: Notification) { if dataLoaded {
        webView.callAsyncJavaScript("await window.CalendarReady; window.CalendarApp.refreshDate()", arguments: [:], in: nil, in: .page, completionHandler: nil)
        refreshReminders()
    } }
    func refreshReminders() {
        let snapshot = latestRequirements
        Task { @MainActor in
            let issue = await reminders.reconcile(snapshot, requestPermission: false)
            webView.callAsyncJavaScript("await window.CalendarReady; window.CalendarApp.setReminderIssue(issue)", arguments: ["issue": issue as Any? ?? NSNull()], in: nil, in: .page, completionHandler: nil)
        }
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        if let id = response.notification.request.content.userInfo["requirementID"] as? String {
            Task { @MainActor [weak self] in
                guard let self else { return }
                if !dataLoaded { pendingNotificationID = id; return }
                openNotification(id)
            }
        }
        completionHandler()
    }
    func openNotification(_ id: String) {
        window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        webView.callAsyncJavaScript("await window.CalendarReady; return window.CalendarApp.openRequirement(id)", arguments: ["id": id], in: nil, in: .page, completionHandler: nil)
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) { completionHandler([.banner,.sound]) }
    func showError(_ message: String) { let alert = NSAlert(); alert.messageText = message; alert.addButton(withTitle: "好"); alert.beginSheetModal(for: window) }
    @objc func showDataFolder() { NSWorkspace.shared.open(dataStore.directory) }
    @objc func exportJSON() { exportJSONFile(scope: "all") { _, error in if let error { self.showError(error) } } }
    @objc func importJSON() { command("importJSON") }
    func pickJSONFile(completion: @escaping (Any?, String?) -> Void) {
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.json]; panel.allowsMultipleSelection = false; panel.canChooseDirectories = false; panel.title = "导入需求 JSON"
        panel.beginSheetModal(for: window) { response in
            guard response == .OK, let url = panel.url else { completion(["raw":NSNull()], nil); return }
            do {
                let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                guard size <= 16 * 1024 * 1024 else { throw CalendarDataError(message:"JSON 文件不能超过 16 MB。") }
                let raw = try String(contentsOf: url, encoding: .utf8)
                completion(["raw":raw], nil)
            } catch { completion(nil, error.localizedDescription) }
        }
    }
    func exportJSONFile(scope: String, completion: @escaping (Any?, String?) -> Void) {
        guard ["all","summary"].contains(scope) else { completion(nil,"导出范围无效。"); return }
        webView.callAsyncJavaScript("return window.CalendarApp.exportJSON(scope)", arguments:["scope":scope], in:nil, in:.page) { result in
            guard case .success(let value) = result, let raw = value as? String, let data = raw.data(using:.utf8), (try? CalendarDataStore.validate(data)) != nil else { completion(nil,"无法导出，请等待当前保存完成。"); return }
            let panel = NSSavePanel(); panel.allowedContentTypes = [.json]; panel.nameFieldStringValue = "需求日历.json"; panel.title = "导出需求 JSON"
            panel.beginSheetModal(for:self.window) { response in
                guard response == .OK, let url = panel.url else { completion(["saved":false],nil); return }
                do { try data.write(to:url,options:.atomic); completion(["saved":true,"bytes":data.count],nil) }
                catch { completion(nil,error.localizedDescription) }
            }
        }
    }
    func startCommandServer() {
        guard commandServer == nil, verifyScript == nil, ProcessInfo.processInfo.environment["CALENDAR_DISABLE_COMMANDS"] != "1" else { return }
        do {
            let server = CalendarCommandServer(directory:dataStore.directory) { [weak self] request, reply in
                guard let self else { reply(["ok":false,"error":["code":"APP_CLOSED","message":"应用已关闭。"]]); return }
                self.webView.callAsyncJavaScript("await window.CalendarReady; return await window.CalendarApp.executeCommand(request)", arguments:["request":request], in:nil, in:.page) { result in
                    switch result {
                    case .success(let value): reply(value as? [String:Any] ?? ["ok":false,"error":["code":"INTERNAL_ERROR","message":"无效的指令响应。"]])
                    case .failure(let error): reply(["ok":false,"error":["code":"INTERNAL_ERROR","message":error.localizedDescription]])
                    }
                }
            }
            try server.start(); commandServer = server
        } catch { showError(error.localizedDescription) }
    }
    func requirementMenu(_ id: String) -> NSMenu {
        let menu = NSMenu(title: "需求")
        for (title, action) in [("打开详情", #selector(contextOpen(_:))), ("编辑需求", #selector(contextEdit(_:))), ("删除需求", #selector(contextDelete(_:)))] {
            let item=menu.addItem(withTitle:title,action:action,keyEquivalent:"");item.target=self;item.representedObject=id
        }
        return menu
    }
    @objc func contextOpen(_ sender: NSMenuItem) { contextCommand("openRequirement", sender) }
    @objc func contextEdit(_ sender: NSMenuItem) { contextCommand("editRequirement", sender) }
    @objc func contextDelete(_ sender: NSMenuItem) { contextCommand("deleteRequirement", sender) }
    func contextCommand(_ name: String, _ sender: NSMenuItem) {
        guard let id=sender.representedObject as? String else { return }
        webView.callAsyncJavaScript("return await window.CalendarApp[method](id)", arguments:["method":name,"id":id], in:nil,in:.page,completionHandler:nil)
    }
    @objc func performUndo() {
        webView.callAsyncJavaScript("return await window.CalendarApp.command('undo')",arguments:[:],in:nil,in:.page) { result in
            if case .success(let handled)=result,handled as? Bool == true { return }
            NSApp.sendAction(Selector(("undo:")),to:nil,from:nil)
        }
    }
    func command(_ value: String) { webView.evaluateJavaScript("window.CalendarApp?.command('\(value)')", completionHandler: nil) }
    @objc func newRequirement() { command("new") }
    @objc func saveRequirement() { command("save") }
    @objc func closeDetail() { command("close") }
    @objc func previousMonth() { command("previous") }
    @objc func nextMonth() { command("next") }

    func authorizeClose(_ done: @escaping (Bool) -> Void) {
        webView.evaluateJavaScript("window.CalendarApp?.hasUnsavedChanges() ?? false") { result, error in
            guard error == nil else { done(false); return }
            guard result as? Bool == true else { done(true); return }
            let alert = NSAlert()
            alert.messageText = "保存对需求的更改？"
            alert.informativeText = "未保存的更改会在退出后丢失。"
            alert.addButton(withTitle: "保存")
            alert.addButton(withTitle: "取消")
            alert.addButton(withTitle: "不保存")
            alert.beginSheetModal(for: self.window) { response in
                if response == .alertThirdButtonReturn { done(true) }
                else if response == .alertFirstButtonReturn {
                    self.webView.callAsyncJavaScript("await window.CalendarApp.command('save'); return !window.CalendarApp.hasUnsavedChanges()", arguments: [:], in: nil, in: .page) { result in
                        switch result { case .success(let saved): done(saved as? Bool == true); case .failure: done(false) }
                    }
                } else { done(false) }
            }
        }
    }
    var closingAuthorized = false
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if closingAuthorized { return true }
        authorizeClose { allowed in if allowed { self.closingAuthorized = true; self.window.close(); NSApp.terminate(nil) } }
        return false
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if closingAuthorized { return .terminateNow }
        authorizeClose { allowed in NSApp.reply(toApplicationShouldTerminate: allowed) }
        return .terminateLater
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func openExternal(_ url: URL?) {
        guard let url, LinkPolicy.permits(url) else { return }
        NSWorkspace.shared.open(url)
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.request.url == entry && navigationAction.targetFrame?.isMainFrame == true { decisionHandler(.allow); return }
        if navigationAction.navigationType == .linkActivated { openExternal(navigationAction.request.url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        openExternal(navigationAction.request.url)
        return nil
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        startCommandServer()
        guard let verifyScript, let verifyOutput else { return }
        // A test timeout is terminal evidence, not a reason to relaunch the same test.
        DispatchQueue.main.asyncAfter(deadline: .now() + 45) {
            let output: [String: Any] = ["ok": false, "error": "WebKit verification exceeded 45 seconds", "script": verifyScript]
            if let data = try? JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted,.sortedKeys]) { try? data.write(to: URL(fileURLWithPath: verifyOutput), options: .atomic) }
            exit(1)
        }
        do {
            let script = "await window.CalendarReady;\n" + (try String(contentsOfFile: verifyScript, encoding: .utf8))
            webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { result in
                let output: [String: Any]
                switch result {
                case .success(let value): output = ["ok": true, "result": value]
                case .failure(let error): output = ["ok": false, "error": error.localizedDescription, "details": String(describing: (error as NSError).userInfo)]
                }
                do { try JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: verifyOutput), options: .atomic) } catch { fputs("Verification write failed: \(error)\n", stderr) }
                if let snapshot = ProcessInfo.processInfo.environment["CALENDAR_VERIFY_SNAPSHOT"] {
                    webView.takeSnapshot(with: nil) { image, error in
                        if let image, let data = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: data), let png = bitmap.representation(using: .png, properties: [:]) { try? png.write(to: URL(fileURLWithPath: snapshot)) }
                        exit(output["ok"] as? Bool == true ? 0 : 1)
                    }
                } else { exit(output["ok"] as? Bool == true ? 0 : 1) }
            }
        } catch { fputs("Verification script failed: \(error)\n", stderr); exit(1) }
    }
}
@main
struct Main {
    @MainActor static func main() {
        let app = NSApplication.shared
        let delegate = CalendarApplication()
        app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
    }
}
