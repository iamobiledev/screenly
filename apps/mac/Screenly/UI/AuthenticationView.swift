import SwiftUI

struct AuthenticationView: View {
    @ObservedObject var appModel: AppModel

    @State private var username = ""
    @State private var password = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if appModel.settings.isAuthenticated {
                signedInContent
            } else if appModel.isAuthenticating &&
                        appModel.settings.hasStoredSession {
                HStack {
                    ProgressView()
                        .controlSize(.small)
                    Text("Validating saved sign-in…")
                        .foregroundStyle(.secondary)
                }
            } else {
                signInContent
            }

            if let error = appModel.authenticationError {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var signInContent: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("Username", text: $username)
                .textFieldStyle(.roundedBorder)
                .textContentType(.username)
                .disabled(appModel.isAuthenticating)
            SecureField("Password", text: $password)
                .textFieldStyle(.roundedBorder)
                .textContentType(.password)
                .disabled(appModel.isAuthenticating)
                .onSubmit(signIn)
            HStack {
                Text("Your password is used only to sign in and is never saved.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button(action: signIn) {
                    if appModel.isAuthenticating {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text("Sign in")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(
                    appModel.isAuthenticating ||
                        username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                        password.isEmpty
                )
            }
        }
    }

    private var signedInContent: some View {
        VStack(alignment: .leading, spacing: 10) {
            LabeledContent("Signed in as") {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(appModel.settings.username)
                        .fontWeight(.medium)
                    Text(appModel.settings.email)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if appModel.settings.availableWorkspaces.count > 1 {
                Picker("Workspace", selection: workspaceSelection) {
                    ForEach(appModel.settings.availableWorkspaces) { workspace in
                        Text(workspace.name).tag(workspace.id)
                    }
                }
                .disabled(
                    appModel.isAuthenticating ||
                        !appModel.canChangeAuthentication
                )
            } else {
                LabeledContent(
                    "Workspace",
                    value: appModel.settings.activeWorkspaceName ?? "Unavailable"
                )
            }

            HStack {
                if appModel.isAuthenticating {
                    ProgressView()
                        .controlSize(.small)
                    Text("Updating account…")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Sign out", role: .destructive) {
                    Task {
                        await appModel.signOut()
                    }
                }
                .disabled(
                    appModel.isAuthenticating ||
                        !appModel.canChangeAuthentication
                )
            }
        }
    }

    private var workspaceSelection: Binding<String> {
        Binding(
            get: { appModel.settings.activeWorkspaceID ?? "" },
            set: { workspaceID in
                Task {
                    await appModel.switchWorkspace(to: workspaceID)
                }
            }
        )
    }

    private func signIn() {
        let submittedPassword = password
        password = ""
        Task {
            await appModel.login(
                username: username,
                password: submittedPassword
            )
        }
    }
}
