//
//  SiteException.swift
//  AdBlock
//

import Foundation

struct SiteException: Identifiable, Equatable {
    let id = UUID()
    var domain: String
    var mode: FilteringMode

    var normalizedDomain: String {
        domain.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}
