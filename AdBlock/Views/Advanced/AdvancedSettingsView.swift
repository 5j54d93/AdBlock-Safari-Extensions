//
//  AdvancedSettingsView.swift
//  AdBlock
//

import SwiftUI

struct AdvancedSettingsView: View {
    @ObservedObject var viewModel: SettingsViewModel
    @State private var isConfirmingReset = false

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            SettingsGroup(
                title: "備份與還原",
                footer: "備份檔包含過濾模式、行為、防護清單與個別網站例外。匯入後會覆蓋目前設定，並同步到 Safari 延伸功能。"
            ) {
                VStack(alignment: .leading, spacing: 0) {
                    SettingRow(
                        title: "匯出設定",
                        detail: "將目前設定存成 JSON 備份檔。",
                        topPadding: 0,
                        bottomPadding: 12
                    ) {
                        Button {
                            viewModel.exportSettingsBackup()
                        } label: {
                            Label("匯出備份", systemImage: "square.and.arrow.up")
                        }
                        .font(AppFont.control)
                        .buttonStyle(.bordered)
                    }

                    SettingsRowDivider()

                    SettingRow(
                        title: "匯入設定",
                        detail: "從備份檔還原設定，會取代目前的設定。",
                        topPadding: 12,
                        bottomPadding: 0
                    ) {
                        Button {
                            viewModel.importSettingsBackup()
                        } label: {
                            Label("匯入備份", systemImage: "square.and.arrow.down")
                        }
                        .font(AppFont.control)
                        .buttonStyle(.bordered)
                    }
                }
            }

            SettingsGroup(
                title: "重設",
                footer: "這會把過濾模式、行為、防護清單與個別網站例外全部還原成建議值。"
            ) {
                SettingRow(
                    title: "重設為建議值",
                    detail: "清除目前調整，回到建議設定。",
                    verticalPadding: 0
                ) {
                    Button(role: .destructive) {
                        isConfirmingReset = true
                    } label: {
                        Label("重設", systemImage: "arrow.counterclockwise")
                    }
                    .font(AppFont.control)
                    .buttonStyle(.bordered)
                    .alert("重設所有設定？", isPresented: $isConfirmingReset) {
                        Button("取消", role: .cancel) {}
                        Button("重設", role: .destructive) {
                            viewModel.resetToDefaults()
                        }
                    } message: {
                        Text("這會把過濾模式、行為、防護清單與個別網站例外全部還原成建議值，無法復原。")
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

                if let saveError = viewModel.saveError {
                    Text(saveError)
                        .font(AppFont.supporting)
                        .foregroundStyle(.red)
                }

            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
