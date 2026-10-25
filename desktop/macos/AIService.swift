import Foundation
import Security
import CryptoKit

/// Private stdio bridge to the shared Node/Harness service. Calendar writes are
/// dispatched back to the live WebView, never to a second file writer.
@MainActor
final class CalendarAIService {
    typealias Reply = (Any?, String?) -> Void
    let directory: URL
    let isolated: Bool
    let dispatch: ([String: Any], @escaping ([String: Any]) -> Void) -> Void
    var child: Process?
    var input: Pipe?
    var output: Pipe?
    var diagnostics: Pipe?
    var buffer = Data()
    var sequence = 0
    var pending: [Int: Reply] = [:]
    var waiting: [() -> Void] = []
    var ready = false
    var failure: String?
    var ephemeralKey = ""

    init(directory: URL, isolated: Bool, dispatch: @escaping ([String: Any], @escaping ([String: Any]) -> Void) -> Void) {
        self.directory = directory; self.isolated = isolated; self.dispatch = dispatch
    }
    var account: String { SHA256.hash(data: Data(directory.path.utf8)).map { String(format: "%02x", $0) }.joined() }
    var query: [String: Any] { [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"dev.11eleve.requirement-calendar.ai",kSecAttrAccount as String:account] }
    func readKey() throws -> String {
        if isolated { return ephemeralKey }
        var lookup = query; lookup[kSecReturnData as String] = true; lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &result)
        if status == errSecItemNotFound { return "" }
        guard status == errSecSuccess, let data = result as? Data, let value = String(data:data,encoding:.utf8) else { throw NSError(domain:NSOSStatusErrorDomain,code:Int(status)) }
        return value
    }
    func writeKey(_ value: String) throws {
        if isolated { ephemeralKey = value; return }
        if value.isEmpty { let status = SecItemDelete(query as CFDictionary); if status != errSecSuccess && status != errSecItemNotFound { throw NSError(domain:NSOSStatusErrorDomain,code:Int(status)) }; return }
        let update = [kSecValueData as String:Data(value.utf8)]
        var status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(query.merging(update) { _, new in new } as CFDictionary,nil) }
        guard status == errSecSuccess else { throw NSError(domain:NSOSStatusErrorDomain,code:Int(status)) }
    }
    func start() {
        guard child == nil, failure == nil else { return }
        do {
            guard let root = Bundle.main.resourceURL?.appendingPathComponent("ai",isDirectory:true) else { throw CalendarDataError(message:"安装包缺少助手服务。") }
            let process = Process(), stdin = Pipe(), stdout = Pipe(), stderr = Pipe()
            process.executableURL = root.appendingPathComponent("node")
            process.arguments = [root.appendingPathComponent("entry.mjs").path,directory.path]
            process.standardInput = stdin; process.standardOutput = stdout; process.standardError = stderr
            process.currentDirectoryURL = root
            stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let data = handle.availableData
                Task { @MainActor in self?.consume(data) }
            }
            stderr.fileHandleForReading.readabilityHandler = { handle in _ = handle.availableData }
            process.terminationHandler = { [weak self] _ in Task { @MainActor in self?.failed("日历助手服务已退出，请重新打开应用。") } }
            child = process; input = stdin; output = stdout; diagnostics = stderr
            try process.run()
            DispatchQueue.main.asyncAfter(deadline:.now()+15) { [weak self] in if let self, !self.ready { self.failed("日历助手启动超时。"); self.child?.terminate() } }
        } catch { failed("无法启动日历助手："+error.localizedDescription) }
    }
    func failed(_ message: String) {
        failure = message; ready = false
        let replies = pending.values; pending.removeAll(); replies.forEach { $0(nil,message) }
        let queued = waiting; waiting.removeAll(); queued.forEach { $0() }
    }
    func consume(_ data: Data) {
        guard !data.isEmpty else { return }
        buffer.append(data)
        guard buffer.count <= 64*1024*1024 else { failed("助手消息过大。"); child?.terminate(); return }
        while let end = buffer.firstIndex(of:10) {
            let line = buffer[..<end]; buffer.removeSubrange(...end)
            guard let message = try? JSONSerialization.jsonObject(with:line) as? [String:Any], let type = message["type"] as? String else { failed("助手通信格式无效。"); child?.terminate(); return }
            if type == "ready" {
                var payload: [String:Any] = ["method":"key","value":""]
                do { payload["value"] = try readKey() } catch { payload["issue"] = "无法读取已保存的 API Key，请在助手设置中重新保存。" }
                send(payload) { [weak self] _,error in
                    guard let self else { return }; if let error { self.failed(error); return }
                    self.ready = true; let queued = self.waiting; self.waiting.removeAll(); queued.forEach { $0() }
                }
            } else if type == "response", let id = message["id"] as? Int, let reply = pending.removeValue(forKey:id) {
                reply(message["result"],(message["error"] as? [String:Any])?["message"] as? String)
            } else if type == "command", let id = message["id"] as? Int, let request = message["request"] as? [String:Any] {
                dispatch(request) { [weak self] result in self?.write(["type":"commandResult","id":id,"result":result]) }
            }
        }
    }
    func write(_ value: [String:Any]) {
        do { var data = try JSONSerialization.data(withJSONObject:value); data.append(10); try input?.fileHandleForWriting.write(contentsOf:data) }
        catch { failed("助手连接已中断。") }
    }
    func send(_ request: [String:Any], reply: @escaping Reply) {
        sequence += 1; let id = sequence; pending[id] = reply
        write(["type":"request","id":id,"request":request])
        DispatchQueue.main.asyncAfter(deadline:.now()+20) { [weak self] in self?.pending.removeValue(forKey:id)?(nil,"助手请求超时，请稍后重试。") }
    }
    func request(_ request: [String:Any], reply: @escaping Reply) {
        if let failure { reply(nil,failure); return }
        start()
        if !ready { if let failure { reply(nil,failure) } else { waiting.append { [weak self] in self?.request(request,reply:reply) } }; return }
        guard let method = request["method"] as? String, ["state","configure","send","cancel","new","select","rotateToken"].contains(method) else { reply(nil,"不支持的助手操作。"); return }
        guard method == "configure" else { send(request,reply:reply); return }
        send(["method":"state"]) { [weak self] value,error in
            guard let self else { return }; if let error { reply(nil,error); return }
            let clear = request["clearKey"] as? Bool == true, key = request["apiKey"] as? String ?? ""
            if (value as? [String:Any])?["busy"] as? Bool == true && (!key.isEmpty || clear) { reply(nil,"请先停止对话再更换 API Key。"); return }
            guard key.count <= 4096 else { reply(nil,"API Key 无效。"); return }
            send(["method":"configure","settings":request["settings"] ?? [:]]) { [weak self] _,error in
                guard let self else { return }; if let error { reply(nil,error); return }
                if clear || !key.isEmpty {
                    do { try self.writeKey(clear ? "" : key) } catch { reply(nil,"无法保存 API Key 到钥匙串："+error.localizedDescription); return }
                    self.send(["method":"key","value":clear ? "" : key]) { [weak self] _,error in if let error { reply(nil,error) } else { self?.send(["method":"state"],reply:reply) } }
                } else { self.send(["method":"state"],reply:reply) }
            }
        }
    }
    func stop() { try? input?.fileHandleForWriting.close() }
}
