import AVFoundation
import SwiftUI

struct SettingsView: View {
    @ObservedObject var appModel: AppModel
    @State private var manualServerURL = ""
    @State private var manualAPIToken = ""

    var body: some View {
        Form {
            Section {
                AuthenticationView(appModel: appModel)
                TextField(
                    "Your display name",
                    text: $appModel.settings.recorderName
                )
            } header: {
                Label("Account & workspace", systemImage: "person.crop.circle")
            }

            Section {
                Toggle(
                    "Capture system audio",
                    isOn: $appModel.settings.capturesSystemAudio
                )
                Toggle(
                    "Capture microphone",
                    isOn: $appModel.settings.capturesMicrophone
                )
                Toggle(
                    "Show webcam bubble",
                    isOn: $appModel.settings.showsWebcam
                )

                if appModel.settings.capturesMicrophone {
                    Picker(
                        "Microphone",
                        selection: $appModel.settings.microphoneDeviceID
                    ) {
                        Text("System default").tag(String?.none)
                        ForEach(audioDevices, id: \.uniqueID) { device in
                            Text(device.localizedName)
                                .tag(String?.some(device.uniqueID))
                        }
                    }
                }

                if appModel.settings.showsWebcam {
                    Picker(
                        "Camera",
                        selection: $appModel.settings.cameraDeviceID
                    ) {
                        Text("System default").tag(String?.none)
                        ForEach(cameraDevices, id: \.uniqueID) { device in
                            Text(device.localizedName)
                                .tag(String?.some(device.uniqueID))
                        }
                    }
                }
            } header: {
                Label("Recording defaults", systemImage: "record.circle")
            }

            Section {
                Picker("Start recording", selection: $appModel.settings.hotkey) {
                    ForEach(HotkeyChoice.allCases) { choice in
                        Text(choice.label).tag(choice)
                    }
                }
                .pickerStyle(.segmented)
            } header: {
                Label("Keyboard shortcut", systemImage: "keyboard")
            }

            Section {
                permissionLabel(
                    "Screen Recording",
                    granted: appModel.permissions.canRecordScreen
                )
                permissionLabel(
                    "Microphone",
                    granted: appModel.permissions.microphoneStatus == .authorized
                )
                permissionLabel(
                    "Camera",
                    granted: appModel.permissions.cameraStatus == .authorized
                )
                HStack {
                    Button("Refresh") {
                        appModel.permissions.refresh()
                    }
                    .glassButton()
                    Button("Open Privacy Settings") {
                        appModel.permissions.openScreenSettings()
                    }
                    .glassButton()
                }
                if appModel.permissions.microphoneStatus != .authorized {
                    Button(
                        appModel.permissions.microphoneStatus == .notDetermined
                            ? "Allow Microphone"
                            : "Open Microphone Settings"
                    ) {
                        if appModel.permissions.microphoneStatus == .notDetermined {
                            Task {
                                await appModel.permissions.requestMicrophone()
                            }
                        } else {
                            appModel.permissions.openMicrophoneSettings()
                        }
                    }
                    .glassButton()
                }
                if appModel.permissions.cameraStatus != .authorized {
                    Button(
                        appModel.permissions.cameraStatus == .notDetermined
                            ? "Allow Camera"
                            : "Open Camera Settings"
                    ) {
                        if appModel.permissions.cameraStatus == .notDetermined {
                            Task {
                                await appModel.permissions.requestCamera()
                            }
                        } else {
                            appModel.permissions.openCameraSettings()
                        }
                    }
                    .glassButton()
                }
            } header: {
                Label("Permissions", systemImage: "lock.shield")
            }

            Section {
                DisclosureGroup("Manual server configuration") {
                    VStack(alignment: .leading, spacing: 10) {
                        TextField(
                            "Server URL",
                            text: $manualServerURL,
                            prompt: Text("https://video.example.com")
                        )
                        SecureField(
                            "Recorder token",
                            text: $manualAPIToken
                        )
                        Text(
                            "For local or self-hosted servers. Applying this configuration signs out the current Screenly account."
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        HStack {
                            Spacer()
                            Button("Use manual configuration") {
                                appModel.useManualConfiguration(
                                    serverURL: manualServerURL,
                                    apiToken: manualAPIToken
                                )
                            }
                            .glassButton()
                            .disabled(
                                manualServerURL.isEmpty ||
                                    manualAPIToken.isEmpty ||
                                    !appModel.canChangeAuthentication
                            )
                        }
                    }
                    .padding(.top, 6)
                }
            } header: {
                Label("Advanced", systemImage: "wrench.and.screwdriver")
            }
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
        .glassWindowSurface()
        .frame(width: 560, height: 620)
        .onAppear {
            appModel.permissions.refresh()
            manualServerURL = appModel.settings.serverURL
            if !appModel.settings.hasStoredSession {
                manualAPIToken = appModel.settings.apiToken
            }
        }
    }

    private func permissionLabel(_ title: String, granted: Bool) -> some View {
        LabeledContent(title) {
            Label(
                granted ? "Allowed" : "Not allowed",
                systemImage: granted
                    ? "checkmark.circle.fill"
                    : "exclamationmark.circle"
            )
            .foregroundStyle(granted ? .green : .orange)
        }
    }

    private var audioDevices: [AVCaptureDevice] {
        AVCaptureDevice.DiscoverySession(
            deviceTypes: [.microphone, .external],
            mediaType: .audio,
            position: .unspecified
        ).devices
    }

    private var cameraDevices: [AVCaptureDevice] {
        AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .external],
            mediaType: .video,
            position: .unspecified
        ).devices
    }
}
