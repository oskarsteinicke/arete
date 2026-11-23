import Foundation
import Capacitor
import ActivityKit

/// Puts the rest between sets on the lock screen and in the Dynamic Island.
///
/// The web code calls `RestTimer.start({ endsAt, duration, title, detail })`
/// whenever a rest begins and `RestTimer.stop()` when it is skipped or done.
/// Only one rest runs at a time, so a new one replaces whatever is showing.
/// Live Activities need iOS 16.2; before that every call quietly does nothing.
@objc(RestTimerPlugin)
public class RestTimerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RestTimerPlugin"
    public let jsName = "RestTimer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    @objc func start(_ call: CAPPluginCall) {
        guard let endsAtMs = call.getDouble("endsAt"), let duration = call.getDouble("duration"), duration > 0 else {
            call.reject("endsAt and a positive duration are required")
            return
        }
        guard #available(iOS 16.2, *) else {
            call.resolve(["started": false])
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["started": false, "reason": "disabled"])
            return
        }
        let endsAt = Date(timeIntervalSince1970: endsAtMs / 1000)
        let state = RestTimerAttributes.ContentState(
            startedAt: endsAt.addingTimeInterval(-duration),
            endsAt: endsAt,
            title: call.getString("title") ?? "Rest",
            detail: call.getString("detail") ?? ""
        )
        // Stale at the end of the rest: the system then redraws it as over,
        // even if the app is asleep by then.
        let content = ActivityContent(state: state, staleDate: endsAt)
        Task {
            let running = Activity<RestTimerAttributes>.activities
            if let current = running.first {
                await current.update(content)
                for extra in running.dropFirst() { await extra.end(nil, dismissalPolicy: .immediate) }
                call.resolve(["started": true])
                return
            }
            do {
                _ = try Activity.request(attributes: RestTimerAttributes(), content: content, pushType: nil)
                call.resolve(["started": true])
            } catch {
                call.resolve(["started": false, "reason": error.localizedDescription])
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        Task {
            for activity in Activity<RestTimerAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }
}
