//
//  FilteringModeSelector.swift
//  AdBlock
//

import SwiftUI

struct FilteringModeSelector: View {
    let selectedMode: FilteringMode
    let selectMode: (FilteringMode) -> Void

    private let modes = FilteringMode.allCases

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("預設過濾模式")
                .font(AppFont.groupTitle)
                .foregroundStyle(AppTheme.text000)

            Text("選一個等級當作所有網站的預設防護；之後可在下方「個別網站的過濾模式」為特定網站改用不同等級。")
                .font(AppFont.supporting)
                .foregroundStyle(AppTheme.text400)
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: 0) {
                ForEach(Array(modes.enumerated()), id: \.element) { index, mode in
                    FilteringModeOptionRow(
                        mode: mode,
                        isSelected: mode == selectedMode,
                        isRecommended: mode == .complete,
                        showsDivider: index < modes.count - 1,
                        selectMode: selectMode
                    )
                }
            }
            .background(AppTheme.bg000)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(AppTheme.border.opacity(0.16), lineWidth: 0.5)
            }
        }
    }
}

private struct FilteringModeOptionRow: View {
    let mode: FilteringMode
    let isSelected: Bool
    let isRecommended: Bool
    let showsDivider: Bool
    let selectMode: (FilteringMode) -> Void
    @State private var isHovering = false

    var body: some View {
        Button {
            selectMode(mode)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: mode.systemImage)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(isSelected ? AppTheme.text000 : AppTheme.text400)
                    .frame(width: 22)
                    .padding(.top, 1)

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 8) {
                        Text(mode.title)
                            .font(AppFont.rowTitle)
                            .foregroundStyle(AppTheme.text000)

                        if isRecommended {
                            Text("預設")
                                .font(AppFont.metadata)
                                .foregroundStyle(AppTheme.brand)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 2)
                                .background(AppTheme.brandSoft)
                                .clipShape(Capsule())
                        }
                    }

                    Text(mode.summary)
                        .font(AppFont.rowDetail)
                        .foregroundStyle(AppTheme.text200)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(mode.permissionNote)
                        .font(AppFont.metadata)
                        .foregroundStyle(AppTheme.text400)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(isSelected ? AppTheme.accent : AppTheme.border.opacity(0.25))
                    .padding(.top, 1)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(backgroundFill)
            .contentShape(Rectangle())
            .overlay(alignment: .bottom) {
                if showsDivider {
                    Rectangle()
                        .fill(AppTheme.border.opacity(0.12))
                        .frame(height: 0.5)
                        .padding(.horizontal, 14)
                }
            }
        }
        .buttonStyle(.plain)
        .onHover { isHovering = $0 }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(mode.title)，\(mode.summary)")
        .accessibilityHint(mode.permissionNote)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    private var backgroundFill: Color {
        if isSelected {
            return AppTheme.accentSoft
        }
        if isHovering {
            return AppTheme.bg200
        }
        return Color.clear
    }
}
