import SwiftUI

struct ContentView: View {
    @EnvironmentObject var focusManager: FocusSessionManager
    @State private var taskTitleInput: String = "SHR-0066: Focus Timer Verification"
    @State private var projectNameInput: String = "SHIORI"
    @State private var selectedMinutes: Int = 25
    @State private var showSettings: Bool = false

    let minutePresets = [5, 10, 15, 25, 45, 60]

    var body: some View {
        NavigationView {
            ZStack {
                Color(red: 0.96, green: 0.95, blue: 0.93)
                    .ignoresSafeArea()

                VStack(spacing: 24) {
                    // Header Bar
                    HStack {
                        HStack(spacing: 6) {
                            Rectangle()
                                .fill(Color.black)
                                .frame(width: 10, height: 10)
                            Text("SHIORI")
                                .font(.system(size: 16, weight: .black, design: .monospaced))
                                .tracking(2)
                        }

                        Spacer()

                        Button(action: { showSettings = true }) {
                            Image(systemName: "gearshape")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(.black)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.top, 8)

                    Spacer()

                    // Main Countdown Display Card
                    VStack(spacing: 12) {
                        Text(focusManager.isPaused ? "FOCUS PAUSED" : focusManager.isRunning ? "FOCUS MODE" : "FOCUS SESSION")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(focusManager.isPaused ? Color.gray.opacity(0.2) : Color.black)
                            .foregroundColor(focusManager.isPaused ? Color.black : Color.white)
                            .cornerRadius(3)

                        // Big Monospaced Timer
                        let mins = focusManager.secondsRemaining / 60
                        let secs = focusManager.secondsRemaining % 60
                        Text(String(format: "%02d:%02d", mins, secs))
                            .font(.system(size: 64, weight: .black, design: .monospaced))
                            .foregroundColor(.black)

                        Text(focusManager.taskTitle)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.black.opacity(0.8))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)

                        // Live Activity Status Indicator
                        if focusManager.isRunning {
                            HStack(spacing: 6) {
                                Circle()
                                    .fill(focusManager.isPaused ? Color.orange : Color.green)
                                    .frame(width: 8, height: 8)
                                Text(focusManager.isPaused ? "Live Activity Paused" : "Live Activity Active on Lock Screen")
                                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                                    .foregroundColor(.gray)
                            }
                            .padding(.top, 4)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 32)
                    .background(Color.white)
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.black, lineWidth: 2)
                    )
                    .shadow(color: Color.black.opacity(0.08), radius: 0, x: 3, y: 3)
                    .padding(.horizontal)

                    // Duration Presets (When not running)
                    if !focusManager.isRunning {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("DURATION PRESET")
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .foregroundColor(.gray)
                                .padding(.horizontal)

                            HStack(spacing: 8) {
                                ForEach(minutePresets, id: \.self) { mins in
                                    Button(action: { selectedMinutes = mins }) {
                                        Text("\(mins)m")
                                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 10)
                                            .background(selectedMinutes == mins ? Color.black : Color.white)
                                            .foregroundColor(selectedMinutes == mins ? Color.white : Color.black)
                                            .cornerRadius(4)
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 4)
                                                    .stroke(Color.black, lineWidth: 1)
                                            )
                                    }
                                }
                            }
                            .padding(.horizontal)
                        }
                    }

                    Spacer()

                    // Primary Action Controls
                    VStack(spacing: 10) {
                        if !focusManager.isRunning {
                            Button(action: {
                                focusManager.startSession(
                                    taskTitle: taskTitleInput,
                                    projectName: projectNameInput,
                                    durationMinutes: selectedMinutes
                                )
                            }) {
                                HStack(spacing: 8) {
                                    Image(systemName: "play.fill")
                                    Text("START FOCUS & LIVE ACTIVITY")
                                }
                                .font(.system(size: 14, weight: .bold, design: .monospaced))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                                .background(Color.black)
                                .foregroundColor(.white)
                                .cornerRadius(6)
                                .shadow(color: Color.black.opacity(0.1), radius: 0, x: 2, y: 2)
                            }
                        } else {
                            HStack(spacing: 12) {
                                if focusManager.isPaused {
                                    Button(action: { focusManager.resumeSession() }) {
                                        HStack(spacing: 6) {
                                            Image(systemName: "play.fill")
                                            Text("RESUME")
                                        }
                                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 14)
                                        .background(Color.black)
                                        .foregroundColor(.white)
                                        .cornerRadius(6)
                                    }
                                } else {
                                    Button(action: { focusManager.pauseSession() }) {
                                        HStack(spacing: 6) {
                                            Image(systemName: "pause.fill")
                                            Text("PAUSE")
                                        }
                                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 14)
                                        .background(Color.white)
                                        .foregroundColor(.black)
                                        .cornerRadius(6)
                                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.black, lineWidth: 1.5))
                                    }
                                }

                                Button(action: { focusManager.stopSession() }) {
                                    HStack(spacing: 6) {
                                        Image(systemName: "stop.fill")
                                        Text("STOP")
                                    }
                                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 14)
                                    .background(Color.white)
                                    .foregroundColor(.red)
                                    .cornerRadius(6)
                                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.red, lineWidth: 1.5))
                                }
                            }
                        }
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 20)
                }
            }
            .navigationBarHidden(true)
            .sheet(isPresented: $showSettings) {
                SettingsSheetView()
            }
        }
    }
}

struct SettingsSheetView: View {
    @EnvironmentObject var focusManager: FocusSessionManager
    @Environment(\.presentationMode) var presentationMode
    @State private var serverUrl: String = ""
    @State private var token: String = ""

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("SHIORI Server Configuration")) {
                    TextField("Server Base URL", text: $serverUrl)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                    SecureField("Auth Token (Optional)", text: $token)
                }

                Section(footer: Text("When started, this native app initiates Apple ActivityKit Live Activities which update on your iPhone Lock Screen and Dynamic Island automatically.")) {
                    EmptyView()
                }
            }
            .navigationTitle("Settings")
            .navigationBarItems(
                leading: Button("Cancel") { presentationMode.wrappedValue.dismiss() },
                trailing: Button("Save") {
                    focusManager.serverBaseUrl = serverUrl
                    focusManager.authToken = token
                    UserDefaults.standard.set(serverUrl, forKey: "shiori_server_url")
                    UserDefaults.standard.set(token, forKey: "shiori_auth_token")
                    presentationMode.wrappedValue.dismiss()
                }
            )
            .onAppear {
                serverUrl = focusManager.serverBaseUrl
                token = focusManager.authToken
            }
        }
    }
}
