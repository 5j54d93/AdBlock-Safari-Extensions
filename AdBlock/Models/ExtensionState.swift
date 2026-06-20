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
            return AppTheme.success
        case .disabled:
            return AppTheme.warning
        case .unavailable:
            return AppTheme.danger
        case .unknown:
            return AppTheme.text400
        }
    }
}
