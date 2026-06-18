//
//  AppTheme.swift
//  AdBlock
//

import AppKit
import SwiftUI

enum AppTheme {
    static let bg000 = Color(nsColor: .adBlockDynamic(light: "#ffffff", dark: "#2c2c2a"))
    static let bg100 = Color(nsColor: .adBlockDynamic(light: "#f8f8f6", dark: "#1f1f1e"))
    static let bg200 = Color(nsColor: .adBlockDynamic(light: "#f4f4f1", dark: "#171716"))
    static let text000 = Color(nsColor: .adBlockDynamic(light: "#121212", dark: "#f8f8f6"))
    static let text200 = Color(nsColor: .adBlockDynamic(light: "#373734", dark: "#c3c2b7"))
    static let text400 = Color(nsColor: .adBlockDynamic(light: "#7b7974", dark: "#97958c"))
    static let border = Color(nsColor: .adBlockDynamic(light: "#1f1f1e", dark: "#e2e1da"))
    static let accent = Color.accentColor
    static let accentSoft = Color.accentColor.opacity(0.14)
}

extension NSColor {
    static func adBlockDynamic(light: String, dark: String) -> NSColor {
        NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            return NSColor(hex: isDark ? dark : light)
        }
    }

    convenience init(hex: String) {
        var value = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        if value.count == 3 {
            value = value.map { "\($0)\($0)" }.joined()
        }

        var rgb: UInt64 = 0
        Scanner(string: value).scanHexInt64(&rgb)

        self.init(
            calibratedRed: CGFloat((rgb >> 16) & 0xff) / 255,
            green: CGFloat((rgb >> 8) & 0xff) / 255,
            blue: CGFloat(rgb & 0xff) / 255,
            alpha: 1
        )
    }
}
