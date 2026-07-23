import AppKit
import SwiftUI

@MainActor
final class RecordingOverlayController {
    private var panel: NSPanel?

    func show(controller: RecordingController) {
        guard panel == nil, let screen = NSScreen.main else {
            return
        }

        let size = CGSize(width: 360, height: 96)
        let origin = CGPoint(
            x: screen.visibleFrame.midX - size.width / 2,
            y: screen.visibleFrame.maxY - size.height - 18
        )
        let panel = NSPanel(
            contentRect: CGRect(origin: origin, size: size),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.contentView = NSHostingView(
            rootView: RecordingHUDView(controller: controller)
        )
        panel.orderFrontRegardless()
        self.panel = panel
    }

    func hide() {
        panel?.orderOut(nil)
        panel = nil
    }
}

private struct RecordingHUDView: View {
    @ObservedObject var controller: RecordingController

    var body: some View {
        ZStack {
            if case let .countdown(count) = controller.state {
                Text("\(count)")
                    .font(.system(size: 46, weight: .semibold, design: .rounded))
                    .contentTransition(.numericText())
                    .frame(width: 78, height: 78)
                    .glassCard(cornerRadius: 28)
                    .accessibilityLabel("Recording starts in \(count)")
            } else {
                HStack(spacing: 14) {
                    Circle()
                        .fill(.red)
                        .frame(width: 9, height: 9)
                    Text(formattedElapsed)
                        .font(.system(.body, design: .monospaced).weight(.semibold))
                    Spacer()
                    GlassGroup(spacing: 8) {
                        HStack(spacing: 8) {
                            Button {
                                controller.pauseOrResume()
                            } label: {
                                Image(
                                    systemName: controller.state == .paused
                                        ? "play.fill"
                                        : "pause.fill"
                                )
                            }
                            .glassButton()
                            .help(controller.state == .paused ? "Resume" : "Pause")

                            Button {
                                controller.stop()
                            } label: {
                                Image(systemName: "stop.fill")
                            }
                            .glassProminentButton()
                            .tint(.red)
                            .help("Stop and upload")

                            Button(role: .destructive) {
                                controller.discard()
                            } label: {
                                Image(systemName: "trash")
                            }
                            .glassButton()
                            .help("Discard recording")
                        }
                    }
                }
                .controlSize(.large)
                .padding(.horizontal, 16)
                .frame(width: 348, height: 66)
                .glassCard(cornerRadius: 24)
            }
        }
        .foregroundStyle(.primary)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(.smooth(duration: 0.22), value: controller.state)
    }

    private var formattedElapsed: String {
        let minutes = controller.elapsedSeconds / 60
        let seconds = controller.elapsedSeconds % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}
