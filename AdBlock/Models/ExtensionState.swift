//
//  ExtensionState.swift
//  AdBlock
//

import SwiftUI

enum ExtensionState {
    case enabled
    case disabled
    case unavailable
    case unknown
}

extension ExtensionState {
    var statusColor: Color {
        switch self {
        case .enabled:
            return .green
        case .disabled:
            return .orange
        case .unavailable:
            return .red
        case .unknown:
            return AppTheme.text400
        }
    }
}
