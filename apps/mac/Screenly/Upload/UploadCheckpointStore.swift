import Foundation

struct UploadCheckpoint: Codable, Sendable {
    let fileURL: URL
    let serverURL: URL
    let workspaceID: String?
    let initiation: InitiateUploadResponse
    var completedParts: [CompletedUploadPart]
    var uploadedBytes: Int
}

actor UploadCheckpointStore {
    private let directoryURL: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(fileManager: FileManager = .default) {
        let applicationSupport = fileManager.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first!
        directoryURL = applicationSupport
            .appending(path: "Screenly", directoryHint: .isDirectory)
            .appending(path: "Uploads", directoryHint: .isDirectory)
        try? fileManager.createDirectory(
            at: directoryURL,
            withIntermediateDirectories: true
        )
    }

    func checkpoint(
        for fileURL: URL,
        serverURL: URL,
        workspaceID: String?
    ) -> UploadCheckpoint? {
        all().first {
            $0.fileURL == fileURL &&
                $0.serverURL == serverURL &&
                ($0.workspaceID == nil || $0.workspaceID == workspaceID)
        }
    }

    func all() -> [UploadCheckpoint] {
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: directoryURL,
            includingPropertiesForKeys: nil
        ) else {
            return []
        }

        return files.compactMap { file in
            guard file.pathExtension == "json",
                  let data = try? Data(contentsOf: file) else {
                return nil
            }
            return try? decoder.decode(UploadCheckpoint.self, from: data)
        }
    }

    func save(_ checkpoint: UploadCheckpoint) throws {
        let data = try encoder.encode(checkpoint)
        try data.write(
            to: fileURL(for: checkpoint.initiation.videoID),
            options: .atomic
        )
    }

    func remove(videoID: UUID) {
        try? FileManager.default.removeItem(at: fileURL(for: videoID))
    }

    private func fileURL(for videoID: UUID) -> URL {
        directoryURL.appending(path: "\(videoID.uuidString).json")
    }
}
