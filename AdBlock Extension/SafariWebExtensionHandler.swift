//
//  SafariWebExtensionHandler.swift
//  AdBlock Extension
//
//  Created by Ricky on 2026/6/16.
//

import Foundation
import SafariServices
import os.log

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let profile: UUID?
        if #available(iOS 17.0, macOS 14.0, *) {
            profile = request?.userInfo?[SFExtensionProfileKey] as? UUID
        } else {
            profile = request?.userInfo?["profile"] as? UUID
        }

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        os_log(
            .default,
            "Received native message: %{public}@ (profile: %{public}@)",
            String(describing: message),
            profile?.uuidString ?? "none"
        )

        let command = Self.command(from: message)
        let payload: [String: Any]

        switch command {
        case "getSettings":
            payload = Self.settingsResponse()
        case "addCustomFilter":
            payload = Self.addCustomFilterResponse(message: message)
        case "removeCustomFilter":
            payload = Self.removeCustomFilterResponse(message: message)
        default:
            payload = [
                "ok": false,
                "error": "Unsupported command",
            ]
        }

        context.completeRequest(
            returningItems: [Self.responseItem(payload)],
            completionHandler: nil
        )
    }

    private static func command(from message: Any?) -> String? {
        if let dictionary = message as? [String: Any] {
            return dictionary["command"] as? String ?? dictionary["what"] as? String
        }

        if let dictionary = message as? NSDictionary {
            return dictionary["command"] as? String ?? dictionary["what"] as? String
        }

        return nil
    }

    private static func string(from message: Any?, key: String) -> String? {
        if let dictionary = message as? [String: Any] {
            return dictionary[key] as? String
        }

        if let dictionary = message as? NSDictionary {
            return dictionary[key] as? String
        }

        return nil
    }

    private static func settingsResponse() -> [String: Any] {
        guard let settings = SharedAdBlockSettings.loadDictionary() else {
            return [
                "ok": true,
                "hasSettings": false,
            ]
        }

        return [
            "ok": true,
            "hasSettings": true,
            "settings": settings,
        ]
    }

    private static func addCustomFilterResponse(message: Any?) -> [String: Any] {
        guard
            let hostname = normalizedHostname(string(from: message, key: "hostname")),
            let selector = normalizedSelector(string(from: message, key: "selector"))
        else {
            return [ "ok": false, "error": "invalid-arguments" ]
        }

        let label = string(from: message, key: "label")?
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard let revision = SharedAdBlockSettings.addCustomFilter(
            hostname: hostname,
            selector: selector,
            label: label
        ) else {
            return [ "ok": false, "error": "write-failed" ]
        }

        return [ "ok": true, "revision": NSNumber(value: revision) ]
    }

    private static func removeCustomFilterResponse(message: Any?) -> [String: Any] {
        guard
            let hostname = normalizedHostname(string(from: message, key: "hostname")),
            let selector = normalizedSelector(string(from: message, key: "selector"))
        else {
            return [ "ok": false, "error": "invalid-arguments" ]
        }

        guard let revision = SharedAdBlockSettings.removeCustomFilter(
            hostname: hostname,
            selector: selector
        ) else {
            return [ "ok": false, "error": "write-failed" ]
        }

        return [ "ok": true, "revision": NSNumber(value: revision) ]
    }

    private static func normalizedHostname(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func normalizedSelector(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func responseItem(_ payload: [String: Any]) -> NSExtensionItem {
        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: payload]
        } else {
            response.userInfo = ["message": payload]
        }
        return response
    }
}

private enum SharedAdBlockSettings {
    static let suiteName = "group.com.Ricky.AdBlock"
    static let storageKey = "macAppSettings.v1"

    private struct SettingsPayload: Codable {
        var revision: Int64
        var defaultFilteringMode: String
        var autoReload: Bool
        var popupBlockMode: Bool
        var enabledRulesets: [String]
        var noFilteringHostnames: [String]
        var basicFilteringHostnames: [String]
        var optimalFilteringHostnames: [String]
        var completeFilteringHostnames: [String]
        var siteExceptionOrder: [String]?
        var customFilters: [CustomFilterPayload]?
    }

    private struct CustomFilterPayload: Codable {
        var hostname: String
        var selectors: [String]
        var labels: [String: String]? = nil
    }

    static func loadDictionary() -> [String: Any]? {
        guard
            let payload = loadPayload(),
            let encodedPayload = try? JSONEncoder().encode(payload),
            let dictionary = try? JSONSerialization.jsonObject(with: encodedPayload) as? [String: Any]
        else {
            return nil
        }

        return dictionary
    }

    static func addCustomFilter(hostname: String, selector: String, label: String?) -> Int64? {
        mutate { payload in
            var filters = payload.customFilters ?? []

            if let index = filters.firstIndex(where: { $0.hostname == hostname }) {
                var entry = filters[index]
                if entry.selectors.contains(selector) == false {
                    entry.selectors.append(selector)
                }
                if let label, label.isEmpty == false {
                    var labels = entry.labels ?? [:]
                    labels[selector] = label
                    entry.labels = labels
                }
                filters[index] = entry
            } else {
                var labels: [String: String]?
                if let label, label.isEmpty == false {
                    labels = [selector: label]
                }
                filters.append(CustomFilterPayload(
                    hostname: hostname,
                    selectors: [selector],
                    labels: labels
                ))
            }

            payload.customFilters = filters
        }
    }

    static func removeCustomFilter(hostname: String, selector: String) -> Int64? {
        mutate { payload in
            guard
                var filters = payload.customFilters,
                let index = filters.firstIndex(where: { $0.hostname == hostname })
            else {
                return
            }

            var entry = filters[index]
            entry.selectors.removeAll { $0 == selector }
            entry.labels?.removeValue(forKey: selector)

            if entry.selectors.isEmpty {
                filters.remove(at: index)
            } else {
                filters[index] = entry
            }

            payload.customFilters = filters
        }
    }

    private static func mutate(_ apply: (inout SettingsPayload) -> Void) -> Int64? {
        let defaults = sharedDefaults()
        guard var payload = loadPayload(from: defaults) else { return nil }

        apply(&payload)

        let newRevision = max(
            payload.revision + 1,
            Int64(Date().timeIntervalSince1970 * 1000)
        )
        payload.revision = newRevision

        guard let encoded = try? JSONEncoder().encode(payload) else { return nil }
        defaults.set(encoded, forKey: storageKey)
        return newRevision
    }

    private static func loadPayload(from defaults: UserDefaults? = nil) -> SettingsPayload? {
        let store = defaults ?? sharedDefaults()
        guard
            let data = store.data(forKey: storageKey),
            let payload = try? JSONDecoder().decode(SettingsPayload.self, from: data)
        else {
            return nil
        }
        return payload
    }

    private static func sharedDefaults() -> UserDefaults {
        guard FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: suiteName
        ) != nil else {
            return .standard
        }

        return UserDefaults(suiteName: suiteName) ?? .standard
    }
}
