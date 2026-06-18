//
//  AdBlockApp.swift
//  AdBlock
//
//  Created by Ricky on 2026/6/16.
//

import SwiftUI

@main
struct AdBlockApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowResizability(.automatic)
    }
}
