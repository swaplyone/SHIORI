import Foundation
import ActivityKit

public struct ShioriFocusActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var sessionName: String
        public var projectName: String
        public var startTime: Date
        public var endTime: Date
        public var durationSeconds: Int
        public var state: String // "RUNNING", "PAUSED", "COMPLETED"
        public var pausedRemainingSeconds: Int?
        
        public init(
            sessionName: String,
            projectName: String,
            startTime: Date,
            endTime: Date,
            durationSeconds: Int,
            state: String,
            pausedRemainingSeconds: Int? = nil
        ) {
            self.sessionName = sessionName
            self.projectName = projectName
            self.startTime = startTime
            self.endTime = endTime
            self.durationSeconds = durationSeconds
            self.state = state
            self.pausedRemainingSeconds = pausedRemainingSeconds
        }
    }
    
    public var sessionId: String
    
    public init(sessionId: String) {
        self.sessionId = sessionId
    }
}
