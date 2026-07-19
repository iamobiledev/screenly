import AVFoundation
import CoreImage
import ScreenCaptureKit

final class CaptureEngine: NSObject, @unchecked Sendable {
    private let captureQueue = DispatchQueue(
        label: "com.screenly.capture",
        qos: .userInteractive
    )
    private let cameraQueue = DispatchQueue(
        label: "com.screenly.camera",
        qos: .userInteractive
    )
    private let cameraLock = NSLock()
    private let ciContext = CIContext(options: [.cacheIntermediates: false])

    private var stream: SCStream?
    private var cameraSession: AVCaptureSession?
    private var writer: AVAssetWriter?
    private var videoInput: AVAssetWriterInput?
    private var systemAudioInput: AVAssetWriterInput?
    private var microphoneInput: AVAssetWriterInput?
    private var pixelBufferAdaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var latestCameraBuffer: CVPixelBuffer?
    private var firstPresentationTime: CMTime?
    private var accumulatedPauseDuration = CMTime.zero
    private var pauseStartedAt: CMTime?
    private var paused = false
    private var outputSize = CGSize.zero
    private var webcamFrame = RecordingOptions.defaults.webcamFrame
    private var includesWebcam = false
    private var onError: (@Sendable (Error) -> Void)?
    private var onCameraFrame: (@Sendable (CGImage) -> Void)?
    private var lastCameraPreviewTime = CFAbsoluteTimeGetCurrent()

    func start(
        target: CaptureTarget,
        options: RecordingOptions,
        outputURL: URL,
        onError: @escaping @Sendable (Error) -> Void,
        onCameraFrame: @escaping @Sendable (CGImage) -> Void
    ) async throws {
        self.onError = onError
        self.onCameraFrame = onCameraFrame
        webcamFrame = options.webcamFrame
        includesWebcam = options.showsWebcam

        let content = try await SCShareableContent.excludingDesktopWindows(
            false,
            onScreenWindowsOnly: true
        )
        let capture = try makeCaptureConfiguration(
            target: target,
            content: content,
            options: options
        )
        outputSize = capture.outputSize

        try prepareWriter(
            outputURL: outputURL,
            outputSize: capture.outputSize,
            includesSystemAudio: options.capturesSystemAudio,
            includesMicrophone: options.capturesMicrophone
        )

        let stream = SCStream(
            filter: capture.filter,
            configuration: capture.configuration,
            delegate: self
        )
        try stream.addStreamOutput(
            self,
            type: .screen,
            sampleHandlerQueue: captureQueue
        )
        if options.capturesSystemAudio {
            try stream.addStreamOutput(
                self,
                type: .audio,
                sampleHandlerQueue: captureQueue
            )
        }
        if options.capturesMicrophone {
            try stream.addStreamOutput(
                self,
                type: .microphone,
                sampleHandlerQueue: captureQueue
            )
        }
        self.stream = stream

        if options.showsWebcam {
            try configureCamera(deviceID: options.cameraDeviceID)
        }

        try await stream.startCapture()
        cameraSession?.startRunning()
    }

    func setPaused(_ shouldPause: Bool) {
        captureQueue.async { [weak self] in
            self?.paused = shouldPause
        }
    }

    func updateWebcamFrame(_ frame: CGRect) {
        captureQueue.async { [weak self] in
            self?.webcamFrame = frame
        }
    }

    func stop() async throws -> URL {
        if let stream {
            try await stream.stopCapture()
        }
        cameraSession?.stopRunning()

        return try await withCheckedThrowingContinuation { continuation in
            captureQueue.async { [weak self] in
                guard let self, let writer else {
                    continuation.resume(throwing: CaptureError.writerUnavailable)
                    return
                }

                videoInput?.markAsFinished()
                systemAudioInput?.markAsFinished()
                microphoneInput?.markAsFinished()

                writer.finishWriting {
                    if writer.status == .completed {
                        continuation.resume(returning: writer.outputURL)
                    } else {
                        continuation.resume(
                            throwing: writer.error ?? CaptureError.writerFailed
                        )
                    }
                }
            }
        }
    }

