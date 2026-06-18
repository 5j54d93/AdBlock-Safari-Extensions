//
//  SidebarView.swift
//  AdBlock
//

import SwiftUI

struct SidebarView: View {
    @Binding var selectedSection: SettingsSection
    @ObservedObject var viewModel: SettingsViewModel

    var body: some View {
        VStack(spacing: 0) {
            List(selection: $selectedSection) {
                Section("Safari 延伸功能") {
                    ForEach(SettingsSection.allCases) { section in
                        Label(section.title, systemImage: section.systemImage)
                            .font(AppFont.sidebarItem)
                            .tag(section)
                    }
                }
            }
            .listStyle(.sidebar)
            .scrollContentBackground(.hidden)

            if let lastSavedAt = viewModel.lastSavedAt {
                VStack(alignment: .leading, spacing: 4) {
                    Text("上次儲存：\(Text(Self.savedAtFormatter.string(from: lastSavedAt)).font(AppFont.timestamp))")
                        .font(AppFont.metadata)
                        .foregroundStyle(AppTheme.text400)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                }
            }
        }
        .background(AppTheme.bg100)
    }

    private static let savedAtFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy/MM/dd HH:mm:ss"
        return formatter
    }()
}
