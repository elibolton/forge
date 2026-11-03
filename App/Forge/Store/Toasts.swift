import Observation
import SwiftUI

/// Short-lived banners with an optional Undo, used instead of confirmation dialogs for reversible actions.
@MainActor
@Observable
final class ToastCenter {
    struct Toast: Identifiable {
        let id = UUID()
        let message: String
        let undo: (() -> Void)?
    }

    private(set) var current: Toast?

    func show(_ message: String, undo: (() -> Void)? = nil) {
        let toast = Toast(message: message, undo: undo)
        withAnimation(Motion.snappy) { current = toast }
        // The banner is easy to miss without sight; say it, and leave VoiceOver users time to find Undo.
        AccessibilityNotification.Announcement(undo == nil ? message : "\(message). Undo available.").post()
        let voiceOver = UIAccessibility.isVoiceOverRunning
        Task {
            // Undo needs time to notice and reach for; plain confirmations can go sooner.
            try? await Task.sleep(for: .seconds(undo == nil ? (voiceOver ? 5 : 3) : (voiceOver ? 15 : 7)))
            if current?.id == toast.id { withAnimation(Motion.snappy) { current = nil } }
        }
    }

    func performUndo() {
        let undo = current?.undo
        withAnimation(Motion.snappy) { current = nil }
        undo?()
    }
}

private struct ToastHost: ViewModifier {
    @Environment(ToastCenter.self) private var toasts

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let toast = toasts.current {
                HStack(spacing: 12) {
                    Text(toast.message).font(.subheadline.weight(.semibold))
                    Spacer(minLength: 8)
                    if toast.undo != nil {
                        Button("Undo") { toasts.performUndo() }
                            .font(.subheadline.bold())
                            .foregroundStyle(Theme.accent)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 14)
                .background(.regularMaterial, in: Capsule())
                .shadow(color: .black.opacity(0.4), radius: 16, y: 6)
                .padding(.horizontal)
                .transition(Motion.transition(.move(edge: .top).combined(with: .opacity)))
                .id(toast.id)
            }
        }
    }
}

extension View {
    func toastHost() -> some View { modifier(ToastHost()) }
}
