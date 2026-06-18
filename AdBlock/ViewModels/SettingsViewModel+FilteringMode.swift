//
//  SettingsViewModel+FilteringMode.swift
//  AdBlock
//

extension SettingsViewModel {
    func setDefaultFilteringMode(_ mode: FilteringMode) {
        guard settings.defaultFilteringMode != mode else { return }
        var next = settings
        next.defaultFilteringMode = mode
        persist(next)
    }
}
