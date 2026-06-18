//
//  CustomFilterSite.swift
//  AdBlock
//

import Foundation

struct CustomFilterSite: Identifiable, Equatable {
    let id = UUID()
    var hostname: String
    var rulesText: String
}
