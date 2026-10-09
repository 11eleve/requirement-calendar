import Foundation
import Darwin

@main
struct DataStoreTests {
    static func main() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("calendar-store-tests-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        var passed = 0
        func check(_ condition: Bool, _ name: String) { precondition(condition, name); passed += 1; print("PASS \(name)") }
        func payload(_ title: String) throws -> Data {
            try JSONSerialization.data(withJSONObject: ["version":5,"anchor":"2026-10-08","requirements":[["id":"r-1","title":title,"short":title,"tone":"","start":"2026-10-08","end":"2026-10-09","phases":[["name":"开发","start":"2026-10-08","end":"2026-10-09"]],"resources":[["name":"接口","type":"文档","url":"https://example.com","icon":"文"]],"tasks":["验收"],"done":[false],"note":"备忘"]]])
        }
        let first=try payload("初稿"),second=try payload("修订稿")
        let store=CalendarDataStore(directory:root)
        check(store.load()["raw"] is NSNull,"26: empty file store starts clean")
        try store.save(first)
        check(try Data(contentsOf:store.primary)==first,"26: full JSON written to an independent file")
        try store.save(second)
        check(try Data(contentsOf:store.backup)==first,"27: previous committed record remains a separate backup")
        let restart=CalendarDataStore(directory:root)
        check(restart.load()["raw"] as? String==String(decoding:second,as:UTF8.self),"26: process restart reloads complete data")
        let competing=CalendarDataStore(directory:root);_=competing.load()
        try restart.save(first)
        do { try competing.save(second);fatalError("conflict should fail") } catch { check(try Data(contentsOf:store.primary)==first,"30: stale window cannot overwrite another window's save") }
        let lock=open(root.appendingPathComponent("calendar.lock").path,O_RDWR);precondition(lock>=0);flock(lock,LOCK_EX|LOCK_NB)
        let locked=CalendarDataStore(directory:root)
        check(locked.load()["issue"] is String,"30: interprocess lock refuses overlapping writes")
        flock(lock,LOCK_UN);close(lock)
        // Restore a known primary and backup, then exercise recovery with byte-for-byte preservation.
        try second.write(to:store.primary);try first.write(to:store.backup)
        let corrupt=Data("broken original record".utf8);try corrupt.write(to:store.primary)
        let recovered=CalendarDataStore(directory:root),loaded=recovered.load()
        check(loaded["raw"] as? String==String(decoding:first,as:UTF8.self)&&loaded["issue"] is String,"27: corrupted primary recovers last-good record visibly")
        try recovered.save(second)
        let archives=try FileManager.default.contentsOfDirectory(at:root,includingPropertiesForKeys:nil).filter{$0.lastPathComponent.hasPrefix("calendar.preserved-")}
        check(try archives.contains{try Data(contentsOf:$0)==corrupt},"27: first save archives corrupt bytes rather than losing them")
        try corrupt.write(to:store.primary);try corrupt.write(to:store.backup)
        let blocked=CalendarDataStore(directory:root);_=blocked.load()
        do{try blocked.save(first);fatalError("blocked should fail")}catch{check(try Data(contentsOf:store.primary)==corrupt,"27: unrecoverable records are never silently replaced")}
        try blocked.save(first,recovery:true)
        check(try Data(contentsOf:store.primary)==first,"28: explicit validated backup restore repairs the file store")
        var future=try JSONSerialization.jsonObject(with:first) as! [String:Any];future["version"]=99
        let futureData=try JSONSerialization.data(withJSONObject:future);try futureData.write(to:store.primary)
        let futureStore=CalendarDataStore(directory:root)
        check(futureStore.load()["raw"] is NSNull,"27: newer schema blocks downgrade even with an old backup")
        try first.write(to:store.primary);let failure=CalendarDataStore(directory:root);_=failure.load()
        try FileManager.default.setAttributes([.posixPermissions:0o500],ofItemAtPath:root.path)
        do{try failure.save(second);fatalError("read-only directory should fail")}catch{check(try Data(contentsOf:store.primary)==first,"27: real filesystem failure retains committed primary bytes")}
        try FileManager.default.setAttributes([.posixPermissions:0o700],ofItemAtPath:root.path)
        try failure.save(second)
        check(try Data(contentsOf:store.primary)==second,"27: retry after filesystem repair succeeds")
        try failure.save(first,recovery:true);try failure.save(second)
        let restoreArchives=try FileManager.default.contentsOfDirectory(at:root,includingPropertiesForKeys:nil).filter{$0.lastPathComponent.hasPrefix("calendar.before-restore-")}
        check(try restoreArchives.contains{try Data(contentsOf:$0)==second},"28: pre-restore records remain archived after subsequent saves")
        var invalid=try JSONSerialization.jsonObject(with:first) as! [String:Any];var items=invalid["requirements"] as! [[String:Any]];items[0]["done"]=[1];invalid["requirements"]=items
        do{_=try CalendarDataStore.validate(JSONSerialization.data(withJSONObject:invalid));fatalError("numeric completion must fail")}catch{check(true,"28: invalid imported task state rejected before any write")}
        var planning = try JSONSerialization.jsonObject(with:first) as! [String:Any]
        planning["version"] = 7
        var planItems = planning["requirements"] as! [[String:Any]]
        let node: [String:Any] = ["id":"review", "name":"技术评审", "date":"2026-10-08", "kind":"review", "done":true]
        planItems[0]["milestones"] = [node];planning["requirements"] = planItems
        _ = try CalendarDataStore.validate(JSONSerialization.data(withJSONObject:planning))
        check(true,"v7: time nodes validate with native file store")
        for changes in [["date":"2026-10-10"], ["kind":"unknown"], ["done":1], ["name":" "]] as [[String:Any]] {
            var badNode = node
            for (key,value) in changes { badNode[key] = value }
            planItems[0]["milestones"] = [badNode];planning["requirements"] = planItems
            do { _ = try CalendarDataStore.validate(JSONSerialization.data(withJSONObject:planning));fatalError("invalid time node should fail") }
            catch { check(true,"v7: invalid node data rejected before writing") }
        }
        planItems[0]["milestones"] = [node,node];planning["requirements"] = planItems
        do { _ = try CalendarDataStore.validate(JSONSerialization.data(withJSONObject:planning));fatalError("duplicate node should fail") }
        catch { check(true,"v7: duplicate node identities rejected") }
        print("\(passed) file-store assertions passed")
    }
}
