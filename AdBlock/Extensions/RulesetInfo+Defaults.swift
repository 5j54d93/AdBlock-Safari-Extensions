//
//  RulesetInfo+Defaults.swift
//  AdBlock
//

extension Array where Element == RulesetInfo {
    var defaultEnabledIDs: [String] {
        filter { $0.enabled == true }.map(\.id)
    }
}
