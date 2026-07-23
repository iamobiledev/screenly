import AppKit
import AVFoundation
import Combine
import CoreGraphics
import OSLog

@MainActor
final class PermissionManager: ObservableObject {
    @Published private(set) var canRecordScreen = CGPreflightScreenCaptureAccess()
    @Published private(set) var cameraStatus = AVCaptureDevice.authorizationStatus(for: .video)
    @Published private(set) var microphoneStatus = AVCaptureDevice.authorizationStatus(for: .audio)
    private let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.screenly.recorder.v2",
        category: "Permissions"
    )

    var hasRequiredPermissions: Bool {
        canRecordScreen && microphoneStatus == .authorized
    }

    func refresh() {
        let previousScreenStatus = canRecordScreen
        canRecordScreen = CGPreflightScreenCaptureAccess()
        cameraStatus = AVCaptureDevice.authorizationStatus(for: .video)
        microphoneStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        // #region agent log
        logger.info(
            "Permission refresh screenBefore=\(previousScreenStatus, privacy: .public) screenAfter=\(self.canRecordScreen, privacy: .public) microphone=\(String(describing: self.microphoneStatus), privacy: .public) camera=\(String(describing: self.cameraStatus), privacy: .public)"
        )
        // #endregion
    }

    func requestScreen() {
        canRecordScreen = CGRequestScreenCaptureAccess()
        // #region agent log
        logger.info(
            "Screen capture request returned granted=\(self.canRecordScreen, privacy: .public)"
        )
        // #endregion
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
        // #region agent log
        logger.info("Opening privacy settings anchor=\(anchor, privacy: .public)")
        // #endregion
        NSWorkspace.shared.open(url)
    }
}
