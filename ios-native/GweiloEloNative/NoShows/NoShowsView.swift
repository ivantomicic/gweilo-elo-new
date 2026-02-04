import SwiftUI
import Supabase

struct NoShowsView: View {
  @StateObject private var viewModel = NoShowsViewModel()
  @State private var section: NoShowsSection = .summary
  @State private var isAdmin = false
  @State private var showAdd = false

  var body: some View {
    NavigationStack {
      VStack(spacing: 16) {
        Picker("Section", selection: $section) {
          Text("Summary").tag(NoShowsSection.summary)
          Text("Entries").tag(NoShowsSection.entries)
        }
        .pickerStyle(.segmented)
        .padding(.horizontal)

        Group {
          if viewModel.isLoading && viewModel.isInitialLoad {
            ProgressView("Loading no-shows…")
              .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
              .padding(.top, 40)
          } else if let error = viewModel.errorMessage {
            Text(error)
              .foregroundStyle(.red)
              .padding(.top, 40)
          } else {
            if section == .summary {
              SummarySection(viewModel: viewModel)
            } else {
              EntriesSection(viewModel: viewModel)
            }
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      .background(AppColors.background)
      .navigationTitle("No-Shows")
      .toolbar {
        if isAdmin {
          ToolbarItem(placement: .navigationBarTrailing) {
            Button {
              Haptics.tap()
              showAdd = true
            } label: {
              Label("Add", systemImage: "plus.circle.fill")
            }
          }
        }
      }
      .sheet(isPresented: $showAdd) {
        AddNoShowView { didAdd in
          if didAdd {
            Task { await viewModel.load() }
          }
          showAdd = false
        }
      }
      .task {
        await viewModel.load()
        isAdmin = RoleService.isAdmin()
      }
    }
  }
}

private struct SummarySection: View {
  @ObservedObject var viewModel: NoShowsViewModel

  var body: some View {
    ScrollView {
      VStack(spacing: 16) {
        SummaryCard(title: "Worst Offender", value: viewModel.worstOffenderLabel)
        SummaryCard(title: "Total No-Shows", value: "\(viewModel.totalNoShows)")

        VStack(alignment: .leading, spacing: 12) {
          Text("Top Offenders")
            .font(.headline.weight(.semibold))
            .foregroundStyle(.white)

          if viewModel.summaryUsers.isEmpty {
            Text("No no-shows recorded.")
              .foregroundStyle(AppColors.muted)
          } else {
            ForEach(viewModel.summaryUsers) { user in
              NoShowUserRow(user: user)
            }
          }
        }
        .padding(16)
        .background(AppColors.card)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
      }
      .padding(.horizontal)
      .padding(.bottom, 24)
    }
  }
}

private struct EntriesSection: View {
  @ObservedObject var viewModel: NoShowsViewModel

  var body: some View {
    ScrollView {
      LazyVStack(spacing: 12) {
        ForEach(viewModel.entries) { entry in
          NoShowEntryCard(entry: entry)
        }

        if viewModel.hasMore {
          Button("Load more") {
            Haptics.tap()
            Task { await viewModel.loadMoreEntries() }
          }
          .buttonStyle(.bordered)
          .padding(.top, 8)
          .disabled(viewModel.isLoading)
        }
      }
      .padding(.horizontal)
      .padding(.bottom, 24)
    }
  }
}

private struct SummaryCard: View {
  let title: String
  let value: String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.caption)
        .foregroundStyle(AppColors.muted)
      Text(value)
        .font(.title2.weight(.bold))
        .foregroundStyle(.white)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(16)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }
}

private struct NoShowUserRow: View {
  let user: NoShowSummaryUser

