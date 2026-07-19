import CoreGraphics
import Foundation

enum CaptureTarget: Equatable, Sendable {
    case display(displayID: CGDirectDisplayID)
    case window(windowID: CGWindowID)
    case region(displayID: CGDirectDisplayID, rect: CGRect)
}

struct RecordingOptions: Sendable {
    var capturesSystemAudio: Bool
    var capturesMicrophone: Bool
    var microphoneDeviceID: String?
    var showsWebcam: Bool
    var cameraDeviceID: String?
    var webcamFrame: CGRect

    static let defaults = RecordingOptions(
        capturesSystemAudio: true,
        capturesMicrophone: true,
        microphoneDeviceID: nil,
        showsWebcam: false,
        cameraDeviceID: nil,
        webcamFrame: CGRect(x: 0.76, y: 0.68, width: 0.2, height: 0.28)
    )
}

enum RecordingState: Equatable {
    case idle
    case preparing
    case countdown(Int)
    case recording
    case paused
    case finishing
    case uploading(progress: Double)
    case uploaded(shareURL: URL)
    case failed(message: String)

    var isActive: Bool {
        switch self {
        case .countdown, .recording, .paused, .finishing:
            true
        default:
            false
        }
    }
}

struct UploadReceipt: Sendable {
    let videoID: UUID
    let slug: String
    let shareURL: URL
}
