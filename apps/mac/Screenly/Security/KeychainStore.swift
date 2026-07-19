import Foundation
import Security

enum KeychainStore {
    private static let service = "com.screenly.recorder"

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
        let lookup: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ]
        let attributes: [CFString: Any] = [
            kSecValueData: Data(value.utf8),
            kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlock
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
}

struct KeychainError: LocalizedError {
    let status: OSStatus

    var errorDescription: String? {
        SecCopyErrorMessageString(status, nil) as String? ??
            "Keychain operation failed (\(status))."
    }
}
