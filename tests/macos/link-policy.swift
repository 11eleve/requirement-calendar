import Foundation

@main
struct LinkPolicyTests {
    static func main() {
        let cases: [(String, Bool)] = [
            ("https://github.com/11eleve/requirement-calendar", true),
            ("http://localhost:8080/docs", true),
            ("file:///etc/passwd", false),
            ("javascript:alert(1)", false),
            ("mailto:person@example.com", false),
            ("https://user:password@example.com", false),
            ("https:relative-path", false)
        ]
        for (value, expected) in cases { precondition(LinkPolicy.permits(URL(string: value)) == expected, value) }
        precondition(!LinkPolicy.permits(nil))
        print("23: native external-link policy passed 8 cases")
    }
}
