import Foundation
import Security

enum KeychainStore {
    // The first recorder releases were ad-hoc signed without a stable
    // designated requirement. Using a new service avoids prompting for access
    // to credentials whose ACL belongs to the old build identity.
    private static let service = "com.screenly.recorder.session.v2"

    static func string(for account: String) -> String {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne
        ]

        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return ""
        }

        return value
    }

    static func set(_ value: String, for account: String) throws {
        if value.isEmpty {
            try remove(account)
            return
        }

        let lookup: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ]
        let attributes: [CFString: Any] = [
            kSecValueData: Data(value.utf8),
            kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]

        let status: OSStatus
        if SecItemCopyMatching(lookup as CFDictionary, nil) == errSecSuccess {
            status = SecItemUpdate(
                lookup as CFDictionary,
                attributes as CFDictionary
            )
        } else {
            status = SecItemAdd(
                lookup.merging(attributes) { _, new in new } as CFDictionary,
                nil
            )
        }

        guard status == errSecSuccess else {
            throw KeychainError(status: status)
        }
    }

    static func remove(_ account: String) throws {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError(status: status)
        }
    }
}

struct KeychainError: LocalizedError {
    let status: OSStatus

    var errorDescription: String? {
        SecCopyErrorMessageString(status, nil) as String? ??
            "Keychain operation failed (\(status))."
    }
}
