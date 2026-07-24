import AppKit
import AVFoundation
import ScreenCaptureKit
import SwiftUI

struct RecordingSetupView: View {
    @ObservedObject var controller: RecordingController
    @ObservedObject var settings: RecorderSettings
    @ObservedObject var permissions: PermissionManager
    @StateObject private var sources = CaptureSourceModel()

    @State private var mode = CaptureMode.display
    @State private var selectedDisplayID: CGDirectDisplayID?
    @State private var selectedWindowID: CGWindowID?
    private let regionSelector = RegionSelectionController()

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("New recording")
                        .font(.title2.weight(.semibold))
                    Text("Choose what you want to share.")
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Cancel") { closeWindow() }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .keyboardShortcut(.cancelAction)
            }
            .padding(.top, 8)

            Picker("Capture mode", selection: $mode) {
                ForEach(CaptureMode.allCases) { mode in
                    Label(mode.title, systemImage: mode.icon)
                        .tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            sourcePicker
                .frame(minHeight: 170)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .glassCard(cornerRadius: 12)

            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 22) {
                    Toggle("Microphone", isOn: $settings.capturesMicrophone)
                    Toggle("System audio", isOn: $settings.capturesSystemAudio)
                    Toggle("Webcam", isOn: $settings.showsWebcam)
                }
                .toggleStyle(.switch)
                .controlSize(.small)

                if settings.capturesMicrophone || settings.showsWebcam {
                    HStack(spacing: 14) {
                        if settings.capturesMicrophone {
                            devicePicker(
                                title: "Microphone",
                                selection: $settings.microphoneDeviceID,
                                devices: audioDevices
                            )
                        }
                        if settings.showsWebcam {
                            devicePicker(
                                title: "Camera",
                                selection: $settings.cameraDeviceID,
                                devices: cameraDevices
                            )
                        }
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassCard(cornerRadius: 12)

            if let errorMessage = sources.errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
            if settings.capturesMicrophone,
               permissions.microphoneStatus != .authorized {
                HStack {
                    Label(
                        "Microphone permission is required.",
                        systemImage: "mic.slash"
                    )
                    .font(.caption)
                    .foregroundStyle(.red)
                    Spacer()
                    Button(microphonePermissionButtonTitle) {
                        resolveMicrophonePermission()
                    }
                    .glassButton()
                }
            }
            if case let .failed(message) = controller.state,
               message != "Microphone permission is required." {
                Label(message, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            HStack {
                Label(settings.hotkey.label, systemImage: "keyboard")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button {
                    start()
                } label: {
                    Label("Start recording", systemImage: "record.circle.fill")
                }
                .glassProminentButton()
                .controlSize(.large)
                .tint(Color(red: 0.42, green: 0.34, blue: 0.92))
                .disabled(!canStart)
                .keyboardShortcut(.return, modifiers: [])
            }
        }
        .padding(24)
        .frame(width: 620)
        .glassWindowSurface()
        .task {
            if settings.capturesMicrophone,
               permissions.microphoneStatus == .notDetermined {
                await permissions.requestMicrophone()
            }
            await refreshCaptureSources()
        }
        .onChange(of: settings.capturesMicrophone) { _, isEnabled in
            if isEnabled, permissions.microphoneStatus == .notDetermined {
                Task {
                    await permissions.requestMicrophone()
                }
            }
        }
        .onChange(of: permissions.canRecordScreen) { _, isGranted in
            if isGranted {
                Task {
                    await refreshCaptureSources()
                }
            }
        }
        .onChange(of: controller.state) { _, state in
            if case .countdown = state {
                closeWindow()
            }
        }
    }

    @ViewBuilder
    private var sourcePicker: some View {
        if !permissions.canRecordScreen {
            ContentUnavailableView {
                Label(
                    "Screen Recording Required",
                    systemImage: "rectangle.dashed.badge.record"
                )
            } description: {
                Text(
                    "Allow this version of Screenly in System Settings, then quit and reopen Screenly."
                )
            } actions: {
                HStack {
                    Button("Open System Settings") {
                        permissions.openScreenSettings()
                    }
                    Button("Quit Screenly") {
                        NSApp.terminate(nil)
                    }
                }
            }
        } else if sources.isLoading {
            ProgressView("Loading screens and windows…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if mode == .window {
            List(sources.windows, selection: $selectedWindowID) { window in
                VStack(alignment: .leading, spacing: 2) {
                    Text(window.title)
                        .lineLimit(1)
                    Text(
                        "\(window.applicationName) · \(window.width) × \(window.height)"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                .tag(window.id)
            }
            .listStyle(.inset)
            .scrollContentBackground(.hidden)
        } else {
            List(sources.displays, selection: $selectedDisplayID) { display in
                HStack {
                    Image(systemName: "display")
                    VStack(alignment: .leading, spacing: 2) {
                        Text(display.name)
                        Text("\(display.width) × \(display.height)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .tag(display.id)
            }
            .listStyle(.inset)
            .scrollContentBackground(.hidden)
        }
    }

    private func devicePicker(
        title: String,
        selection: Binding<String?>,
        devices: [AVCaptureDevice]
    ) -> some View {
        Picker(title, selection: selection) {
            Text("System default").tag(String?.none)
            ForEach(devices, id: \.uniqueID) { device in
                Text(device.localizedName).tag(String?.some(device.uniqueID))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var canStart: Bool {
        guard permissions.canRecordScreen else {
            return false
        }
        switch mode {
        case .display, .area:
            return selectedDisplayID != nil
        case .window:
            return selectedWindowID != nil
        }
    }

    private func start() {
        let options = settings.recordingOptions

        switch mode {
        case .display:
            guard let selectedDisplayID else { return }
            controller.start(
                target: .display(displayID: selectedDisplayID),
                options: options
            )

        case .window:
            guard let selectedWindowID else { return }
            controller.start(
                target: .window(windowID: selectedWindowID),
                options: options
            )

        case .area:
            guard let selectedDisplayID else { return }
            closeWindow()
            regionSelector.selectRegion(on: selectedDisplayID) { region in
                guard let region else { return }
                controller.start(
                    target: .region(
                        displayID: selectedDisplayID,
                        rect: region
                    ),
                    options: options
                )
            }
        }
    }

    private func closeWindow() {
        NSApp.keyWindow?.close()
    }

    private func refreshCaptureSources() async {
        permissions.refresh()
        guard permissions.canRecordScreen else {
            return
        }
        await sources.refresh()
        selectedDisplayID = selectedDisplayID ?? sources.displays.first?.id
        selectedWindowID = selectedWindowID ?? sources.windows.first?.id
    }

    private var microphonePermissionButtonTitle: String {
        permissions.microphoneStatus == .notDetermined
            ? "Allow Microphone"
            : "Open Microphone Settings"
    }

    private func resolveMicrophonePermission() {
        if permissions.microphoneStatus == .notDetermined {
            Task {
                await permissions.requestMicrophone()
            }
        } else {
            permissions.openMicrophoneSettings()
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

private enum CaptureMode: String, CaseIterable, Identifiable {
    case display
    case window
    case area

    var id: Self { self }

    var title: String {
        switch self {
        case .display: "Full screen"
        case .window: "Window"
        case .area: "Area"
        }
    }

    var icon: String {
        switch self {
        case .display: "display"
        case .window: "macwindow"
        case .area: "viewfinder"
        }
    }
}
