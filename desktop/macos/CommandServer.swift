import Foundation
import Darwin

// A per-user Unix socket. Requests are dispatched through the live application's
// command layer, so the CLI never writes around unsaved drafts or native backups.
final class CalendarCommandServer: @unchecked Sendable {
    let directory: URL
    let handler: @MainActor ([String: Any], @escaping ([String: Any]) -> Void) -> Void
    private var listener: Int32 = -1
    private var lease: Int32 = -1
    private let queue = DispatchQueue(label: "calendar.commands.accept")
    init(directory: URL, handler: @escaping @MainActor ([String: Any], @escaping ([String: Any]) -> Void) -> Void) {
        self.directory = directory; self.handler = handler
    }
    func start() throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        lease = Darwin.open(directory.appendingPathComponent("command.lock").path, O_CREAT | O_RDWR, 0o600)
        guard lease >= 0, flock(lease, LOCK_EX | LOCK_NB) == 0 else { throw CalendarDataError(message: "另一个需求日历正在提供命令行服务，请关闭重复窗口。") }
        let path = directory.appendingPathComponent("command.sock").path
        var address = sockaddr_un(); address.sun_family = sa_family_t(AF_UNIX)
        let bytes = Array(path.utf8) + [0]
        guard bytes.count <= MemoryLayout.size(ofValue: address.sun_path) else { throw CalendarDataError(message: "命令行数据目录路径过长。") }
        withUnsafeMutableBytes(of: &address.sun_path) { buffer in buffer.copyBytes(from: bytes) }
        address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
        var info = stat()
        if lstat(path, &info) == 0 {
            guard info.st_uid == geteuid(), (info.st_mode & S_IFMT) == S_IFSOCK else { throw CalendarDataError(message: "命令行入口被其他文件占用。") }
            guard unlink(path) == 0 else { throw CalendarDataError(message: "无法清理失效的命令行入口。") }
        }
        listener = socket(AF_UNIX, SOCK_STREAM, 0)
        guard listener >= 0 else { throw CalendarDataError(message: "无法创建命令行入口。") }
        let bound = withUnsafePointer(to: &address) { pointer in pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(listener, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) } }
        guard bound == 0, chmod(path, 0o600) == 0, listen(listener, 8) == 0 else { throw CalendarDataError(message: "无法启动命令行入口：\(String(cString: strerror(errno)))") }
        queue.async { [self] in
            while listener >= 0 {
                let client = accept(listener, nil, nil)
                if client < 0 { if errno == EINTR { continue }; break }
                DispatchQueue.global(qos: .utility).async { [self] in receive(client) }
            }
        }
    }
    private func respond(_ client: Int32, _ value: [String: Any]) {
        DispatchQueue.global(qos: .utility).async {
            defer { Darwin.close(client) }
            guard var bytes = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) else { return }
            bytes.append(10)
            bytes.withUnsafeBytes { buffer in
                var sent = 0
                while sent < buffer.count {
                    let count = Darwin.send(client, buffer.baseAddress!.advanced(by: sent), buffer.count - sent, 0)
                    if count <= 0 { if errno == EINTR { continue }; return }; sent += count
                }
            }
        }
    }
    private func receive(_ client: Int32) {
        var uid: uid_t = 0, gid: gid_t = 0, yes: Int32 = 1
        guard getpeereid(client, &uid, &gid) == 0, uid == geteuid() else { Darwin.close(client); return }
        setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &yes, socklen_t(MemoryLayout.size(ofValue: yes)))
        var timeout = timeval(tv_sec: 15, tv_usec: 0)
        setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout.size(ofValue: timeout)))
        setsockopt(client, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout.size(ofValue: timeout)))
        var data = Data(), buffer = [UInt8](repeating: 0, count: 8192)
        while data.count <= 64 * 1024 * 1024 {
            let count = Darwin.recv(client, &buffer, buffer.count, 0)
            if count <= 0 { if count < 0 && errno == EINTR { continue }; Darwin.close(client); return }
            data.append(buffer, count: count)
            if let end = data.firstIndex(of: 10) {
                guard let request = try? JSONSerialization.jsonObject(with: data.prefix(upTo: end)) as? [String: Any] else {
                    respond(client, ["ok": false, "error": ["code":"INVALID_JSON", "message":"指令必须是 JSON 对象。"]]); return
                }
                DispatchQueue.main.async { [self] in
                    handler(request) { [self] result in
                        var response = result
                        response["dataFile"] = directory.appendingPathComponent("calendar.json").path
                        respond(client, response)
                    }
                }
                return
            }
        }
        respond(client, ["ok": false, "error": ["code":"TOO_LARGE", "message":"指令过大。"]])
    }
    deinit { if listener >= 0 { Darwin.close(listener) }; if lease >= 0 { flock(lease, LOCK_UN); Darwin.close(lease) } }
}
