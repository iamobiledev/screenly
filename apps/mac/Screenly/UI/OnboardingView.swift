import AppKit
import AVFoundation
import SwiftUI

struct OnboardingView: View {
    @ObservedObject var appModel: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "record.circle")
                    .font(.system(size: 38))
                    .foregroundStyle(.tint)
                Text("Set up Screenly")
                    .font(.largeTitle.weight(.semibold))
                Text(
                    "Sign in to your workspace and grant capture access. Then every recording is only a hotkey away."
                )
                .foregroundStyle(.secondary)
            }

            VStack(spacing: 10) {
                PermissionRow(
                    title: "Screen Recording",
                    detail: "Required to capture a display, window, or area.",
                    isGranted: appModel.permissions.canRecordScreen
                ) {
                    appModel.permissions.requestScreen()
                } openSettings: {
                    appModel.permissions.openScreenSettings()
                }
                PermissionRow(
                    title: "Microphone",
                    detail: "Required when microphone audio is enabled.",
                    isGranted: appModel.permissions.microphoneStatus == .authorized
                ) {
                    Task {
                        await appModel.permissions.requestMicrophone()
                    }
                } openSettings: {
                    appModel.permissions.openMicrophoneSettings()
                }
                PermissionRow(
                    title: "Camera",
                    detail: "Optional, for the webcam bubble.",
                    isGranted: appModel.permissions.cameraStatus == .authorized
                ) {
                    Task {
                        await appModel.permissions.requestCamera()
                    }
                } openSettings: {
                    appModel.permissions.openCameraSettings()
                }
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("Screenly account")
                    .font(.headline)
                AuthenticationView(appModel: appModel)
            }

            HStack {
                Text("Default hotkey: \(appModel.settings.hotkey.label)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Finish setup") {
                    appModel.completeOnboarding()
                    OnboardingWindowController.shared.close()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(!canFinish)
            }
        }
        .padding(30)
        .frame(width: 620)
        .onAppear {
            appModel.permissions.refresh()
        }
    }

    private var canFinish: Bool {
        appModel.permissions.canRecordScreen &&
            appModel.permissions.microphoneStatus == .authorized &&
            appModel.settings.isServerConfigured &&
            !appModel.isAuthenticating
    }
}

private struct PermissionRow: View {
    let title: String
    let detail: String
    let isGranted: Bool
    let request: () -> Void
    let openSettings: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            Image(
                systemName: isGranted
                    ? "checkmark.circle.fill"
                    : "circle.dashed"
            )
            .font(.title2)
            .foregroundStyle(isGranted ? .green : .secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .fontWeight(.medium)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if isGranted {
                Text("Allowed")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.green)
            } else {
                Button("Allow", action: request)
                Button("Settings", action: openSettings)
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }
}

@MainActor
final class OnboardingWindowController {
    static let shared = OnboardingWindowController()
    private var window: NSWindow?

    func show(appModel: AppModel) {
        if let window {
            window.makeKeyAndOrderFront(nil)
            return
        }

        let window = NSWindow(
            contentRect: CGRect(x: 0, y: 0, width: 620, height: 720),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.title = "Welcome to Screenly"
        window.contentView = NSHostingView(
            rootView: OnboardingView(appModel: appModel)
        )
        window.center()
        window.isReleasedWhenClosed = false
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        self.window = window
    }

    func close() {
        window?.close()
        window = nil
    }
}
