//
//  SettingsViewModel+CustomFilters.swift
//  AdBlock
//

import AppKit
import Foundation

extension SettingsViewModel {
    /// Removes a single hidden element (selector) from a site, preserving the
    /// remaining selectors and their labels. Operates on `settings.customFilters`
    /// directly so captured labels survive.
    func removeCustomFilter(hostname: String, selector: String) {
        guard let index = settings.customFilters.firstIndex(where: { $0.hostname == hostname }) else {
            return
        }

        var entry = settings.customFilters[index]
        entry.selectors.removeAll { $0 == selector }
        entry.labels?.removeValue(forKey: selector)

        var next = settings
        if entry.selectors.isEmpty {
            next.customFilters.remove(at: index)
        } else {
            next.customFilters[index] = entry
        }

        guard persistNow(next) else { return }
        customFilterSites = Self.customFilterSites(from: settings)
        settingsTransferError = nil
        settingsTransferMessage = nil
    }

    func clearAllCustomFilters() {
        guard settings.customFilters.isEmpty == false else { return }

        var next = settings
        next.customFilters = []
        guard persistNow(next) else { return }

        customFilterSites = Self.customFilterSites(from: settings)
        settingsTransferError = nil
        settingsTransferMessage = "已清除所有隱藏的內容。"
    }

    func importCustomFilterText(_ text: String) -> Int {
        let importedEntries = Self.customFilterEntries(fromRawFilterText: text)
        guard importedEntries.isEmpty == false else {
            settingsTransferError = "沒有找到可匯入的自訂規則。"
            return 0
        }

        var mergedEntries = settings.customFilters
        var entryByHostname: [String: Int] = [:]
        for (index, entry) in mergedEntries.enumerated() {
            entryByHostname[entry.hostname] = index
        }
        var importedRuleCount = 0

        for entry in importedEntries {
            if let index = entryByHostname[entry.hostname] {
                var selectors = mergedEntries[index].selectors
                let beforeCount = selectors.count
                let seen = Set(selectors)
                selectors.append(contentsOf: entry.selectors.filter { seen.contains($0) == false })
                selectors = Self.uniqueNonEmptyStrings(selectors)
                importedRuleCount += max(0, selectors.count - beforeCount)
                mergedEntries[index].selectors = selectors
            } else {
                entryByHostname[entry.hostname] = mergedEntries.count
                mergedEntries.append(entry)
                importedRuleCount += entry.selectors.count
            }
        }

        var next = settings
        next.customFilters = Self.sanitizedCustomFilters(mergedEntries)
        guard persistNow(next) else { return 0 }

        customFilterSites = Self.customFilterSites(from: settings)
        settingsTransferError = nil
        settingsTransferMessage = "已匯入 \(importedRuleCount) 條自訂規則，會同步到 Safari 延伸功能。"
        return importedRuleCount
    }

    func copyCustomFiltersToPasteboard() {
        let text = settings.customFilters
            .flatMap { entry in
                entry.selectors.map { selector in
                    "\(entry.hostname)##\(selector)"
                }
            }
            .joined(separator: "\n")

        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        settingsTransferError = nil
        settingsTransferMessage = text.isEmpty ? "目前沒有自訂規則可複製。" : "已複製自訂規則。"
    }

    static func customFilterSites(from settings: AdBlockSettings) -> [CustomFilterSite] {
        settings.customFilters.map { entry in
            CustomFilterSite(
                hostname: entry.hostname,
                rulesText: entry.selectors.joined(separator: "\n")
            )
        }
    }

    /// Normalizes hostnames, dedupes selectors, and merges entries with the same
    /// hostname while preserving each surviving selector's captured label.
    static func sanitizedCustomFilters(_ entries: [CustomFilterEntry]) -> [CustomFilterEntry] {
        var output: [CustomFilterEntry] = []
        var indexByHostname: [String: Int] = [:]

        for entry in entries {
            guard let hostname = normalizedHostname(entry.hostname) else { continue }
            let selectors = uniqueNonEmptyStrings(entry.selectors)
            guard selectors.isEmpty == false else { continue }

            let labels = entry.labels?.filter { selectors.contains($0.key) }

            if let index = indexByHostname[hostname] {
                let mergedSelectors = uniqueNonEmptyStrings(output[index].selectors + selectors)
                var mergedLabels = output[index].labels ?? [:]
                if let labels {
                    mergedLabels.merge(labels) { current, _ in current }
                }
                output[index].selectors = mergedSelectors
                output[index].labels = nonEmptyLabels(mergedLabels, for: mergedSelectors)
            } else {
                indexByHostname[hostname] = output.count
                output.append(CustomFilterEntry(
                    hostname: hostname,
                    selectors: selectors,
                    labels: nonEmptyLabels(labels, for: selectors)
                ))
            }
        }

        return output
    }

