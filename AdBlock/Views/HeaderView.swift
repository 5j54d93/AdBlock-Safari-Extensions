//
//  HeaderView.swift
//  AdBlock
//

import SwiftUI

struct HeaderView: View {
    let selectedSection: SettingsSection

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(selectedSection.title)
                .font(AppFont.pageTitle)
                .foregroundStyle(AppTheme.text000)

            Text(selectedSection.description)
                .font(AppFont.pageDescription)
                .foregroundStyle(AppTheme.text400)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
