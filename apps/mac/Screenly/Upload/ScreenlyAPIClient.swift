import Foundation
import UniformTypeIdentifiers

struct ScreenlyAPIClient: Sendable {
    let baseURL: URL
    let token: String
    private let session: URLSession

    init(baseURL: URL, token: String, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.token = token
        self.session = session
    }

    func initiate(
        fileURL: URL,
        recorderName: String
    ) async throws -> InitiateUploadResponse {
        let values = try fileURL.resourceValues(
            forKeys: [.fileSizeKey, .contentTypeKey]
        )
        guard let fileSize = values.fileSize else {
            throw UploadError.cannotReadRecording
        }

        let body = InitiateUploadRequest(
            fileName: fileURL.lastPathComponent,
            contentType: values.contentType?.preferredMIMEType ?? "video/mp4",
            sizeBytes: fileSize,
            title: "Screen recording",
            recorderName: recorderName
        )
        return try await send(
            path: "api/uploads",
            method: "POST",
            body: body,
            response: InitiateUploadResponse.self
        )
    }

    func signParts(
        videoID: UUID,
        partNumbers: [Int]
    ) async throws -> [SignedUploadPart] {
        let response: SignPartsResponse = try await send(
            path: "api/uploads/\(videoID.uuidString)/parts",
            method: "POST",
            body: SignPartsRequest(partNumbers: partNumbers),
            response: SignPartsResponse.self
        )
        return response.parts
    }

    func complete(
        videoID: UUID,
        parts: [CompletedUploadPart]
    ) async throws {
        let _: CompleteUploadResponse = try await send(
            path: "api/uploads/\(videoID.uuidString)/complete",
            method: "POST",
            body: CompleteUploadRequest(parts: parts),
            response: CompleteUploadResponse.self
        )
    }

    func discard(videoID: UUID) async throws {
        var request = authorizedRequest(
            path: "api/uploads/\(videoID.uuidString)"
        )
        request.httpMethod = "DELETE"
        let (_, response) = try await session.data(for: request)
        try validate(response)
    }

    private func send<Body: Encodable, Response: Decodable>(
        path: String,
        method: String,
        body: Body,
        response: Response.Type
    ) async throws -> Response {
        var request = authorizedRequest(path: path)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, urlResponse) = try await session.data(for: request)
        try validate(urlResponse, data: data)
        return try JSONDecoder().decode(Response.self, from: data)
    }

    private func authorizedRequest(path: String) -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 60
        return request
    }

    private func validate(_ response: URLResponse, data: Data = Data()) throws {
        guard let response = response as? HTTPURLResponse else {
            throw UploadError.invalidResponse
        }
        guard 200 ..< 300 ~= response.statusCode else {
            let message = (try? JSONDecoder().decode(
                APIErrorEnvelope.self,
                from: data
            ))?.error.message
            throw UploadError.server(
                status: response.statusCode,
                message: message ?? HTTPURLResponse.localizedString(
                    forStatusCode: response.statusCode
                )
            )
        }
    }
}

private struct InitiateUploadRequest: Encodable {
    let fileName: String
    let contentType: String
    let sizeBytes: Int
    let title: String
    let recorderName: String
}

struct InitiateUploadResponse: Codable, Sendable {
    let videoID: UUID
    let slug: String
    let shareURL: URL
    let uploadID: String
    let partSizeBytes: Int
    let partCount: Int

    enum CodingKeys: String, CodingKey {
        case videoID = "videoId"
        case slug
        case shareURL = "shareUrl"
        case uploadID = "uploadId"
        case partSizeBytes
        case partCount
    }
}

private struct SignPartsRequest: Encodable {
    let partNumbers: [Int]
}

private struct SignPartsResponse: Decodable {
    let parts: [SignedUploadPart]
}

struct SignedUploadPart: Decodable, Sendable {
    let partNumber: Int
    let url: URL
}

struct CompletedUploadPart: Codable, Sendable {
    let partNumber: Int
    let etag: String
}

private struct CompleteUploadRequest: Encodable {
    let parts: [CompletedUploadPart]
}

private struct CompleteUploadResponse: Decodable {
    let videoID: UUID
    let slug: String
    let status: String

    enum CodingKeys: String, CodingKey {
        case videoID = "videoId"
        case slug
        case status
    }
}

private struct APIErrorEnvelope: Decodable {
    let error: APIErrorBody
}

private struct APIErrorBody: Decodable {
    let message: String
}

enum UploadError: LocalizedError {
    case cannotReadRecording
    case invalidPartResponse
    case invalidResponse
    case server(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .cannotReadRecording:
            "The recording file could not be read."
        case .invalidPartResponse:
            "Object storage did not accept an upload part."
        case .invalidResponse:
            "The server returned an invalid response."
        case let .server(status, message):
            "Upload failed (\(status)): \(message)"
        }
    }
}
