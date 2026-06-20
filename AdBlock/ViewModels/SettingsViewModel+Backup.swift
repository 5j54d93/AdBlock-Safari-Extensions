//
//  SettingsViewModel+Backup.swift
//  AdBlock
//

import AppKit
import Foundation
import UniformTypeIdentifiers

extension SettingsViewModel {
    func resetToDefaults() {
        let defaults = AdBlockSettings.defaults(enabledRulesets: rulesets.defaultEnabledIDs)
        persist(defaults)
        siteExceptions = Self.exceptions(from: defaults)
        customFilterSites = Self.customFilterSites(from: defaults)
    }

    func exportSettingsBackup() {
        settingsTransferMessage = nil
        settingsTransferError = nil

        let savePanel = NSSavePanel()
        savePanel.title = "匯出 AdBlock 設定"
        savePanel.message = "將目前設定匯出成 JSON 備份檔。"
        savePanel.nameFieldStringValue = Self.defaultBackupFileName()
        savePanel.canCreateDirectories = true
        savePanel.allowedContentTypes = [.json]

        guard savePanel.runModal() == .OK, let url = savePanel.url else {
            return
        }

        do {
            let data = try store.makeBackupData(for: settings)
            try data.write(to: url, options: .atomic)
            settingsTransferMessage = "已匯出設定備份。"
        } catch {
            settingsTransferError = "無法匯出設定：\(error.localizedDescription)"
        }
    }

    func importSettingsBackup() {
        settingsTransferMessage = nil
        settingsTransferError = nil

        let openPanel = NSOpenPanel()
        openPanel.title = "匯入 AdBlock 設定"
        openPanel.message = "選擇先前匯出的 JSON 備份檔。"
        openPanel.allowedContentTypes = [.json]
        openPanel.allowsMultipleSelection = false
        openPanel.canChooseDirectories = false
        openPanel.canChooseFiles = true

        guard openPanel.runModal() == .OK, let url = openPanel.url else {
            return
        }

        let hasSecurityScope = url.startAccessingSecurityScopedResource()
        defer {
            if hasSecurityScope {
                url.stopAccessingSecurityScopedResource()
            }
        }

        do {
            let data = try Data(contentsOf: url)
            let importedSettings = try store.settings(fromBackupData: data)
            let sanitizedSettings = sanitizedImportedSettings(importedSettings)
            if persistNow(sanitizedSettings) {
                siteExceptions = Self.exceptions(from: settings)
                customFilterSites = Self.customFilterSites(from: settings)
                settingsTransferMessage = "已匯入設定，變更會同步到 Safari 延伸功能。"
            }
        } catch {
            settingsTransferError = "無法匯入設定：\(error.localizedDescription)"
        }
    }

    private func sanitizedImportedSettings(_ importedSettings: AdBlockSettings) -> AdBlockSettings {
        let knownRulesetIDs = Set(rulesets.map(\.id))
        var importedEnabledIDs = Set<String>()
        for rulesetID in importedSettings.enabledRulesets where knownRulesetIDs.contains(rulesetID) {
            importedEnabledIDs.insert(rulesetID)
        }

        var nextSettings = importedSettings
        nextSettings.enabledRulesets = Array(
            rulesets
                .map(\.id)
                .filter { importedEnabledIDs.contains($0) }
                .prefix(AdBlockSettings.maxEnabledRulesets)
        )

        var usedHostnames = Set<String>()
        nextSettings.noFilteringHostnames = Self.sanitizedHostnames(
            importedSettings.noFilteringHostnames,
            usedHostnames: &usedHostnames
        )
        nextSettings.basicFilteringHostnames = Self.sanitizedHostnames(
            importedSettings.basicFilteringHostnames,
            usedHostnames: &usedHostnames
        )
        nextSettings.optimalFilteringHostnames = Self.sanitizedHostnames(
            importedSettings.optimalFilteringHostnames,
            usedHostnames: &usedHostnames
        )
        nextSettings.completeFilteringHostnames = Self.sanitizedHostnames(
            importedSettings.completeFilteringHostnames,
            usedHostnames: &usedHostnames
        )
        nextSettings.siteExceptionOrder = Self.sanitizedSiteExceptionOrder(
            importedSettings.siteExceptionOrder,
            settings: nextSettings
        )
        nextSettings.customFilters = Self.sanitizedCustomFilters(importedSettings.customFilters)

        return nextSettings
    }

    private static func sanitizedHostnames(
        _ hostnames: [String],
        usedHostnames: inout Set<String>
    ) -> [String] {
        hostnames.compactMap { hostname in
            let normalized = hostname
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            guard normalized.isEmpty == false,
                  normalized.hasPrefix("#") == false,
                  usedHostnames.insert(normalized).inserted else {
                return nil
            }
            return normalized
        }
    }

    private static func sanitizedSiteExceptionOrder(
        _ preferredOrder: [String],
        settings: AdBlockSettings
    ) -> [String] {
        let hostnames = settings.noFilteringHostnames
            + settings.basicFilteringHostnames
            + settings.optimalFilteringHostnames
            + settings.completeFilteringHostnames
        let validHostnames = Set(hostnames)
        var usedHostnames = Set<String>()
        var result: [String] = []

        for hostname in preferredOrder {
            let normalized = hostname
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            guard validHostnames.contains(normalized),
                  usedHostnames.insert(normalized).inserted else {
                continue
            }
            result.append(normalized)
        }

        for hostname in hostnames where usedHostnames.insert(hostname).inserted {
            result.append(hostname)
        }

        return result
    }

    private static func defaultBackupFileName() -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        return "AdBlock-Settings-\(formatter.string(from: Date())).json"
    }
}
