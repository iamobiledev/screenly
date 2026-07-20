import Foundation

struct AuthUser: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let username: String
    let email: String
}

struct AuthWorkspace: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let name: String
    let slug: String
    let role: String
}

struct RecorderToken: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let name: String
    let tokenPrefix: String
    let createdAt: Date
    let token: String
}

struct DeviceLoginResponse: Codable, Sendable {
    let sessionToken: String
    let sessionExpiresAt: Date
    let user: AuthUser
    let workspaces: [AuthWorkspace]
    let activeWorkspace: AuthWorkspace
    let recorderToken: RecorderToken
}

struct DeviceSessionResponse: Codable, Sendable {
    let user: AuthUser
    let workspaces: [AuthWorkspace]
    let sessionExpiresAt: Date
}

struct WorkspaceSwitchResponse: Codable, Sendable {
    let activeWorkspace: AuthWorkspace
    let recorderToken: RecorderToken
}
