import SwiftUI

@main
struct ShioriApp: App {
    @StateObject private var focusManager = FocusSessionManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(focusManager)
        }
    }
}