    private func makeCaptureConfiguration(
        target: CaptureTarget,
        content: SCShareableContent,
        options: RecordingOptions
    ) throws -> (
        filter: SCContentFilter,
        configuration: SCStreamConfiguration,
        outputSize: CGSize
    ) {
        let filter: SCContentFilter
        let sourceSize: CGSize
        let sourceRect: CGRect?

        switch target {
        case let .display(displayID):
            guard let display = content.displays.first(where: {
                $0.displayID == displayID
            }) else {
                throw CaptureError.targetUnavailable
            }
            filter = SCContentFilter(display: display, excludingWindows: [])
            sourceSize = CGSize(
                width: CGFloat(CGDisplayPixelsWide(displayID)),
                height: CGFloat(CGDisplayPixelsHigh(displayID))
            )
            sourceRect = nil

        case let .window(windowID):
            guard let window = content.windows.first(where: {
                $0.windowID == windowID
            }) else {
                throw CaptureError.targetUnavailable
            }
            filter = SCContentFilter(desktopIndependentWindow: window)
            sourceSize = CGSize(
                width: CGFloat(max(2, Int(window.frame.width * 2))),
                height: CGFloat(max(2, Int(window.frame.height * 2)))
            )
            sourceRect = nil

        case let .region(displayID, rect):
            guard let display = content.displays.first(where: {
                $0.displayID == displayID
            }) else {
                throw CaptureError.targetUnavailable
            }
            filter = SCContentFilter(display: display, excludingWindows: [])
            let scale = CGFloat(CGDisplayPixelsWide(displayID)) /
                max(display.frame.width, 1)
            sourceSize = CGSize(
                width: CGFloat(max(2, Int(rect.width * scale))),
                height: CGFloat(max(2, Int(rect.height * scale)))
            )
            sourceRect = rect
        }

        let outputSize = fitForH264(sourceSize)
        let configuration = SCStreamConfiguration()
        configuration.width = Int(outputSize.width)
        configuration.height = Int(outputSize.height)
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        configuration.queueDepth = 6
        configuration.pixelFormat = kCVPixelFormatType_32BGRA
        configuration.showsCursor = true
        configuration.capturesAudio = options.capturesSystemAudio
        configuration.sampleRate = 48_000
        configuration.channelCount = 2
        configuration.captureMicrophone = options.capturesMicrophone
        configuration.microphoneCaptureDeviceID = options.microphoneDeviceID
        if let sourceRect {
            configuration.sourceRect = sourceRect
        }

        return (filter, configuration, outputSize)
    }

    private func fitForH264(_ size: CGSize) -> CGSize {
        let maximumDimension: CGFloat = 3_840
        let scale = min(1, maximumDimension / max(size.width, size.height))
        return CGSize(
            width: max(2, floor(size.width * scale / 2) * 2),
            height: max(2, floor(size.height * scale / 2) * 2)
        )
    }

    private func prepareWriter(
        outputURL: URL,
        outputSize: CGSize,
        includesSystemAudio: Bool,
        includesMicrophone: Bool
    ) throws {
        try? FileManager.default.removeItem(at: outputURL)
        let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)

