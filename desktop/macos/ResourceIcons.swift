import Foundation
import ImageIO
import UniformTypeIdentifiers

// Fetch only an origin's public icon. Document paths, queries, cookies and browser
// credentials never enter the request. Failed fetches leave the bundled symbol.
enum ResourceIconPolicy {
    static let byteLimit = 262_144
    static func endpoint(_ raw: String) -> URL? {
        guard let url = URL(string: raw), LinkPolicy.permits(url), url.scheme?.lowercased() == "https",
              let host = url.host?.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: ".")),
              host.contains("."), !host.contains(":"), !host.hasSuffix(".local"), !host.hasSuffix(".localhost"),
              !host.split(separator: ".").allSatisfy({ Int($0) != nil }) else { return nil }
        var origin = URLComponents()
        origin.scheme = "https"; origin.host = host; origin.port = url.port; origin.path = "/favicon.ico"
        return origin.url
    }
    static func candidates(in data: Data, homepage: URL) -> [URL] {
        let raw = String(decoding: data, as: UTF8.self)
        let head = raw.range(of: "</head", options: .caseInsensitive).map { String(raw[..<$0.lowerBound]) } ?? raw
        let inert = try? NSRegularExpression(pattern: #"<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?</\1\s*>"#, options: .caseInsensitive)
        let html = inert?.stringByReplacingMatches(in: head, range: NSRange(head.startIndex..., in: head), withTemplate: "") ?? head
        guard let links = try? NSRegularExpression(pattern: "<link\\b[^>]*>", options: .caseInsensitive),
              let attributes = try? NSRegularExpression(pattern: #"([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#) else { return [] }
        let source = html as NSString
        var result: [(URL, Int)] = []
        for match in links.matches(in: html, range: NSRange(location: 0, length: source.length)).prefix(64) {
            let tag = source.substring(with: match.range), text = tag as NSString
            var values: [String: String] = [:]
            for attribute in attributes.matches(in: tag, range: NSRange(location: 0, length: text.length)) {
                let name = text.substring(with: attribute.range(at: 1)).lowercased()
                let valueRange = (2...4).map { attribute.range(at: $0) }.first { $0.location != NSNotFound }!
                values[name] = text.substring(with: valueRange).replacingOccurrences(of: "&amp;", with: "&")
            }
            let rel = (values["rel"] ?? "").lowercased().split(whereSeparator: { $0.isWhitespace })
            guard rel.contains("icon") || rel.contains("apple-touch-icon"), let href = values["href"],
                  let url = URL(string: href, relativeTo: homepage)?.absoluteURL,
                  endpoint(url.absoluteString) != nil, url.pathExtension.lowercased() != "svg",
                  values["type"]?.lowercased() != "image/svg+xml" else { continue }
            result.append((url, rel.contains("icon") ? 0 : 1))
        }
        var seen = Set<URL>()
        return result.sorted { $0.1 < $1.1 }.map(\.0).filter { seen.insert($0).inserted }.prefix(2).map { $0 }
    }
    static func permitsRedirect(from original: URL?, to target: URL?) -> Bool {
        guard let original, let target, LinkPolicy.permits(target) else { return false }
        return target.scheme == "https" && target.host == original.host && (target.port ?? 443) == (original.port ?? 443)
    }
    static func configuration() -> URLSessionConfiguration {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false
        config.urlCredentialStorage = nil; config.urlCache = nil
        config.timeoutIntervalForRequest = 6; config.timeoutIntervalForResource = 8
        config.httpMaximumConnectionsPerHost = 2
        return config
    }
    static func png(_ data: Data) -> String? {
        guard !data.isEmpty, data.count <= byteLimit,
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
              let width = properties[kCGImagePropertyPixelWidth as String] as? Int,
              let height = properties[kCGImagePropertyPixelHeight as String] as? Int,
              width > 0, height > 0, width <= 1024, height <= 1024,
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 56] as CFDictionary) else { return nil }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, UTType.png.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return "data:image/png;base64," + (output as Data).base64EncodedString()
    }
}

