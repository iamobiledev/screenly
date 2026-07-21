import AppKit
import AVFoundation
import SwiftUI

struct OnboardingView: View {
    @ObservedObject var appModel: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
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
                        .frame(width: 52, height: 52)
                        .shadow(
                            color: Color(red: 0.42, green: 0.34, blue: 0.92)
                                .opacity(0.4),
                            radius: 12,
                            y: 6
                        )
                    Image(systemName: "record.circle")
                        .font(.system(size: 26, weight: .medium))
                        .foregroundStyle(.white)
                }
                Text("Set up Screenly")
                    .font(.largeTitle.weight(.semibold))
                Text(
                    "Sign in to your workspace and grant capture access. Then every recording is only a hotkey away."
                )
                .foregroundStyle(.secondary)
            }
            .padding(.top, 10)

            GlassGroup(spacing: 10) {
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
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("Screenly account")
                    .font(.headline)
                AuthenticationView(appModel: appModel)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassCard(cornerRadius: 14)

            HStack {
                Label(
                    "Default hotkey: \(appModel.settings.hotkey.label)",
                    systemImage: "keyboard"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                Spacer()
                Button("Finish setup") {
                    appModel.completeOnboarding()
                    OnboardingWindowController.shared.close()
                }
                .glassProminentButton()
                .controlSize(.large)
                .tint(Color(red: 0.42, green: 0.34, blue: 0.92))
                .disabled(!canFinish)
            }
        }
        .padding(30)
        .frame(width: 620)
        .glassWindowSurface()
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
                    .glassButton()
                Button("Settings", action: openSettings)
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .glassCard(cornerRadius: 12)
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
        GlassWindowStyler.apply(to: window)
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
