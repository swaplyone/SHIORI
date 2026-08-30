import Foundation
import Combine
import ActivityKit

public class FocusSessionManager: ObservableObject {
    public static let shared = FocusSessionManager()

    @Published public var isRunning: Bool = false
    @Published public var isPaused: Bool = false
    @Published public var taskTitle: String = "Focus Session"
    @Published public var projectName: String = "SHIORI"
    @Published public var durationSeconds: Int = 25 * 60
    @Published public var startTime: Date = Date()
    @Published public var endTime: Date = Date().addingTimeInterval(25 * 60)
    @Published public var secondsRemaining: Int = 25 * 60
    @Published public var serverBaseUrl: String = "https://shiori.swaplyone.in"
    @Published public var authToken: String = ""

    private var activeActivity: Any? = nil
    private var countdownTimer: AnyCancellable?
    private var elapsedBeforePause: Int = 0

    private init() {
        // Load stored settings if any
        if let storedUrl = UserDefaults.standard.string(forKey: "shiori_server_url"), !storedUrl.isEmpty {
            self.serverBaseUrl = storedUrl
        }
        if let storedToken = UserDefaults.standard.string(forKey: "shiori_auth_token") {
            self.authToken = storedToken
        }
    }

    // MARK: - ActivityKit Live Activity Management
    public func startSession(taskTitle: String, projectName: String, durationMinutes: Int) {
        self.taskTitle = taskTitle
        self.projectName = projectName
        self.durationSeconds = max(1, durationMinutes) * 60
        self.startTime = Date()
        self.endTime = Date().addingTimeInterval(TimeInterval(self.durationSeconds))
        self.secondsRemaining = self.durationSeconds
        self.elapsedBeforePause = 0
        self.isRunning = true
        self.isPaused = false

        // 1. Request Apple ActivityKit Live Activity (Displays on Lock Screen & Dynamic Island)
        if #available(iOS 16.1, *) {
            requestLiveActivity()
        }

        // 2. Start local countdown tick
        startLocalTimer()

        // 3. Sync to SHIORI Cloud Backend
        syncBackendStart(durationMinutes: durationMinutes)
    }

    @available(iOS 16.1, *)
    private func requestLiveActivity() {
        // End any previous activities
        endLiveActivity(dismissalPolicy: .immediate)

        let attributes = ShioriFocusActivityAttributes(sessionId: UUID().uuidString)
        let initialContentState = ShioriFocusActivityAttributes.ContentState(
            sessionName: self.taskTitle,
            projectName: self.projectName,
            startTime: self.startTime,
            endTime: self.endTime,
            durationSeconds: self.durationSeconds,
            state: "RUNNING",
            pausedRemainingSeconds: nil
        )

        do {
            let activity = try Activity<ShioriFocusActivityAttributes>.request(
                attributes: attributes,
                content: .init(state: initialContentState, staleDate: nil),
                pushType: nil
            )
            self.activeActivity = activity
            print("[SHIORI LiveActivity] Successfully started activity ID: \(activity.id)")
        } catch {
            print("[SHIORI LiveActivity] Failed to request Live Activity: \(error.localizedDescription)")
        }
    }

    public func pauseSession() {
        guard isRunning && !isPaused else { return }
        
        let now = Date()
        let currentSegment = max(0, Int(now.timeIntervalSince(startTime)))
        elapsedBeforePause += currentSegment
        secondsRemaining = max(0, durationSeconds - elapsedBeforePause)
        isPaused = true
        
        if #available(iOS 16.1, *) {
            updateLiveActivity(state: "PAUSED", pausedRemainingSeconds: secondsRemaining)
        }
        
        countdownTimer?.cancel()
        syncBackendPause()
    }

    public func resumeSession() {
        guard isRunning && isPaused else { return }
        
        let remaining = max(1, durationSeconds - elapsedBeforePause)
        startTime = Date()
        endTime = Date().addingTimeInterval(TimeInterval(remaining))
        secondsRemaining = remaining
        isPaused = false
        
        if #available(iOS 16.1, *) {
            updateLiveActivity(state: "RUNNING", pausedRemainingSeconds: nil)
        }
        
        startLocalTimer()
        syncBackendResume()
    }

    public func stopSession() {
        isRunning = false
        isPaused = false
        countdownTimer?.cancel()
        secondsRemaining = durationSeconds
        
        if #available(iOS 16.1, *) {
            endLiveActivity(dismissalPolicy: .immediate)
        }
        
        syncBackendStop()
    }

    public func completeSession() {
        isRunning = false
        isPaused = false
        countdownTimer?.cancel()
        secondsRemaining = 0
        
        if #available(iOS 16.1, *) {
            updateLiveActivity(state: "COMPLETED", pausedRemainingSeconds: 0)
            endLiveActivity(dismissalPolicy: .after(Date().addingTimeInterval(4)))
        }
        
        syncBackendComplete()
    }

    @available(iOS 16.1, *)
    private func updateLiveActivity(state: String, pausedRemainingSeconds: Int?) {
        guard let activity = activeActivity as? Activity<ShioriFocusActivityAttributes> else { return }
        
        let updatedState = ShioriFocusActivityAttributes.ContentState(
            sessionName: self.taskTitle,
            projectName: self.projectName,
            startTime: self.startTime,
            endTime: self.endTime,
            durationSeconds: self.durationSeconds,
            state: state,
            pausedRemainingSeconds: pausedRemainingSeconds
        )
        
        Task {
            await activity.update(ActivityContent(state: updatedState, staleDate: nil))
        }
    }

    @available(iOS 16.1, *)
    private func endLiveActivity(dismissalPolicy: ActivityUIDismissalPolicy) {
        guard let activity = activeActivity as? Activity<ShioriFocusActivityAttributes> else { return }
        
        Task {
            await activity.end(nil, dismissalPolicy: dismissalPolicy)
            self.activeActivity = nil
        }
    }

    private func startLocalTimer() {
        countdownTimer?.cancel()
        countdownTimer = Timer.publish(every: 0.5, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self = self, self.isRunning, !self.isPaused else { return }
                let currentSegment = max(0, Int(Date().timeIntervalSince(self.startTime)))
                let totalElapsed = self.elapsedBeforePause + currentSegment
                let remaining = max(0, self.durationSeconds - totalElapsed)
                
                self.secondsRemaining = remaining
                if remaining == 0 {
                    self.completeSession()
                }
            }
    }

    // MARK: - Backend REST API Synchronization
    private func syncBackendStart(durationMinutes: Int) {
        guard let url = URL(string: "\(serverBaseUrl)/api/focus/session/start") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !authToken.isEmpty {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        let body: [String: Any] = [
            "taskTitle": taskTitle,
            "projectName": projectName,
            "durationMinutes": durationMinutes
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: request).resume()
    }

    private func syncBackendPause() {
        guard let url = URL(string: "\(serverBaseUrl)/api/focus/session/pause") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        if !authToken.isEmpty {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        URLSession.shared.dataTask(with: request).resume()
    }

    private func syncBackendResume() {
        guard let url = URL(string: "\(serverBaseUrl)/api/focus/session/resume") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        if !authToken.isEmpty {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        URLSession.shared.dataTask(with: request).resume()
    }

    private func syncBackendStop() {
        guard let url = URL(string: "\(serverBaseUrl)/api/focus/session/stop") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        if !authToken.isEmpty {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        URLSession.shared.dataTask(with: request).resume()
    }

    private func syncBackendComplete() {
        guard let url = URL(string: "\(serverBaseUrl)/api/focus/session/complete") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        if !authToken.isEmpty {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        URLSession.shared.dataTask(with: request).resume()
    }
}
