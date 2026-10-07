import Foundation
import CoreFoundation
import Darwin

struct CalendarDataError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

// File operations run under a cross-process lock. The observed bytes are an optimistic lease.
final class CalendarDataStore {
    let directory: URL
    var primary: URL { directory.appendingPathComponent("calendar.json") }
    var backup: URL { directory.appendingPathComponent("calendar.last-good.json") }
    private var observed: Data?
    private var blocked = false
    init(directory: URL) { self.directory = directory }

    static func validate(_ data: Data) throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any], let version = value["version"] as? Int, [4,5,6].contains(version) else { throw CalendarDataError(message: "数据版本或格式不受支持，原始数据已保留。") }
        func date(_ value: Any?) -> String? {
            guard let value = value as? String, value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil, value >= "0001-01-01" else { return nil }
            let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT: 0); formatter.dateFormat = "yyyy-MM-dd"; formatter.isLenient = false
            guard let parsed = formatter.date(from: value), formatter.string(from: parsed) == value else { return nil }
            return value
        }
        func nonempty(_ value: Any?) -> Bool { guard let value = value as? String else { return false }; return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        guard date(value["anchor"]) != nil, let items = value["requirements"] as? [[String: Any]] else { throw CalendarDataError(message: "数据不完整，原始数据已保留。") }
        var ids = Set<String>()
        for item in items {
            guard let id = item["id"] as? String, nonempty(id), ids.insert(id).inserted, nonempty(item["title"]), let start = date(item["start"]), let end = date(item["end"]), start <= end,
                  let phases = item["phases"] as? [[String: Any]], let resources = item["resources"] as? [[String: Any]], let tasks = item["tasks"] as? [String], tasks.allSatisfy({nonempty($0)}), let done = item["done"] as? [NSNumber], done.count == tasks.count, done.allSatisfy({CFGetTypeID($0) == CFBooleanGetTypeID()}), item["note"] is String else { throw CalendarDataError(message: "需求、事项或周期数据无效。") }
            var previous: String?
            for phase in phases.sorted(by: { ($0["start"] as? String ?? "") < ($1["start"] as? String ?? "") }) {
                guard nonempty(phase["name"]), let a = date(phase["start"]), let b = date(phase["end"]), a <= b, a >= start, b <= end, previous == nil || a > previous! else { throw CalendarDataError(message: "阶段日期越界或重叠。") }
                previous = b
            }
            for resource in resources {
                guard nonempty(resource["name"]), resource["type"] is String, let link = resource["url"] as? String, link.isEmpty || (LinkPolicy.permits(URL(string: link)) && link.rangeOfCharacter(from: .controlCharacters) == nil) else { throw CalendarDataError(message: "资料链接或名称无效。") }
            }
            if let reminder = item["reminder"], !(reminder is NSNull) {
                guard let reminder = reminder as? String, reminder.range(of: #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$"#, options: .regularExpression) != nil, date(String(reminder.prefix(10))) != nil, let hour = Int(reminder.dropFirst(11).prefix(2)), hour < 24, let minute = Int(reminder.suffix(2)), minute < 60 else { throw CalendarDataError(message: "提醒时间无效。") }
            }
        }
        return value
    }

    private func locked<T>(_ body: () throws -> T) throws -> T {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let descriptor = open(directory.appendingPathComponent("calendar.lock").path, O_CREAT | O_RDWR, 0o600)
        guard descriptor >= 0 else { throw CalendarDataError(message: "无法打开本机数据目录。") }
        defer { close(descriptor) }
        guard flock(descriptor, LOCK_EX | LOCK_NB) == 0 else { throw CalendarDataError(message: "另一个窗口正在保存，请稍后重试。") }
        defer { flock(descriptor, LOCK_UN) }
        return try body()
    }
    private func read(_ url: URL) throws -> Data? {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try Data(contentsOf: url)
    }
    func load() -> [String: Any] {
        do {
            return try locked {
                observed = try read(primary)
                guard let data = observed else { blocked = false; return ["raw": NSNull(), "issue": NSNull()] }
                do { _ = try Self.validate(data); blocked = false; return ["raw": String(decoding: data, as: UTF8.self), "issue": NSNull()] }
                catch {
                    if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let version = object["version"] as? Int, version > 6 { blocked = true; throw CalendarDataError(message: "数据来自更高版本，已阻止旧版覆盖。请升级应用。") }
                    if let good = try read(backup), (try? Self.validate(good)) != nil {
                        blocked = false
                        return ["raw": String(decoding: good, as: UTF8.self), "issue": "已载入上一份有效备份；损坏的原始文件将在下次保存时独立保留。"]
                    }
                    blocked = true
                    throw CalendarDataError(message: "数据无法读取，原文件已保留。请使用“文件 → 从备份恢复…”选择有效备份。")
                }
            }
        } catch { blocked = true; return ["raw": NSNull(), "issue": error.localizedDescription] }
    }
    func save(_ data: Data, recovery: Bool = false) throws {
        _ = try Self.validate(data)
        try locked {
            guard !blocked || recovery else { throw CalendarDataError(message: "当前记录无法安全覆盖，请先从备份恢复。") }
            let current = try read(primary)
            guard current == observed else { throw CalendarDataError(message: "数据已被另一个窗口修改，未覆盖任何记录。请重新打开应用后再编辑。") }
            if let current {
                if (try? Self.validate(current)) != nil { try current.write(to: backup, options: .atomic) }
                else { try current.write(to: directory.appendingPathComponent("calendar.preserved-\(UUID().uuidString).json"), options: .atomic) }
            }
            try data.write(to: primary, options: .atomic)
            observed = data
            blocked = false
        }
    }
}
