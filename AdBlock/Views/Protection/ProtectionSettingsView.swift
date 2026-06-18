//
//  ProtectionSettingsView.swift
//  AdBlock
//

import SwiftUI

struct ProtectionSettingsView: View {
    @ObservedObject var viewModel: SettingsViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            FilteringModeSelector(
                selectedMode: viewModel.settings.defaultFilteringMode,
                selectMode: viewModel.setDefaultFilteringMode
            )

            SettingsGroup(title: "行為", footer: "這些設定會同步到 Safari 延伸功能，並在延伸功能啟動、喚醒或開啟彈出視窗與控制台時套用。") {
                VStack(alignment: .leading, spacing: 0) {
                    ToggleRow(
                        title: "自動重新載入頁面",
                        detail: "調整網站過濾模式後，自動重新載入目前頁面。",
                        isOn: viewModel.binding(\.autoReload),
                        topPadding: 0,
                        bottomPadding: 12
                    )

                    SettingsRowDivider()

                    ToggleRow(
                        title: "阻擋 popup 視窗",
                        detail: "自動關閉網站開出的非預期分頁或彈出視窗。",
                        isOn: viewModel.binding(\.popupBlockMode),
                        topPadding: 12,
                        bottomPadding: 0
                    )
                }
            }

            SiteExceptionsSection(viewModel: viewModel)
        }
    }
}

private struct SiteExceptionsSection: View {
    @ObservedObject var viewModel: SettingsViewModel
    @State private var isExpanded = false

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

                    Text("個別網站的過濾模式")
                        .font(AppFont.groupTitle)
                        .foregroundStyle(AppTheme.text000)

                    if viewModel.siteExceptionCount > 0 {
                        Text("\(viewModel.siteExceptionCount) 個例外")
                            .font(AppFont.metadata)
                            .foregroundStyle(AppTheme.accent)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 2)
                            .background(AppTheme.accentSoft)
                            .clipShape(Capsule())
                    }

                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(alignment: .leading, spacing: 12) {
                    Text("為特定網站指定不同於預設的防護等級，每個網站只會套用一種模式。")
                        .font(AppFont.supporting)
                        .foregroundStyle(AppTheme.text400)
                        .fixedSize(horizontal: false, vertical: true)

                    if viewModel.siteExceptions.isEmpty {
                        Text("尚未設定例外網站。")
                            .font(AppFont.rowDetail)
                            .foregroundStyle(AppTheme.text400)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 6)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(Array(viewModel.siteExceptions.enumerated()), id: \.element.id) { index, exception in
                                SiteExceptionRow(
                                    exception: exception,
                                    viewModel: viewModel,
                                    showsDivider: index < viewModel.siteExceptions.count - 1
                                )
                            }
                        }
                        .background(AppTheme.bg000)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .stroke(AppTheme.border.opacity(0.16), lineWidth: 0.5)
                        }
                    }

                    Button {
                        viewModel.addSiteException()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "plus")
                                .font(.system(size: 13, weight: .medium))
                            Text("新增例外網站")
                                .font(AppFont.control)
                        }
                        .foregroundStyle(AppTheme.text000)
                        .padding(.horizontal, 12)
                        .frame(height: 36)
                        .background {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(AppTheme.border.opacity(0.2), lineWidth: 0.5)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

private struct SiteExceptionRow: View {
    let exception: SiteException
    @ObservedObject var viewModel: SettingsViewModel
    let showsDivider: Bool

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "globe")
                .font(.system(size: 14))
                .foregroundStyle(AppTheme.text400)
                .accessibilityHidden(true)

            TextField("example.com", text: domainBinding)
                .font(AppFont.editor)
                .textFieldStyle(.plain)
                .frame(maxWidth: .infinity, alignment: .leading)

            Picker("模式", selection: modeBinding) {
                ForEach(FilteringMode.allCases) { mode in
                    Text(mode.title).tag(mode)
                }
            }
            .labelsHidden()
            .pickerStyle(.menu)
            .fixedSize()

            Button {
                viewModel.removeSiteException(exception.id)
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(AppTheme.text400)
                    .frame(width: 24, height: 24)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("移除這個例外")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 7)
        .overlay(alignment: .bottom) {
            if showsDivider {
                Rectangle()
                    .fill(AppTheme.border.opacity(0.12))
                    .frame(height: 0.5)
            }
        }
    }

    private var domainBinding: Binding<String> {
        Binding {
            exception.domain
        } set: { newValue in
            viewModel.updateSiteExceptionDomain(exception.id, newValue)
        }
    }

    private var modeBinding: Binding<FilteringMode> {
        Binding {
            exception.mode
        } set: { newValue in
            viewModel.updateSiteExceptionMode(exception.id, newValue)
        }
    }
}
