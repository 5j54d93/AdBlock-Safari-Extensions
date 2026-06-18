//
//  RulesetCatalog.swift
//  AdBlock
//
//  Created by Ricky on 2026/6/16.
//

import Foundation

struct RulesetInfo: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var group: String?
    var enabled: Bool?
    var lang: String?
    var tags: String?
    var homeURL: String? = nil

    var displayGroup: String {
        switch group {
        case "default":
            return "建議開啟"
        case "ads":
            return "廣告補強"
        case "privacy":
            return "隱私保護"
        case "malware":
            return "危險網站"
        case "annoyances":
            return "彈窗與干擾"
        case "regions":
            return "特定語言網站"
        default:
            return "其他清單"
        }
    }

    var displayName: String {
        switch id {
        case "ublock-filters":
            return "基礎防護"
        case "easylist":
            return "一般廣告"
        case "easyprivacy":
            return "追蹤保護"
        case "adguard-mobile":
            return "手機版網站廣告"
        case "block-lan":
            return "內部網路保護"
        case "annoyances-ai":
            return "AI 小工具"
        case "annoyances-cookies":
            return "Cookie 提示"
        case "annoyances-overlays":
            return "遮罩與彈出提示"
        case "annoyances-social":
            return "社群分享元件"
        case "annoyances-widgets":
            return "聊天與客服浮窗"
        case "annoyances-others":
            return "其他干擾內容"
        case "annoyances-notifications":
            return "通知提示"
        case "ublock-experimental":
            return "實驗性防護"
        default:
            if let regionalDisplayName {
                return regionalDisplayName
            }

            if group == "regions", let localizedLanguageName {
                return "\(localizedLanguageName)網站"
            }

            return cleanedName
        }
    }

    var displayDescription: String {
        switch id {
        case "ublock-filters":
            return "AdBlock 的核心清單，處理常見廣告、追蹤器與可疑連線。"
        case "easylist":
            return "補強一般網頁廣告與廣告版位。"
        case "easyprivacy":
            return "減少跨網站追蹤、分析工具與資料收集。"
        case "adguard-mobile":
            return "補強手機版網站的廣告格式。桌面版 Safari 較少遇到，且會多佔一個清單名額，因此預設關閉；常逛手機版網站再開即可。"
        case "block-lan":
            return "阻擋網站嘗試連到家中或公司內部網路裝置。"
        case "annoyances-ai":
            return "隱藏部分網站上的 AI 推薦或聊天小工具。"
        case "annoyances-cookies":
            return "減少 Cookie 同意、訂閱與通知提醒。"
        case "annoyances-overlays":
            return "處理遮住內容的浮層、提示與彈出區塊。"
        case "annoyances-social":
            return "減少社群分享、追蹤與嵌入元件。"
        case "annoyances-widgets":
            return "隱藏常見的客服聊天、回饋與浮動工具。"
        case "annoyances-others":
            return "處理其他會干擾閱讀的頁面元素。"
        case "annoyances-notifications":
            return "減少要求訂閱、開啟通知或接收推播的提示。"
        case "ublock-experimental":
            return "仍在驗證中的額外防護，可能影響少數網站。"
        default:
            if let regionalDescription {
                return regionalDescription
            }

            switch group {
            case "ads":
                return "補強特定網站或裝置上的廣告封鎖。"
            case "privacy":
                return "減少追蹤與不必要的資料收集。"
            case "malware":
                return "協助阻擋已知危險或可疑網站。"
            case "annoyances":
                return "減少彈窗、提示與其他干擾閱讀的內容。"
            case "regions":
                return "針對特定語言或地區網站補強封鎖。"
            default:
                return "額外的防護清單，可依需要開啟。"
            }
        }
    }

    private var localizedLanguageName: String? {
        guard let lang, lang.isEmpty == false else { return nil }
        let codes = lang
            .split(separator: " ")
            .prefix(2)
            .compactMap { Locale(identifier: "zh_Hant").localizedString(forLanguageCode: String($0)) }

        guard let first = codes.first else { return nil }
        if codes.count > 1 {
            return "\(first)等語言"
        }

        return first
    }

    private var regionalDisplayName: String? {
        let baseName: String?
        if let regionalName {
            baseName = regionalName
        } else if group == "regions", let localizedLanguageName {
            baseName = "\(localizedLanguageName)網站"
        } else {
            baseName = nil
        }

        guard let baseName else { return nil }
        let flags = regionFlags
        return flags.isEmpty ? baseName : "\(flags) \(baseName)"
    }

    private var regionFlags: String {
        let prefix = name.split(separator: ":", maxSplits: 1).first.map(String.init) ?? name
        var flags: [String] = []
        var current = ""
        for scalar in prefix.unicodeScalars where (0x1F1E6...0x1F1FF).contains(scalar.value) {
            current.unicodeScalars.append(scalar)
            if current.unicodeScalars.count == 2 {
                flags.append(current)
                current = ""
            }
        }
        return flags.joined(separator: " ")
    }

    private var regionalName: String? {
        switch id {
        case "alb-0":
            return "阿爾巴尼亞語網站"
        case "ara-0":
            return "阿拉伯語網站"
        case "bgr-0":
            return "保加利亞語與馬其頓語網站"
        case "chn-0":
            return "中文網站"
        case "cze-0":
            return "捷克語與斯洛伐克語網站"
        case "deu-0":
            return "德語網站"
        case "est-0":
            return "愛沙尼亞語網站"
        case "fin-0":
            return "芬蘭語網站"
        case "fra-0":
            return "法語網站"
        case "grc-0":
            return "希臘語網站"
        case "hrv-0":
            return "克羅埃西亞語與塞爾維亞語網站"
        case "hun-0":
            return "匈牙利語網站"
        case "idn-0":
            return "印尼語與馬來語網站"
        case "ind-0":
            return "印度與南亞語言網站"
        case "irn-0":
            return "波斯語與中亞語言網站"
        case "isl-0":
            return "冰島語網站"
        case "isr-0":
            return "希伯來語網站"
        case "ita-0":
            return "義大利語網站"
        case "jpn-1":
            return "日文網站"
        case "kor-1":
            return "韓文網站"
        case "ltu-0":
            return "立陶宛語網站"
        case "lva-0":
            return "拉脫維亞語網站"
        case "mkd-0":
            return "馬其頓語網站"
        case "nld-0":
            return "荷蘭語網站"
        case "nor-0":
            return "北歐語言網站"
        case "pol-0":
            return "波蘭語網站"
        case "rou-1":
            return "羅馬尼亞語網站"
        case "rus-0":
            return "俄語與東歐語言網站"
        case "rus-1":
            return "俄語網站追蹤補強"
        case "spa-0":
            return "西班牙語網站"
        case "spa-1":
            return "西班牙語與葡萄牙語網站"
        case "svn-0":
            return "斯洛維尼亞語網站"
        case "swe-1":
            return "瑞典語網站"
        case "tha-0":
            return "泰文網站"
        case "tur-0":
            return "土耳其語網站"
        case "ukr-0":
            return "烏克蘭語網站"
        case "vie-1":
            return "越南語網站"
        default:
            return nil
        }
    }

    private var regionalDescription: String? {
        guard let regionalName else { return nil }
        if id == "rus-1" {
            return "補強俄語網站常見的追蹤器與統計工具封鎖。"
        }

        return "針對\(regionalName)常見廣告與追蹤內容補強封鎖。"
    }

    private var cleanedName: String {
        var value = name
        let prefixes = [
            "AdBlock – ",
            "AdBlock - ",
            "EasyList – ",
            "EasyList - ",
            "AdGuard – ",
            "AdGuard - ",
        ]

        for prefix in prefixes {
            value = value.replacingOccurrences(of: prefix, with: "")
        }

        return value.isEmpty ? "其他防護" : value
    }
}

