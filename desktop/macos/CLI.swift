import Foundation
import Darwin

struct CLIError: Error { let code: String; let message: String }
let inputLimit = 16 * 1024 * 1024
func failure(_ code: String, _ message: String) -> CLIError { CLIError(code:code,message:message) }
func output(_ value: Any) {
    if let data = try? JSONSerialization.data(withJSONObject:value,options:[.prettyPrinted,.sortedKeys,.fragmentsAllowed]) {
        FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data([10]))
    }
}
func readJSON(_ file: String) throws -> Any {
    let handle = file == "-" ? FileHandle.standardInput : try FileHandle(forReadingFrom:URL(fileURLWithPath:file))
    defer { if file != "-" { try? handle.close() } }
    var data = Data()
    while let chunk = try handle.read(upToCount:min(8192,inputLimit + 1 - data.count)), !chunk.isEmpty {
        data.append(chunk); if data.count > inputLimit { throw failure("TOO_LARGE","JSON 输入不能超过 16 MB。") }
    }
    do { return try JSONSerialization.jsonObject(with:data,options:.fragmentsAllowed) }
    catch { throw failure("INVALID_JSON","无法解析 JSON：\(error.localizedDescription)") }
}
func connectSocket(_ path: String) throws -> Int32 {
    var info = stat()
    guard lstat(path,&info) == 0 else { throw failure("APP_NOT_RUNNING","需求日历尚未启动，或命令行入口尚未就绪。") }
    guard info.st_uid == geteuid(), (info.st_mode & S_IFMT) == S_IFSOCK, (info.st_mode & 0o077) == 0 else { throw failure("UNSAFE_ENDPOINT","命令行入口的所有者或权限不正确。") }
    var address = sockaddr_un(); address.sun_family = sa_family_t(AF_UNIX); address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
    let bytes = Array(path.utf8) + [0]
    guard bytes.count <= MemoryLayout.size(ofValue:address.sun_path) else { throw failure("INVALID_PATH","数据目录路径过长。") }
    withUnsafeMutableBytes(of:&address.sun_path) { $0.copyBytes(from:bytes) }
    let client = socket(AF_UNIX,SOCK_STREAM,0)
    guard client >= 0 else { throw failure("CONNECTION_FAILED","无法创建连接。") }
    var yes: Int32 = 1, timeout = timeval(tv_sec:20,tv_usec:0)
    setsockopt(client,SOL_SOCKET,SO_NOSIGPIPE,&yes,socklen_t(MemoryLayout.size(ofValue:yes)))
    setsockopt(client,SOL_SOCKET,SO_RCVTIMEO,&timeout,socklen_t(MemoryLayout.size(ofValue:timeout)))
    setsockopt(client,SOL_SOCKET,SO_SNDTIMEO,&timeout,socklen_t(MemoryLayout.size(ofValue:timeout)))
    let connected = withUnsafePointer(to:&address) { $0.withMemoryRebound(to:sockaddr.self,capacity:1) { Darwin.connect(client,$0,socklen_t(MemoryLayout<sockaddr_un>.size)) } }
    guard connected == 0 else { Darwin.close(client); throw failure("APP_NOT_RUNNING","无法连接需求日历，请启动应用后重试。") }
    var uid: uid_t = 0, gid: gid_t = 0
    guard getpeereid(client,&uid,&gid) == 0, uid == geteuid() else { Darwin.close(client); throw failure("UNSAFE_ENDPOINT","拒绝其他用户的命令行服务。") }
    return client
}
func exchange(_ client: Int32, _ request: [String:Any]) throws -> [String:Any] {
    defer { Darwin.close(client) }
    var bytes = try JSONSerialization.data(withJSONObject:request); bytes.append(10)
    try bytes.withUnsafeBytes { buffer in
        var sent = 0
        while sent < buffer.count {
            let count = Darwin.send(client,buffer.baseAddress!.advanced(by:sent),buffer.count-sent,0)
            if count <= 0 { if errno == EINTR { continue }; throw failure("CONNECTION_FAILED","发送指令失败。") }; sent += count
        }
    }
    var data = Data(), buffer = [UInt8](repeating:0,count:8192)
    while data.count <= 64 * 1024 * 1024 {
        let count = Darwin.recv(client,&buffer,buffer.count,0)
        if count <= 0 { if count < 0 && errno == EINTR { continue }; throw failure("CONNECTION_FAILED","未收到确认结果。请查询数据后再重试写入。") }
        data.append(buffer,count:count)
        if let end = data.firstIndex(of:10) {
            guard let value = try JSONSerialization.jsonObject(with:data.prefix(upTo:end)) as? [String:Any] else { throw failure("INVALID_RESPONSE","应用返回了无效响应。") }; return value
        }
    }
    throw failure("TOO_LARGE","响应过大。")
}
let help = """
需求日历命令行 reqcal

  reqcal list [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--query 文字]
  reqcal get ID
  reqcal create --json '{"title":"登录优化","start":"2026-10-12","end":"2026-10-16"}'
  reqcal create --file requirement.json       # --file - 从标准输入读取
  reqcal update ID --json '{"note":"接口已确认"}' [--if-revision REVISION]
  reqcal shift ID --days 3 [--if-revision REVISION]
  reqcal delete ID [--if-revision REVISION]
  reqcal import requirements.json [--mode merge|update|copy|replace]
  reqcal preview-import requirements.json [--mode merge|update|copy|replace]
  reqcal export [--output requirements.json] [--from DATE] [--to DATE]
  reqcal schema
  reqcal status
  reqcal request --file command.json         # 原始结构化指令；可传 expectedRevision

默认输出 JSON：{ok, revision, changed, data}。导出指定 --output 时写入可直接导回的 JSON。
应用未启动时自动在后台启动同包内的需求日历。使用 --no-launch 可禁用自动启动。
修改会立即持久化并刷新日历；未保存草稿返回 DRAFT_DIRTY，过期版本返回 REVISION_CONFLICT。
导入默认合并并跳过重复 ID；replace 会替换全部需求并归档原记录。
高级选项：--data-dir DIR --app APP_PATH；自定义目录必须与应用启动配置一致。
退出码：0 成功；2 参数或校验错误；3 草稿/版本/忙碌冲突；4 连接/持久化失败。
"""
do {
    var args = Array(CommandLine.arguments.dropFirst()), positional = [String](), options = [String:String](), noLaunch = false
    if args.isEmpty || args.contains("--help") || args.contains("-h") { print(help); exit(0) }
    let optionNames: Set<String> = ["--from","--to","--query","--json","--file","--mode","--output","--days","--if-revision","--data-dir","--app"]
    while !args.isEmpty {
        let token = args.removeFirst()
        if token == "--no-launch" { noLaunch = true }
        else if token.hasPrefix("--") {
            guard optionNames.contains(token), !args.isEmpty, options[token] == nil else { throw failure("INVALID_ARGUMENT","无效、重复或缺少值的选项：\(token)") }
            options[token] = args.removeFirst()
        } else { positional.append(token) }
    }
    guard let action = positional.first else { throw failure("INVALID_ARGUMENT","需要指令；使用 --help 查看说明。") }
    let supported: Set<String> = ["list","get","create","update","shift","delete","import","export","preview-import","schema","status","request"]
    guard supported.contains(action) else { throw failure("UNKNOWN_COMMAND","未知指令：\(action)") }
    var request: [String:Any] = ["action":action]
    var allowed: Set<String> = ["--data-dir","--app"]
    if ["list","export"].contains(action) { allowed.formUnion(["--from","--to","--query"]); for key in ["from","to","query"] { if let value = options["--"+key] { request[key] = value } } }
    if action == "export" { allowed.insert("--output") }
    if ["create","update","request"].contains(action) {
        allowed.formUnion(["--json","--file"])
        guard (options["--json"] != nil) != (options["--file"] != nil) else { throw failure("INVALID_ARGUMENT","请选择 --json 或 --file 提供 JSON。") }
        let value: Any
        if let raw = options["--json"] { guard raw.utf8.count <= inputLimit, let data = raw.data(using:.utf8) else { throw failure("TOO_LARGE","JSON 输入过大。") }; do { value = try JSONSerialization.jsonObject(with:data,options:.fragmentsAllowed) } catch { throw failure("INVALID_JSON","--json 内容不是有效的 JSON。") } }
        else { value = try readJSON(options["--file"]!) }
        if action == "request" { guard let object = value as? [String:Any] else { throw failure("INVALID_ARGUMENT","原始指令必须是 JSON 对象。") }; request = object }
        else { request["data"] = value }
    }
    if ["get","update","shift","delete"].contains(action) { guard positional.count == 2 else { throw failure("INVALID_ARGUMENT","\(action) 需要一个需求 ID。") }; request["id"] = positional[1] }
    else if ["import","preview-import"].contains(action) {
        guard positional.count == 2 else { throw failure("INVALID_ARGUMENT","需要 JSON 文件路径，或 - 表示标准输入。") }
        request["data"] = try readJSON(positional[1]); allowed.insert("--mode"); if let mode = options["--mode"] { request["mode"] = mode }
    } else if positional.count != 1 { throw failure("INVALID_ARGUMENT","多余的位置参数。") }
    if action == "shift" { allowed.insert("--days"); guard let raw = options["--days"], let days = Int(raw) else { throw failure("INVALID_ARGUMENT","--days 必须是整数。") }; request["days"] = days }
    if ["create","update","shift","delete","import","request"].contains(action) { allowed.insert("--if-revision"); if let revision = options["--if-revision"] { request["expectedRevision"] = revision } }
    for key in options.keys where !allowed.contains(key) { throw failure("INVALID_ARGUMENT","\(action) 不支持选项 \(key)。") }
    if action == "import", request["mode"] as? String == "replace", options["--if-revision"] == nil { throw failure("INVALID_ARGUMENT","替换全部需求需要先读取 revision，再传 --if-revision。") }
    let directory = options["--data-dir"].map { URL(fileURLWithPath:$0) } ?? FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("RequirementCalendar",isDirectory:true)
    let socket = directory.appendingPathComponent("command.sock").path
    let client: Int32
    do { client = try connectSocket(socket) }
    catch let error as CLIError {
        guard !noLaunch, error.code == "APP_NOT_RUNNING", options["--data-dir"] == nil else { throw error }
        let executable = URL(fileURLWithPath:CommandLine.arguments[0]).standardizedFileURL.resolvingSymlinksInPath()
        let bundle = options["--app"].map { URL(fileURLWithPath:$0) } ?? executable.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        guard bundle.pathExtension == "app", FileManager.default.fileExists(atPath:bundle.appendingPathComponent("Contents/MacOS/RequirementCalendar").path) else { throw failure("APP_NOT_RUNNING","找不到同包应用，请传 --app /完整路径/需求日历.app。") }
        let process = Process(); process.executableURL = URL(fileURLWithPath:"/usr/bin/open"); process.arguments = ["-g","-a",bundle.path,"--args","--command-background"]; process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice; try process.run(); process.waitUntilExit()
        var connected: Int32? = nil
        for _ in 0..<100 { if let fd = try? connectSocket(socket) { connected = fd; break }; usleep(100_000) }
        guard let connected else { throw failure("APP_NOT_RUNNING","自动启动后仍无法连接，请打开新版应用后重试。") }; client = connected
    }
    let response = try exchange(client,request)
    if response["ok"] as? Bool == true, let destination = options["--output"] {
        guard let data = response["data"] else { throw failure("INVALID_RESPONSE","没有导出内容。") }
        var bytes = try JSONSerialization.data(withJSONObject:data,options:[.prettyPrinted,.sortedKeys]); bytes.append(10)
        try bytes.write(to:URL(fileURLWithPath:destination),options:.atomic)
        output(["ok":true,"revision":response["revision"] ?? NSNull(),"file":URL(fileURLWithPath:destination).standardizedFileURL.path,"bytes":bytes.count])
    } else { output(response) }
    if response["ok"] as? Bool != true {
        let error = response["error"] as? [String:Any], code = error?["code"] as? String ?? "INTERNAL_ERROR"
        exit(["BUSY","DRAFT_DIRTY","REVISION_CONFLICT"].contains(code) ? 3 : ["SAVE_FAILED","INTERNAL_ERROR"].contains(code) ? 4 : 2)
    }
} catch let error as CLIError { output(["ok":false,"error":["code":error.code,"message":error.message]]); exit(["APP_NOT_RUNNING","CONNECTION_FAILED","UNSAFE_ENDPOINT"].contains(error.code) ? 4 : 2) }
catch { output(["ok":false,"error":["code":"IO_ERROR","message":error.localizedDescription]]); exit(4) }
