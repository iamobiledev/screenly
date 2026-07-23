import AppKit
import AVFoundation
import Combine
import CoreGraphics

@MainActor
final class PermissionManager: ObservableObject {
    @Published private(set) var canRecordScreen = CGPreflightScreenCaptureAccess()
    @Published private(set) var cameraStatus = AVCaptureDevice.authorizationStatus(for: .video)
    @Published private(set) var microphoneStatus = AVCaptureDevice.authorizationStatus(for: .audio)
    private var cancellables = Set<AnyCancellable>()

    init() {
        NotificationCenter.default.publisher(
            for: NSApplication.didBecomeActiveNotification
        )
        .sink { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.refresh()
            }
        }
        .store(in: &cancellables)
    }

    var hasRequiredPermissions: Bool {
        canRecordScreen && microphoneStatus == .authorized
    }

    func refresh() {
        canRecordScreen = CGPreflightScreenCaptureAccess()
        cameraStatus = AVCaptureDevice.authorizationStatus(for: .video)
        microphoneStatus = AVCaptureDevice.authorizationStatus(for: .audio)
    }

    func requestScreen() {
        // The system prompt is asynchronous. Its immediate return value is not
        // a final authorization result, so refresh when Screenly is activated.
        _ = CGRequestScreenCaptureAccess()
    }

    func requestCamera() async {
        _ = await AVCaptureDevice.requestAccess(for: .video)
        refresh()
    }

    func requestMicrophone() async {
        _ = await AVCaptureDevice.requestAccess(for: .audio)
        refresh()
    }

    func openScreenSettings() {
        openSettings("Privacy_ScreenCapture")
    }

    func openCameraSettings() {
        openSettings("Privacy_Camera")
    }

    func openMicrophoneSettings() {
        openSettings("Privacy_Microphone")
    }

    private func openSettings(_ anchor: String) {
        guard let url = URL(
            string: "x-apple.systempreferences:com.apple.preference.security?\(anchor)"
        ) else {
            return
        }
        NSWorkspace.shared.open(url)
    }
}
