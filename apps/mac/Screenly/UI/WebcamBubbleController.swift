import AppKit
import SwiftUI

@MainActor
final class WebcamBubbleController {
    private var panel: NSPanel?
    private var observers: [NSObjectProtocol] = []

    func show(controller: RecordingController) {
        guard panel == nil, let screen = NSScreen.main else {
            return
        }

        let size = CGSize(width: 220, height: 220)
        let origin = CGPoint(
            x: screen.visibleFrame.maxX - size.width - 28,
            y: screen.visibleFrame.minY + 28
        )
        let panel = NSPanel(
            contentRect: CGRect(origin: origin, size: size),
            styleMask: [.borderless, .resizable, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isMovableByWindowBackground = true
        panel.minSize = CGSize(width: 120, height: 120)
        panel.maxSize = CGSize(width: 420, height: 420)
        panel.contentAspectRatio = CGSize(width: 1, height: 1)
        panel.contentView = NSHostingView(
            rootView: WebcamBubbleView(controller: controller)
        )
        panel.orderFrontRegardless()
        self.panel = panel

        let center = NotificationCenter.default
        observers = [
            center.addObserver(
                forName: NSWindow.didMoveNotification,
                object: panel,
                queue: .main
            ) { [weak self, weak controller] _ in
                Task { @MainActor in
                    self?.syncFrame(to: controller)
                }
            },
            center.addObserver(
                forName: NSWindow.didResizeNotification,
                object: panel,
                queue: .main
            ) { [weak self, weak controller] _ in
                Task { @MainActor in
                    self?.syncFrame(to: controller)
                }
            }
        ]
        syncFrame(to: controller)
    }

    func hide() {
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
        }
        observers.removeAll()
        panel?.orderOut(nil)
        panel = nil
    }

    private func syncFrame(to controller: RecordingController?) {
        guard let controller, let panel, let screen = panel.screen else {
            return
        }
        let screenFrame = screen.frame
        let frame = panel.frame
        controller.updateWebcamFrame(
            CGRect(
                x: (frame.minX - screenFrame.minX) / screenFrame.width,
                y: (frame.minY - screenFrame.minY) / screenFrame.height,
                width: frame.width / screenFrame.width,
                height: frame.height / screenFrame.height
            )
        )
    }
}

private struct WebcamBubbleView: View {
    @ObservedObject var controller: RecordingController

    var body: some View {
        ZStack {
            Color.black
            if let image = controller.webcamPreview {
                Image(decorative: image, scale: 1)
                    .resizable()
                    .scaledToFill()
                    .scaleEffect(x: -1, y: 1)
            } else {
                ProgressView()
                    .controlSize(.small)
                    .tint(.white)
            }
        }
        .clipShape(Circle())
        .overlay {
            Circle().stroke(.white.opacity(0.9), lineWidth: 3)
        }
        .padding(4)
    }
}
