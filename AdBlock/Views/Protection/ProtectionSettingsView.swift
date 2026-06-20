//
//  ProtectionSettingsView.swift
//  AdBlock
//

import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct ProtectionSettingsView: View {
    @ObservedObject var viewModel: SettingsViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
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
    @State private var isExpanded: Bool

    init(viewModel: SettingsViewModel) {
        self.viewModel = viewModel
        _isExpanded = State(initialValue: viewModel.siteExceptionCount > 0)
    }

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
                            .foregroundStyle(AppTheme.brand)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 2)
                            .background(AppTheme.brandSoft)
                            .clipShape(Capsule())
                    }

                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .center, spacing: 10) {
                        Text("為特定網站指定不同於預設的防護等級，每個網站只會套用一種模式。")
                            .font(AppFont.supporting)
                            .foregroundStyle(AppTheme.text400)
                            .fixedSize(horizontal: false, vertical: true)

                        Spacer(minLength: 12)

                        Menu {
                            Button {
                                viewModel.sortSiteExceptionsByDomain()
                            } label: {
                                Label("依網站排序", systemImage: "textformat")
                            }

                            Button {
                                viewModel.sortSiteExceptionsByMode()
                            } label: {
                                Label("依模式排序", systemImage: "shield")
                            }
                        } label: {
                            Label("排序", systemImage: "arrow.up.arrow.down")
                        }
                        .font(AppFont.control)
                        .disabled(viewModel.siteExceptions.count < 2)

                        Button {
                            viewModel.addSiteException()
                        } label: {
                            Label("新增例外", systemImage: "plus")
                        }
                        .font(AppFont.control)
                        .buttonStyle(.borderedProminent)
                    }

                    SiteExceptionListCard(viewModel: viewModel)
                }
            }
        }
    }
}

private struct SiteExceptionListCard: View {
    @ObservedObject var viewModel: SettingsViewModel
    @State private var draggedSiteExceptionID: UUID?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if viewModel.siteExceptions.isEmpty {
                Text("尚未設定例外網站。")
                    .font(AppFont.rowDetail)
                    .foregroundStyle(AppTheme.text400)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
            } else {
                ForEach(viewModel.siteExceptions) { exception in
                    SiteExceptionRow(
                        exception: exception,
                        draggedSiteExceptionID: $draggedSiteExceptionID,
                        viewModel: viewModel
                    )
                    .opacity(draggedSiteExceptionID == exception.id ? 0.45 : 1)
                    .onDrop(
                        of: [.plainText],
                        delegate: SiteExceptionDropDelegate(
                            destinationID: exception.id,
                            draggedSiteExceptionID: $draggedSiteExceptionID,
                            viewModel: viewModel
                        )
                    )

                    if viewModel.siteExceptions.last?.id != exception.id {
                        SettingsRowDivider()
                            .padding(.horizontal, 14)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.bg000)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(AppTheme.border.opacity(0.16), lineWidth: 0.5)
        }
    }
}

