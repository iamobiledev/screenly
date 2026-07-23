import AppKit
import SwiftUI

@MainActor
final class SetupWindowController {
    static let shared = SetupWindowController()
    private var window: NSWindow?
    private var closeObserver: WindowCloseObserver?

    func show(appModel: AppModel) {
        if let window {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let view = RecordingSetupView(
            controller: appModel.recorder,
            settings: appModel.settings,
            permissions: appModel.permissions
        )
        let window = NSWindow(
            contentRect: CGRect(x: 0, y: 0, width: 620, height: 520),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "New Recording"
        GlassWindowStyler.apply(to: window)
        window.contentView = NSHostingView(rootView: view)
        window.center()
        window.isReleasedWhenClosed = false
        let closeObserver = WindowCloseObserver { [weak self] in
            self?.window = nil
            self?.closeObserver = nil
        }
        window.delegate = closeObserver
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        self.window = window
        self.closeObserver = closeObserver
    }
}

@MainActor
private final class WindowCloseObserver: NSObject, NSWindowDelegate {
    private let onClose: () -> Void

    init(onClose: @escaping () -> Void) {
        self.onClose = onClose
    }

    func windowWillClose(_ notification: Notification) {
        onClose()
    }
}
