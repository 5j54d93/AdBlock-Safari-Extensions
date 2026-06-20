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
            return "已隱藏的內容"
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
            return "eye.slash"
        case .filterListSources:
            return "link"
        case .advanced:
            return "slider.horizontal.3"
        }
    }

    var description: String {
        switch self {
        case .protection:
            return "設定整體的封鎖強度與行為，並為個別網站指定例外。"
        case .rulesets:
            return "選擇要啟用的內建封鎖清單，涵蓋廣告、追蹤器與各語言網站。"
        case .customRules:
            return "你在各網站手動隱藏的元素都列在這裡，隨時可以還原。"
        case .filterListSources:
            return "查看 AdBlock 目前內建的開源防護清單與來源。"
        case .advanced:
            return "備份、還原或重設你的所有設定。"
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
