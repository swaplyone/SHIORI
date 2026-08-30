import SwiftUI
import WidgetKit
import ActivityKit

@available(iOS 16.1, *)
public struct ShioriFocusLiveActivityWidget: Widget {
    public var body: some WidgetConfiguration {
        ActivityConfiguration(for: ShioriFocusActivityAttributes.self) { context in
            // iPhone Lock Screen & StandBy Live Activity View
            LockScreenLiveActivityView(context: context)
                .activityBackgroundTint(Color(red: 0.96, green: 0.95, blue: 0.93)) // SHIORI Paper Warm E-Ink
                .activitySystemActionForegroundColor(Color.black)
        } dynamicIsland: { context in
            // iPhone 14 Pro / 15 / 16 Dynamic Island UI
            DynamicIsland {
                // Expanded Dynamic Island
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 4) {
                        Image(systemName: "timer")
                            .font(.caption2.bold())
                        Text("SHIORI")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                    }
                    .padding(.leading, 8)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.state == "PAUSED" ? "PAUSED" : "FOCUSING")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.black)
                        .foregroundColor(.white)
                        .cornerRadius(3)
                        .padding(.trailing, 8)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(context.state.sessionName)
                            .font(.system(size: 13, weight: .bold))
                            .lineLimit(1)
                        
                        if context.state.state == "PAUSED", let pausedSec = context.state.pausedRemainingSeconds {
                            Text(String(format: "%02d:%02d", pausedSec / 60, pausedSec % 60))
                                .font(.system(size: 24, weight: .bold, design: .monospaced))
                        } else {
                            Text(timerInterval: context.state.startTime...context.state.endTime, countsDown: true)
                                .font(.system(size: 24, weight: .bold, design: .monospaced))
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.bottom, 6)
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .foregroundColor(.white)
            } compactTrailing: {
                if context.state.state == "PAUSED", let pausedSec = context.state.pausedRemainingSeconds {
                    Text(String(format: "%d:%02d", pausedSec / 60, pausedSec % 60))
                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                } else {
                    Text(timerInterval: context.state.startTime...context.state.endTime, countsDown: true)
                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                }
            } minimal: {
                Image(systemName: "timer")
                    .foregroundColor(.white)
            }
        }
    }
}

// Minimal E-Ink Lock Screen Presentation
@available(iOS 16.1, *)
struct LockScreenLiveActivityView: View {
    let context: ActivityViewContext<ShioriFocusActivityAttributes>
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header: Brand & State
            HStack {
                HStack(spacing: 5) {
                    Rectangle()
                        .fill(Color.black)
                        .frame(width: 8, height: 8)
                    Text("SHIORI")
                        .font(.system(size: 12, weight: .black, design: .monospaced))
                        .tracking(1.5)
                }
                
                Spacer()
                
                Text(context.state.state == "PAUSED" ? "PAUSED" : "FOCUS MODE")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(context.state.state == "PAUSED" ? Color.gray.opacity(0.3) : Color.black)
                    .foregroundColor(context.state.state == "PAUSED" ? Color.black : Color.white)
                    .cornerRadius(2)
            }
            
            // Large Native Countdown Timer (Updates second-by-second with zero CPU overhead)
            HStack(alignment: .firstTextBaseline) {
                if context.state.state == "PAUSED", let pausedSec = context.state.pausedRemainingSeconds {
                    Text(String(format: "%02d:%02d", pausedSec / 60, pausedSec % 60))
                        .font(.system(size: 38, weight: .bold, design: .monospaced))
                        .foregroundColor(.black)
                } else {
                    Text(timerInterval: context.state.startTime...context.state.endTime, countsDown: true)
                        .font(.system(size: 38, weight: .bold, design: .monospaced))
                        .foregroundColor(.black)
                }
                
                Spacer()
                
                Text(context.state.projectName)
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundColor(.gray)
            }
            
            // Task Title & Minimal Progress Line
            VStack(alignment: .leading, spacing: 3) {
                Text(context.state.sessionName)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.black)
                    .lineLimit(1)
                
                // Native Progress View
                if context.state.state == "RUNNING" {
                    ProgressView(timerInterval: context.state.startTime...context.state.endTime, countsDown: false)
                        .tint(Color.black)
                }
            }
        }
        .padding(14)
        .background(Color(red: 0.97, green: 0.96, blue: 0.94))
    }
}