private struct SiteExceptionRow: View {
    let exception: SiteException
    @Binding var draggedSiteExceptionID: UUID?
    @ObservedObject var viewModel: SettingsViewModel
    @State private var isHoveringDragHandle = false

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "line.3.horizontal")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(AppTheme.text400)
                .frame(width: 28, height: 28)
                .background(isHoveringDragHandle ? AppTheme.bg200 : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .onHover { isHoveringDragHandle = $0 }
                .help("拖曳排序")

            // Only fetch a favicon for fully-trusted (mode = 關閉) sites: protection
            // is off there, so the user already browses them unfiltered and the
            // settings request leaks nothing new. Other modes keep the globe.
            SiteFaviconView(
                host: exception.normalizedDomain,
                fetchEnabled: exception.mode == .none
            )

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

            SiteExceptionIconButton(
                systemImage: "safari",
                help: siteURL == nil ? "輸入網站後可在 Safari 開啟" : "在 Safari 開啟",
                isDisabled: siteURL == nil
            ) {
                openSiteInSafari()
            }

            SiteExceptionIconButton(systemImage: "trash", help: "移除這個例外") {
                viewModel.removeSiteException(exception.id)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .onDrag {
            draggedSiteExceptionID = exception.id
            return NSItemProvider(object: exception.id.uuidString as NSString)
        } preview: {
            SiteExceptionDragPreview(exception: exception)
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

    private var siteURL: URL? {
        let value = exception.domain.trimmingCharacters(in: .whitespacesAndNewlines)
        guard value.isEmpty == false else { return nil }

        if let url = URL(string: value),
           let scheme = url.scheme?.lowercased(),
           ["http", "https"].contains(scheme),
           url.host?.isEmpty == false {
            return url
        }

        let host = value.lowercased()
        guard host.contains("."),
              host.contains(" ") == false,
              host.contains("/") == false else {
            return nil
        }

        return URL(string: "https://\(host)")
    }

    private func openSiteInSafari() {
        guard let siteURL else { return }

        guard let safariURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Safari") else {
            NSWorkspace.shared.open(siteURL)
            return
        }

        let configuration = NSWorkspace.OpenConfiguration()
        NSWorkspace.shared.open([siteURL], withApplicationAt: safariURL, configuration: configuration) { _, error in
            if error != nil {
                NSWorkspace.shared.open(siteURL)
            }
        }
    }
}

private struct SiteExceptionIconButton: View {
    let systemImage: String
    let help: String
    var isDisabled = false
    let action: () -> Void
    @State private var isHovering = false

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(
                    isDisabled ? AppTheme.border.opacity(0.22) : AppTheme.text400
                )
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .background(isHovering && isDisabled == false ? AppTheme.bg200 : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .onHover { isHovering = $0 }
        .help(help)
    }
}

private struct SiteExceptionDragPreview: View {
    let exception: SiteException

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "line.3.horizontal")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(AppTheme.text400)
                .frame(width: 18)

            Image(systemName: "globe")
                .font(.system(size: 14))
                .foregroundStyle(AppTheme.text400)
                .frame(width: 16)

            Text(displayDomain)
                .font(AppFont.editor)
                .foregroundStyle(AppTheme.text000)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)

            Text(exception.mode.title)
                .font(AppFont.metadata)
                .foregroundStyle(AppTheme.text200)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(AppTheme.bg200)
                .clipShape(Capsule())
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(width: 420, alignment: .leading)
        .background(AppTheme.bg000)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(AppTheme.border.opacity(0.16), lineWidth: 0.5)
        }
    }

    private var displayDomain: String {
        let normalized = exception.normalizedDomain
        return normalized.isEmpty ? "example.com" : normalized
    }
}

private struct SiteExceptionDropDelegate: DropDelegate {
    let destinationID: UUID
    @Binding var draggedSiteExceptionID: UUID?
    let viewModel: SettingsViewModel

    func dropEntered(info: DropInfo) {
        guard let sourceID = draggedSiteExceptionID,
              sourceID != destinationID else {
            return
        }

        withAnimation(.easeOut(duration: 0.16)) {
            viewModel.moveSiteException(sourceID, to: destinationID)
        }
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }

    func performDrop(info: DropInfo) -> Bool {
        draggedSiteExceptionID = nil
        return true
    }
}

/// Shows a site favicon for fully-trusted (mode = 關閉) sites, falling back to a
/// globe while loading, on failure, or when fetching is disabled. Fetches the
/// favicon directly from the site (no third-party service); URLCache handles
/// caching across redraws.
private struct SiteFaviconView: View {
    let host: String
    let fetchEnabled: Bool

    private var faviconURL: URL? {
        guard fetchEnabled else { return nil }
        let trimmed = host.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard trimmed.isEmpty == false,
              trimmed.contains("."),
              trimmed.contains(" ") == false,
              trimmed.contains("/") == false else {
            return nil
        }
        return URL(string: "https://\(trimmed)/favicon.ico")
    }

    var body: some View {
        Group {
            if let faviconURL {
                AsyncImage(url: faviconURL) { phase in
                    if case .success(let image) = phase {
                        image
                            .resizable()
                            .interpolation(.high)
                            .scaledToFit()
                            .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
                    } else {
                        globe
                    }
                }
            } else {
                globe
            }
        }
        .frame(width: 16, height: 16)
        .accessibilityHidden(true)
    }

    private var globe: some View {
        Image(systemName: "globe")
            .font(.system(size: 14))
            .foregroundStyle(AppTheme.text400)
    }
}
