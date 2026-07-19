import AppKit
import AVFoundation
import ScreenCaptureKit
import SwiftUI

struct RecordingSetupView: View {
    @ObservedObject var controller: RecordingController
    @ObservedObject var settings: RecorderSettings
    @StateObject private var sources = CaptureSourceModel()

    @State private var mode = CaptureMode.display
    @State private var selectedDisplayID: CGDirectDisplayID?
    @State private var selectedWindowID: CGWindowID?
    private let regionSelector = RegionSelectionController()

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
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
            }

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

            Divider()

            HStack(spacing: 22) {
                Toggle("Microphone", isOn: $settings.capturesMicrophone)
                Toggle("System audio", isOn: $settings.capturesSystemAudio)
                Toggle("Webcam", isOn: $settings.showsWebcam)
            }
            .toggleStyle(.switch)

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

            if let errorMessage = sources.errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            HStack {
                Label(settings.hotkey.label, systemImage: "keyboard")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Start recording") {
                    start()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(!canStart)
                .keyboardShortcut(.return, modifiers: [])
            }
        }
        .padding(24)
        .frame(width: 620)
        .task {
            await sources.refresh()
            selectedDisplayID = selectedDisplayID ?? sources.displays.first?.id
            selectedWindowID = selectedWindowID ?? sources.windows.first?.id
        }
    }

    @ViewBuilder
    private var sourcePicker: some View {
        if sources.isLoading {
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
        switch mode {
        case .display, .area:
            selectedDisplayID != nil
        case .window:
            selectedWindowID != nil
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
            closeWindow()

        case .window:
            guard let selectedWindowID else { return }
            controller.start(
                target: .window(windowID: selectedWindowID),
                options: options
            )
            closeWindow()

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
