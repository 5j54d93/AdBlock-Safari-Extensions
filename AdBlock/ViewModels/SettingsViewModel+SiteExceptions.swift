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

    func moveSiteException(_ sourceID: UUID, to destinationID: UUID) {
        guard sourceID != destinationID,
              let sourceIndex = siteExceptions.firstIndex(where: { $0.id == sourceID }),
              let destinationIndex = siteExceptions.firstIndex(where: { $0.id == destinationID }) else {
            return
        }

        let targetOffset = destinationIndex > sourceIndex ? destinationIndex + 1 : destinationIndex
        let exception = siteExceptions.remove(at: sourceIndex)
        let adjustedTarget = sourceIndex < targetOffset ? targetOffset - 1 : targetOffset
        siteExceptions.insert(exception, at: min(adjustedTarget, siteExceptions.count))
        persistSiteExceptions()
    }

    func sortSiteExceptionsByDomain() {
        siteExceptions.sort { lhs, rhs in
            Self.compareDomains(lhs.normalizedDomain, rhs.normalizedDomain)
        }
        persistSiteExceptions()
    }

    func sortSiteExceptionsByMode() {
        let modeRank = Dictionary(
            uniqueKeysWithValues: FilteringMode.allCases.enumerated().map { index, mode in
                (mode, index)
            }
        )

        siteExceptions.sort { lhs, rhs in
            if lhs.normalizedDomain.isEmpty != rhs.normalizedDomain.isEmpty {
                return rhs.normalizedDomain.isEmpty
            }
            if lhs.mode != rhs.mode {
                return (modeRank[lhs.mode] ?? 0) < (modeRank[rhs.mode] ?? 0)
            }
            return Self.compareDomains(lhs.normalizedDomain, rhs.normalizedDomain)
        }
        persistSiteExceptions()
    }

    static func exceptions(from settings: AdBlockSettings) -> [SiteException] {
        // Normalize on load so legacy entries stored as full URLs/paths surface
        // as the bare hostname the extension actually matches on.
        var result: [SiteException] = []
        result += settings.noFilteringHostnames.map { SiteException(domain: SiteException.normalizedHostname($0), mode: .none) }
        result += settings.basicFilteringHostnames.map { SiteException(domain: SiteException.normalizedHostname($0), mode: .basic) }
        result += settings.optimalFilteringHostnames.map { SiteException(domain: SiteException.normalizedHostname($0), mode: .optimal) }
        result += settings.completeFilteringHostnames.map { SiteException(domain: SiteException.normalizedHostname($0), mode: .complete) }
        return orderedSiteExceptions(result, preferredOrder: settings.siteExceptionOrder)
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
        next.siteExceptionOrder = order

        guard next != settings else { return }
        persist(next)
    }

    private static func compareDomains(_ lhs: String, _ rhs: String) -> Bool {
        if lhs.isEmpty != rhs.isEmpty {
            return rhs.isEmpty
        }
        return lhs.localizedStandardCompare(rhs) == .orderedAscending
    }

    private static func orderedSiteExceptions(
        _ exceptions: [SiteException],
        preferredOrder: [String]
    ) -> [SiteException] {
        var remaining: [String: SiteException] = [:]
        for exception in exceptions where remaining[exception.normalizedDomain] == nil {
            remaining[exception.normalizedDomain] = exception
        }

        var ordered: [SiteException] = []
        for domain in preferredOrder {
            let normalized = SiteException.normalizedHostname(domain)
            guard let exception = remaining.removeValue(forKey: normalized) else { continue }
            ordered.append(exception)
        }

        for exception in exceptions where remaining[exception.normalizedDomain] != nil {
            ordered.append(exception)
            remaining.removeValue(forKey: exception.normalizedDomain)
        }

        return ordered
    }
}
