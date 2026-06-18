//
//  AppFont.swift
//  AdBlock
//

import SwiftUI

enum AppFont {
    static let sidebarItem = Font.body
    static let pageTitle = Font.title.weight(.semibold)
    static let pageDescription = Font.body
    static let groupTitle = Font.title3.weight(.semibold)
    static let rowTitle = Font.body.weight(.medium)
    static let rowDetail = Font.callout
    static let supporting = Font.callout
    static let rulesetTitle = Font.body
    static let metadata = Font.footnote
    static let caption = Font.footnote
    static let control = Font.body
    static let editor = Font.system(.body, design: .monospaced)
    static let timestamp = Font.system(.footnote, design: .monospaced)
}
