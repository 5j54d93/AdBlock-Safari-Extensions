//
//  SettingsSection.swift
//  AdBlock
//

import Foundation

enum SettingsSection: String, CaseIterable, Identifiable {
    case protection
    case rulesets
    case customRules
    case filterListSources
    case advanced

    var id: String { rawValue }

    var title: String {
        switch self {
        case .protection:
            return "防護設定"
        case .rulesets:
            return "防護清單"
        case .customRules:
            return "自訂規則"
        case .filterListSources:
            return "封鎖清單來源"
        case .advanced:
            return "進階"
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
            return "查看 AdBlock 目前內建的開源封鎖清單與來源。"
        default:
            return defaultDescription
        }
    }
}
