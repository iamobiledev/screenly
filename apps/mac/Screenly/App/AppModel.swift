import AppKit
import Combine
import Foundation

@MainActor
final class AppModel: ObservableObject {
    var settings: RecorderSettings
    let permissions: PermissionManager
    let recorder: RecordingController
    @Published private(set) var isAuthenticating = false
    @Published private(set) var authenticationError: String?

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
        settings.objectWillChange
            .sink { [weak self] _ in
                self?.objectWillChange.send()
            }
            .store(in: &cancellables)
        NotificationCenter.default.publisher(
            for: NSApplication.didBecomeActiveNotification
        )
        .sink { [weak self] _ in
            self?.permissions.refresh()
        }
        .store(in: &cancellables)
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
            }
            await validateStoredSession()
            if settings.hasCompletedOnboarding {
                recorder.resumePendingUploads()
            }
        }
    }

    func requestRecording() {
        guard !recorder.state.isActive else {
            return
        }
        guard settings.isServerConfigured else {
            authenticationError = "Sign in before starting a recording."
            OnboardingWindowController.shared.show(appModel: self)
            return
        }
        permissions.refresh()
        SetupWindowController.shared.show(appModel: self)
    }

    func completeOnboarding() {
        guard settings.isServerConfigured else {
            authenticationError =
                "Sign in or configure a server before finishing setup."
            return
        }
        settings.hasCompletedOnboarding = true
        requestRecording()
        recorder.resumePendingUploads()
    }

    func login(username: String, password: String) async {
        guard !isAuthenticating else { return }
        let username = username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !username.isEmpty, !password.isEmpty else {
            authenticationError = AuthError.missingCredentials.localizedDescription
            return
        }

        isAuthenticating = true
        authenticationError = nil
        defer { isAuthenticating = false }

        do {
            let response = try await authService().login(
                username: username,
                password: password,
                deviceName: deviceName
            )
            guard response.workspaces.contains(where: {
                $0.id == response.activeWorkspace.id
            }),
            !response.sessionToken.isEmpty,
            !response.recorderToken.token.isEmpty else {
                throw AuthError.invalidResponse
            }
            try settings.applyLogin(response)
        } catch {
            authenticationError = userFacingMessage(for: error)
        }
    }

    func validateStoredSession() async {
        guard settings.hasStoredSession else { return }

        if let expiresAt = settings.sessionExpiresAt, expiresAt <= Date() {
            clearLocalAuthentication()
            authenticationError = "Your session expired. Sign in again."
            return
        }

        isAuthenticating = true
        defer { isAuthenticating = false }
        do {
            let response = try await authService().validateSession(
                settings.sessionToken
            )
            guard let fallbackWorkspace = response.workspaces.first else {
                throw AuthError.noWorkspace
            }
            settings.applyValidatedSession(response)
            let activeIsAvailable = response.workspaces.contains {
                $0.id == settings.activeWorkspaceID
            }
            if !activeIsAvailable || settings.apiToken.isEmpty {
                try await switchWorkspace(
                    to: activeIsAvailable
                        ? settings.activeWorkspaceID ?? fallbackWorkspace.id
                        : fallbackWorkspace.id,
                    managesOperationState: false
                )
            }
        } catch let error as AuthError {
            switch error {
            case .unauthorized(_), .noWorkspace:
                clearLocalAuthentication()
            default:
                break
            }
            authenticationError = error.localizedDescription
        } catch {
            authenticationError = userFacingMessage(for: error)
        }
    }

    func switchWorkspace(to workspaceID: String) async {
        guard !isAuthenticating else { return }
        do {
            try await switchWorkspace(
                to: workspaceID,
                managesOperationState: true
            )
        } catch {
            authenticationError = userFacingMessage(for: error)
        }
    }

    func signOut() async {
        guard !isAuthenticating else { return }
        guard canChangeAuthentication else {
            authenticationError =
                "Finish the current recording or upload before signing out."
            return
        }

        isAuthenticating = true
        authenticationError = nil
        let sessionToken = settings.sessionToken
        var remoteError: Error?
        if !sessionToken.isEmpty {
            do {
                try await authService().logout(sessionToken: sessionToken)
            } catch {
                remoteError = error
            }
        }
        clearLocalAuthentication()
        isAuthenticating = false
        if let remoteError {
            authenticationError =
                "Signed out on this Mac. The server could not revoke the session: " +
                userFacingMessage(for: remoteError)
        }
    }

    func useManualConfiguration(serverURL: String, apiToken: String) {
        let serverURL = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let apiToken = apiToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isAllowedServerURL(serverURL), !apiToken.isEmpty else {
            authenticationError =
                "Enter a valid server URL and recorder token."
            return
        }
        guard canChangeAuthentication else {
            authenticationError =
                "Finish the current recording or upload before changing servers."
            return
        }

        do {
            try settings.useManualConfiguration(
                serverURL: serverURL,
                apiToken: apiToken
            )
            authenticationError = nil
        } catch {
            authenticationError = userFacingMessage(for: error)
        }
    }

    private func registerHotkey(_ choice: HotkeyChoice) {
        hotkey.register(choice) { [weak self] in
            self?.requestRecording()
        }
    }

    private func switchWorkspace(
        to workspaceID: String,
        managesOperationState: Bool
    ) async throws {
        guard workspaceID != settings.activeWorkspaceID || settings.apiToken.isEmpty else {
            return
        }
        guard canChangeAuthentication else {
            throw AuthError.server(
                status: 409,
                message: "Finish the current recording or upload first."
            )
        }
        guard settings.availableWorkspaces.contains(where: {
            $0.id == workspaceID
        }) else {
            throw AuthError.noWorkspace
        }
        guard !settings.sessionToken.isEmpty else {
            throw AuthError.unauthorized("Sign in again to switch workspaces.")
        }

        if managesOperationState {
            isAuthenticating = true
            authenticationError = nil
        }
        defer {
            if managesOperationState {
                isAuthenticating = false
            }
        }

        let response = try await authService().switchWorkspace(
            sessionToken: settings.sessionToken,
            workspaceID: workspaceID,
            deviceName: deviceName
        )
        guard response.activeWorkspace.id == workspaceID,
              !response.recorderToken.token.isEmpty else {
            throw AuthError.invalidResponse
        }
        try settings.applyWorkspaceSwitch(response)
    }

    private func authService() throws -> AuthService {
        guard isAllowedServerURL(settings.serverURL),
              let baseURL = URL(string: settings.serverURL) else {
            throw AuthError.invalidConfiguration
        }
        return AuthService(baseURL: baseURL)
    }

    private func clearLocalAuthentication() {
        do {
            try settings.clearAuthentication()
        } catch {
            authenticationError = userFacingMessage(for: error)
        }
    }

    private func userFacingMessage(for error: Error) -> String {
        if let error = error as? LocalizedError,
           let message = error.errorDescription {
            return message
        }
        return "Authentication could not be completed. Check your connection and try again."
    }

    private func isAllowedServerURL(_ value: String) -> Bool {
        guard let url = URL(string: value),
              let scheme = url.scheme?.lowercased(),
              let host = url.host?.lowercased(),
              !host.isEmpty else {
            return false
        }
        return scheme == "https" ||
            (scheme == "http" && ["localhost", "127.0.0.1", "::1"].contains(host))
    }

    private var deviceName: String {
        let name = Host.current().localizedName ?? "Mac recorder"
        return String(name.prefix(120))
    }

    var canChangeAuthentication: Bool {
        switch recorder.state {
        case .idle, .uploaded:
            true
        default:
            false
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