private final class ResourceIconRequestDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        guard ResourceIconPolicy.permitsRedirect(from: task.originalRequest?.url, to: request.url) else { completionHandler(nil); return }
        completionHandler(request)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        completionHandler(challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust ? .performDefaultHandling : .cancelAuthenticationChallenge, nil)
    }
}

@MainActor
final class ResourceIconStore {
    private struct Entry { let value: String?; let expires: Date }
    private var cache: [URL: Entry] = [:]
    private var pending: [URL: Task<String?, Never>] = [:]
    private let fetch: (URL) async throws -> Data
    private let now: () -> Date
    init(fetch: ((URL) async throws -> Data)? = nil, now: @escaping () -> Date = Date.init) {
        self.now = now
        let session = URLSession(configuration: ResourceIconPolicy.configuration())
        self.fetch = fetch ?? { url in try await Self.fetchIcon(url, session: session) }
    }
    func icon(for raw: String) async -> String? {
        guard let url = ResourceIconPolicy.endpoint(raw) else { return nil }
        if let entry = cache[url], entry.expires > now() { return entry.value }
        if let task = pending[url] { return await task.value }
        // The page queues four origins at a time; cap other callers as well.
        guard pending.count < 8 else { return nil }
        let task = Task<String?, Never> { [fetch] in
            guard let data = try? await fetch(url) else { return nil }
            return ResourceIconPolicy.png(data)
        }
        pending[url] = task
        let value = await task.value
        pending[url] = nil
        if cache.count >= 128, let oldest = cache.min(by: { $0.value.expires < $1.value.expires })?.key { cache[oldest] = nil }
        cache[url] = Entry(value: value, expires: now().addingTimeInterval(value == nil ? 600 : 86400))
        return value
    }
    nonisolated static func fetchIcon(_ endpoint: URL, session: URLSession) async throws -> Data {
        let homepage = endpoint.deletingLastPathComponent()
        // Give a responsive declared icon a short head start. A slow homepage or
        // CDN must not make the usable default favicon wait through every timeout.
        let result = await withTaskGroup(of: Data?.self, returning: Data?.self) { group in
            group.addTask {
                guard let html = try? await download(homepage, session: session, html: true) else { return nil }
                for url in ResourceIconPolicy.candidates(in: html, homepage: homepage) where url != endpoint {
                    guard !Task.isCancelled else { return nil }
                    if let data = try? await download(url, session: session), ResourceIconPolicy.png(data) != nil { return data }
                }
                return nil
            }
            group.addTask {
                do { try await Task.sleep(for: .milliseconds(250)) } catch { return nil }
                guard !Task.isCancelled, let data = try? await download(endpoint, session: session), ResourceIconPolicy.png(data) != nil else { return nil }
                return data
            }
            for await data in group {
                if let data { group.cancelAll(); return data }
            }
            return nil
        }
        guard let result else { throw URLError(.cannotDecodeContentData) }
        return result
    }
    nonisolated static func download(_ url: URL, session: URLSession, html: Bool = false) async throws -> Data {
        try Task.checkCancellation()
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.setValue(html ? "text/html" : "image/*", forHTTPHeaderField: "Accept")
        let (bytes, response) = try await session.bytes(for: request, delegate: ResourceIconRequestDelegate())
        defer { bytes.task.cancel() }
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              ResourceIconPolicy.permitsRedirect(from: url, to: http.url),
              html || response.expectedContentLength <= ResourceIconPolicy.byteLimit else { throw URLError(.badServerResponse) }
        let mime = response.mimeType?.lowercased() ?? ""
        guard html ? mime == "text/html" : (mime.hasPrefix("image/") || mime == "application/octet-stream") else { throw URLError(.cannotDecodeContentData) }
        let task = bytes.task
        return try await withTaskCancellationHandler {
            var data = Data()
            for try await byte in bytes {
                try Task.checkCancellation()
                if html && data.count >= 131_072 { break }
                guard data.count < ResourceIconPolicy.byteLimit else { throw URLError(.dataLengthExceedsMaximum) }
                data.append(byte)
            }
            return data
        } onCancel: {
            task.cancel()
        }
    }
}
