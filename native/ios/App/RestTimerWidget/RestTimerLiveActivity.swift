import ActivityKit
import SwiftUI
import WidgetKit

// Arete's palette (tokens.css): ink ground, white type, muted grey, orange.
private let ink = Color(red: 11 / 255, green: 11 / 255, blue: 11 / 255)
private let muted = Color(red: 138 / 255, green: 133 / 255, blue: 128 / 255)
private let orange = Color(red: 1, green: 86 / 255, blue: 30 / 255)

@main
struct RestTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        RestTimerLiveActivity()
    }
}

/// The rest timer on the lock screen and in the Dynamic Island. The app sets
/// the stale date to the end of the rest, so once it is over the system
/// redraws it as "Rest over" even though the app itself may be asleep.
struct RestTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            LockScreenRest(state: context.state, over: isOver(context))
                .activityBackgroundTint(ink)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let state = context.state, over = isOver(context)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(over ? "Rest over" : "Rest").font(.caption).foregroundStyle(muted)
                        Text(over ? "Next set" : state.title).font(.headline).lineLimit(1)
                    }
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Countdown(state: state, over: over)
                        .font(.system(size: 34, weight: .heavy, design: .rounded))
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    RestBar(state: state, over: over).padding(.horizontal, 4)
                }
            } compactLeading: {
                Image(systemName: over ? "checkmark" : "timer").foregroundStyle(orange)
            } compactTrailing: {
                Countdown(state: state, over: over)
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .frame(maxWidth: 46)
            } minimal: {
                Image(systemName: over ? "checkmark" : "timer").foregroundStyle(orange)
            }
            .keylineTint(orange)
        }
    }

    private func isOver(_ context: ActivityViewContext<RestTimerAttributes>) -> Bool {
        context.isStale || context.state.endsAt <= Date()
    }
}

/// Counts down by itself; nothing has to update it every second.
private struct Countdown: View {
    let state: RestTimerAttributes.ContentState
    let over: Bool

    var body: some View {
        if over || state.endsAt <= state.startedAt {
            Text("0:00").monospacedDigit().foregroundStyle(orange)
        } else {
            Text(timerInterval: state.startedAt...state.endsAt, countsDown: true)
                .monospacedDigit()
                .multilineTextAlignment(.trailing)
                .foregroundStyle(.white)
        }
    }
}

private struct RestBar: View {
    let state: RestTimerAttributes.ContentState
    let over: Bool

    var body: some View {
        if over || state.endsAt <= state.startedAt {
            ProgressView(value: 1).tint(orange)
        } else {
            ProgressView(timerInterval: state.startedAt...state.endsAt, countsDown: false) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .tint(orange)
        }
    }
}

private struct LockScreenRest: View {
    let state: RestTimerAttributes.ContentState
    let over: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(over ? "Rest over" : "Rest")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(muted)
                    Text(over ? "Time for the next set" : state.title)
                        .font(.headline)
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    if !over && !state.detail.isEmpty {
                        Text(state.detail)
                            .font(.subheadline)
                            .foregroundStyle(muted)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                Countdown(state: state, over: over)
                    .font(.system(size: 46, weight: .heavy, design: .rounded))
                    .frame(maxWidth: 150, alignment: .trailing)
            }
            RestBar(state: state, over: over)
        }
        .padding(16)
    }
}
