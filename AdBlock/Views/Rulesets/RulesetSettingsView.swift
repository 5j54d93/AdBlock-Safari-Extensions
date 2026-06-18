//
//  RulesetSettingsView.swift
//  AdBlock
//

import SwiftUI

struct RulesetSettingsView: View {
    @ObservedObject var viewModel: SettingsViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            RulesetToolbar(viewModel: viewModel)

            ForEach(viewModel.filteredRulesetGroups) { group in
                RulesetGroupSection(group: group, viewModel: viewModel)
            }

            if viewModel.filteredRulesetGroups.isEmpty {
                Text("找不到符合「\(viewModel.searchText)」的防護清單。")
                    .font(AppFont.rowDetail)
                    .foregroundStyle(AppTheme.text400)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 16)
            }
        }
    }
}

private struct RulesetToolbar: View {
    @ObservedObject var viewModel: SettingsViewModel
    @State private var isConfirmingRecommended = false

    private var atLimit: Bool {
        viewModel.enabledRulesetCount >= AdBlockSettings.maxEnabledRulesets
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    RulesetSearchField(text: $viewModel.searchText)
                    recommendedButton
                }

                VStack(alignment: .leading, spacing: 10) {
                    RulesetSearchField(text: $viewModel.searchText)
                    recommendedButton
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
            }

            countLine
        }
    }

    private var countLine: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            if atLimit {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(Color.orange)
                    .accessibilityHidden(true)
            }

            Text(atLimit
                 ? "已達上限 \(AdBlockSettings.maxEnabledRulesets)／\(AdBlockSettings.maxEnabledRulesets) 份（請先關閉其他清單，再開新的）"
                 : "已開啟 \(viewModel.enabledRulesetCount)／\(AdBlockSettings.maxEnabledRulesets) 份（Safari 最多可同時啟用 \(AdBlockSettings.maxEnabledRulesets) 份清單）")
                .font(AppFont.supporting)
                .foregroundStyle(atLimit ? Color.orange : AppTheme.text400)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 2)
    }

    private var recommendedButton: some View {
        RulesetToolbarButton(
            title: "重設為建議清單",
            systemImage: "arrow.counterclockwise",
            action: { isConfirmingRecommended = true }
        )
        .alert("重設為建議清單？", isPresented: $isConfirmingRecommended) {
            Button("取消", role: .cancel) {}
            Button("重設", role: .destructive) {
                viewModel.enableRecommendedRulesets()
            }
        } message: {
            Text("這會以建議清單取代你目前的勾選，無法復原。")
        }
    }
}

private struct RulesetGroupSection: View {
    let group: RulesetGroup
    @ObservedObject var viewModel: SettingsViewModel
    @State private var isExpanded: Bool

    private static let collapsibleGroups: Set<String> = ["特定語言網站", "其他清單"]

    init(group: RulesetGroup, viewModel: SettingsViewModel) {
        self.group = group
        self.viewModel = viewModel
        _isExpanded = State(initialValue: Self.collapsibleGroups.contains(group.title) == false)
    }

    private var isCollapsible: Bool {
        Self.collapsibleGroups.contains(group.title)
    }

    private var isSearching: Bool {
        viewModel.searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
    }

    private var showsRows: Bool {
        isCollapsible == false || isExpanded || isSearching
    }

    private var enabledCount: Int {
        group.rulesets.filter { viewModel.isRulesetEnabled($0) }.count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header

            if showsRows {
                VStack(spacing: 0) {
                    ForEach(Array(group.rulesets.enumerated()), id: \.element.id) { index, ruleset in
                        RulesetRow(
                            ruleset: ruleset,
                            viewModel: viewModel,
                            showsDivider: index < group.rulesets.count - 1
                        )
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AppTheme.bg000)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(AppTheme.border.opacity(0.16), lineWidth: 0.5)
                }
            }
        }
    }

    @ViewBuilder
    private var header: some View {
        if isCollapsible && isSearching == false {
            Button {
                withAnimation(.easeOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                headerContent(showsChevron: true)
            }
            .buttonStyle(.plain)
        } else {
            headerContent(showsChevron: false)
        }
    }

    private func headerContent(showsChevron: Bool) -> some View {
        HStack(spacing: 10) {
            if showsChevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(AppTheme.text400)
                    .rotationEffect(.degrees(isExpanded ? 90 : 0))
            }

            Text(group.title)
                .font(AppFont.groupTitle)
                .foregroundStyle(AppTheme.text000)

            Spacer(minLength: 8)

            if isCollapsible {
                Text("\(group.rulesets.count) 個 · 已開啟 \(enabledCount)")
                    .font(AppFont.metadata)
                    .foregroundStyle(enabledCount > 0 ? AppTheme.accent : AppTheme.text400)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 2)
                    .background(enabledCount > 0 ? AppTheme.accentSoft : AppTheme.bg200)
                    .clipShape(Capsule())
            }
        }
        .contentShape(Rectangle())
    }
}

private struct RulesetSearchField: View {
    @Binding var text: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(AppTheme.text400)
                .accessibilityHidden(true)

            TextField("搜尋防護清單或語言", text: $text)
                .font(AppFont.control)
                .textFieldStyle(.plain)
        }
        .padding(.horizontal, 12)
        .frame(minWidth: 240, maxWidth: .infinity, minHeight: 40, maxHeight: 40)
        .background(AppTheme.bg200)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(AppTheme.border.opacity(0.08), lineWidth: 0.5)
        }
    }
}

private struct RulesetToolbarButton: View {
    let title: String
    let systemImage: String
    let action: () -> Void
    @State private var isHovering = false

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(AppFont.control)
                .foregroundStyle(AppTheme.text000)
                .lineLimit(1)
                .padding(.horizontal, 12)
                .frame(height: 40)
                .background {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(isHovering ? AppTheme.bg200 : Color.clear)
                }
                .overlay {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(AppTheme.border.opacity(0.16), lineWidth: 0.5)
                }
        }
        .buttonStyle(.plain)
        .onHover { isHovering = $0 }
    }
}

private struct RulesetRow: View {
    let ruleset: RulesetInfo
    @ObservedObject var viewModel: SettingsViewModel
    let showsDivider: Bool

    var body: some View {
        let enabled = viewModel.isRulesetEnabled(ruleset)

        Toggle(isOn: Binding {
            enabled
        } set: { value in
            viewModel.setRuleset(ruleset, enabled: value)
        }) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(ruleset.displayName)
                        .font(AppFont.rulesetTitle)
                        .foregroundStyle(AppTheme.text000)

                    if ruleset.enabled == true {
                        Text("建議")
                            .font(AppFont.metadata)
                            .foregroundStyle(AppTheme.accent)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2)
                            .background(AppTheme.accentSoft)
                            .clipShape(Capsule())
                    }
                }

                Text(disabledReason ?? ruleset.displayDescription)
                    .font(AppFont.metadata)
                    .foregroundStyle(AppTheme.text400)
                    .fixedSize(horizontal: false, vertical: true)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .toggleStyle(.checkbox)
        .disabled(disabledReason != nil)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) {
            if showsDivider {
                Rectangle()
                    .fill(AppTheme.border.opacity(0.12))
                    .frame(height: 0.5)
            }
        }
    }

    private var disabledReason: String? {
        let enabled = viewModel.isRulesetEnabled(ruleset)
        let isAtLimit = viewModel.enabledRulesetCount >= AdBlockSettings.maxEnabledRulesets

        if enabled == false && isAtLimit {
            return "已達上限，請先關閉其他防護清單。"
        }

        return nil
    }
}
