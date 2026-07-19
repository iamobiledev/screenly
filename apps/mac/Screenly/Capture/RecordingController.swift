import AppKit
import Combine
import Foundation

@MainActor
final class RecordingController: ObservableObject {
    @Published private(set) var state: RecordingState = .idle
    @Published private(set) var elapsedSeconds = 0
    @Published private(set) var webcamPreview: CGImage?

    let settings: RecorderSettings
    let permissions: PermissionManager

    private let engine = CaptureEngine()
    private let uploader = MultipartUploader()
    private var elapsedTimer: Timer?
    private var currentFileURL: URL?
    private var activeUploadTask: Task<Void, Never>?

    init(
        settings: RecorderSettings,
        permissions: PermissionManager
    ) {
        self.settings = settings
        self.permissions = permissions
    }

    func start(target: CaptureTarget, options: RecordingOptions) {
        guard state == .idle || isTerminalState else {
            return
        }
        guard makeClient() != nil else {
            state = .failed(
                message: "Add your server URL and API token in Settings."
            )
            return
        }
        guard permissions.canRecordScreen else {
            state = .failed(
                message: "Screen Recording permission is required."
            )
            return
        }
        if options.capturesMicrophone,
           permissions.microphoneStatus != .authorized {
            state = .failed(message: "Microphone permission is required.")
            return
        }
        if options.showsWebcam,
           permissions.cameraStatus != .authorized {
            state = .failed(message: "Camera permission is required.")
            return
        }

        activeUploadTask?.cancel()
        activeUploadTask = Task { [weak self] in
            guard let self else { return }
            do {
                state = .preparing
                for count in stride(from: 3, through: 1, by: -1) {
                    state = .countdown(count)
                    try await Task.sleep(for: .seconds(1))
                }

                let outputURL = try makeRecordingURL()
                currentFileURL = outputURL
                try await engine.start(
                    target: target,
                    options: options,
                    outputURL: outputURL
                ) { [weak self] error in
                    Task { @MainActor in
                        self?.handleCaptureError(error)
                    }
                } onCameraFrame: { [weak self] image in
                    Task { @MainActor in
                        self?.webcamPreview = image
                    }
                }
                elapsedSeconds = 0
                startElapsedTimer()
                state = .recording
            } catch is CancellationError {
                state = .idle
            } catch {
                state = .failed(message: error.localizedDescription)
            }
        }
    }

    func pauseOrResume() {
        switch state {
        case .recording:
            engine.setPaused(true)
            stopElapsedTimer()
            state = .paused
        case .paused:
            engine.setPaused(false)
            startElapsedTimer()
            state = .recording
        default:
            break
        }
    }

    func stop() {
        guard state == .recording || state == .paused else {
            return
        }
        stopElapsedTimer()
        state = .finishing

        Task { [weak self] in
            guard let self else { return }
            do {
                let fileURL = try await engine.stop()
                currentFileURL = fileURL
                beginUpload(fileURL: fileURL)
            } catch {
                state = .failed(message: error.localizedDescription)
            }
        }
    }

    func discard() {
        activeUploadTask?.cancel()
        stopElapsedTimer()
        let client = makeClient()

        Task { [weak self] in
            guard let self else { return }
            if state == .recording || state == .paused || state == .finishing {
                _ = try? await engine.stop()
            }
            if let currentFileURL {
                if let client {
                    await uploader.discard(
                        fileURL: currentFileURL,
                        client: client
                    )
                }
                try? FileManager.default.removeItem(at: currentFileURL)
            }
            self.currentFileURL = nil
            webcamPreview = nil
            state = .idle
        }
    }

    func reset() {
        guard isTerminalState else { return }
        state = .idle
        elapsedSeconds = 0
    }

    func retryUpload() {
        guard case .failed = state, let currentFileURL else {
            return
        }
        beginUpload(fileURL: currentFileURL)
    }

    func updateWebcamFrame(_ frame: CGRect) {
        engine.updateWebcamFrame(frame)
    }

    func resumePendingUploads() {
        guard let client = makeClient() else {
            return
        }

        Task { [weak self] in
            guard let self else { return }
            let files = await uploader.pendingFiles(for: client.baseURL)
            guard let file = files.first else { return }
            currentFileURL = file
            beginUpload(fileURL: file)
        }
    }

    private func beginUpload(fileURL: URL) {
        guard let client = makeClient() else {
            state = .failed(message: "The upload server is not configured.")
            return
        }

        state = .uploading(progress: 0)
        activeUploadTask = Task { [weak self] in
            guard let self else { return }
            do {
                let receipt = try await uploader.upload(
                    fileURL: fileURL,
                    client: client,
                    recorderName: settings.recorderName
                ) { receipt in
                    Task { @MainActor [weak self] in
                        self?.copyToClipboard(receipt.shareURL)
                    }
                } onProgress: { progress in
                    Task { @MainActor [weak self] in
                        self?.state = .uploading(progress: progress)
                    }
                }

                try? FileManager.default.removeItem(at: fileURL)
                currentFileURL = nil
                state = .uploaded(shareURL: receipt.shareURL)
            } catch is CancellationError {
                return
            } catch {
                if Task.isCancelled {
                    return
                }
                state = .failed(message: error.localizedDescription)
            }
        }
    }

    private func makeClient() -> ScreenlyAPIClient? {
        guard let baseURL = URL(string: settings.serverURL),
              ["http", "https"].contains(baseURL.scheme?.lowercased()),
              !settings.apiToken.isEmpty else {
            return nil
        }
        if baseURL.scheme?.lowercased() == "http",
           !["localhost", "127.0.0.1", "::1"].contains(
               baseURL.host?.lowercased() ?? ""
           ) {
            return nil
        }
        return ScreenlyAPIClient(baseURL: baseURL, token: settings.apiToken)
    }

    private func makeRecordingURL() throws -> URL {
        let applicationSupport = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first!
        let directory = applicationSupport
            .appending(path: "Screenly", directoryHint: .isDirectory)
            .appending(path: "Recordings", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        return directory.appending(path: "\(UUID().uuidString).mp4")
    }

    private func startElapsedTimer() {
        elapsedTimer?.invalidate()
        elapsedTimer = Timer.scheduledTimer(
            withTimeInterval: 1,
            repeats: true
        ) { [weak self] _ in
            Task { @MainActor in
                self?.elapsedSeconds += 1
            }
        }
    }

    private func stopElapsedTimer() {
        elapsedTimer?.invalidate()
        elapsedTimer = nil
    }

    private func copyToClipboard(_ url: URL) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(url.absoluteString, forType: .string)
        state = .uploading(progress: 0)
    }

    private func handleCaptureError(_ error: Error) {
        stopElapsedTimer()
        state = .failed(message: error.localizedDescription)
    }

    private var isTerminalState: Bool {
        switch state {
        case .uploaded, .failed:
            true
        default:
            false
        }
    }
}
