import SwiftUI
import Supabase

struct SessionsView: View {
  @StateObject private var viewModel = SessionsViewModel()
  @State private var path = NavigationPath()
  @State private var showStartSession = false
  @State private var isModOrAdmin = false

  var body: some View {
    NavigationStack(path: $path) {
      Group {
        if viewModel.isLoading {
          ProgressView("Loading sessions…")
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .padding(.top, 40)
        } else if let error = viewModel.errorMessage {
          Text(error)
            .foregroundStyle(.red)
            .padding(.top, 40)
        } else {
          ScrollView {
            LazyVStack(spacing: 14) {
              ForEach(viewModel.sessions) { session in
                NavigationLink(value: session.id) {
                  SessionCardView(session: session)
                }
                .simultaneousGesture(TapGesture().onEnded { Haptics.tap() })
              }
            }
            .padding(.horizontal)
            .padding(.bottom, 24)
          }
        }
      }
      .background(AppColors.background)
      .navigationTitle("Sessions")
      .navigationDestination(for: UUID.self) { sessionId in
        SessionDetailView(sessionId: sessionId)
      }
      .toolbar {
        if isModOrAdmin {
          ToolbarItem(placement: .navigationBarTrailing) {
            Button {
              Haptics.tap()
              showStartSession = true
            } label: {
              Label("Start", systemImage: "plus.circle.fill")
            }
          }
        }
      }
      .sheet(isPresented: $showStartSession) {
        StartSessionView { sessionId in
          showStartSession = false
          path.append(sessionId)
        }
      }
      .task {
        await viewModel.load()
        isModOrAdmin = RoleService.isModOrAdmin()
      }
    }
  }
}

private struct SessionCardView: View {
  let session: SessionSummary

  var body: some View {
    HStack(spacing: 14) {
      VStack(spacing: 4) {
        Text(session.createdAtFormattedWeekday)
          .font(.caption.weight(.bold))
          .foregroundStyle(AppColors.primary)
          .textCase(.uppercase)
        Text(session.createdAtFormattedDay)
          .font(.title3.weight(.bold))
          .foregroundStyle(.white)
        Text(session.createdAtFormattedTime)
          .font(.caption2)
          .foregroundStyle(AppColors.muted)
      }
      .frame(width: 72)
      .padding(.vertical, 4)
      .overlay(alignment: .trailing) {
        Rectangle()
          .fill(Color.white.opacity(0.08))
          .frame(width: 1)
      }

      VStack(alignment: .leading, spacing: 8) {
        HStack(spacing: 6) {
          Image(systemName: "person.3.fill")
            .foregroundStyle(AppColors.muted)
          Text("\(session.playerCount) players")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
        }

        if session.hasMatches {
          HStack(spacing: 8) {
            if session.singlesMatchCount > 0 {
              Text("Singles \(session.singlesMatchCount)")
            }
            if session.singlesMatchCount > 0 && session.doublesMatchCount > 0 {
              Circle().fill(Color.white.opacity(0.2)).frame(width: 4, height: 4)
            }
            if session.doublesMatchCount > 0 {
              Text("Doubles \(session.doublesMatchCount)")
            }
          }
          .font(.caption)
          .foregroundStyle(AppColors.muted)
          .padding(.horizontal, 10)
          .padding(.vertical, 6)
          .background(Color.white.opacity(0.05))
          .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }

        if let bestWorst = session.bestWorst {
          HStack(spacing: 8) {
            if let best = bestWorst.best {
              Label(best.label, systemImage: "star.fill")
                .labelStyle(.titleAndIcon)
                .foregroundStyle(Color.yellow)
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.white.opacity(0.05))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            if let worst = bestWorst.worst {
              Label(worst.label, systemImage: "arrow.down")
                .labelStyle(.titleAndIcon)
                .foregroundStyle(Color.red)
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.white.opacity(0.05))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
          }
        }
      }

      Spacer()

      Image(systemName: "chevron.right")
        .foregroundStyle(AppColors.muted)
    }
    .padding(14)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }
}

