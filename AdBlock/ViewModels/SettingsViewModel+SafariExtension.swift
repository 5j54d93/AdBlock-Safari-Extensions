//
//  SettingsViewModel+SafariExtension.swift
//  AdBlock
//

import Foundation
import SafariServices

extension SettingsViewModel {
    func openSafariSettings() {
        guard let identifier = Self.extensionBundleIdentifiers.first else { return }
        SFSafariApplication.showPreferencesForExtension(withIdentifier: identifier) { [weak self] _ in
            Task { @MainActor in
                await self?.refreshExtensionState(after: .milliseconds(500))
            }
        }
    }

    func refreshExtensionState(
        showActivity: Bool = true,
        after delay: Duration? = nil
    ) async {
        if let delay {
            try? await Task.sleep(for: delay)
        }
        await Task.yield()

        guard isExtensionStateRefreshInFlight == false else { return }
        isExtensionStateRefreshInFlight = true

        if showActivity {
            isRefreshingExtensionState = true
        }
        defer {
            lastExtensionStateRefreshAt = Date()
            isExtensionStateRefreshInFlight = false
            if showActivity {
                isRefreshingExtensionState = false
            }
        }

        let nextState = await Self.extensionState()
        if nextState != extensionState {
            extensionState = nextState
        }
    }

    func refreshExtensionStateIfNeeded(
        showActivity: Bool = false,
        minimumInterval: TimeInterval = 1
    ) async {
        if let lastExtensionStateRefreshAt,
           Date().timeIntervalSince(lastExtensionStateRefreshAt) < minimumInterval {
            return
        }

        await refreshExtensionState(showActivity: showActivity)
    }

    private static var extensionBundleIdentifiers: [String] {
        var identifiers: [String] = []

        if let plugInsURL = Bundle.main.builtInPlugInsURL,
           let contents = try? FileManager.default.contentsOfDirectory(
                at: plugInsURL,
                includingPropertiesForKeys: nil
           ) {
            for url in contents where url.pathExtension == "appex" {
                guard
                    let bundle = Bundle(url: url),
                    let identifier = bundle.bundleIdentifier
                else {
                    continue
                }
                identifiers.append(identifier)
            }
        }

        identifiers.append("com.Ricky.AdBlock.Extension")
        return Array(NSOrderedSet(array: identifiers)) as? [String] ?? identifiers
    }

    private static func extensionState() async -> ExtensionState {
        var foundDisabledState = false
        var foundUnavailableState = false

        for identifier in extensionBundleIdentifiers {
            let result = await state(for: identifier)
            switch result {
            case .enabled:
                return .enabled
            case .disabled:
                foundDisabledState = true
            case .unavailable:
                foundUnavailableState = true
            case .unknown:
                break
            }
        }

        if foundDisabledState {
            return .disabled
        }
        if foundUnavailableState || extensionBundleIdentifiers.isEmpty {
            return .unavailable
        }
        return .unknown
    }

    private static func state(for identifier: String) async -> ExtensionState {
        await withCheckedContinuation { continuation in
            SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: identifier) { state, error in
                if error != nil {
                    continuation.resume(returning: .unavailable)
                } else if state?.isEnabled == true {
                    continuation.resume(returning: .enabled)
                } else {
                    continuation.resume(returning: .disabled)
                }
            }
        }
    }
}
