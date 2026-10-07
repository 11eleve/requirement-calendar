import Foundation
import UserNotifications

@MainActor
final class FakeNotifications: NotificationScheduling {
    var permission: UNAuthorizationStatus = .notDetermined
    var allow = true
    var requestCount = 0
    var plans: [String: ReminderPlan] = [:]
    var unrelated = ["other.feature"]
    var failIDs = Set<String>()
    func status() async -> UNAuthorizationStatus { permission }
    func requestPermission() async throws -> Bool { requestCount += 1; permission = allow ? .authorized : .denied; return allow }
    func pendingIDs() async -> [String] { Array(plans.keys)+unrelated }
    func add(_ plan: ReminderPlan) async throws { if failIDs.contains(plan.id) { throw CalendarDataError(message:"injected scheduling failure") };plans[plan.id]=plan }
    func remove(_ ids: [String]) { ids.forEach { plans.removeValue(forKey:$0) };unrelated.removeAll { ids.contains($0) } }
}

@main
struct ReminderTests {
    @MainActor static func main() async {
        var assertions=0
        func check(_ value: Bool,_ message: String){precondition(value,message);assertions += 1;print("PASS \(message)")}
        let now=ISO8601DateFormatter().date(from:"2026-10-07T00:00:00Z")!
        func item(_ id:String="one",_ time:String="2026-10-08T09:00")->[String:Any]{["id":id,"title":"需求 \(id)","reminder":time]}
        let fake=FakeNotifications(),manager=ReminderManager(scheduler:fake)
        _=await manager.reconcile([],requestPermission:true,now:now)
        check(fake.requestCount==0,"32: no reminder never requests notification permission")
        let passive=await manager.reconcile([item()],requestPermission:false,now:now)
        check(fake.requestCount==0&&passive != nil,"35: launch never prompts and reports missing authorization")
        check(await manager.reconcile([item()],requestPermission:true,now:now)==nil,"32: explicit reminder save requests and schedules")
        check(fake.requestCount==1&&fake.plans.count==1,"32: one permission request, one owned notification")
        _=await manager.reconcile([item("one","2026-10-09T10:30")],requestPermission:true,now:now)
        check(fake.requestCount==1&&fake.plans.count==1&&fake.plans["requirement.one"]!.components.minute==30,"33: editing replaces the same identifier without duplicate prompts")
        _=await manager.reconcile([],requestPermission:false,now:now)
        check(fake.plans.isEmpty&&fake.unrelated==["other.feature"],"33: delete cancels owned reminders and preserves unrelated requests")
        _=await manager.reconcile([item("past","2020-01-01T09:00"),item("bad","2026-02-30T09:00")],requestPermission:true,now:now)
        check(fake.plans.isEmpty,"33: past and impossible times are never scheduled")
        let denied=FakeNotifications();denied.allow=false;let deniedManager=ReminderManager(scheduler:denied)
        check(await deniedManager.reconcile([item()],requestPermission:true,now:now) != nil&&denied.plans.isEmpty,"35: denied authorization returns a visible non-success warning")
        fake.failIDs=["requirement.one"]
        check(await manager.reconcile([item(),item("two")],requestPermission:true,now:now)?.contains("1") == true,"35: individual scheduling errors are reported accurately")
        check(fake.plans["requirement.one"]==nil&&fake.plans["requirement.two"] != nil,"35: failed updates cannot leave a stale old reminder")
        let plan=ReminderPlan.make([item()],now:now).first!
        check(plan.requirementID=="one"&&plan.id=="requirement.one","34: notification carries the exact requirement identity")
        var calendar=Calendar(identifier:.gregorian);calendar.timeZone=TimeZone(identifier:"America/Los_Angeles")!
        check(ReminderPlan.make([item("dst","2027-03-14T02:30")],now:now,calendar:calendar).isEmpty,"32: nonexistent DST wall time is rejected")
        var buddhist=Calendar(identifier:.buddhist);buddhist.timeZone=TimeZone(secondsFromGMT:0)!
        let localized=ReminderPlan.make([item()],now:now,calendar:buddhist)
        check(localized.count==1&&localized[0].components.year==2026&&localized[0].components.calendar?.identifier == .gregorian,"35: system calendar preference cannot reinterpret Gregorian reminder years")
        print("\(assertions) reminder assertions passed; no system permission requested or real notification sent")
    }
}
