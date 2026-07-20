import Foundation

actor MultipartUploader {
    private let session: URLSession
    private let checkpointStore: UploadCheckpointStore
    private let maximumAttempts = 4
    private let signedPartBatchSize = 20

    init(
        session: URLSession = .shared,
        checkpointStore: UploadCheckpointStore = UploadCheckpointStore()
    ) {
        self.session = session
        self.checkpointStore = checkpointStore
    }

    func upload(
        fileURL: URL,
        client: ScreenlyAPIClient,
        recorderName: String,
        onInitiated: @escaping @Sendable (UploadReceipt) -> Void,
        onProgress: @escaping @Sendable (Double) -> Void
    ) async throws -> UploadReceipt {
        var checkpoint: UploadCheckpoint
        if let existing = await checkpointStore.checkpoint(
            for: fileURL,
            serverURL: client.baseURL,
            workspaceID: client.workspaceID
        ) {
            checkpoint = existing
        } else {
            let initiation = try await withRetry {
                try await client.initiate(
                    fileURL: fileURL,
                    recorderName: recorderName
                )
            }
            checkpoint = UploadCheckpoint(
                fileURL: fileURL,
                serverURL: client.baseURL,
                workspaceID: client.workspaceID,
                initiation: initiation,
                completedParts: [],
                uploadedBytes: 0
            )
            try await checkpointStore.save(checkpoint)
        }
        let initiation = checkpoint.initiation
        let receipt = UploadReceipt(
            videoID: initiation.videoID,
            slug: initiation.slug,
            shareURL: initiation.shareURL
        )
        onInitiated(receipt)

        let handle = try FileHandle(forReadingFrom: fileURL)
        defer { try? handle.close() }

        var completedParts = checkpoint.completedParts
        var uploadedBytes = checkpoint.uploadedBytes
        let fileSize = try fileURL.resourceValues(
            forKeys: [.fileSizeKey]
        ).fileSize ?? 0
        try handle.seek(toOffset: UInt64(uploadedBytes))

        for batchStart in stride(
            from: completedParts.count + 1,
            through: initiation.partCount,
            by: signedPartBatchSize
        ) {
            try Task.checkCancellation()
            let batchEnd = min(
                initiation.partCount,
                batchStart + signedPartBatchSize - 1
            )
            let partNumbers = Array(batchStart ... batchEnd)
            let signedParts = try await withRetry {
                try await client.signParts(
                    videoID: initiation.videoID,
                    partNumbers: partNumbers
                )
            }
            let signedByNumber = Dictionary(
                uniqueKeysWithValues: signedParts.map {
                    ($0.partNumber, $0.url)
                }
            )

            for partNumber in partNumbers {
                try Task.checkCancellation()
                guard let signedURL = signedByNumber[partNumber],
                      let data = try handle.read(
                        upToCount: initiation.partSizeBytes
                      ),
                      !data.isEmpty else {
                    throw UploadError.invalidPartResponse
                }

                let etag = try await withRetry {
                    try await uploadPart(data, to: signedURL)
                }
                completedParts.append(
                    CompletedUploadPart(
                        partNumber: partNumber,
                        etag: etag
                    )
                )
                uploadedBytes += data.count
                checkpoint.completedParts = completedParts
                checkpoint.uploadedBytes = uploadedBytes
                try await checkpointStore.save(checkpoint)
                onProgress(
                    fileSize > 0
                        ? min(1, Double(uploadedBytes) / Double(fileSize))
                        : 0
                )
            }
        }

        try await withRetry {
            try await client.complete(
                videoID: initiation.videoID,
                parts: completedParts
            )
        }
        await checkpointStore.remove(videoID: initiation.videoID)
        onProgress(1)
        return receipt
    }

    func pendingFiles(for client: ScreenlyAPIClient) async -> [URL] {
        await checkpointStore.all()
            .filter {
                $0.serverURL == client.baseURL &&
                    ($0.workspaceID == nil || $0.workspaceID == client.workspaceID)
            }
            .map(\.fileURL)
            .filter { FileManager.default.fileExists(atPath: $0.path) }
    }

    func discard(fileURL: URL, client: ScreenlyAPIClient) async {
        guard let checkpoint = await checkpointStore.checkpoint(
            for: fileURL,
            serverURL: client.baseURL,
            workspaceID: client.workspaceID
        ) else {
            return
        }
        try? await client.discard(videoID: checkpoint.initiation.videoID)
        await checkpointStore.remove(videoID: checkpoint.initiation.videoID)
    }

    private func uploadPart(_ data: Data, to url: URL) async throws -> String {
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.timeoutInterval = 10 * 60
        let (_, response) = try await session.upload(
            for: request,
            from: data
        )
        guard let response = response as? HTTPURLResponse,
              200 ..< 300 ~= response.statusCode,
              let etag = response.value(forHTTPHeaderField: "ETag") else {
            throw UploadError.invalidPartResponse
        }
        return etag
    }

    private func withRetry<Value: Sendable>(
        operation: () async throws -> Value
    ) async throws -> Value {
        var lastError: Error?

        for attempt in 1 ... maximumAttempts {
            do {
                return try await operation()
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                lastError = error
                guard attempt < maximumAttempts else {
                    break
                }
                let delay = UInt64(1 << (attempt - 1)) * 1_000_000_000
                try await Task.sleep(nanoseconds: delay)
            }
        }

        throw lastError ?? UploadError.invalidResponse
    }
}
