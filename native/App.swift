import AppKit
import WebKit

@MainActor
final class CalendarApplication: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    let entry = Bundle.main.url(forResource: "index", withExtension: "html")!
    let verifyScript = ProcessInfo.processInfo.environment["CALENDAR_VERIFY_SCRIPT"]
    let verifyOutput = ProcessInfo.processInfo.environment["CALENDAR_VERIFY_OUTPUT"]

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        createMenu()
        let config = WKWebViewConfiguration()
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
        if verifyScript == nil { window.setFrameAutosaveName("RequirementCalendarWindow") }
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        webView.loadFileURL(entry, allowingReadAccessTo: entry.deletingLastPathComponent())
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
        file.submenu = fileMenu
        main.addItem(file)
        let edit = NSMenuItem()
        let editMenu = NSMenu(title: "编辑")
        for (title, action, key) in [("撤销", Selector(("undo:")), "z"), ("重做", Selector(("redo:")), "Z"), ("剪切", #selector(NSText.cut(_:)), "x"), ("拷贝", #selector(NSText.copy(_:)), "c"), ("粘贴", #selector(NSText.paste(_:)), "v"), ("全选", #selector(NSText.selectAll(_:)), "a")] {
            editMenu.addItem(withTitle: title, action: action, keyEquivalent: key)
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
                    self.webView.evaluateJavaScript("window.CalendarApp.command('save'); !window.CalendarApp.hasUnsavedChanges()") { saved, error in done(error == nil && saved as? Bool == true) }
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
        guard let verifyScript, let verifyOutput else { return }
        do {
            let script = try String(contentsOfFile: verifyScript, encoding: .utf8)
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
