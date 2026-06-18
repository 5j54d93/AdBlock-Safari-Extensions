//
//  SettingsViewModel.swift
//  AdBlock
//

import Combine
import Foundation

@MainActor
final class SettingsViewModel: ObservableObject {
    @Published var searchText = ""
    @Published var settings: AdBlockSettings
    @Published var siteExceptions: [SiteException] = []
    @Published var customFilterSites: [CustomFilterSite] = []
    @Published var rulesets: [RulesetInfo]
    @Published var extensionState: ExtensionState = .unknown
    @Published var isRefreshingExtensionState = false
    @Published var lastSavedAt: Date?
    @Published var saveError: String?
    @Published var settingsTransferMessage: String?
    @Published var settingsTransferError: String?

    let store = AdBlockSettingsStore()
    var isExtensionStateRefreshInFlight = false
    var lastExtensionStateRefreshAt: Date?

    init() {
        let loadedRulesets = RulesetCatalog.load()
        rulesets = loadedRulesets
        settings = store.load(defaultRulesets: loadedRulesets.defaultEnabledIDs)
        siteExceptions = Self.exceptions(from: settings)
        customFilterSites = Self.customFilterSites(from: settings)
    }

    var extensionStatusTitle: String {
        switch extensionState {
        case .enabled:
            return "Safari 延伸功能已啟用"
        case .disabled:
            return "Safari 延伸功能尚未啟用"
        case .unavailable:
            return "無法讀取 Safari 延伸功能狀態"
        case .unknown:
            return "正在確認 Safari 延伸功能狀態"
        }
    }

    var extensionStatusDescription: String {
        switch extensionState {
        case .enabled:
            return "App 的設定會同步給 Safari 延伸功能。"
        case .disabled:
            return "請先在 Safari 設定的延伸功能頁面啟用 AdBlock。"
        case .unavailable:
            return "Safari 沒有回傳延伸功能狀態，可以打開 Safari 設定確認。"
        case .unknown:
            return "正在向 Safari 查詢延伸功能是否已啟用。"
        }
    }

    var filterListSources: [FilterListSource] {
        FilterListSource.make(from: rulesets)
    }
}
