//
//  SiteException.swift
//  AdBlock
//

import Foundation

struct SiteException: Identifiable, Equatable {
    let id = UUID()
    var domain: String
    var mode: FilteringMode

    var normalizedDomain: String {
        Self.normalizedHostname(domain)
    }

    /// Reduces free-form input (a full URL, a host with a path, a host with a
    /// port, etc.) down to the bare hostname the extension matches against. The
    /// extension keys filtering modes purely by hostname, so anything carrying a
    /// scheme or path — e.g. "https://adsense.google.com/adsense/u/0/" — would
    /// never match and the exception would silently do nothing.
    static func normalizedHostname(_ raw: String) -> String {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard text.isEmpty == false else { return "" }
        // Preserve comment markers used elsewhere in the exception list.
        if text.hasPrefix("#") { return text }
        // Strip scheme (http://, https://, …).
        if let range = text.range(of: "://") {
            text = String(text[range.upperBound...])
        }
        // Strip path / query / fragment.
        if let cut = text.firstIndex(where: { $0 == "/" || $0 == "?" || $0 == "#" }) {
            text = String(text[..<cut])
        }
        // Strip credentials (user:pass@host).
        if let at = text.lastIndex(of: "@") {
            text = String(text[text.index(after: at)...])
        }
        // Strip port.
        if let colon = text.firstIndex(of: ":") {
            text = String(text[..<colon])
        }
        // Strip trailing dots.
        while text.hasSuffix(".") { text.removeLast() }
        return text
    }
}
