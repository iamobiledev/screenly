import AVFoundation
import SwiftUI

struct SettingsView: View {
    @ObservedObject var appModel: AppModel

    var body: some View {
        Form {
            Section("Workspace") {
                TextField(
                    "Server URL",
                    text: $appModel.settings.serverURL,
                    prompt: Text("https://video.example.com")
                )
                SecureField(
                    "Recorder API token",
                    text: $appModel.settings.apiToken
                )
                TextField(
                    "Your display name",
                    text: $appModel.settings.recorderName
                )
                Text("The API token is stored in the macOS Keychain.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Recording defaults") {
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
            }

            Section("Keyboard shortcut") {
                Picker("Start recording", selection: $appModel.settings.hotkey) {
                    ForEach(HotkeyChoice.allCases) { choice in
                        Text(choice.label).tag(choice)
                    }
                }
                .pickerStyle(.segmented)
            }

            Section("Permissions") {
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
                    Button("Open Privacy Settings") {
                        appModel.permissions.openScreenSettings()
                    }
                }
            }
        }
        .formStyle(.grouped)
        .padding(12)
        .frame(width: 560, height: 620)
        .onAppear {
            appModel.permissions.refresh()
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
