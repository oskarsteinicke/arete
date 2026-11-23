import ActivityKit
import Foundation

/// The rest between sets, as a Live Activity on the lock screen and in the
/// Dynamic Island. Compiled into both the app (which starts and ends it) and
/// the widget extension (which draws it), so the two always agree on its shape.
///
/// Everything lives in the content state: the countdown is drawn from
/// `startedAt...endsAt` by the system itself, so it keeps ticking while the
/// app is asleep and needs no updates until the rest changes.
@available(iOS 16.1, *)
struct RestTimerAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var startedAt: Date
        var endsAt: Date
        /// The exercise being rested from, or "Rest" for a one-off timer.
        var title: String
        /// What comes next, such as "Set 3 of 4 next". Can be empty.
        var detail: String
    }
}
