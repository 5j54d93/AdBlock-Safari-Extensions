//
//  SafariExtensionViewController.swift
//  AdBlock Extension
//
//  Created by Ricky on 2026/6/16.
//

import SafariServices

class SafariExtensionViewController: SFSafariExtensionViewController {
    
    static let shared: SafariExtensionViewController = {
        let shared = SafariExtensionViewController()
        shared.preferredContentSize = NSSize(width:320, height:240)
        return shared
    }()

}
