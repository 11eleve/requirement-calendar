import Foundation

enum LinkPolicy {
    static func permits(_ url: URL?) -> Bool {
        guard let url else { return false }
        return ["https", "http"].contains(url.scheme?.lowercased() ?? "") && url.host != nil && url.user == nil && url.password == nil
    }
}
