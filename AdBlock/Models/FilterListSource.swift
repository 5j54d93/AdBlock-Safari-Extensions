//
//  FilterListSource.swift
//  AdBlock
//

import Foundation

struct FilterListSource: Identifiable {
    let id: String
    let title: String
    let displayURL: String
    let url: URL?
    let rulesets: [RulesetInfo]

    var countText: String {
        "\(rulesets.count) 份清單"
    }

    var isGitHubSource: Bool {
        guard let host = url?.host else { return false }
        return Self.displayHost(from: host) == "github.com"
    }

    static func make(from rulesets: [RulesetInfo]) -> [FilterListSource] {
        var order: [String] = []
        var rulesetsBySource: [String: [RulesetInfo]] = [:]

        for ruleset in rulesets {
            guard let sourceURLString = normalizedURLString(
                from: ruleset.homeURL ?? fallbackHomeURL(for: ruleset.id)
            ) else { continue }
            if rulesetsBySource[sourceURLString] == nil {
                order.append(sourceURLString)
            }
            rulesetsBySource[sourceURLString, default: []].append(ruleset)
        }

        return order.compactMap { sourceURLString in
            guard let sourceRulesets = rulesetsBySource[sourceURLString] else { return nil }
            return FilterListSource(
                id: sourceURLString,
                title: displayName(for: sourceURLString),
                displayURL: displayURL(for: sourceURLString),
                url: URL(string: sourceURLString),
                rulesets: sourceRulesets
            )
        }
    }

    private static let sourceDisplayNames: [String: String] = [
        "https://github.com/uBlockOrigin/uAssets": "uBlock Origin filter assets",
        "https://easylist.to/": "EasyList / EasyPrivacy",
        "https://github.com/AdguardTeam/AdguardFilters": "AdGuard Filters",
        "https://github.com/easylist/easylist": "EasyList / Fanboy Lists",
    ]

    private static func normalizedURLString(from value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              value.isEmpty == false else {
            return nil
        }

        guard var components = URLComponents(string: value) else {
            return value
        }

        components.fragment = nil
        return components.url?.absoluteString ?? value
    }

    private static func fallbackHomeURL(for rulesetID: String) -> String? {
        switch rulesetID {
        case "ublock-filters", "block-lan", "ublock-experimental":
            return "https://github.com/uBlockOrigin/uAssets"
        case "easylist", "easyprivacy":
            return "https://easylist.to/"
        case "adguard-mobile":
            return "https://github.com/AdguardTeam/AdguardFilters"
        case "annoyances-ai",
             "annoyances-cookies",
             "annoyances-overlays",
             "annoyances-social",
             "annoyances-widgets",
             "annoyances-others",
             "annoyances-notifications":
            return "https://github.com/easylist/easylist"
        default:
            return nil
        }
    }

    private static func displayName(for sourceURLString: String) -> String {
        if let displayName = sourceDisplayNames[sourceURLString] {
            return displayName
        }

        guard let url = URL(string: sourceURLString),
              let rawHost = url.host else {
            return sourceURLString
        }
        let host = displayHost(from: rawHost)

        guard host == "github.com" else {
            return host
        }

        let pathComponents = url.path
            .split(separator: "/")
            .map(String.init)

        return pathComponents.last ?? host
    }

    private static func displayURL(for sourceURLString: String) -> String {
        guard let url = URL(string: sourceURLString),
              let rawHost = url.host else {
            return sourceURLString
        }

        return displayHost(from: rawHost)
    }

    private static func displayHost(from host: String) -> String {
        host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }
}
