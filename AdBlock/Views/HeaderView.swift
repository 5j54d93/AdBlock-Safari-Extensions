//
//  HeaderView.swift
//  AdBlock
//

import SwiftUI

struct HeaderView: View {
    let selectedSection: SettingsSection
    let extensionStatusDescription: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(selectedSection.title)
                .font(AppFont.pageTitle)
                .foregroundStyle(AppTheme.text000)

            Text(selectedSection.description(default: extensionStatusDescription))
                .font(AppFont.pageDescription)
                .foregroundStyle(AppTheme.text400)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
