import Foundation
import UserNotifications

struct ReminderPlan: Equatable {
    let id: String
    let requirementID: String
    let title: String
    let components: DateComponents
    static let prefix = "requirement."
    static func make(_ requirements: [[String: Any]], now: Date = Date(), calendar: Calendar = .current) -> [ReminderPlan] {
        requirements.compactMap { value in
            guard let id = value["id"] as? String, let title = value["title"] as? String, let raw = value["reminder"] as? String else { return nil }
            let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.calendar = calendar; formatter.timeZone = calendar.timeZone; formatter.dateFormat = "yyyy-MM-dd'T'HH:mm"; formatter.isLenient = false
            guard let date = formatter.date(from: raw), formatter.string(from: date) == raw, date > now else { return nil }
            let components = calendar.dateComponents([.year,.month,.day,.hour,.minute], from: date)
            return ReminderPlan(id: prefix + id, requirementID: id, title: title, components: components)
        }
    }
}

@MainActor
protocol NotificationScheduling {
    func status() async -> UNAuthorizationStatus
    func requestPermission() async throws -> Bool
    func pendingIDs() async -> [String]
    func add(_ plan: ReminderPlan) async throws
    func remove(_ ids: [String])
}

@MainActor
final class SystemNotificationScheduler: NotificationScheduling {
    let center = UNUserNotificationCenter.current()
    func status() async -> UNAuthorizationStatus { await center.notificationSettings().authorizationStatus }
    func requestPermission() async throws -> Bool { try await center.requestAuthorization(options: [.alert,.sound]) }
    func pendingIDs() async -> [String] { await center.pendingNotificationRequests().map(\.identifier) }
    func add(_ plan: ReminderPlan) async throws {
        let content = UNMutableNotificationContent(); content.title = plan.title; content.body = "需求提醒"; content.sound = .default; content.userInfo = ["requirementID": plan.requirementID]
        let trigger = UNCalendarNotificationTrigger(dateMatching: plan.components, repeats: false)
        try await center.add(UNNotificationRequest(identifier: plan.id, content: content, trigger: trigger))
    }
    func remove(_ ids: [String]) { center.removePendingNotificationRequests(withIdentifiers: ids) }
}

@MainActor
final class ReminderManager {
    let scheduler: any NotificationScheduling
    init(scheduler: any NotificationScheduling) { self.scheduler = scheduler }
    private var tail: Task<String?, Never>?
    // Permission is requested only by an explicit save containing a future reminder.
    func reconcile(_ requirements: [[String: Any]], requestPermission: Bool, now: Date = Date()) async -> String? {
        let previous = tail
        let task = Task { @MainActor in
            _ = await previous?.value
            return await self.apply(requirements, requestPermission: requestPermission, now: now)
        }
        tail = task
        return await task.value
    }
    private func apply(_ requirements: [[String: Any]], requestPermission: Bool, now: Date) async -> String? {
        let plans = ReminderPlan.make(requirements, now: now)
        let owned = await scheduler.pendingIDs().filter { $0.hasPrefix(ReminderPlan.prefix) }
        let live = Set(plans.map(\.id))
        scheduler.remove(owned.filter { !live.contains($0) })
        guard !plans.isEmpty else { return nil }
        var status = await scheduler.status()
        if status == .notDetermined && requestPermission {
            do { status = try await scheduler.requestPermission() ? .authorized : .denied }
            catch { return "需求已保存，但通知授权失败：\(error.localizedDescription)" }
        }
        guard status == .authorized || status == .provisional else {
            scheduler.remove(owned)
            return "需求已保存，提醒尚未启用。请在系统设置 → 通知 → 需求日历中允许通知。"
        }
        var failed = 0
        for plan in plans { do { try await scheduler.add(plan) } catch { scheduler.remove([plan.id]); failed += 1 } }
        return failed == 0 ? nil : "需求已保存，但 \(failed) 个提醒未能加入系统通知，请重试保存。"
    }
}

// Used only when the app is explicitly launched in its isolated verification mode.
@MainActor
final class IsolatedNotificationScheduler: NotificationScheduling {
    var permission: UNAuthorizationStatus = .notDetermined
    var requests = 0
    var plans: [String: ReminderPlan] = [:]
    func status() async -> UNAuthorizationStatus { permission }
    func requestPermission() async throws -> Bool { requests += 1; permission = .authorized; return true }
    func pendingIDs() async -> [String] { Array(plans.keys) }
    func add(_ plan: ReminderPlan) async throws { plans[plan.id] = plan }
    func remove(_ ids: [String]) { ids.forEach { plans.removeValue(forKey: $0) } }
}
