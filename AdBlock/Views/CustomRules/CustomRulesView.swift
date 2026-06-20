//
//  CustomRulesView.swift
//  AdBlock
//

import SwiftUI

struct CustomRulesView: View {
    @ObservedObject var viewModel: SettingsViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            HiddenContentIntro()

            if viewModel.settings.customFilters.isEmpty {
                EmptyHiddenContent()
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(viewModel.settings.customFilters) { entry in
                        HiddenSiteCard(entry: entry, viewModel: viewModel)
                    }
                }
            }

            AdvancedCustomRules(viewModel: viewModel)

            VStack(alignment: .leading, spacing: 6) {
                if let settingsTransferMessage = viewModel.settingsTransferMessage {
                    Text(settingsTransferMessage)
                        .font(AppFont.supporting)
                        .foregroundStyle(AppTheme.text200)
                }

                if let settingsTransferError = viewModel.settingsTransferError {
                    Text(settingsTransferError)
                        .font(AppFont.supporting)
                        .foregroundStyle(AppTheme.danger)
                }
            }
        }
    }
}

// MARK: - Intro

private struct HiddenContentIntro: View {
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "hand.tap")
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(AppTheme.brand)
                .padding(.top, 1)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text("想隱藏某個廣告或區塊？")
                    .font(AppFont.rowTitle)
                    .foregroundStyle(AppTheme.text000)

                Text("在 Safari 打開該網站，點工具列的 AdBlock →「移除元素」，再點一下想隱藏的東西，就會永久存到這裡。")
                    .font(AppFont.rowDetail)
                    .foregroundStyle(AppTheme.text200)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.brandSoft)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct EmptyHiddenContent: View {
    var body: some View {
        Text("還沒有手動隱藏任何內容。照上面的步驟，在 Safari 點選想隱藏的東西，就會出現在這裡。")
            .font(AppFont.rowDetail)
            .foregroundStyle(AppTheme.text400)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 4)
    }
}

// MARK: - Per-site card

private struct HiddenSiteCard: View {
    let entry: CustomFilterEntry
    @ObservedObject var viewModel: SettingsViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "globe")
                    .font(.system(size: 14))
                    .foregroundStyle(AppTheme.text400)
                    .accessibilityHidden(true)

                Text(entry.hostname)
                    .font(AppFont.rowTitle)
                    .foregroundStyle(AppTheme.text000)

                Spacer(minLength: 8)

                Text("隱藏了 \(entry.selectors.count) 個元素")
                    .font(AppFont.metadata)
                    .foregroundStyle(AppTheme.text400)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 2)
                    .background(AppTheme.bg200)
                    .clipShape(Capsule())
            }
            .padding(.vertical, 10)

            SettingsRowDivider()

            ForEach(Array(entry.selectors.enumerated()), id: \.element) { index, selector in
                HiddenElementRow(
                    selector: selector,
                    label: entry.label(for: selector),
                    showsDivider: index < entry.selectors.count - 1
                ) {
                    viewModel.removeCustomFilter(hostname: entry.hostname, selector: selector)
                }
            }
        }
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.bg000)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(AppTheme.border.opacity(0.16), lineWidth: 0.5)
        }
    }
}

private struct HiddenElementRow: View {
    let selector: String
    let label: String?
    let showsDivider: Bool
    let remove: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: iconName)
                .font(.system(size: 16))
                .foregroundStyle(AppTheme.text400)
                .frame(width: 34, height: 34)
                .background(AppTheme.bg200)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(label ?? selector)
                    .font(label == nil ? AppFont.timestamp : AppFont.rowDetail)
                    .foregroundStyle(AppTheme.text000)
                    .lineLimit(1)
                    .truncationMode(.middle)

                if label != nil {
                    Text(selector)
                        .font(AppFont.timestamp)
                        .foregroundStyle(AppTheme.text400)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button(action: remove) {
                Image(systemName: "trash")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(AppTheme.text400)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("取消隱藏這個元素")
        }
        .padding(.vertical, 9)
        .overlay(alignment: .bottom) {
            if showsDivider {
                Rectangle()
                    .fill(AppTheme.border.opacity(0.12))
                    .frame(height: 0.5)
            }
        }
    }

    private var iconName: String {
        let lowered = selector.lowercased()
        if lowered.contains("img") || lowered.contains("image") || lowered.contains("photo") {
            return "photo"
        }
        if lowered.contains("video") || lowered.contains("player") {
            return "play.rectangle"
        }
        if lowered.contains("modal") || lowered.contains("popup") || lowered.contains("overlay") {
            return "rectangle.on.rectangle"
        }
        return "rectangle"
    }
}

// MARK: - Advanced

private struct AdvancedCustomRules: View {
    @ObservedObject var viewModel: SettingsViewModel
    @State private var isExpanded = false
    @State private var importText = ""
    @State private var isConfirmingClear = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                withAnimation(.easeOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(AppTheme.text400)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))

                    Text("進階：手動輸入規則")
                        .font(AppFont.groupTitle)
                        .foregroundStyle(AppTheme.text000)

                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(alignment: .leading, spacing: 12) {
                    Text("每行貼一條 adblock 規則，例如 example.com##.ad-banner，或只貼選擇器 .ad-banner。匯入後會同步到 Safari 延伸功能。")
                        .font(AppFont.supporting)
                        .foregroundStyle(AppTheme.text400)
                        .fixedSize(horizontal: false, vertical: true)

                    TextEditor(text: $importText)
                        .font(AppFont.editor)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 92)
                        .padding(8)
                        .background(AppTheme.bg200)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(AppTheme.border.opacity(0.12), lineWidth: 0.5)
                        }

                    HStack(spacing: 10) {
                        Button {
                            let importedCount = viewModel.importCustomFilterText(importText)
                            if importedCount > 0 {
                                importText = ""
                            }
                        } label: {
                            Label("匯入", systemImage: "tray.and.arrow.down")
                        }
                        .font(AppFont.control)
                        .buttonStyle(.borderedProminent)
                        .disabled(importText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                        Button {
                            viewModel.copyCustomFiltersToPasteboard()
                        } label: {
                            Label("複製全部", systemImage: "doc.on.doc")
                        }
                        .font(AppFont.control)
                        .buttonStyle(.bordered)
                        .disabled(viewModel.settings.customFilters.isEmpty)

                        Spacer(minLength: 0)

                        Button(role: .destructive) {
                            isConfirmingClear = true
                        } label: {
                            Label("清除全部", systemImage: "trash")
                        }
                        .font(AppFont.control)
                        .buttonStyle(.bordered)
                        .disabled(viewModel.settings.customFilters.isEmpty)
                        .alert("清除所有隱藏的內容？", isPresented: $isConfirmingClear) {
                            Button("取消", role: .cancel) {}
                            Button("清除", role: .destructive) {
                                viewModel.clearAllCustomFilters()
                            }
                        } message: {
                            Text("這會移除所有網站的隱藏元素，無法復原。")
                        }
                    }
                }
            }
        }
    }
}
