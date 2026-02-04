import SwiftUI

enum AppColors {
  static let background = Color(red: 10/255, green: 10/255, blue: 10/255)
  static let card = Color(red: 26/255, green: 27/255, blue: 35/255)
  static let primary = Color(red: 59/255, green: 130/255, blue: 246/255)
  static let muted = Color.white.opacity(0.65)
  static let fieldBorder = Color.white.opacity(0.18)
  static let glow = Color(red: 239/255, green: 68/255, blue: 68/255)
}

struct AuthFieldStyle: ViewModifier {
  func body(content: Content) -> some View {
    content
      .padding(.horizontal, 14)
      .padding(.vertical, 12)
      .background(AppColors.card)
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(AppColors.fieldBorder, lineWidth: 1)
      )
      .foregroundStyle(Color.white)
  }
}

extension View {
  func authField() -> some View {
    modifier(AuthFieldStyle())
  }
}
