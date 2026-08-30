import Foundation
import ActivityKit

public struct ShioriTaskAssignmentAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var taskCode: String
        public var taskTitle: String
        public var projectName: String
        public var assignerName: String
        public var assignmentStatus: String // "ASSIGNED", "ACCEPTED", "REJECTED"
        public var updatedAt: Date
        
        public init(
            taskCode: String,
            taskTitle: String,
            projectName: String,
            assignerName: String,
            assignmentStatus: String = "ASSIGNED",
            updatedAt: Date = Date()
        ) {
            self.taskCode = taskCode
            self.taskTitle = taskTitle
            self.projectName = projectName
            self.assignerName = assignerName
            self.assignmentStatus = assignmentStatus
            self.updatedAt = updatedAt
        }
    }

    public var taskId: String

    public init(taskId: String) {
        self.taskId = taskId
    }
}
