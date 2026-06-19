//
//  SettingsSection.swift
//  AdBlock
//

import Foundation

enum SettingsSection: String, CaseIterable, Identifiable {
    case protection
    case rulesets
    case customRules
    case advanced
    case filterListSources

    var id: String { rawValue }

    var group: SettingsSectionGroup {
        switch self {
        case .protection, .rulesets, .customRules, .advanced:
            return .protection
        case .filterListSources:
            return .about
        }
    }

    var title: String {
        switch self {
        case .protection:
            return "防護設定"
        case .rulesets:
            return "防護清單"
        case .customRules:
            return "自訂規則"
        case .advanced:
            return "進階"
        case .filterListSources:
            return "防護清單來源"
        }
    }

    var systemImage: String {
        switch self {
        case .protection:
            return "shield.lefthalf.filled"
        case .rulesets:
            return "list.bullet.rectangle"
        case .customRules:
            return "curlybraces.square"
        case .filterListSources:
            return "link"
        case .advanced:
            return "slider.horizontal.3"
        }
    }

    func description(default defaultDescription: String) -> String {
        switch self {
        case .customRules:
            return "為特定網站加入自己的頁面隱藏或 scriptlet 規則，儲存後會同步到 Safari 延伸功能。"
        case .filterListSources:
            return "查看 AdBlock 目前內建的開源防護清單與來源。"
        default:
            return defaultDescription
        }
    }
}

enum SettingsSectionGroup: String, CaseIterable, Identifiable {
    case protection
    case about

    var id: String { rawValue }

    var title: String {
        switch self {
        case .protection:
            return "防護"
        case .about:
            return "關於"
        }
    }

    var sections: [SettingsSection] {
        SettingsSection.allCases.filter { $0.group == self }
    }
}
