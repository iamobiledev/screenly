import AppKit
import SwiftUI

/// Shared styling helpers that adopt Apple's Liquid Glass design on
/// macOS 26 (Tahoe) while gracefully falling back to translucent
/// materials on macOS 15.
///
/// The `#if compiler(>=6.2)` guards keep the sources buildable with
/// Xcode 16 toolchains that predate the Liquid Glass SDK; the
/// `#available` checks keep binaries built with Xcode 26 working on
/// macOS 15 at runtime.
extension View {
    /// A rounded glass surface for grouping related controls.
    @ViewBuilder
    func glassCard(cornerRadius: CGFloat = 14) -> some View {
        #if compiler(>=6.2)
        if #available(macOS 26.0, *) {
            self.glassEffect(
                .regular,
                in: .rect(cornerRadius: cornerRadius)
            )
        } else {
            materialCard(cornerRadius: cornerRadius)
        }
        #else
        materialCard(cornerRadius: cornerRadius)
        #endif
    }

    /// The primary call-to-action button treatment.
    @ViewBuilder
    func glassProminentButton() -> some View {
        #if compiler(>=6.2)
        if #available(macOS 26.0, *) {
            self.buttonStyle(.glassProminent)
        } else {
            self.buttonStyle(.borderedProminent)
        }
        #else
        self.buttonStyle(.borderedProminent)
        #endif
    }

    /// A secondary button treatment on a glass pill.
    @ViewBuilder
    func glassButton() -> some View {
        #if compiler(>=6.2)
        if #available(macOS 26.0, *) {
            self.buttonStyle(.glass)
        } else {
            self.buttonStyle(.bordered)
        }
        #else
        self.buttonStyle(.bordered)
        #endif
    }

    /// Layered translucent backdrop for utility windows so the desktop
    /// shines through the interface the way native glass panels do.
    func glassWindowSurface() -> some View {
        background {
            ZStack {
                Rectangle()
                    .fill(.ultraThinMaterial)
                LinearGradient(
                    colors: [
                        Color.white.opacity(0.1),
                        Color.clear,
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
            .ignoresSafeArea()
        }
    }

    private func materialCard(cornerRadius: CGFloat) -> some View {
        background(
            .ultraThinMaterial,
            in: RoundedRectangle(
                cornerRadius: cornerRadius,
                style: .continuous
            )
        )
        .overlay(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(.white.opacity(0.12), lineWidth: 1)
        )
    }
}

/// Groups sibling glass elements so their shapes can blend and morph on
/// macOS 26. On earlier systems the content renders unchanged.
struct GlassGroup<Content: View>: View {
    private let spacing: CGFloat
    private let content: Content

    init(spacing: CGFloat = 12, @ViewBuilder content: () -> Content) {
        self.spacing = spacing
        self.content = content()
    }

    var body: some View {
        #if compiler(>=6.2)
        if #available(macOS 26.0, *) {
            GlassEffectContainer(spacing: spacing) {
                content
            }
        } else {
            content
        }
        #else
        content
        #endif
    }
}

@MainActor
enum GlassWindowStyler {
    /// Gives a utility window the transparent-titlebar chrome used by
    /// native glass panels; pair with `glassWindowSurface()` on the
    /// root SwiftUI view.
    static func apply(to window: NSWindow) {
        window.styleMask.insert(.fullSizeContentView)
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.isMovableByWindowBackground = true
        window.backgroundColor = .clear
        window.isOpaque = false
    }
}