        let pixels = outputSize.width * outputSize.height
        let bitRate = min(14_000_000, max(4_000_000, Int(pixels * 2.4)))
        let videoSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: Int(outputSize.width),
            AVVideoHeightKey: Int(outputSize.height),
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: bitRate,
                AVVideoExpectedSourceFrameRateKey: 30,
                AVVideoMaxKeyFrameIntervalKey: 60,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
            ]
        ]
        let videoInput = AVAssetWriterInput(
            mediaType: .video,
            outputSettings: videoSettings
        )
        videoInput.expectsMediaDataInRealTime = true
        guard writer.canAdd(videoInput) else {
            throw CaptureError.cannotAddVideoTrack
        }
        writer.add(videoInput)

        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: videoInput,
            sourcePixelBufferAttributes: [
                kCVPixelBufferPixelFormatTypeKey as String:
                    kCVPixelFormatType_32BGRA,
                kCVPixelBufferWidthKey as String: Int(outputSize.width),
                kCVPixelBufferHeightKey as String: Int(outputSize.height),
                kCVPixelBufferIOSurfacePropertiesKey as String: [:]
            ]
        )

        if includesSystemAudio {
            systemAudioInput = addAudioInput(to: writer, channels: 2)
        }
        if includesMicrophone {
            microphoneInput = addAudioInput(to: writer, channels: 1)
        }

        guard writer.startWriting() else {
            throw writer.error ?? CaptureError.writerFailed
        }

        self.writer = writer
        self.videoInput = videoInput
        pixelBufferAdaptor = adaptor
    }

    private func addAudioInput(
        to writer: AVAssetWriter,
        channels: Int
    ) -> AVAssetWriterInput? {
        let input = AVAssetWriterInput(
            mediaType: .audio,
            outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 48_000,
                AVNumberOfChannelsKey: channels,
                AVEncoderBitRateKey: channels == 1 ? 96_000 : 160_000
            ]
        )
        input.expectsMediaDataInRealTime = true
        guard writer.canAdd(input) else {
            return nil
        }
        writer.add(input)
        return input
    }

    private func configureCamera(deviceID: String?) throws {
        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .external],
            mediaType: .video,
            position: .unspecified
        )
        guard let device = discovery.devices.first(where: {
            deviceID == nil || $0.uniqueID == deviceID
        }) else {
            throw CaptureError.cameraUnavailable
        }

        let session = AVCaptureSession()
        session.beginConfiguration()
        session.sessionPreset = .high
        let input = try AVCaptureDeviceInput(device: device)
        guard session.canAddInput(input) else {
            throw CaptureError.cameraUnavailable
        }
        session.addInput(input)

        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String:
                kCVPixelFormatType_32BGRA
        ]
        output.setSampleBufferDelegate(self, queue: cameraQueue)
        guard session.canAddOutput(output) else {
            throw CaptureError.cameraUnavailable
        }
        session.addOutput(output)
        session.commitConfiguration()
        cameraSession = session
    }

    private func appendScreenSample(_ sampleBuffer: CMSampleBuffer) {
        guard CMSampleBufferIsValid(sampleBuffer),
              let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer),
              let writer,
              let videoInput,
              let pixelBufferAdaptor else {
            return
        }

        let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        guard let adjustedTime = adjustedTime(for: presentationTime) else {
            return
        }

        if firstPresentationTime == nil {
            firstPresentationTime = presentationTime
            writer.startSession(atSourceTime: adjustedTime)
        }
        guard videoInput.isReadyForMoreMediaData,
              let pool = pixelBufferAdaptor.pixelBufferPool else {
            return
        }

        var outputBuffer: CVPixelBuffer?
        guard CVPixelBufferPoolCreatePixelBuffer(
            nil,
            pool,
            &outputBuffer
        ) == kCVReturnSuccess, let outputBuffer else {
            return
        }

        var composedImage = scaleToCanvas(CIImage(cvImageBuffer: imageBuffer))
        if includesWebcam, let cameraImage = cameraImage() {
            composedImage = compositeCamera(cameraImage, over: composedImage)
        }
        ciContext.render(
            composedImage,
            to: outputBuffer,
            bounds: CGRect(origin: .zero, size: outputSize),
            colorSpace: CGColorSpaceCreateDeviceRGB()
        )
        if !pixelBufferAdaptor.append(outputBuffer, withPresentationTime: adjustedTime) {
            report(writer.error ?? CaptureError.writerFailed)
        }
    }

    private func appendAudioSample(
        _ sampleBuffer: CMSampleBuffer,
        to input: AVAssetWriterInput?
    ) {
        guard firstPresentationTime != nil,
              let input,
              input.isReadyForMoreMediaData,
              let adjusted = adjustedSampleBuffer(sampleBuffer) else {
            return
        }
        if !input.append(adjusted) {
            report(writer?.error ?? CaptureError.writerFailed)
        }
    }

    private func adjustedTime(for time: CMTime) -> CMTime? {
        if paused {
            if pauseStartedAt == nil {
                pauseStartedAt = time
            }
            return nil
        }

        if let pauseStartedAt {
            accumulatedPauseDuration = CMTimeAdd(
                accumulatedPauseDuration,
                CMTimeSubtract(time, pauseStartedAt)
            )
            self.pauseStartedAt = nil
        }
        return CMTimeSubtract(time, accumulatedPauseDuration)
    }

    private func adjustedSampleBuffer(
        _ sampleBuffer: CMSampleBuffer
    ) -> CMSampleBuffer? {
        let time = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        guard adjustedTime(for: time) != nil else {
            return nil
        }

        var count = 0
        CMSampleBufferGetSampleTimingInfoArray(
            sampleBuffer,
            entryCount: 0,
            arrayToFill: nil,
            entriesNeededOut: &count
        )
        var timing = Array(
            repeating: CMSampleTimingInfo(
                duration: .invalid,
                presentationTimeStamp: .invalid,
                decodeTimeStamp: .invalid
            ),
            count: count
        )
        timing.withUnsafeMutableBufferPointer { buffer in
            CMSampleBufferGetSampleTimingInfoArray(
                sampleBuffer,
                entryCount: count,
                arrayToFill: buffer.baseAddress,
                entriesNeededOut: &count
            )
        }

        for index in timing.indices {
            timing[index].presentationTimeStamp = CMTimeSubtract(
                timing[index].presentationTimeStamp,
                accumulatedPauseDuration
            )
            if timing[index].decodeTimeStamp.isValid {
                timing[index].decodeTimeStamp = CMTimeSubtract(
                    timing[index].decodeTimeStamp,
                    accumulatedPauseDuration
                )
            }
        }

        var adjustedBuffer: CMSampleBuffer?
        let status = timing.withUnsafeMutableBufferPointer { buffer in
            CMSampleBufferCreateCopyWithNewTiming(
                allocator: kCFAllocatorDefault,
                sampleBuffer: sampleBuffer,
                sampleTimingEntryCount: count,
                sampleTimingArray: buffer.baseAddress,
                sampleBufferOut: &adjustedBuffer
            )
        }
        return status == noErr ? adjustedBuffer : nil
    }

    private func scaleToCanvas(_ image: CIImage) -> CIImage {
        let scaleX = outputSize.width / image.extent.width
        let scaleY = outputSize.height / image.extent.height
        return image
            .transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))
            .cropped(to: CGRect(origin: .zero, size: outputSize))
    }

    private func compositeCamera(
        _ image: CIImage,
        over background: CIImage
    ) -> CIImage {
        let frame = CGRect(
            x: webcamFrame.minX * outputSize.width,
            y: webcamFrame.minY * outputSize.height,
            width: webcamFrame.width * outputSize.width,
            height: webcamFrame.height * outputSize.height
        )
        let square = min(image.extent.width, image.extent.height)
        let crop = CGRect(
            x: image.extent.midX - square / 2,
            y: image.extent.midY - square / 2,
            width: square,
            height: square
        )
        let camera = image
            .cropped(to: crop)
            .transformed(
                by: CGAffineTransform(
                    scaleX: frame.width / square,
                    y: frame.height / square
                )
            )
            .transformed(
                by: CGAffineTransform(
                    translationX: frame.minX,
                    y: frame.minY
                )
            )
        let mask = CIFilter(
            name: "CIRoundedRectangleGenerator",
            parameters: [
                "inputExtent": CIVector(cgRect: frame),
                "inputRadius": min(frame.width, frame.height) / 2,
                "inputColor": CIColor.white
            ]
        )?.outputImage

        guard let mask else {
            return camera.composited(over: background)
        }
        return camera.applyingFilter(
            "CIBlendWithMask",
            parameters: [
                kCIInputBackgroundImageKey: background,
                kCIInputMaskImageKey: mask
            ]
        )
    }

    private func cameraImage() -> CIImage? {
        cameraLock.lock()
        defer { cameraLock.unlock() }
        return latestCameraBuffer.map(CIImage.init(cvImageBuffer:))
    }

    private func report(_ error: Error) {
        onError?(error)
    }
}