  var body: some View {
    HStack(spacing: 12) {
      AvatarView(url: user.avatarURL, fallback: user.name)
        .frame(width: 44, height: 44)

      VStack(alignment: .leading, spacing: 4) {
        Text(user.name)
          .font(.headline)
          .foregroundStyle(.white)
        Text("Last: \(DateFormatter.noShowDate.string(from: user.lastNoShowDate))")
          .font(.caption)
          .foregroundStyle(AppColors.muted)
      }

      Spacer()

      Text("\(user.noShowCount)")
        .font(.headline.weight(.bold))
        .foregroundStyle(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.white.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
    .padding(12)
    .background(Color.white.opacity(0.03))
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
  }
}

private struct NoShowEntryCard: View {
  let entry: NoShowEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 12) {
        AvatarView(url: entry.user.avatarURL, fallback: entry.user.name)
          .frame(width: 40, height: 40)
        VStack(alignment: .leading, spacing: 4) {
          Text(entry.user.name)
            .font(.headline)
            .foregroundStyle(.white)
          Text(DateFormatter.noShowDate.string(from: entry.date))
            .font(.caption)
            .foregroundStyle(AppColors.muted)
        }
        Spacer()
      }

      if let reason = entry.reason, !reason.isEmpty {
        Text(reason)
          .font(.subheadline)
          .foregroundStyle(AppColors.muted)
      }
    }
    .padding(14)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
  }
}

enum NoShowsSection {
  case summary
  case entries
}

@MainActor
final class NoShowsViewModel: ObservableObject {
  @Published var summaryUsers: [NoShowSummaryUser] = []
  @Published var entries: [NoShowEntry] = []
  @Published var isLoading = false
  @Published var isInitialLoad = true
  @Published var errorMessage: String?
  @Published var hasMore = true

  private var currentPage = 0
  private let pageSize = 10

  var totalNoShows: Int {
    summaryUsers.reduce(0) { $0 + $1.noShowCount }
  }

  var worstOffenderLabel: String {
    guard let worst = summaryUsers.first else { return "—" }
    return "\(worst.name) (\(worst.noShowCount))"
  }

  func load() async {
    isLoading = true
    errorMessage = nil

    do {
      try await loadSummary()
      try await loadMoreEntries(reset: true)
      isInitialLoad = false
      isLoading = false
    } catch {
      isInitialLoad = false
      isLoading = false
      errorMessage = "Failed to load no-shows. \(error.localizedDescription)"
    }
  }

  func loadMoreEntries() async {
    do {
      try await loadMoreEntries(reset: false)
    } catch {
      errorMessage = "Failed to load more entries. \(error.localizedDescription)"
    }
  }

  private func loadSummary() async throws {
    let supabase = SupabaseService.shared.client

    let rows: [NoShowSummaryRow] = try await supabase
      .from("no_shows")
      .select("user_id, date")
      .order("date", ascending: false)
      .execute()
      .value

    var counts: [UUID: (count: Int, lastDate: Date)] = [:]

    rows.forEach { row in
      guard let parsedDate = DateParser.noShowDate(row.date) else { return }
      if let existing = counts[row.user_id] {
        counts[row.user_id] = (existing.count + 1, existing.lastDate)
      } else {
        counts[row.user_id] = (1, parsedDate)
      }
    }

    let userIds = counts.keys.map { $0.uuidString }
    guard !userIds.isEmpty else {
      summaryUsers = []
      return
    }

    let profiles: [ProfileRow] = try await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", values: userIds)
      .execute()
      .value

    let profileMap = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0) })

    summaryUsers = counts.compactMap { (id, value) in
      let profile = profileMap[id]
      return NoShowSummaryUser(
        id: id,
        name: profile?.display_name ?? "User",
        avatarURL: profile?.avatar_url.flatMap(URL.init(string:)),
        noShowCount: value.count,
        lastNoShowDate: value.lastDate
      )
    }
    .sorted { $0.noShowCount > $1.noShowCount }
  }

  private func loadMoreEntries(reset: Bool) async throws {
    if reset {
      currentPage = 0
      entries = []
      hasMore = true
    }

    guard hasMore else { return }

    let supabase = SupabaseService.shared.client

    let from = currentPage * pageSize
    let to = from + pageSize - 1

    let rows: [NoShowEntryRowDB] = try await supabase
      .from("no_shows")
      .select("id, user_id, date, reason, created_at")
      .order("date", ascending: false)
      .range(from: from, to: to)
      .execute()
      .value

    if rows.isEmpty {
      hasMore = false
      return
    }

    let userIds = Array(Set(rows.map { $0.user_id.uuidString }))

    let profiles: [ProfileRow] = try await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", values: userIds)
      .execute()
      .value

    let profileMap = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0) })

    let mapped: [NoShowEntry] = rows.compactMap { row in
      guard let parsedDate = DateParser.noShowDate(row.date) else { return nil }
      let profile = profileMap[row.user_id]
      return NoShowEntry(
        id: row.id,
        user: NoShowEntryUser(
          id: row.user_id,
          name: profile?.display_name ?? "User",
          avatarURL: profile?.avatar_url.flatMap(URL.init(string:))
        ),
        date: parsedDate,
        reason: row.reason
      )
    }

    entries.append(contentsOf: mapped)
    currentPage += 1
    hasMore = rows.count == pageSize
  }
}

