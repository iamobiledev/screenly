import Combine
import Foundation

@MainActor
final class RecorderSettings: ObservableObject {
    static let productionServerURL =
        "https://screenly-web-271658039719.us-central1.run.app"

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
        static let sessionToken = "userSessionToken"
        static let username = "authUsername"
        static let email = "authEmail"
        static let workspaces = "authWorkspaces"
        static let activeWorkspaceID = "activeWorkspaceID"
        static let activeWorkspaceName = "activeWorkspaceName"
        static let sessionExpiresAt = "sessionExpiresAt"
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

    @Published private(set) var apiToken: String
    @Published private(set) var sessionToken: String
    @Published private(set) var username: String
    @Published private(set) var email: String
    @Published private(set) var availableWorkspaces: [AuthWorkspace]
    @Published private(set) var activeWorkspaceID: String?
    @Published private(set) var activeWorkspaceName: String?
    @Published private(set) var sessionExpiresAt: Date?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        serverURL = defaults.object(forKey: Key.serverURL) == nil
            ? Self.productionServerURL
            : defaults.string(forKey: Key.serverURL) ?? ""
        recorderName = defaults.string(forKey: Key.recorderName) ?? NSFullUserName()
        capturesSystemAudio =
            (defaults.object(forKey: Key.capturesSystemAudio) as? Bool) ?? true
        capturesMicrophone =
            (defaults.object(forKey: Key.capturesMicrophone) as? Bool) ?? true
        showsWebcam =
            (defaults.object(forKey: Key.showsWebcam) as? Bool) ?? false
        microphoneDeviceID = defaults.string(forKey: Key.microphoneDeviceID)
        cameraDeviceID = defaults.string(forKey: Key.cameraDeviceID)
        hasCompletedOnboarding = defaults.bool(forKey: Key.hasCompletedOnboarding)
        hotkey = HotkeyChoice(
            rawValue: defaults.string(forKey: Key.hotkey) ?? ""
        ) ?? .optionShiftR
        username = defaults.string(forKey: Key.username) ?? ""
        email = defaults.string(forKey: Key.email) ?? ""
        availableWorkspaces = Self.decodeWorkspaces(
            defaults.data(forKey: Key.workspaces)
        )
        let storedWorkspaceID = defaults.string(forKey: Key.activeWorkspaceID)
        activeWorkspaceID = storedWorkspaceID
        activeWorkspaceName = defaults.string(forKey: Key.activeWorkspaceName)
        sessionExpiresAt = defaults.object(forKey: Key.sessionExpiresAt) as? Date
        let storedSessionToken = KeychainStore.string(for: Key.sessionToken)
        sessionToken = storedSessionToken

