import Foundation

struct AuthService: Sendable {
    private let baseURL: URL
    private let session: URLSession

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func login(
        username: String,
        password: String,
        deviceName: String
    ) async throws -> DeviceLoginResponse {
        try await send(
            path: "api/auth/device/session",
            method: "POST",
            body: LoginRequest(
                username: username,
                password: password,
                deviceName: deviceName
            ),
            sessionToken: nil,
            response: DeviceLoginResponse.self
        )
    }

    func validateSession(_ sessionToken: String) async throws -> DeviceSessionResponse {
        try await send(
            path: "api/auth/device/session",
            method: "GET",
            body: nil as EmptyRequest?,
            sessionToken: sessionToken,
            response: DeviceSessionResponse.self
        )
    }

    func logout(sessionToken: String) async throws {
        var request = request(
            path: "api/auth/device/session",
            method: "DELETE",
            sessionToken: sessionToken
        )
        request.httpBody = nil
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else {
            throw AuthError.invalidResponse
        }
        guard response.statusCode == 204 || response.statusCode == 401 else {
            throw serverError(response: response, data: data)
        }
    }

    func switchWorkspace(
        sessionToken: String,
        workspaceID: String,
        deviceName: String
    ) async throws -> WorkspaceSwitchResponse {
        try await send(
            path: "api/auth/device/workspace",
            method: "POST",
            body: WorkspaceSwitchRequest(
                workspaceId: workspaceID,
                deviceName: deviceName
            ),
            sessionToken: sessionToken,
            response: WorkspaceSwitchResponse.self
        )
    }

    private func send<Body: Encodable, Response: Decodable>(
        path: String,
        method: String,
        body: Body?,
        sessionToken: String?,
        response: Response.Type
    ) async throws -> Response {
        var request = request(
            path: path,
            method: method,
            sessionToken: sessionToken
        )
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }

        let (data, urlResponse) = try await session.data(for: request)
        guard let urlResponse = urlResponse as? HTTPURLResponse else {
            throw AuthError.invalidResponse
        }
        guard 200 ..< 300 ~= urlResponse.statusCode else {
            throw serverError(response: urlResponse, data: data)
        }

        do {
            return try AuthJSON.decoder().decode(Response.self, from: data)
        } catch {
            throw AuthError.invalidResponse
        }
    }

    private func request(
        path: String,
        method: String,
        sessionToken: String?
    ) -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.timeoutInterval = 30
        if let sessionToken {
            request.setValue(
                "Bearer \(sessionToken)",
                forHTTPHeaderField: "Authorization"
            )
        }
        return request
    }

    private func serverError(
        response: HTTPURLResponse,
        data: Data
    ) -> AuthError {
        let envelope = try? JSONDecoder().decode(AuthErrorEnvelope.self, from: data)
        if response.statusCode == 401 {
            return .unauthorized(
                envelope?.error.message ?? "Your sign-in is no longer valid."
            )
        }
        return .server(
            status: response.statusCode,
            message: envelope?.error.message ?? HTTPURLResponse.localizedString(
                forStatusCode: response.statusCode
            )
        )
    }
}

private struct LoginRequest: Encodable {
    let username: String
    let password: String
    let deviceName: String
}

private struct WorkspaceSwitchRequest: Encodable {
    let workspaceId: String
    let deviceName: String
}

private struct EmptyRequest: Encodable {}

private struct AuthErrorEnvelope: Decodable {
    let error: AuthErrorBody
}

private struct AuthErrorBody: Decodable {
    let message: String
}

private enum AuthJSON {
    static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [
                .withInternetDateTime,
                .withFractionalSeconds
            ]
            if let date = formatter.date(from: value) {
                return date
            }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: value) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Expected an ISO-8601 date."
            )
        }
        return decoder
    }
}

enum AuthError: LocalizedError, Sendable {
    case invalidConfiguration
    case invalidResponse
    case missingCredentials
    case noWorkspace
    case unauthorized(String)
    case server(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidConfiguration:
            "Enter a valid HTTPS server URL (or localhost for development)."
        case .invalidResponse:
            "The server returned an invalid authentication response."
        case .missingCredentials:
            "Enter both your username and password."
        case .noWorkspace:
            "Your account does not have an available workspace."
        case let .unauthorized(message):
            message
        case let .server(status, message):
            "Sign-in failed (\(status)): \(message)"
        }
    }
}