struct NoShowSummaryUser: Identifiable {
  let id: UUID
  let name: String
  let avatarURL: URL?
  let noShowCount: Int
  let lastNoShowDate: Date
}

struct NoShowEntry: Identifiable {
  let id: UUID
  let user: NoShowEntryUser
  let date: Date
  let reason: String?
}

struct NoShowEntryUser {
  let id: UUID
  let name: String
  let avatarURL: URL?
}

private struct NoShowSummaryRow: Decodable {
  let user_id: UUID
  let date: String
}

private struct NoShowEntryRowDB: Decodable {
  let id: UUID
  let user_id: UUID
  let date: String
  let reason: String?
  let created_at: String
}

private struct ProfileRow: Decodable {
  let id: UUID
  let display_name: String?
  let avatar_url: String?
}

private extension DateFormatter {
  static let noShowDate: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = .current
    formatter.dateStyle = .medium
    return formatter
  }()
}

private enum DateParser {
  static func noShowDate(_ value: String) -> Date? {
    if let date = ISO8601DateFormatter().date(from: value) {
      return date
    }
    let formatter = DateFormatter()
    formatter.locale = .current
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.date(from: value)
  }
}

private struct AddNoShowView: View {
  let onDismiss: (Bool) -> Void

  @Environment(\.dismiss) private var dismiss
  @StateObject private var viewModel = AddNoShowViewModel()
  @State private var selectedUserId: UUID?
  @State private var date = Date()
  @State private var reason = ""
  @State private var errorMessage: String?
  @State private var isSaving = false

  var body: some View {
    NavigationStack {
      Form {
        Section("Player") {
          Picker("User", selection: $selectedUserId) {
            Text("Select").tag(UUID?.none)
            ForEach(viewModel.users) { user in
              Text(user.name).tag(Optional(user.id))
            }
          }
        }

        Section("Details") {
          DatePicker("Date", selection: $date, displayedComponents: .date)
          TextField("Reason", text: $reason)
        }

        if let errorMessage {
          Text(errorMessage).foregroundStyle(.red)
        }
      }
      .navigationTitle("Add No-Show")
      .toolbar {
        ToolbarItem(placement: .navigationBarLeading) {
          Button("Cancel") { onDismiss(false) }
        }
        ToolbarItem(placement: .navigationBarTrailing) {
          Button("Save") {
            Haptics.tap()
            Task { await save() }
          }
          .disabled(selectedUserId == nil || isSaving)
        }
      }
      .task {
        await viewModel.loadUsers()
      }
    }
  }

  private func save() async {
    guard let userId = selectedUserId else { return }
    errorMessage = nil
    isSaving = true
    defer { isSaving = false }

    do {
      try await viewModel.addNoShow(userId: userId, date: date, reason: reason)
      onDismiss(true)
    } catch {
      errorMessage = "Failed to add no-show."
    }
  }
}

@MainActor
final class AddNoShowViewModel: ObservableObject {
  @Published var users: [AddNoShowUser] = []

  func loadUsers() async {
    do {
      let supabase = SupabaseService.shared.client
      let rows: [ProfileRow] = try await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .order("display_name", ascending: true)
        .execute()
        .value

      users = rows.map { row in
        AddNoShowUser(id: row.id, name: row.display_name ?? "User")
      }
    } catch {
      users = []
    }
  }

  func addNoShow(userId: UUID, date: Date, reason: String) async throws {
    let supabase = SupabaseService.shared.client
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    let dateString = formatter.string(from: date)

    _ = try await supabase
      .from("no_shows")
      .insert([
        "user_id": userId.uuidString,
        "date": dateString,
        "reason": reason.isEmpty ? nil : reason
      ])
      .execute()
  }
}

struct AddNoShowUser: Identifiable {
  let id: UUID
  let name: String
}