@MainActor
final class SessionsViewModel: ObservableObject {
  @Published var sessions: [SessionSummary] = []
  @Published var isLoading = false
  @Published var errorMessage: String?

  func load() async {
    isLoading = true
    errorMessage = nil

    do {
      let supabase = SupabaseService.shared.client

      let rows: [SessionRow] = try await supabase
        .from("sessions")
        .select("id, player_count, created_at, status, completed_at, best_player_display_name, best_player_delta, worst_player_display_name, worst_player_delta")
        .order("created_at", ascending: false)
        .limit(25)
        .execute()
        .value

      let sessionIds = rows.map { $0.id.uuidString }

      var matchCounts: [UUID: MatchCounts] = [:]
      if !sessionIds.isEmpty {
        let matches: [SessionMatchRow] = try await supabase
          .from("session_matches")
          .select("session_id, match_type")
          .in("session_id", values: sessionIds)
          .eq("status", value: "completed")
          .execute()
          .value

        matches.forEach { match in
          var counts = matchCounts[match.session_id] ?? MatchCounts()
          if match.match_type == "singles" { counts.singles += 1 }
          if match.match_type == "doubles" { counts.doubles += 1 }
          matchCounts[match.session_id] = counts
        }
      }

      sessions = rows.map { row in
        let counts = matchCounts[row.id] ?? MatchCounts()
        return SessionSummary(
          id: row.id,
          playerCount: row.player_count ?? 0,
          createdAt: row.created_at,
          status: row.status ?? "active",
          completedAt: row.completed_at,
          singlesMatchCount: counts.singles,
          doublesMatchCount: counts.doubles,
          bestWorst: SessionBestWorst(
            bestName: row.best_player_display_name,
            bestDelta: row.best_player_delta,
            worstName: row.worst_player_display_name,
            worstDelta: row.worst_player_delta
          )
        )
      }

      isLoading = false
    } catch {
      isLoading = false
      errorMessage = "Failed to load sessions."
    }
  }
}

struct SessionSummary: Identifiable, Hashable {
  let id: UUID
  let playerCount: Int
  let createdAt: Date
  let status: String
  let completedAt: Date?
  let singlesMatchCount: Int
  let doublesMatchCount: Int
  let bestWorst: SessionBestWorst?

  var hasMatches: Bool {
    singlesMatchCount > 0 || doublesMatchCount > 0
  }

  var createdAtFormattedWeekday: String {
    DateFormatter.sessionWeekday.string(from: createdAt)
  }

  var createdAtFormattedDay: String {
    DateFormatter.sessionDay.string(from: createdAt)
  }

  var createdAtFormattedTime: String {
    DateFormatter.sessionTime.string(from: createdAt)
  }
}

struct SessionBestWorst: Hashable {
  let bestName: String?
  let bestDelta: Double?
  let worstName: String?
  let worstDelta: Double?

  var best: BestWorstBadge? {
    guard let name = bestName, let delta = bestDelta else { return nil }
    return BestWorstBadge(label: "\(name) (+\(Int(delta.rounded())))")
  }

  var worst: BestWorstBadge? {
    guard let name = worstName, let delta = worstDelta else { return nil }
    return BestWorstBadge(label: "\(name) (\(Int(delta.rounded())))")
  }
}

struct BestWorstBadge: Hashable {
  let label: String
}

private struct SessionRow: Decodable {
  let id: UUID
  let player_count: Int?
  let created_at: Date
  let status: String?
  let completed_at: Date?
  let best_player_display_name: String?
  let best_player_delta: Double?
  let worst_player_display_name: String?
  let worst_player_delta: Double?
}

private struct SessionMatchRow: Decodable {
  let session_id: UUID
  let match_type: String
}

private struct MatchCounts {
  var singles: Int = 0
  var doubles: Int = 0
}

private extension DateFormatter {
  static let sessionWeekday: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = .current
    formatter.dateFormat = "EEE"
    return formatter
  }()

  static let sessionDay: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = .current
    formatter.dateFormat = "d"
    return formatter
  }()

  static let sessionTime: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = .current
    formatter.dateStyle = .short
    formatter.timeStyle = .short
    return formatter
  }()
}
