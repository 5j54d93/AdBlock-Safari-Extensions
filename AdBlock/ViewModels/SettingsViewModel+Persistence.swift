//
//  SettingsViewModel+Persistence.swift
//  AdBlock
//

import Foundation
import SwiftUI

extension SettingsViewModel {
    func binding<Value: Equatable>(
        _ keyPath: WritableKeyPath<AdBlockSettings, Value>
    ) -> Binding<Value> {
        Binding {
            self.settings[keyPath: keyPath]
        } set: { value in
            guard self.settings[keyPath: keyPath] != value else { return }
            var next = self.settings
            next[keyPath: keyPath] = value
            self.persist(next)
        }
    }

    func persist(_ nextSettings: AdBlockSettings) {
        Task { @MainActor [weak self] in
            await Task.yield()
            self?.persistNow(nextSettings)
        }
    }

    /// Re-reads settings from the shared store and adopts them when they are
    /// newer than what we hold in memory. This lets elements hidden via the
    /// Safari point-and-click tool (which writes through the extension's native
    /// handler) appear in the app, without clobbering them on the next save.
    func reloadFromStoreIfNeeded() {
        let latest = store.load(defaultRulesets: rulesets.defaultEnabledIDs)
        guard latest.revision > settings.revision else { return }

        settings = latest
        siteExceptions = Self.exceptions(from: settings)
        customFilterSites = Self.customFilterSites(from: settings)
    }

    @discardableResult
    func persistNow(_ nextSettings: AdBlockSettings) -> Bool {
        var settingsToSave = nextSettings
        settingsToSave.revision = max(
            settings.revision + 1,
            Int64(Date().timeIntervalSince1970 * 1000)
        )

        do {
            try store.save(settingsToSave)
            settings = settingsToSave
            lastSavedAt = Date()
            saveError = nil
            return true
        } catch {
            saveError = error.localizedDescription
            return false
        }
    }
}
