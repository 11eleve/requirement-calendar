import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func fixturePNG(width: Int = 4, height: Int = 4) -> Data {
    let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.setFillColor(CGColor(red: 0.4, green: 0.3, blue: 0.7, alpha: 1)); context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    let data = NSMutableData(), image = context.makeImage()!
    let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, image, nil); precondition(CGImageDestinationFinalize(destination))
    return data as Data
}

final class IconStubProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let url = request.url!, path = url.path
        let status = path == "/missing.ico" ? 404 : 200
        let mime = path == "/html.ico" ? "text/html" : "image/png"
        var data = fixturePNG()
        var responseMIME = mime
        if path == "/" { responseMIME = "text/html"; data = Data("<link rel='icon' href='/brand.png?size=64&amp;v=2'>".utf8) }
        if path == "/brand.png" { data = fixturePNG(width: 8, height: 8) }
        if path == "/large-html" { responseMIME = "text/html"; data = Data(repeating: 32, count: 200_000) }
        if path == "/large.ico" { data = Data(repeating: 0, count: ResourceIconPolicy.byteLimit + 1) }
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": responseMIME])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@main
struct ResourceIconTests {
    @MainActor static func main() async throws {
        var checks: [String] = []
        func check(_ value: Bool, _ message: String) { precondition(value, message); checks.append(message) }
        check(ResourceIconPolicy.endpoint("https://docs.dingtalk.com/document/a?token=private#heading")?.absoluteString == "https://docs.dingtalk.com/favicon.ico", "document path, query and fragment are stripped")
        check(ResourceIconPolicy.endpoint("https://EXAMPLE.com:8443/a")?.absoluteString == "https://example.com:8443/favicon.ico", "HTTPS origins normalize their host and preserve their port")
        for raw in ["http://example.com/a", "file:///tmp/icon.png", "https://user:secret@example.com/a", "https://localhost/a", "https://127.0.0.1/a", "https://[::1]/a", "https://work.local/a", "not a URL"] {
            check(ResourceIconPolicy.endpoint(raw) == nil, "ineligible icon origin rejected: " + raw)
        }
        let origin = URL(string: "https://example.com/favicon.ico")!
        check(ResourceIconPolicy.permitsRedirect(from: origin, to: URL(string: "https://example.com/assets/icon.png")), "same-origin HTTPS icon redirects allowed")
        for raw in ["http://example.com/icon.png", "https://other.example/icon.png", "https://example.com:8443/icon.png", "https://user:secret@example.com/icon.png"] {
            check(!ResourceIconPolicy.permitsRedirect(from: origin, to: URL(string: raw)), "redirect cannot change trust boundary: " + raw)
        }
        let homepage = URL(string: "https://example.com/")!
        let html = Data(#"<link rel='mask-icon' href='/mask.svg'><link REL="shortcut ICON" href="https://assets.example/brand.png?a=1&amp;b=2"><link rel='icon' type='image/svg+xml' href='/icon.svg'><link rel='apple-touch-icon' href='/touch.png'>"#.utf8)
        let candidates = ResourceIconPolicy.candidates(in: html, homepage: homepage)
        check(candidates.map(\.absoluteString) == ["https://assets.example/brand.png?a=1&b=2", "https://example.com/touch.png"], "declared icons support CDN origins, relative paths, tokens and escaped query separators")
        check(ResourceIconPolicy.candidates(in: Data("<link rel=icon href=/same.png><link rel='icon' href='/same.png'>".utf8), homepage: homepage).count == 1, "duplicate declared icons share one candidate")
        check(ResourceIconPolicy.candidates(in: Data("<link rel='icon' href='javascript:alert(1)'><link rel='icon' href='http://assets.example/a.png'><link rel='icon' href='https://127.0.0.1/a.png'><link rel='icon' href='https://user:secret@assets.example/a.png'>".utf8), homepage: homepage).isEmpty, "active, insecure, local and authenticated declared icons are excluded")
        check(ResourceIconPolicy.candidates(in: Data("<script>window.location='/private-document'</script>".utf8), homepage: homepage).isEmpty, "HTML is inspected as text and no scripts run")
        check(ResourceIconPolicy.candidates(in: Data("<!-- <link rel='icon' href='/comment.png'> --><script>const fake=\"<link rel='icon' href='/script.png'>\";</script></head><link rel='icon' href='/body.png'>".utf8), homepage: homepage).isEmpty, "comments, script strings and body markup do not become declared icons")
        let config = ResourceIconPolicy.configuration()
        check(config.httpCookieStorage == nil && config.urlCredentialStorage == nil && config.urlCache == nil && !config.httpShouldSetCookies, "icon session has no cookie, credential or disk cache stores")
        let png = fixturePNG(), resized = ResourceIconPolicy.png(fixturePNG(width: 256, height: 128))!
        let resizedData = Data(base64Encoded: String(resized.dropFirst("data:image/png;base64,".count)))!
        let resizedSource = CGImageSourceCreateWithData(resizedData as CFData, nil)!
        let properties = CGImageSourceCopyPropertiesAtIndex(resizedSource, 0, nil) as! [String: Any]
        check(properties[kCGImagePropertyPixelWidth as String] as! Int == 56 && properties[kCGImagePropertyPixelHeight as String] as! Int == 28, "decoded icons are downsampled to bounded PNG with aspect ratio")
        check(ResourceIconPolicy.png(Data("<svg onload='alert(1)'/>".utf8)) == nil, "active SVG source is never passed to WebKit")
        check(ResourceIconPolicy.png(Data("<html>not an icon</html>".utf8)) == nil, "HTML and broken image payloads use the fallback")
        check(ResourceIconPolicy.png(fixturePNG(width: 2048, height: 1)) == nil, "oversized image dimensions are rejected before decoding")
        check(ResourceIconPolicy.png(Data(repeating: 0, count: ResourceIconPolicy.byteLimit + 1)) == nil, "oversized compressed payloads are rejected")
        var calls: [URL] = [], clock = Date(timeIntervalSince1970: 1000)
        let store = ResourceIconStore(fetch: { url in calls.append(url); try await Task.sleep(nanoseconds: 20_000_000); return png }, now: { clock })
        async let first = store.icon(for: "https://example.com/doc/first?secret=one")
        async let second = store.icon(for: "https://example.com/doc/second?secret=two")
        let values = await (first, second)
        check(values.0 != nil && values.0 == values.1 && calls.count == 1, "parallel document links share one origin request")
        _ = await store.icon(for: "https://example.com/third")
        check(calls.count == 1 && calls[0].absoluteString == "https://example.com/favicon.ico", "successful origin requests stay cached without document data")
        clock = clock.addingTimeInterval(86401); _ = await store.icon(for: "https://example.com/again")
        check(calls.count == 2, "expired success entries can refresh")
        var failures = 0
        let failing = ResourceIconStore(fetch: { _ in failures += 1; throw URLError(.timedOut) }, now: { clock })
        let failed = await failing.icon(for: "https://offline.example/doc")
        _ = await failing.icon(for: "https://offline.example/other")
        check(failed == nil && failures == 1, "network failure is cached briefly and returns a fallback result")
        clock = clock.addingTimeInterval(601); _ = await failing.icon(for: "https://offline.example/retry")
        check(failures == 2, "failed origins can recover after a short cache interval")
        let stubConfig = ResourceIconPolicy.configuration(); stubConfig.protocolClasses = [IconStubProtocol.self]
        let session = URLSession(configuration: stubConfig)
        let downloaded = try await ResourceIconStore.download(origin, session: session)
        check(ResourceIconPolicy.png(downloaded) != nil, "real URLSession byte reader accepts an image response")
        for path in ["missing", "html", "large"] {
            var rejected = false
            do { _ = try await ResourceIconStore.download(URL(string: "https://example.com/\(path).ico")!, session: session) } catch { rejected = true }
            check(rejected, "real URLSession reader rejects " + path + " response")
        }
        let discovered = try await ResourceIconStore.fetchIcon(origin, session: session)
        check(discovered == fixturePNG(width: 8, height: 8), "homepage-declared icon is preferred over the generic favicon endpoint")
        let htmlPrefix = try await ResourceIconStore.download(URL(string: "https://example.com/large-html")!, session: session, html: true)
        check(htmlPrefix.count == 131072, "homepage inspection stops after a bounded prefix without buffering the entire page")
        session.invalidateAndCancel()
        let output: [String: Any] = ["ok": true, "checks": checks, "scope": "native URL origin policy, bounded PNG decoding, request coalescing/cache, and URLSession byte reader via an isolated URLProtocol; no browser cookies or real document requests"]
        print(String(data: try JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted,.sortedKeys]), encoding: .utf8)!)
    }
}
