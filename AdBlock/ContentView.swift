//
//  ContentView.swift
//  AdBlock
//
//  Created by Ricky on 2026/6/16.
//

import AppKit
import SwiftUI

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedSection: SettingsSection = .protection
    @StateObject private var viewModel = SettingsViewModel()

    private var extensionStatusSubtitle: Text {
        let dot = Text(Image(systemName: "circlebadge.fill"))
            .foregroundColor(viewModel.extensionState.statusColor)
        return Text("\(dot) \(viewModel.extensionStatusTitle)")
    }

    var body: some View {
        NavigationSplitView {
            SidebarView(selectedSection: $selectedSection, viewModel: viewModel)
                .navigationSplitViewColumnWidth(min: 220, ideal: 240, max: 280)
        } detail: {
            ZStack(alignment: .topLeading) {
                AppTheme.bg100.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        HeaderView(selectedSection: selectedSection)

                        switch selectedSection {
                        case .protection:
                            ProtectionSettingsView(viewModel: viewModel)
                        case .rulesets:
                            RulesetSettingsView(viewModel: viewModel)
                        case .customRules:
                            CustomRulesView(viewModel: viewModel)
                        case .filterListSources:
                            FilterListSourcesView(viewModel: viewModel)
                        case .advanced:
                            AdvancedSettingsView(viewModel: viewModel)
                        }
                    }
                    .padding(28)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .frame(minWidth: 920, minHeight: 640)
        .background(AppTheme.bg100)
        .navigationTitle("AdBlock")
        .navigationSubtitle(extensionStatusSubtitle)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button {
                    Task {
                        await viewModel.refreshExtensionState()
                    }
                } label: {
                    if viewModel.isRefreshingExtensionState {
                        ProgressView()
                            .controlSize(.small)
                            .frame(width: 16, height: 16)
                            .accessibilityLabel("正在重新整理 Safari 延伸功能狀態")
                    } else {
                        Label("重新整理狀態", systemImage: "arrow.clockwise")
                    }
                }
                .disabled(viewModel.isRefreshingExtensionState)
                .help("重新整理 Safari 延伸功能狀態")

                Button {
                    viewModel.openSafariSettings()
                } label: {
                    Label("Safari 設定", systemImage: "safari")
                }
                .help("打開 Safari 延伸功能設定")
            }
        }
        .task {
            await viewModel.refreshExtensionState()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            Task { @MainActor in
                viewModel.reloadFromStoreIfNeeded()
                await viewModel.refreshExtensionStateIfNeeded()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
            Task {
                await viewModel.refreshExtensionStateIfNeeded()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { @MainActor in
                viewModel.reloadFromStoreIfNeeded()
                await viewModel.refreshExtensionStateIfNeeded()
            }
        }
    }
}
