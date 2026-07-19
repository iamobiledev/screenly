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
        panel.hasShadow = true
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
        Group {
            if case let .countdown(count) = controller.state {
                Text("\(count)")
                    .font(.system(size: 48, weight: .bold, design: .rounded))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                HStack(spacing: 14) {
                    Circle()
                        .fill(.red)
                        .frame(width: 10, height: 10)
                    Text(formattedElapsed)
                        .font(.system(.body, design: .monospaced).weight(.semibold))
                    Spacer()
                    Button {
                        controller.pauseOrResume()
                    } label: {
                        Image(
                            systemName: controller.state == .paused
                                ? "play.fill"
                                : "pause.fill"
                        )
                    }
                    .help(controller.state == .paused ? "Resume" : "Pause")

                    Button {
                        controller.stop()
                    } label: {
                        Image(systemName: "stop.fill")
                    }
                    .help("Stop and upload")

                    Button(role: .destructive) {
                        controller.discard()
                    } label: {
                        Image(systemName: "trash")
                    }
                    .help("Discard recording")
                }
                .buttonStyle(.borderless)
                .padding(.horizontal, 20)
            }
        }
        .foregroundStyle(.white)
        .background(.black.opacity(0.88), in: RoundedRectangle(cornerRadius: 18))
        .padding(6)
    }

    private var formattedElapsed: String {
        let minutes = controller.elapsedSeconds / 60
        let seconds = controller.elapsedSeconds % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}