        if !storedSessionToken.isEmpty, let storedWorkspaceID {
            apiToken = KeychainStore.string(
                for: Self.recorderTokenAccount(workspaceID: storedWorkspaceID)
            )
        } else {
            apiToken = KeychainStore.string(for: Key.apiToken)
        }
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
        guard let url = URL(string: serverURL),
              let scheme = url.scheme?.lowercased(),
              let host = url.host?.lowercased(),
              !host.isEmpty,
              !apiToken.isEmpty else {
            return false
        }
        return scheme == "https" ||
            (scheme == "http" && ["localhost", "127.0.0.1", "::1"].contains(host))
    }

    var isAuthenticated: Bool {
        !sessionToken.isEmpty &&
            !username.isEmpty &&
            activeWorkspaceID != nil &&
            !apiToken.isEmpty
    }

    var hasStoredSession: Bool {
        !sessionToken.isEmpty
    }

    func applyLogin(_ response: DeviceLoginResponse) throws {
        let recorderTokenAccount = Self.recorderTokenAccount(
            workspaceID: response.activeWorkspace.id
        )
        try KeychainStore.set(
            response.recorderToken.token,
            for: recorderTokenAccount
        )
        do {
            try KeychainStore.set(response.sessionToken, for: Key.sessionToken)
        } catch {
            try? KeychainStore.remove(recorderTokenAccount)
            throw error
        }
        try? KeychainStore.remove(Key.apiToken)
        let newWorkspaceIDs = Set(response.workspaces.map(\.id))
        for workspace in availableWorkspaces
        where !newWorkspaceIDs.contains(workspace.id) {
            try? KeychainStore.remove(
                Self.recorderTokenAccount(workspaceID: workspace.id)
            )
        }

        sessionToken = response.sessionToken
        apiToken = response.recorderToken.token
        sessionExpiresAt = response.sessionExpiresAt
        applyUser(response.user)
        applyWorkspaces(
            response.workspaces,
            activeWorkspace: response.activeWorkspace
        )
    }

    func applyValidatedSession(_ response: DeviceSessionResponse) {
        sessionExpiresAt = response.sessionExpiresAt
        defaults.set(response.sessionExpiresAt, forKey: Key.sessionExpiresAt)
        applyUser(response.user)
        let currentWorkspaceIDs = Set(response.workspaces.map(\.id))
        for workspace in availableWorkspaces
        where !currentWorkspaceIDs.contains(workspace.id) {
            try? KeychainStore.remove(
                Self.recorderTokenAccount(workspaceID: workspace.id)
            )
        }
        availableWorkspaces = response.workspaces
        persistWorkspaces()

        if let activeWorkspaceID,
           let active = response.workspaces.first(where: {
               $0.id == activeWorkspaceID
           }) {
            activeWorkspaceName = active.name
            defaults.set(active.name, forKey: Key.activeWorkspaceName)
        } else {
            apiToken = ""
            activeWorkspaceID = nil
            activeWorkspaceName = nil
            defaults.removeObject(forKey: Key.activeWorkspaceID)
            defaults.removeObject(forKey: Key.activeWorkspaceName)
        }
    }

    func applyWorkspaceSwitch(_ response: WorkspaceSwitchResponse) throws {
        try KeychainStore.set(
            response.recorderToken.token,
            for: Self.recorderTokenAccount(
                workspaceID: response.activeWorkspace.id
            )
        )
        apiToken = response.recorderToken.token
        activeWorkspaceID = response.activeWorkspace.id
        activeWorkspaceName = response.activeWorkspace.name
        defaults.set(response.activeWorkspace.id, forKey: Key.activeWorkspaceID)
        defaults.set(response.activeWorkspace.name, forKey: Key.activeWorkspaceName)
    }

    func clearAuthentication() throws {
        var keychainError: Error?
        do {
            try KeychainStore.remove(Key.sessionToken)
        } catch {
            keychainError = error
        }
        do {
            try KeychainStore.remove(Key.apiToken)
        } catch {
            keychainError = keychainError ?? error
        }
        for workspace in availableWorkspaces {
            do {
                try KeychainStore.remove(
                    Self.recorderTokenAccount(workspaceID: workspace.id)
                )
            } catch {
                keychainError = keychainError ?? error
            }
        }

        sessionToken = ""
        apiToken = ""
        username = ""
        email = ""
        availableWorkspaces = []
        activeWorkspaceID = nil
        activeWorkspaceName = nil
        sessionExpiresAt = nil
        for key in [
            Key.username,
            Key.email,
            Key.workspaces,
            Key.activeWorkspaceID,
            Key.activeWorkspaceName,
            Key.sessionExpiresAt
        ] {
            defaults.removeObject(forKey: key)
        }
        if let keychainError {
            throw keychainError
        }
    }

    func useManualConfiguration(serverURL: String, apiToken: String) throws {
        try clearAuthentication()
        try KeychainStore.set(apiToken, for: Key.apiToken)
        self.serverURL = serverURL
        self.apiToken = apiToken
    }

    private func applyUser(_ user: AuthUser) {
        username = user.username
        email = user.email
        defaults.set(user.username, forKey: Key.username)
        defaults.set(user.email, forKey: Key.email)
    }

    private func applyWorkspaces(
        _ workspaces: [AuthWorkspace],
        activeWorkspace: AuthWorkspace
    ) {
        availableWorkspaces = workspaces
        activeWorkspaceID = activeWorkspace.id
        activeWorkspaceName = activeWorkspace.name
        if let sessionExpiresAt {
            defaults.set(sessionExpiresAt, forKey: Key.sessionExpiresAt)
        }
        defaults.set(activeWorkspace.id, forKey: Key.activeWorkspaceID)
        defaults.set(activeWorkspace.name, forKey: Key.activeWorkspaceName)
        persistWorkspaces()
    }

    private func persistWorkspaces() {
        defaults.set(
            try? JSONEncoder().encode(availableWorkspaces),
            forKey: Key.workspaces
        )
    }

    private static func decodeWorkspaces(_ data: Data?) -> [AuthWorkspace] {
        guard let data else { return [] }
        return (try? JSONDecoder().decode([AuthWorkspace].self, from: data)) ?? []
    }

    private static func recorderTokenAccount(workspaceID: String) -> String {
        "recorderToken.\(workspaceID)"
    }
}
