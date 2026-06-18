//
//  RulesetGroup.swift
//  AdBlock
//

import Foundation

struct RulesetGroup: Identifiable {
    var id: String { title }
    let title: String
    let rulesets: [RulesetInfo]
}
