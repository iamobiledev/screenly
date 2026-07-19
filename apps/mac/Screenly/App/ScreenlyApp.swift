import SwiftUI

@main
struct ScreenlyApp: App {
    @StateObject private var appModel = AppModel()

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(appModel: appModel)
        } label: {
            Label("Screenly", systemImage: menuBarIcon)
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView(appModel: appModel)
        }
    }

    private var menuBarIcon: String {
        switch appModel.recorder.state {
        case .recording, .paused:
            "record.circle.fill"
        case .uploading:
            "arrow.up.circle"
        case .uploaded:
            "checkmark.circle"
        case .failed:
            "exclamationmark.circle"
        default:
            "record.circle"
        }
    }
}
