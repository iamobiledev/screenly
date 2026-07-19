import Carbon
import Foundation

private let screenlyHotkeySignature: OSType = 0x5343_524E // "SCRN"
private let screenlyHotkeyIdentifier: UInt32 = 1

@MainActor
final class GlobalHotkey {
    private var hotKeyReference: EventHotKeyRef?
    private var eventHandlerReference: EventHandlerRef?
    private var onPressed: (() -> Void)?

    func register(
        _ choice: HotkeyChoice,
        onPressed: @escaping () -> Void
    ) {
        unregister()
        self.onPressed = onPressed

        var eventType = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )

        InstallEventHandler(
            GetApplicationEventTarget(),
            { _, event, userData in
                guard let event, let userData else {
                    return OSStatus(eventNotHandledErr)
                }

                var hotKeyID = EventHotKeyID(signature: 0, id: 0)
                let status = GetEventParameter(
                    event,
                    EventParamName(kEventParamDirectObject),
                    EventParamType(typeEventHotKeyID),
                    nil,
                    MemoryLayout<EventHotKeyID>.size,
                    nil,
                    &hotKeyID
                )
                guard status == noErr else {
                    return status
                }

                let owner = Unmanaged<GlobalHotkey>
                    .fromOpaque(userData)
                    .takeUnretainedValue()
                guard hotKeyID.signature == screenlyHotkeySignature,
                      hotKeyID.id == screenlyHotkeyIdentifier else {
                    return OSStatus(eventNotHandledErr)
                }

                Task { @MainActor in
                    owner.onPressed?()
                }
                return noErr
            },
            1,
            &eventType,
            Unmanaged.passUnretained(self).toOpaque(),
            &eventHandlerReference
        )

        let hotKeyID = EventHotKeyID(
            signature: screenlyHotkeySignature,
            id: screenlyHotkeyIdentifier
        )
        RegisterEventHotKey(
            choice.keyCode,
            choice.modifiers,
            hotKeyID,
            GetApplicationEventTarget(),
            0,
            &hotKeyReference
        )
    }

    func unregister() {
        if let hotKeyReference {
            UnregisterEventHotKey(hotKeyReference)
            self.hotKeyReference = nil
        }
        if let eventHandlerReference {
            RemoveEventHandler(eventHandlerReference)
            self.eventHandlerReference = nil
        }
        onPressed = nil
    }

}

enum HotkeyChoice: String, CaseIterable, Identifiable {
    case optionShiftR
    case commandShiftR
    case controlShiftR

    var id: Self { self }

    var label: String {
        switch self {
        case .optionShiftR: "⌥⇧R"
        case .commandShiftR: "⌘⇧R"
        case .controlShiftR: "⌃⇧R"
        }
    }

    var keyCode: UInt32 {
        UInt32(kVK_ANSI_R)
    }

    var modifiers: UInt32 {
        switch self {
        case .optionShiftR:
            UInt32(optionKey | shiftKey)
        case .commandShiftR:
            UInt32(cmdKey | shiftKey)
        case .controlShiftR:
            UInt32(controlKey | shiftKey)
        }
    }
}
