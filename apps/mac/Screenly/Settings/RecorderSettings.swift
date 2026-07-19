import Combine
import Foundation

@MainActor
final class RecorderSettings: ObservableObject {
    private enum Key {
        static let serverURL = "serverURL"
        static let recorderName = "recorderName"
        static let capturesSystemAudio = "capturesSystemAudio"
        static let capturesMicrophone = "capturesMicrophone"
        static let showsWebcam = "showsWebcam"
        static let microphoneDeviceID = "microphoneDeviceID"
        static let cameraDeviceID = "cameraDeviceID"
        static let hasCompletedOnboarding = "hasCompletedOnboarding"
        static let hotkey = "hotkey"
        static let apiToken = "apiToken"
    }

    private let defaults: UserDefaults

    @Published var serverURL: String {
        didSet { defaults.set(serverURL, forKey: Key.serverURL) }
    }

    @Published var recorderName: String {
        didSet { defaults.set(recorderName, forKey: Key.recorderName) }
    }

    @Published var capturesSystemAudio: Bool {
        didSet { defaults.set(capturesSystemAudio, forKey: Key.capturesSystemAudio) }
    }

    @Published var capturesMicrophone: Bool {
        didSet { defaults.set(capturesMicrophone, forKey: Key.capturesMicrophone) }
    }

    @Published var showsWebcam: Bool {
        didSet { defaults.set(showsWebcam, forKey: Key.showsWebcam) }
    }

    @Published var microphoneDeviceID: String? {
        didSet { defaults.set(microphoneDeviceID, forKey: Key.microphoneDeviceID) }
    }

    @Published var cameraDeviceID: String? {
        didSet { defaults.set(cameraDeviceID, forKey: Key.cameraDeviceID) }
    }

    @Published var hasCompletedOnboarding: Bool {
        didSet { defaults.set(hasCompletedOnboarding, forKey: Key.hasCompletedOnboarding) }
    }

    @Published var hotkey: HotkeyChoice {
        didSet { defaults.set(hotkey.rawValue, forKey: Key.hotkey) }
    }

    @Published var apiToken: String {
        didSet {
            try? KeychainStore.set(apiToken, for: Key.apiToken)
        }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        serverURL = defaults.string(forKey: Key.serverURL) ?? ""
        recorderName = defaults.string(forKey: Key.recorderName) ?? NSFullUserName()
        capturesSystemAudio = defaults.object(forKey: Key.capturesSystemAudio) as? Bool ?? true
        capturesMicrophone = defaults.object(forKey: Key.capturesMicrophone) as? Bool ?? true
        showsWebcam = defaults.object(forKey: Key.showsWebcam) as? Bool ?? false
        microphoneDeviceID = defaults.string(forKey: Key.microphoneDeviceID)
        cameraDeviceID = defaults.string(forKey: Key.cameraDeviceID)
        hasCompletedOnboarding = defaults.bool(forKey: Key.hasCompletedOnboarding)
        hotkey = HotkeyChoice(
            rawValue: defaults.string(forKey: Key.hotkey) ?? ""
        ) ?? .optionShiftR
        apiToken = KeychainStore.string(for: Key.apiToken)
    }

    var recordingOptions: RecordingOptions {
        var options = RecordingOptions.defaults
        options.capturesSystemAudio = capturesSystemAudio
        options.capturesMicrophone = capturesMicrophone
        options.microphoneDeviceID = microphoneDeviceID
        options.showsWebcam = showsWebcam
        options.cameraDeviceID = cameraDeviceID
        return options
    }

    var isServerConfigured: Bool {
        URL(string: serverURL)?.scheme == "https" && !apiToken.isEmpty
    }
}
