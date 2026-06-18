//
//  AdBlockSettings.swift
//  AdBlock
//
//  Created by Ricky on 2026/6/16.
//

import Foundation

enum FilteringMode: String, CaseIterable, Codable, Identifiable {
    case none
    case basic
    case optimal
    case complete

    var id: String { rawValue }

    var title: String {
        switch self {
        case .none:
            return "關閉"
        case .basic:
            return "基本"
        case .optimal:
            return "最佳"
        case .complete:
            return "完整"
        }
    }

    var summary: String {
        switch self {
        case .none:
            return "不封鎖任何網站內容，適合暫時排查網站問題。"
        case .basic:
            return "封鎖常見廣告與追蹤連線，相容性最好。"
        case .optimal:
            return "加入頁面內容過濾，適合大多數日常瀏覽。"
        case .complete:
            return "使用最高防護等級，封鎖最多但少數網站可能需要例外。"
        }
    }

    var permissionNote: String {
        switch self {
        case .none:
            return "適合：信任網站、付款流程，或暫時確認問題是否由封鎖造成。"
        case .basic:
            return "權限需求最低，通常最不會影響網站功能。"
        case .optimal:
            return "需要允許 Safari 延伸功能在網站上運作；保護與相容性較平衡。"
        case .complete:
            return "需要網站權限；少數網站可能載入較慢或需要改用較低等級。"
        }
    }

    var systemImage: String {
        switch self {
        case .none:
            return "power"
        case .basic:
            return "shield"
        case .optimal:
            return "shield.lefthalf.filled"
        case .complete:
            return "shield.fill"
        }
    }
}

struct AdBlockSettings: Codable, Equatable {
    static let suiteName = "group.com.Ricky.AdBlock"
    static let storageKey = "macAppSettings.v1"
    static let maxEnabledRulesets = 50

    var revision: Int64
    var defaultFilteringMode: FilteringMode
    var autoReload: Bool
    var popupBlockMode: Bool
    var enabledRulesets: [String]
    var noFilteringHostnames: [String]
    var basicFilteringHostnames: [String]
    var optimalFilteringHostnames: [String]
    var completeFilteringHostnames: [String]
    var customFilters: [CustomFilterEntry]

    init(
        revision: Int64,
        defaultFilteringMode: FilteringMode,
        autoReload: Bool,
        popupBlockMode: Bool,
        enabledRulesets: [String],
        noFilteringHostnames: [String],
        basicFilteringHostnames: [String],
        optimalFilteringHostnames: [String],
        completeFilteringHostnames: [String],
        customFilters: [CustomFilterEntry] = []
    ) {
        self.revision = revision
        self.defaultFilteringMode = defaultFilteringMode
        self.autoReload = autoReload
        self.popupBlockMode = popupBlockMode
        self.enabledRulesets = enabledRulesets
        self.noFilteringHostnames = noFilteringHostnames
        self.basicFilteringHostnames = basicFilteringHostnames
        self.optimalFilteringHostnames = optimalFilteringHostnames
        self.completeFilteringHostnames = completeFilteringHostnames
        self.customFilters = customFilters
    }

    private enum CodingKeys: String, CodingKey {
        case revision
        case defaultFilteringMode
        case autoReload
        case popupBlockMode
        case enabledRulesets
        case noFilteringHostnames
        case basicFilteringHostnames
        case optimalFilteringHostnames
        case completeFilteringHostnames
        case customFilters
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        revision = try container.decode(Int64.self, forKey: .revision)
        defaultFilteringMode = try container.decode(FilteringMode.self, forKey: .defaultFilteringMode)
        autoReload = try container.decode(Bool.self, forKey: .autoReload)
        popupBlockMode = try container.decode(Bool.self, forKey: .popupBlockMode)
        enabledRulesets = try container.decode([String].self, forKey: .enabledRulesets)
        noFilteringHostnames = try container.decodeIfPresent([String].self, forKey: .noFilteringHostnames) ?? []
        basicFilteringHostnames = try container.decodeIfPresent([String].self, forKey: .basicFilteringHostnames) ?? []
        optimalFilteringHostnames = try container.decodeIfPresent([String].self, forKey: .optimalFilteringHostnames) ?? []
        completeFilteringHostnames = try container.decodeIfPresent([String].self, forKey: .completeFilteringHostnames) ?? []
        customFilters = try container.decodeIfPresent([CustomFilterEntry].self, forKey: .customFilters) ?? []
    }

    static func defaults(enabledRulesets: [String]) -> AdBlockSettings {
        AdBlockSettings(
            revision: 0,
            defaultFilteringMode: .complete,
            autoReload: true,
            popupBlockMode: true,
            enabledRulesets: enabledRulesets,
            noFilteringHostnames: [],
            basicFilteringHostnames: [],
            optimalFilteringHostnames: [],
            completeFilteringHostnames: [],
            customFilters: []
        )
    }
}

struct CustomFilterEntry: Codable, Equatable, Identifiable {
    var id: String { hostname }
    var hostname: String
    var selectors: [String]
}

struct AdBlockSettingsBackup: Codable {
    static let currentVersion = 1

    let appName: String
    let backupVersion: Int
    let exportedAt: Date
    let settings: AdBlockSettings

    init(settings: AdBlockSettings, exportedAt: Date = Date()) {
        appName = "AdBlock"
        backupVersion = Self.currentVersion
        self.exportedAt = exportedAt
        self.settings = settings
    }
}

final class AdBlockSettingsStore {
    private let defaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init() {
        defaults = Self.sharedDefaults()
    }

    func load(defaultRulesets: [String]) -> AdBlockSettings {
        guard
            let data = defaults.data(forKey: AdBlockSettings.storageKey),
            let settings = try? decoder.decode(AdBlockSettings.self, from: data)
        else {
            return AdBlockSettings.defaults(enabledRulesets: defaultRulesets)
        }

        return settings
    }

    func save(_ settings: AdBlockSettings) throws {
        let data = try encoder.encode(settings)
        defaults.set(data, forKey: AdBlockSettings.storageKey)
        defaults.synchronize()
    }

    private static func sharedDefaults() -> UserDefaults {
        guard FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: AdBlockSettings.suiteName
        ) != nil else {
            return .standard
        }

        return UserDefaults(suiteName: AdBlockSettings.suiteName) ?? .standard
    }

    func makeBackupData(for settings: AdBlockSettings) throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [
            .prettyPrinted,
            .sortedKeys,
            .withoutEscapingSlashes
        ]
        return try encoder.encode(AdBlockSettingsBackup(settings: settings))
    }

    func settings(fromBackupData data: Data) throws -> AdBlockSettings {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        if let backup = try? decoder.decode(AdBlockSettingsBackup.self, from: data) {
            return backup.settings
        }

        return try decoder.decode(AdBlockSettings.self, from: data)
    }
}
