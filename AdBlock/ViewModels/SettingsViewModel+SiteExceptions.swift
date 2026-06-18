//
//  SettingsViewModel+SiteExceptions.swift
//  AdBlock
//

import Foundation

extension SettingsViewModel {
    var siteExceptionCount: Int {
        siteExceptions.filter { $0.normalizedDomain.isEmpty == false }.count
    }

    func addSiteException() {
        siteExceptions.append(SiteException(domain: "", mode: .none))
    }

    func updateSiteExceptionDomain(_ id: UUID, _ domain: String) {
        guard let index = siteExceptions.firstIndex(where: { $0.id == id }) else { return }
        guard siteExceptions[index].domain != domain else { return }
        siteExceptions[index].domain = domain
        persistSiteExceptions()
    }

    func updateSiteExceptionMode(_ id: UUID, _ mode: FilteringMode) {
        guard let index = siteExceptions.firstIndex(where: { $0.id == id }) else { return }
        guard siteExceptions[index].mode != mode else { return }
        siteExceptions[index].mode = mode
        persistSiteExceptions()
    }

    func removeSiteException(_ id: UUID) {
        siteExceptions.removeAll { $0.id == id }
        persistSiteExceptions()
    }

    static func exceptions(from settings: AdBlockSettings) -> [SiteException] {
        var result: [SiteException] = []
        result += settings.noFilteringHostnames.map { SiteException(domain: $0, mode: .none) }
        result += settings.basicFilteringHostnames.map { SiteException(domain: $0, mode: .basic) }
        result += settings.optimalFilteringHostnames.map { SiteException(domain: $0, mode: .optimal) }
        result += settings.completeFilteringHostnames.map { SiteException(domain: $0, mode: .complete) }
        return result
    }

    private func persistSiteExceptions() {
        var modeByDomain: [String: FilteringMode] = [:]
        var order: [String] = []
        for exception in siteExceptions {
            let domain = exception.normalizedDomain
            guard domain.isEmpty == false, domain.hasPrefix("#") == false else { continue }
            if modeByDomain[domain] == nil {
                order.append(domain)
            }
            modeByDomain[domain] = exception.mode
        }

        var buckets: [FilteringMode: [String]] = [:]
        for domain in order {
            guard let mode = modeByDomain[domain] else { continue }
            buckets[mode, default: []].append(domain)
        }

        var next = settings
        next.noFilteringHostnames = buckets[.none] ?? []
        next.basicFilteringHostnames = buckets[.basic] ?? []
        next.optimalFilteringHostnames = buckets[.optimal] ?? []
        next.completeFilteringHostnames = buckets[.complete] ?? []

        guard next != settings else { return }
        persist(next)
    }
}
