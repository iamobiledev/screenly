import Combine
import Foundation

@MainActor
final class AppModel: ObservableObject {
    let settings: RecorderSettings
    let permissions: PermissionManager
    let recorder: RecordingController

    private let hotkey = GlobalHotkey()
    private let recordingOverlay = RecordingOverlayController()
    private let webcamBubble = WebcamBubbleController()
    private var cancellables = Set<AnyCancellable>()

    init() {
        let settings = RecorderSettings()
        let permissions = PermissionManager()
        self.settings = settings
        self.permissions = permissions
        recorder = RecordingController(
            settings: settings,
            permissions: permissions
        )

        registerHotkey(settings.hotkey)
        settings.$hotkey
            .dropFirst()
            .sink { [weak self] choice in
                self?.registerHotkey(choice)
            }
            .store(in: &cancellables)
        recorder.$state
            .sink { [weak self] state in
                self?.synchronizeOverlays(with: state)
            }
            .store(in: &cancellables)

        Task { [weak self] in
            guard let self else { return }
            if !settings.hasCompletedOnboarding {
                OnboardingWindowController.shared.show(appModel: self)
            } else {
                recorder.resumePendingUploads()
            }
        }
    }

    func requestRecording() {
        guard !recorder.state.isActive else {
            return
        }
        permissions.refresh()
        SetupWindowController.shared.show(appModel: self)
    }

    func completeOnboarding() {
        settings.hasCompletedOnboarding = true
        requestRecording()
        recorder.resumePendingUploads()
    }

    private func registerHotkey(_ choice: HotkeyChoice) {
        hotkey.register(choice) { [weak self] in
            self?.requestRecording()
        }
    }

    private func synchronizeOverlays(with state: RecordingState) {
        switch state {
        case .countdown, .recording, .paused:
            recordingOverlay.show(controller: recorder)
        default:
            recordingOverlay.hide()
        }

        switch state {
        case .recording, .paused:
            if settings.showsWebcam {
                webcamBubble.show(controller: recorder)
            } else {
                webcamBubble.hide()
            }
        default:
            webcamBubble.hide()
        }
    }
}
