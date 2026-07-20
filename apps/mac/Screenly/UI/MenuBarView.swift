import AppKit
import SwiftUI

struct MenuBarView: View {
    @ObservedObject var appModel: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            Divider()
            stateContent
            Divider()
            HStack {
                SettingsLink {
                    Label("Settings", systemImage: "gearshape")
                }
                .buttonStyle(.plain)
                Spacer()
                Button("Quit") {
                    NSApp.terminate(nil)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            }
            .font(.caption)
        }
        .padding(16)
        .frame(width: 320)
    }

    private var header: some View {
        HStack {
            Image(systemName: "record.circle.fill")
                .font(.title2)
                .foregroundStyle(.red)
            VStack(alignment: .leading, spacing: 1) {
                Text("Screenly")
                    .font(.headline)
                Text("\(appModel.settings.hotkey.label) to record")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let workspace = appModel.settings.activeWorkspaceName,
                   appModel.settings.isAuthenticated {
                    Text(workspace)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer()
            if case .recording = appModel.recorder.state {
                Circle()
                    .fill(.red)
                    .frame(width: 8, height: 8)
            }
        }
    }

    @ViewBuilder
    private var stateContent: some View {
        switch appModel.recorder.state {
        case .idle:
            if appModel.settings.isServerConfigured {
                Button {
                    appModel.requestRecording()
                } label: {
                    Label("New recording", systemImage: "plus.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button {
                    openLibrary()
                } label: {
                    Label("Open team library", systemImage: "rectangle.stack")
                }
                .buttonStyle(.plain)
            } else if appModel.isAuthenticating &&
                        appModel.settings.hasStoredSession {
                statusRow(title: "Validating sign-in…", showsProgress: true)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Label(
                        "Sign in to start recording",
                        systemImage: "person.crop.circle.badge.exclamationmark"
                    )
                    .font(.callout.weight(.medium))
                    Text("Your workspace determines where recordings are uploaded.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    SettingsLink {
                        Text("Sign in…")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                }
            }

        case .preparing:
            statusRow(title: "Preparing capture…", showsProgress: true)

        case let .countdown(count):
            statusRow(title: "Recording starts in \(count)…", showsProgress: false)

        case .recording, .paused:
            HStack {
                Text(formattedElapsed)
                    .font(.system(.title3, design: .monospaced).weight(.semibold))
                Spacer()
                Button {
                    appModel.recorder.pauseOrResume()
                } label: {
                    Image(
                        systemName: appModel.recorder.state == .paused
                            ? "play.fill"
                            : "pause.fill"
                    )
                }
                Button {
                    appModel.recorder.stop()
                } label: {
                    Image(systemName: "stop.fill")
                }
                .buttonStyle(.borderedProminent)
                Button(role: .destructive) {
                    appModel.recorder.discard()
                } label: {
                    Image(systemName: "trash")
                }
            }

        case .finishing:
            statusRow(title: "Finalizing recording…", showsProgress: true)

        case let .uploading(progress):
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label("Uploading", systemImage: "arrow.up.circle")
                    Spacer()
                    Text(progress, format: .percent.precision(.fractionLength(0)))
                        .foregroundStyle(.secondary)
                }
                ProgressView(value: progress)
                Text("The share link is already in your clipboard.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

        case let .uploaded(shareURL):
            VStack(alignment: .leading, spacing: 10) {
                Label("Link copied", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                Text(shareURL.absoluteString)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                HStack {
                    Button("Open video") {
                        NSWorkspace.shared.open(shareURL)
                    }
                    Button("Done") {
                        appModel.recorder.reset()
                    }
                }
            }

        case let .failed(message):
            VStack(alignment: .leading, spacing: 10) {
                Label("Something went wrong", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack {
                    Button("Retry upload") {
                        appModel.recorder.retryUpload()
                    }
                    Button("Dismiss") {
                        appModel.recorder.reset()
                    }
                }
            }
        }
    }

    private func statusRow(title: String, showsProgress: Bool) -> some View {
        HStack(spacing: 10) {
            if showsProgress {
                ProgressView()
                    .controlSize(.small)
            }
            Text(title)
            Spacer()
        }
    }

    private var formattedElapsed: String {
        let minutes = appModel.recorder.elapsedSeconds / 60
        let seconds = appModel.recorder.elapsedSeconds % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }

    private func openLibrary() {
        guard let baseURL = URL(string: appModel.settings.serverURL) else {
            return
        }
        NSWorkspace.shared.open(baseURL.appending(path: "library"))
    }
}
