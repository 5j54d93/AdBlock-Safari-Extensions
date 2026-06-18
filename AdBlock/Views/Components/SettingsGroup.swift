//
//  SettingsGroup.swift
//  AdBlock
//

import SwiftUI

struct SettingsGroup<Content: View>: View {
    let title: String
    let footer: String?
    @ViewBuilder var content: Content

    init(title: String, footer: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.footer = footer
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(AppFont.groupTitle)
                .foregroundStyle(AppTheme.text000)

            VStack(alignment: .leading, spacing: 0) {
                content
                    .padding(14)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.bg000)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(AppTheme.border.opacity(0.16), lineWidth: 0.5)
            }

            if let footer {
                Text(footer)
                    .font(AppFont.supporting)
                    .foregroundStyle(AppTheme.text400)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct SettingRow<Control: View>: View {
    let title: String
    let detail: String
    var verticalPadding: CGFloat = 10
    var topPadding: CGFloat?
    var bottomPadding: CGFloat?
    @ViewBuilder var control: Control

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(AppFont.rowTitle)
                    .foregroundStyle(AppTheme.text000)

                Text(detail)
                    .font(AppFont.rowDetail)
                    .foregroundStyle(AppTheme.text400)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 16)

            control
        }
        .padding(.top, topPadding ?? verticalPadding)
        .padding(.bottom, bottomPadding ?? verticalPadding)
    }
}

struct ToggleRow: View {
    let title: String
    let detail: String
    let isOn: Binding<Bool>
    var verticalPadding: CGFloat = 10
    var topPadding: CGFloat?
    var bottomPadding: CGFloat?

    var body: some View {
        SettingRow(
            title: title,
            detail: detail,
            verticalPadding: verticalPadding,
            topPadding: topPadding,
            bottomPadding: bottomPadding
        ) {
            Toggle(title, isOn: isOn)
                .labelsHidden()
                .toggleStyle(.switch)
                .controlSize(.small)
        }
    }
}

struct SettingsRowDivider: View {
    var body: some View {
        Rectangle()
            .fill(AppTheme.border.opacity(0.12))
            .frame(height: 0.5)
    }
}
