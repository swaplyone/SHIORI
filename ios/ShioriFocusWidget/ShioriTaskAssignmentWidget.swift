import SwiftUI
import WidgetKit
import ActivityKit
import AppIntents

@available(iOS 16.1, *)
public struct ShioriTaskAssignmentWidget: Widget {
    public var body: some WidgetConfiguration {
        ActivityConfiguration(for: ShioriTaskAssignmentAttributes.self) { context in
            TaskAssignmentLockScreenView(context: context)
                .activityBackgroundTint(Color(red: 0.96, green: 0.95, blue: 0.93))
                .activitySystemActionForegroundColor(Color.black)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 4) {
                        Image(systemName: "doc.text")
                            .font(.caption2.bold())
                        Text("SHIORI")
                            .font(.system(size: 11, weight: .black, design: .monospaced))
                    }
                    .padding(.leading, 8)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.assignmentStatus == "ACCEPTED" ? "ACCEPTED" : context.state.assignmentStatus == "REJECTED" ? "REJECTED" : "ASSIGNED")
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
                        Text("\(context.state.taskCode): \(context.state.taskTitle)")
                            .font(.system(size: 13, weight: .bold))
                            .lineLimit(1)
                        Text("Assigned by \(context.state.assignerName)")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.gray)
                    }
                    .padding(.horizontal, 8)
                    .padding(.bottom, 6)
                }
            } compactLeading: {
                Image(systemName: "doc.text.fill")
                    .foregroundColor(.white)
            } compactTrailing: {
                Text(context.state.taskCode)
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(.white)
            } minimal: {
                Image(systemName: "doc.text.fill")
                    .foregroundColor(.white)
            }
        }
    }
}

// Lock Screen Interactive View
@available(iOS 16.1, *)
struct TaskAssignmentLockScreenView: View {
    let context: ActivityViewContext<ShioriTaskAssignmentAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack {
                HStack(spacing: 5) {
                    Rectangle()
                        .fill(Color.black)
                        .frame(width: 8, height: 8)
                    Text("SHIORI")
                        .font(.system(size: 11, weight: .black, design: .monospaced))
                        .tracking(1.5)
                }

                Spacer()

                Text(context.state.assignmentStatus == "ACCEPTED" ? "✓ ACCEPTED" : context.state.assignmentStatus == "REJECTED" ? "× REJECTED" : "TASK ASSIGNED")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(context.state.assignmentStatus == "REJECTED" ? Color.red.opacity(0.15) : Color.black)
                    .foregroundColor(context.state.assignmentStatus == "REJECTED" ? Color.red : Color.white)
                    .cornerRadius(2)
            }

            // Task Details
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(context.state.taskCode)
                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                        .padding(.horizontal, 4)
                        .padding(.vertical, 1)
                        .background(Color.black.opacity(0.08))
                        .cornerRadius(2)

                    Text(context.state.projectName)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(.gray)
                }

                Text(context.state.taskTitle)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.black)
                    .lineLimit(2)

                Text("Assigned to you by \(context.state.assignerName)")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.gray)
            }

            // Interactive Lock Screen Buttons (When in ASSIGNED state)
            if context.state.assignmentStatus == "ASSIGNED" {
                HStack(spacing: 10) {
                    if #available(iOS 17.0, *) {
                        Button(intent: AcceptTaskIntent(taskId: context.attributes.taskId)) {
                            HStack(spacing: 4) {
                                Image(systemName: "checkmark")
                                Text("ACCEPT")
                            }
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(Color.black)
                            .foregroundColor(.white)
                            .cornerRadius(4)
                        }

                        Button(intent: RejectTaskIntent(taskId: context.attributes.taskId)) {
                            HStack(spacing: 4) {
                                Image(systemName: "xmark")
                                Text("REJECT")
                            }
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(Color.white)
                            .foregroundColor(.black)
                            .cornerRadius(4)
                            .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.black, lineWidth: 1))
                        }
                    } else {
                        // Fallback for iOS 16
                        Text("Open SHIORI to accept or reject")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.gray)
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding(14)
        .background(Color(red: 0.97, green: 0.96, blue: 0.94))
    }
}

// App Intents for Interactive Lock Screen Buttons
@available(iOS 16.0, *)
public struct AcceptTaskIntent: AppIntent {
    public static var title: LocalizedStringResource = "Accept Task Assignment"
    
    @Parameter(title: "Task ID")
    public var taskId: String
    
    public init() {}
    public init(taskId: String) {
        self.taskId = taskId
    }
    
    public func perform() async throws -> some IntentResult {
        // Send secure REST request to backend /api/tasks/:id/accept
        guard let url = URL(string: "https://shiori.swaplyone.in/api/tasks/\(taskId)/accept") else {
            return .result()
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        if let token = UserDefaults.standard.string(forKey: "shiori_auth_token") {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        _ = try? await URLSession.shared.data(for: request)
        return .result()
    }
}

@available(iOS 16.0, *)
public struct RejectTaskIntent: AppIntent {
    public static var title: LocalizedStringResource = "Reject Task Assignment"
    
    @Parameter(title: "Task ID")
    public var taskId: String
    
    public init() {}
    public init(taskId: String) {
        self.taskId = taskId
    }
    
    public func perform() async throws -> some IntentResult {
        // Send secure REST request to backend /api/tasks/:id/reject
        guard let url = URL(string: "https://shiori.swaplyone.in/api/tasks/\(taskId)/reject") else {
            return .result()
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        if let token = UserDefaults.standard.string(forKey: "shiori_auth_token") {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        _ = try? await URLSession.shared.data(for: request)
        return .result()
    }
}
