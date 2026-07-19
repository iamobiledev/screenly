import AppKit
import SwiftUI

@MainActor
final class RegionSelectionController {
    private var window: NSWindow?

    func selectRegion(
        on displayID: CGDirectDisplayID,
        completion: @escaping (CGRect?) -> Void
    ) {
        guard let screen = NSScreen.screens.first(where: {
            ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")]
                as? NSNumber)?.uint32Value == displayID
        }) else {
            completion(nil)
            return
        }

        let view = RegionSelectionView { [self] region in
            self.window?.orderOut(nil)
            self.window = nil
            completion(region)
        }
        let window = NSWindow(
            contentRect: screen.frame,
            styleMask: .borderless,
            backing: .buffered,
            defer: false,
            screen: screen
        )
        window.backgroundColor = .clear
        window.isOpaque = false
        window.hasShadow = false
        window.level = .screenSaver
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.contentView = NSHostingView(rootView: view)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        self.window = window
    }
}

private struct RegionSelectionView: View {
    let completion: (CGRect?) -> Void

    @State private var start: CGPoint?
    @State private var current: CGPoint?

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Color.black.opacity(0.42)
                if let selection {
                    Rectangle()
                        .fill(.clear)
                        .overlay {
                            Rectangle()
                                .stroke(.white, lineWidth: 2)
                        }
                        .frame(
                            width: selection.width,
                            height: selection.height
                        )
                        .position(
                            x: selection.midX,
                            y: selection.midY
                        )
                    Text(
                        "\(Int(selection.width)) × \(Int(selection.height))"
                    )
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .foregroundStyle(.white)
                    .background(.black.opacity(0.72), in: Capsule())
                    .position(
                        x: selection.midX,
                        y: max(18, selection.minY - 18)
                    )
                } else {
                    VStack(spacing: 8) {
                        Text("Drag to select an area")
                            .font(.system(size: 20, weight: .semibold))
                        Text("Press Esc to cancel")
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                    }
                    .padding(20)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                    .position(x: proxy.size.width / 2, y: proxy.size.height / 2)
                }
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 2, coordinateSpace: .local)
                    .onChanged { value in
                        if start == nil {
                            start = value.startLocation
                        }
                        current = value.location
                    }
                    .onEnded { _ in
                        guard let selection,
                              selection.width >= 40,
                              selection.height >= 40 else {
                            start = nil
                            current = nil
                            return
                        }
                        completion(selection)
                    }
            )
            .onExitCommand {
                completion(nil)
            }
        }
        .ignoresSafeArea()
    }

    private var selection: CGRect? {
        guard let start, let current else {
            return nil
        }
        return CGRect(
            x: min(start.x, current.x),
            y: min(start.y, current.y),
            width: abs(current.x - start.x),
            height: abs(current.y - start.y)
        )
    }
}