enum RulesetCatalog {
    static func load() -> [RulesetInfo] {
        if let url = bundledRulesetDetailsURL(),
           let data = try? Data(contentsOf: url),
           let rulesets = try? JSONDecoder().decode([RulesetInfo].self, from: data) {
            return rulesets
        }

        return fallbackRulesets
    }

    private static func bundledRulesetDetailsURL() -> URL? {
        let plugInsURL = Bundle.main.builtInPlugInsURL
        let candidateURLs = [
            plugInsURL?.appendingPathComponent("AdBlock Extension.appex"),
            Bundle.main.bundleURL
                .appendingPathComponent("Contents")
                .appendingPathComponent("PlugIns")
                .appendingPathComponent("AdBlock Extension.appex"),
        ].compactMap { $0 }

        for candidateURL in candidateURLs {
            guard let bundle = Bundle(url: candidateURL) else { continue }
            if let url = bundle.url(
                forResource: "ruleset-details",
                withExtension: "json",
                subdirectory: "rulesets"
            ) {
                return url
            }
        }

        return Bundle.main.url(
            forResource: "ruleset-details",
            withExtension: "json",
            subdirectory: "rulesets"
        )
    }

    private static let fallbackRulesets: [RulesetInfo] = [
        RulesetInfo(id: "ublock-filters", name: "AdBlock 基礎防護 - 廣告、追蹤器與更多項目", group: "default", enabled: true, lang: nil, tags: nil),
        RulesetInfo(id: "easylist", name: "EasyList", group: "default", enabled: true, lang: nil, tags: nil),
        RulesetInfo(id: "easyprivacy", name: "EasyPrivacy", group: "default", enabled: true, lang: nil, tags: nil),
        RulesetInfo(id: "block-lan", name: "Block Outsider Intrusion into LAN", group: "privacy", enabled: true, lang: nil, tags: nil),
        RulesetInfo(id: "annoyances-ai", name: "EasyList - AI Widgets", group: "annoyances", enabled: true, lang: nil, tags: nil),
        RulesetInfo(id: "annoyances-cookies", name: "EasyList - Cookie Notices", group: "annoyances", enabled: true, lang: nil, tags: nil),
        RulesetInfo(id: "annoyances-overlays", name: "EasyList - Overlay Notices", group: "annoyances", enabled: true, lang: nil, tags: nil),
        RulesetInfo(id: "annoyances-social", name: "EasyList - Social Widgets", group: "annoyances", enabled: true, lang: nil, tags: nil),
        RulesetInfo(id: "annoyances-widgets", name: "EasyList - Chat Widgets", group: "annoyances", enabled: true, lang: nil, tags: nil),
        RulesetInfo(id: "annoyances-others", name: "EasyList - Other Annoyances", group: "annoyances", enabled: true, lang: nil, tags: nil),
        RulesetInfo(id: "annoyances-notifications", name: "EasyList - Notifications", group: "annoyances", enabled: true, lang: nil, tags: nil),
    ]
}
