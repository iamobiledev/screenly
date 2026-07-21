import AppKit
import SwiftUI

struct MenuBarView: View {
    @ObservedObject var appModel: AppModel

    var body: some View {
        GlassGroup(spacing: 14) {
            VStack(alignment: .leading, spacing: 12) {
                header
                stateContent
                footer
            }
            .padding(14)
        }
        .frame(width: 330)
    }

    private var header: some View {
        HStack(spacing: 11) {
            ZStack {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0.52, green: 0.45, blue: 0.96),
                                Color(red: 0.35, green: 0.27, blue: 0.87),
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 34, height: 34)
                Image(systemName: isRecordingState
                    ? "record.circle.fill"
                    : "record.circle")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(.white)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text("Screenly")
                    .font(.headline)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            if isRecordingState {
                recordingChip
            }
        }
        .padding(10)
        .glassCard(cornerRadius: 14)
    }

    private var recordingChip: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(.red)
                .frame(width: 7, height: 7)
            Text("REC")
                .font(.caption2.weight(.bold))
                .foregroundStyle(.red)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(.red.opacity(0.14), in: Capsule())
    }

    private var footer: some View {
        HStack {
            SettingsLink {
                Label("Settings", systemImage: "gearshape")
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            Spacer()
            Button("Quit") {
                NSApp.terminate(nil)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
        }
        .font(.caption)
        .padding(.horizontal, 4)
    }

    @ViewBuilder
    private var stateContent: some View {
        switch appModel.recorder.state {
        case .idle:
            if appModel.settings.isServerConfigured {
                VStack(spacing: 8) {
                    Button {
                        appModel.requestRecording()
                    } label: {
                        Label("New recording", systemImage: "plus.circle.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .glassProminentButton()
                    .controlSize(.large)
                    .tint(Color(red: 0.42, green: 0.34, blue: 0.92))

                    Button {
                        openLibrary()
                    } label: {
                        Label("Open team library", systemImage: "rectangle.stack")
                            .frame(maxWidth: .infinity)
                    }
                    .glassButton()
                }
            } else if appModel.isAuthenticating &&
                        appModel.settings.hasStoredSession {
                statusCard(title: "Validating sign-in…", showsProgress: true)
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Label(
                        "Sign in to start recording",
                        systemImage: "person.crop.circle.badge.exclamationmark"
                    )
                    .font(.callout.weight(.medium))
                    Text("Your workspace determines where recordings are uploaded.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    SettingsLink {
                        Text("Sign in…")
                            .frame(maxWidth: .infinity)
                    }
                    .glassProminentButton()
                    .tint(Color(red: 0.42, green: 0.34, blue: 0.92))
                }
                .padding(12)
                .glassCard(cornerRadius: 14)
            }

        case .preparing:
            statusCard(title: "Preparing capture…", showsProgress: true)

        case let .countdown(count):
            statusCard(
                title: "Recording starts in \(count)…",
                showsProgress: false
            )

        case .recording, .paused:
            HStack {
                Text(formattedElapsed)
                    .font(.system(.title3, design: .monospaced).weight(.semibold))
                    .contentTransition(.numericText())
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
                .glassButton()
                Button {
                    appModel.recorder.stop()
                } label: {
                    Image(systemName: "stop.fill")
                }
                .glassProminentButton()
                .tint(.red)
                Button(role: .destructive) {
                    appModel.recorder.discard()
                } label: {
                    Image(systemName: "trash")
                }
                .glassButton()
            }
            .padding(12)
            .glassCard(cornerRadius: 14)

        case .finishing:
            statusCard(title: "Finalizing recording…", showsProgress: true)

        case let .uploading(progress):
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label("Uploading", systemImage: "arrow.up.circle")
                    Spacer()
                    Text(progress, format: .percent.precision(.fractionLength(0)))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
                ProgressView(value: progress)
                    .tint(Color(red: 0.52, green: 0.45, blue: 0.96))
                Text("The share link is already in your clipboard.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(12)
            .glassCard(cornerRadius: 14)

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
                    .glassProminentButton()
                    .tint(Color(red: 0.42, green: 0.34, blue: 0.92))
                    Button("Done") {
                        appModel.recorder.reset()
                    }
                    .glassButton()
                }
            }
            .padding(12)
            .glassCard(cornerRadius: 14)

        case let .failed(message):
            VStack(alignment: .leading, spacing: 10) {
                Label(
                    "Something went wrong",
                    systemImage: "exclamationmark.triangle.fill"
                )
                .foregroundStyle(.red)
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                HStack {
                    Button("Retry upload") {
                        appModel.recorder.retryUpload()
                    }
                    .glassProminentButton()
                    .tint(Color(red: 0.42, green: 0.34, blue: 0.92))
                    Button("Dismiss") {
                        appModel.recorder.reset()
                    }
                    .glassButton()
                }
            }
            .padding(12)
            .glassCard(cornerRadius: 14)
        }
    }

    private func statusCard(title: String, showsProgress: Bool) -> some View {
        HStack(spacing: 10) {
            if showsProgress {
                ProgressView()
                    .controlSize(.small)
            }
            Text(title)
            Spacer()
        }
        .padding(12)
        .glassCard(cornerRadius: 14)
    }

    private var isRecordingState: Bool {
        switch appModel.recorder.state {
        case .recording, .paused:
            true
        default:
            false
        }
    }

    private var subtitle: String {
        if let workspace = appModel.settings.activeWorkspaceName,
           appModel.settings.isAuthenticated {
            "\(workspace) · \(appModel.settings.hotkey.label)"
        } else {
            "\(appModel.settings.hotkey.label) to record"
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
