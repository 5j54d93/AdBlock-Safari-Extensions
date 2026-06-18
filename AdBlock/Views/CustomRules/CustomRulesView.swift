//
//  CustomRulesView.swift
//  AdBlock
//

import SwiftUI

struct CustomRulesView: View {
    @ObservedObject var viewModel: SettingsViewModel
    @State private var importText = ""
    @State private var isImportExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            SettingsGroup(
                title: "自訂規則",
                footer: "每行填一條規則，例如 .ad-banner 或 +js(set-constant, adEnabled, false)。也可以在批次匯入貼上 example.com##.ad-banner 這類規則。"
            ) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .center, spacing: 10) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("已設定 \(viewModel.customFilterSites.count) 個網站，\(viewModel.customFilterRuleCount) 條規則")
                                .font(AppFont.rowTitle)
                                .foregroundStyle(AppTheme.text000)

                            Text("自訂規則會隨 App 設定同步到 Safari 延伸功能。")
                                .font(AppFont.rowDetail)
                                .foregroundStyle(AppTheme.text400)
                        }

                        Spacer(minLength: 12)

                        Button {
                            viewModel.copyCustomFiltersToPasteboard()
                        } label: {
                            Label("複製全部", systemImage: "doc.on.doc")
                        }
                        .font(AppFont.control)
                        .buttonStyle(.bordered)

                        Button {
                            viewModel.addCustomFilterSite()
                        } label: {
                            Label("新增網站", systemImage: "plus")
                        }
                        .font(AppFont.control)
                        .buttonStyle(.borderedProminent)
                    }

                    DisclosureGroup("批次匯入", isExpanded: $isImportExpanded) {
                        VStack(alignment: .leading, spacing: 10) {
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

                            HStack {
                                Text("支援格式：example.com##.ad-banner")
                                    .font(AppFont.metadata)
                                    .foregroundStyle(AppTheme.text400)

                                Spacer(minLength: 12)

                                Button {
                                    let importedCount = viewModel.importCustomFilterText(importText)
                                    if importedCount > 0 {
                                        importText = ""
                                        isImportExpanded = false
                                    }
                                } label: {
                                    Label("匯入", systemImage: "tray.and.arrow.down")
                                }
                                .font(AppFont.control)
                                .buttonStyle(.bordered)
                                .disabled(importText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            }
                        }
                        .padding(.top, 8)
                    }
                    .font(AppFont.rowTitle)
                }
            }

            if viewModel.customFilterSites.isEmpty {
                Text("尚未設定自訂規則。")
                    .font(AppFont.rowDetail)
                    .foregroundStyle(AppTheme.text400)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 4)
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(viewModel.customFilterSites) { site in
                        CustomFilterSiteCard(site: site, viewModel: viewModel)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                if let settingsTransferMessage = viewModel.settingsTransferMessage {
                    Text(settingsTransferMessage)
                        .font(AppFont.supporting)
                        .foregroundStyle(AppTheme.text200)
                }

                if let settingsTransferError = viewModel.settingsTransferError {
                    Text(settingsTransferError)
                        .font(AppFont.supporting)
                        .foregroundStyle(.red)
                }
            }
        }
    }
}

private struct CustomFilterSiteCard: View {
    let site: CustomFilterSite
    @ObservedObject var viewModel: SettingsViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "globe")
                    .font(.system(size: 14))
                    .foregroundStyle(AppTheme.text400)
                    .accessibilityHidden(true)

                TextField("example.com", text: hostnameBinding)
                    .font(AppFont.editor)
                    .textFieldStyle(.plain)

                Button {
                    viewModel.removeCustomFilterSite(site.id)
                } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(AppTheme.text400)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("移除這個網站的自訂規則")
            }

            TextEditor(text: rulesBinding)
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
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.bg000)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(AppTheme.border.opacity(0.16), lineWidth: 0.5)
        }
    }

    private var hostnameBinding: Binding<String> {
        Binding {
            site.hostname
        } set: { newValue in
            viewModel.updateCustomFilterSiteHostname(site.id, newValue)
        }
    }

    private var rulesBinding: Binding<String> {
        Binding {
            site.rulesText
        } set: { newValue in
            viewModel.updateCustomFilterSiteRulesText(site.id, newValue)
        }
    }
}