    private static func nonEmptyLabels(
        _ labels: [String: String]?,
        for selectors: [String]
    ) -> [String: String]? {
        guard let labels else { return nil }
        let valid = labels.filter { selectors.contains($0.key) }
        return valid.isEmpty ? nil : valid
    }

    private static func customFilterEntries(from sites: [CustomFilterSite]) -> [CustomFilterEntry] {
        var entries: [CustomFilterEntry] = []
        var indexByHostname: [String: Int] = [:]

        for site in sites {
            guard let hostname = normalizedHostname(site.hostname) else { continue }
            let selectors = selectors(fromRulesText: site.rulesText)
            guard selectors.isEmpty == false else { continue }

            if let index = indexByHostname[hostname] {
                entries[index].selectors = uniqueNonEmptyStrings(entries[index].selectors + selectors)
            } else {
                indexByHostname[hostname] = entries.count
                entries.append(CustomFilterEntry(hostname: hostname, selectors: selectors))
            }
        }

        return entries
    }

    private static func customFilterEntries(fromRawFilterText text: String) -> [CustomFilterEntry] {
        var entries: [CustomFilterEntry] = []
        var indexByHostname: [String: Int] = [:]

        for rawLine in text.components(separatedBy: .newlines) {
            let line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            guard line.isEmpty == false,
                  line.hasPrefix("!") == false,
                  line.hasPrefix("[") == false,
                  line.contains("#@#") == false,
                  let separatorRange = line.range(of: "##") else {
                continue
            }

            let rawHosts = String(line[..<separatorRange.lowerBound])
            let selector = String(line[separatorRange.upperBound...])
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard selector.isEmpty == false else { continue }

            for rawHost in rawHosts.split(separator: ",") {
                let host = rawHost.trimmingCharacters(in: .whitespacesAndNewlines)
                guard host.hasPrefix("~") == false,
                      let hostname = normalizedHostname(host) else {
                    continue
                }

                if let index = indexByHostname[hostname] {
                    entries[index].selectors = uniqueNonEmptyStrings(entries[index].selectors + [selector])
                } else {
                    indexByHostname[hostname] = entries.count
                    entries.append(CustomFilterEntry(hostname: hostname, selectors: [selector]))
                }
            }
        }

        return entries
    }

    private static func selectors(fromRulesText text: String) -> [String] {
        uniqueNonEmptyStrings(
            text.components(separatedBy: .newlines).compactMap { rawLine in
                var line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
                guard line.isEmpty == false, line.hasPrefix("!") == false else { return nil }
                if line.contains("#@#") { return nil }
                if let range = line.range(of: "##") {
                    line = String(line[range.upperBound...])
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                }
                return line.isEmpty ? nil : line
            }
        )
    }

    private static func uniqueNonEmptyStrings(_ values: [String]) -> [String] {
        var output: [String] = []
        var seen = Set<String>()
        for value in values {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard trimmed.isEmpty == false,
                  seen.insert(trimmed).inserted else {
                continue
            }
            output.append(trimmed)
        }
        return output
    }

    private static func normalizedHostname(_ value: String) -> String? {
        var candidate = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()

        if candidate.hasPrefix("http://") || candidate.hasPrefix("https://") {
            guard let host = URL(string: candidate)?.host else { return nil }
            candidate = host
        }

        candidate = candidate
            .trimmingCharacters(in: CharacterSet(charactersIn: "."))

        guard candidate.isEmpty == false,
              candidate.contains(" ") == false,
              candidate.contains("/") == false,
              candidate.contains(":") == false,
              candidate.contains("#") == false else {
            return nil
        }

        return candidate
    }
}
