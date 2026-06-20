//
//  FilterListSourcesView.swift
//  AdBlock
//

import SwiftUI

struct FilterListSourcesView: View {
    @ObservedObject var viewModel: SettingsViewModel

    private var listedRulesetCount: Int {
        viewModel.filterListSources.reduce(0) { $0 + $1.rulesets.count }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            SettingsGroup(
                title: "開源封鎖清單",
                footer: "清單內容由開源社群長期維護，AdBlock 會將它們轉換成 Safari 可以使用的封鎖規則。"
            ) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("目前列出 \(listedRulesetCount) 份封鎖清單，來自 \(viewModel.filterListSources.count) 個開源來源。")
                        .font(AppFont.rowTitle)
                        .foregroundStyle(AppTheme.text000)

                    Text("這些清單提供廣告、追蹤器、彈出視窗、干擾內容與特定語言網站的封鎖資料。")
                        .font(AppFont.rowDetail)
                        .foregroundStyle(AppTheme.text400)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            VStack(alignment: .leading, spacing: 12) {
                ForEach(viewModel.filterListSources) { source in
                    FilterListSourceCard(source: source)
                }
            }
        }
    }
}

private struct FilterListSourceCard: View {
    let source: FilterListSource

    private var gridColumns: [GridItem] {
        [
            GridItem(.adaptive(minimum: 180, maximum: 320), spacing: 8, alignment: .leading),
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    if let url = source.url {
                        Link(destination: url) {
                            Label {
                                Text(source.title)
                            } icon: {
                                SourceIcon(source: source)
                            }
                            .labelStyle(.titleAndIcon)
                            .font(AppFont.rowTitle)
                        }
                        .foregroundStyle(AppTheme.accent)
                    } else {
                        Text(source.title)
                            .font(AppFont.rowTitle)
                            .foregroundStyle(AppTheme.text000)
                    }

                    Text(source.displayURL)
                        .font(AppFont.metadata)
                        .foregroundStyle(AppTheme.text400)
                }

                Spacer(minLength: 12)

                Text(source.countText)
                    .font(AppFont.metadata)
                    .foregroundStyle(AppTheme.text400)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 3)
                    .background(AppTheme.bg200)
                    .clipShape(Capsule())
            }

            LazyVGrid(columns: gridColumns, alignment: .leading, spacing: 8) {
                ForEach(source.rulesets) { ruleset in
                    RulesetSourceBadge(
                        ruleset: ruleset,
                        isOptimized: source.isOptimized(ruleset)
                    )
                }
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
}

private struct RulesetSourceBadge: View {
    let ruleset: RulesetInfo
    let isOptimized: Bool

    var body: some View {
        HStack(spacing: 6) {
            Text(ruleset.displayName)
                .lineLimit(1)
                .truncationMode(.tail)
                .layoutPriority(0)

            if isOptimized {
                Text("已優化")
                    .font(AppFont.metadata)
                    .foregroundStyle(AppTheme.brand)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(AppTheme.brandSoft)
                    .clipShape(Capsule())
                    .fixedSize(horizontal: true, vertical: false)
                    .layoutPriority(1)
            }
        }
        .font(AppFont.metadata)
        .foregroundStyle(AppTheme.text200)
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.bg200)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .help(helpText)
    }

    private var helpText: String {
        isOptimized ? "\(ruleset.name) - AdBlock 已少量優化" : ruleset.name
    }
}

private struct SourceIcon: View {
    let source: FilterListSource

    var body: some View {
        Group {
            if source.isGitHubSource {
                Image("GitHub")
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
            } else {
                Image(systemName: "arrow.up.right.square")
                    .resizable()
                    .scaledToFit()
            }
        }
        .frame(width: 15, height: 15)
        .accessibilityHidden(true)
    }
}
