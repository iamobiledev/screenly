import AppKit
import Combine
import ScreenCaptureKit

@MainActor
final class CaptureSourceModel: ObservableObject {
    @Published private(set) var displays: [DisplayChoice] = []
    @Published private(set) var windows: [WindowChoice] = []
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?

    func refresh() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let content = try await SCShareableContent.excludingDesktopWindows(
                true,
                onScreenWindowsOnly: true
            )
            displays = content.displays.map { display in
                DisplayChoice(
                    id: display.displayID,
                    name: screenName(for: display.displayID),
                    width: CGDisplayPixelsWide(display.displayID),
                    height: CGDisplayPixelsHigh(display.displayID)
                )
            }
            windows = content.windows.compactMap { window in
                guard let application = window.owningApplication,
                      let title = window.title,
                      !title.isEmpty,
                      application.bundleIdentifier != Bundle.main.bundleIdentifier else {
                    return nil
                }
                return WindowChoice(
                    id: window.windowID,
                    applicationName: application.applicationName,
                    title: title,
                    width: Int(window.frame.width),
                    height: Int(window.frame.height)
                )
            }
            .sorted {
                if $0.applicationName == $1.applicationName {
                    return $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending
                }
                return $0.applicationName.localizedCaseInsensitiveCompare(
                    $1.applicationName
                ) == .orderedAscending
            }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func screenName(for displayID: CGDirectDisplayID) -> String {
        NSScreen.screens.first {
            ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")]
                as? NSNumber)?.uint32Value == displayID
        }?.localizedName ?? "Display"
    }
}

struct DisplayChoice: Identifiable, Hashable {
    let id: CGDirectDisplayID
    let name: String
    let width: Int
    let height: Int
}

struct WindowChoice: Identifiable, Hashable {
    let id: CGWindowID
    let applicationName: String
    let title: String
    let width: Int
    let height: Int
}
