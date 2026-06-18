//
//  SettingsViewModel+Rulesets.swift
//  AdBlock
//

import Foundation

extension SettingsViewModel {
    var enabledRulesetCount: Int {
        settings.enabledRulesets.count
    }

    var filteredRulesetGroups: [RulesetGroup] {
        let needle = searchText
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let filtered = rulesets.filter { ruleset in
            guard needle.isEmpty == false else { return true }
            return ruleset.displayName.lowercased().contains(needle)
                || ruleset.displayDescription.lowercased().contains(needle)
                || ruleset.name.lowercased().contains(needle)
                || ruleset.displayGroup.lowercased().contains(needle)
                || (ruleset.tags?.lowercased().contains(needle) ?? false)
        }

        let grouped = Dictionary(grouping: filtered, by: \.displayGroup)
        let order = ["建議開啟", "廣告補強", "隱私保護", "危險網站", "彈窗與干擾", "特定語言網站", "其他清單"]

        return order.compactMap { title in
            guard let items = grouped[title], items.isEmpty == false else { return nil }
            return RulesetGroup(title: title, rulesets: items)
        }
    }

    func isRulesetEnabled(_ ruleset: RulesetInfo) -> Bool {
        settings.enabledRulesets.contains(ruleset.id)
    }

    func setRuleset(_ ruleset: RulesetInfo, enabled: Bool) {
        var ids = Set(settings.enabledRulesets)
        if enabled {
            guard ids.count < AdBlockSettings.maxEnabledRulesets || ids.contains(ruleset.id) else {
                return
            }
            ids.insert(ruleset.id)
        } else {
            ids.remove(ruleset.id)
        }

        var next = settings
        next.enabledRulesets = rulesets.map(\.id).filter { ids.contains($0) }
        persist(next)
    }

    func enableRecommendedRulesets() {
        var next = settings
        next.enabledRulesets = rulesets
            .filter { $0.enabled == true }
            .map(\.id)
        persist(next)
    }
}