extension CaptureEngine: SCStreamOutput, SCStreamDelegate {
    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of outputType: SCStreamOutputType
    ) {
        switch outputType {
        case .screen:
            appendScreenSample(sampleBuffer)
        case .audio:
            appendAudioSample(sampleBuffer, to: systemAudioInput)
        case .microphone:
            appendAudioSample(sampleBuffer, to: microphoneInput)
        @unknown default:
            break
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        report(error)
    }
}

extension CaptureEngine: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(
        _ output: AVCaptureOutput,
        didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
            return
        }
        cameraLock.lock()
        latestCameraBuffer = imageBuffer
        cameraLock.unlock()

        let now = CFAbsoluteTimeGetCurrent()
        guard now - lastCameraPreviewTime >= 0.1 else {
            return
        }
        lastCameraPreviewTime = now
        let image = CIImage(cvImageBuffer: imageBuffer)
        if let preview = ciContext.createCGImage(image, from: image.extent) {
            onCameraFrame?(preview)
        }
    }
}

enum CaptureError: LocalizedError {
    case cameraUnavailable
    case cannotAddVideoTrack
    case targetUnavailable
    case writerFailed
    case writerUnavailable

    var errorDescription: String? {
        switch self {
        case .cameraUnavailable:
            "The selected camera is unavailable."
        case .cannotAddVideoTrack:
            "The recording encoder could not create a video track."
        case .targetUnavailable:
            "The selected screen or window is no longer available."
        case .writerFailed:
            "The recording could not be encoded."
        case .writerUnavailable:
            "The recording encoder was not started."
        }
    }
}
