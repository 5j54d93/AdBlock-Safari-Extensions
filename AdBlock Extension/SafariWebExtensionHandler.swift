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
        var customFilters: [CustomFilterPayload]?
    }

    private struct CustomFilterPayload: Codable {
        var hostname: String
        var selectors: [String]
    }

    static func loadDictionary() -> [String: Any]? {
        let defaults = sharedDefaults()
        guard
            let data = defaults.data(forKey: storageKey),
            let payload = try? JSONDecoder().decode(SettingsPayload.self, from: data),
            let encodedPayload = try? JSONEncoder().encode(payload),
            let dictionary = try? JSONSerialization.jsonObject(with: encodedPayload) as? [String: Any]
        else {
            return nil
        }

        return dictionary
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
