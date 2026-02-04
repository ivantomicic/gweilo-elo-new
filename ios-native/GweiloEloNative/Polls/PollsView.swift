import SwiftUI
import Supabase

struct PollsView: View {
  @StateObject private var viewModel = PollsViewModel()
  @State private var filter: PollFilter = .active
  @State private var isAdmin = false
  @State private var showCreate = false

  var body: some View {
    NavigationStack {
      VStack(spacing: 16) {
        Picker("Filter", selection: $filter) {
          Text("Active").tag(PollFilter.active)
          Text("Completed").tag(PollFilter.completed)
          Text("All").tag(PollFilter.all)
        }
        .pickerStyle(.segmented)
        .padding(.horizontal)

        Group {
          if viewModel.isLoading {
            ProgressView("Loading polls…")
              .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
              .padding(.top, 40)
          } else if let error = viewModel.errorMessage {
            Text(error)
              .foregroundStyle(.red)
              .padding(.top, 40)
          } else if viewModel.filteredPolls(filter).isEmpty {
            Text("No polls yet.")
              .foregroundStyle(AppColors.muted)
              .padding(.top, 40)
          } else {
            ScrollView {
              LazyVStack(spacing: 16) {
                ForEach(viewModel.filteredPolls(filter)) { poll in
                  PollCardView(poll: poll) { optionId in
                    Task { await viewModel.submitAnswer(pollId: poll.id, optionId: optionId) }
                  }
                }
              }
              .padding(.horizontal)
              .padding(.bottom, 24)
            }
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      .background(AppColors.background)
      .navigationTitle("Polls")
      .toolbar {
        if isAdmin {
          ToolbarItem(placement: .navigationBarTrailing) {
            Button {
              Haptics.tap()
              showCreate = true
            } label: {
              Label("Add", systemImage: "plus.circle.fill")
            }
          }
        }
      }
      .sheet(isPresented: $showCreate) {
        CreatePollView { didCreate in
          if didCreate { Task { await viewModel.load() } }
          showCreate = false
        }
      }
      .task {
        await viewModel.load()
        isAdmin = RoleService.isAdmin()
      }
    }
  }
}

private struct PollCardView: View {
  let poll: PollItem
  let onSelect: (UUID) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text(poll.question)
          .font(.headline.weight(.semibold))
          .foregroundStyle(.white)
        Spacer()
        if poll.isActive {
          StatusPill(label: "Active", color: AppColors.primary)
        } else {
          StatusPill(label: "Closed", color: Color.gray)
        }
      }

      if let description = poll.description {
        Text(description)
          .font(.subheadline)
          .foregroundStyle(AppColors.muted)
      }

      VStack(spacing: 10) {
        ForEach(poll.options) { option in
          PollOptionRow(
            option: option,
            totalAnswers: poll.totalAnswers,
            isSelected: poll.userSelectedOptionId == option.id,
            isLocked: poll.hasUserAnswered || !poll.isActive
          ) {
            onSelect(option.id)
          }
        }
      }

      HStack {
        Text("\(poll.totalAnswers) votes")
          .font(.caption)
          .foregroundStyle(AppColors.muted)
        Spacer()
        if let endDate = poll.endDate {
          Text("Ends \(DateFormatter.pollEnd.string(from: endDate))")
            .font(.caption)
            .foregroundStyle(AppColors.muted)
        }
      }
    }
    .padding(16)
    .background(AppColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }
}

private struct PollOptionRow: View {
  let option: PollOptionItem
  let totalAnswers: Int
  let isSelected: Bool
  let isLocked: Bool
  let onTap: () -> Void

  var body: some View {
    Button(action: {
      Haptics.tap()
      onTap()
    }) {
      ZStack(alignment: .leading) {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .fill(Color.white.opacity(0.05))

        GeometryReader { geo in
          let width = geo.size.width * progress
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(AppColors.primary.opacity(isSelected ? 0.5 : 0.25))
            .frame(width: width)
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

        HStack {
          Text(option.text)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
          Spacer()
          Text("\(option.answerCount)")
            .font(.caption)
            .foregroundStyle(AppColors.muted)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
      }
      .frame(height: 44)
    }
    .buttonStyle(.plain)
    .disabled(isLocked)
    .opacity(isLocked && !isSelected ? 0.7 : 1.0)
  }

  private var progress: CGFloat {
    guard totalAnswers > 0 else { return 0 }
    return CGFloat(option.answerCount) / CGFloat(totalAnswers)
  }
}

private struct StatusPill: View {
  let label: String
  let color: Color

  var body: some View {
    Text(label)
      .font(.caption.weight(.bold))
      .foregroundStyle(color)
      .padding(.horizontal, 8)
      .padding(.vertical, 4)
      .background(Color.white.opacity(0.06))
      .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
  }
}

enum PollFilter {
  case active
  case completed
  case all
}

private struct CreatePollView: View {
  let onDismiss: (Bool) -> Void

  @State private var question = ""
  @State private var description = ""
  @State private var options: [String] = ["", ""]
  @State private var includeEndDate = false
  @State private var endDate = Date()
  @State private var errorMessage: String?
  @State private var isSaving = false

  var body: some View {
    NavigationStack {
      Form {
        Section("Question") {
          TextField("Question", text: $question)
          TextField("Description (optional)", text: $description)
        }

        Section("Options") {
          ForEach(options.indices, id: \ .self) { index in
            TextField("Option \(index + 1)", text: $options[index])
          }
          Button("Add option") {
            Haptics.tap()
            options.append("")
          }
        }

        Section("End Date") {
          Toggle("Set end date", isOn: $includeEndDate)
          if includeEndDate {
            DatePicker("End", selection: $endDate, displayedComponents: [.date, .hourAndMinute])
          }
        }

        if let errorMessage {
          Text(errorMessage).foregroundStyle(.red)
        }
      }
      .navigationTitle("New Poll")
      .toolbar {
        ToolbarItem(placement: .navigationBarLeading) {
          Button("Cancel") { onDismiss(false) }
        }
        ToolbarItem(placement: .navigationBarTrailing) {
          Button("Create") {
            Haptics.tap()
            Task { await create() }
          }
          .disabled(isSaving)
        }
      }
    }
  }

  private func create() async {
    errorMessage = nil
    isSaving = true
    defer { isSaving = false }

    let trimmedOptions = options.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    guard !question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      errorMessage = "Question is required"
      return
    }
    guard trimmedOptions.count >= 2 else {
      errorMessage = "At least 2 options required"
      return
    }

    do {
      let supabase = SupabaseService.shared.client
      guard let userId = supabase.auth.currentSession?.user.id else {
        errorMessage = "Not authenticated"
        return
      }

      let insert = PollInsert(
        question: question,
        description: description.isEmpty ? nil : description,
        end_date: includeEndDate ? ISO8601DateFormatter().string(from: endDate) : nil,
        created_by: userId.uuidString
      )

      let poll: [PollRow] = try await supabase
        .from("polls")
        .insert(insert)
        .select("id, question, description, end_date, created_at, created_by")
        .execute()
        .value

      guard let pollId = poll.first?.id else {
        errorMessage = "Failed to create poll"
        return
      }

      let optionsPayload = trimmedOptions.enumerated().map { index, text in
        PollOptionInsert(poll_id: pollId.uuidString, option_text: text, display_order: index)
      }

      _ = try await supabase
        .from("poll_options")
        .insert(optionsPayload)
        .execute()

      onDismiss(true)
    } catch {
      errorMessage = "Failed to create poll"
    }
  }
}

@MainActor
final class PollsViewModel: ObservableObject {
  @Published var polls: [PollItem] = []
  @Published var isLoading = false
  @Published var errorMessage: String?

  func load() async {
    isLoading = true
    errorMessage = nil

    do {
      let supabase = SupabaseService.shared.client

      let pollsRows: [PollRow] = try await supabase
        .from("polls")
        .select("id, question, description, end_date, created_at, created_by")
        .order("created_at", ascending: false)
        .execute()
        .value

      if pollsRows.isEmpty {
        polls = []
        isLoading = false
        return
      }

      let pollIds = pollsRows.map { $0.id.uuidString }

      let optionsRows: [PollOptionRowDB] = try await supabase
        .from("poll_options")
        .select("id, poll_id, option_text, display_order")
        .in("poll_id", values: pollIds)
        .order("poll_id", ascending: true)
        .order("display_order", ascending: true)
        .execute()
        .value

      let answersRows: [PollAnswerRow] = try await supabase
        .from("poll_answers")
        .select("id, poll_id, option_id, user_id")
        .in("poll_id", values: pollIds)
        .execute()
        .value

      let currentUserId = supabase.auth.currentSession?.user.id

      var answerCounts: [UUID: Int] = [:]
      var userAnswers: [UUID: UUID] = [:]

      answersRows.forEach { answer in
        answerCounts[answer.option_id, default: 0] += 1
        if let currentUserId, answer.user_id == currentUserId {
          userAnswers[answer.poll_id] = answer.option_id
        }
      }

      let optionsMap = Dictionary(grouping: optionsRows, by: { $0.poll_id })
      let now = Date()

      polls = pollsRows.map { poll in
        let options = (optionsMap[poll.id] ?? []).map { option in
          PollOptionItem(
            id: option.id,
            text: option.option_text,
            displayOrder: option.display_order ?? 0,
            answerCount: answerCounts[option.id] ?? 0
          )
        }

        let totalAnswers = options.reduce(0) { $0 + $1.answerCount }
        let isActive = poll.end_date == nil || poll.end_date! > now
        let userSelectedOptionId = userAnswers[poll.id]
        let hasUserAnswered = userSelectedOptionId != nil

        return PollItem(
          id: poll.id,
          question: poll.question,
          description: poll.description,
          endDate: poll.end_date,
          createdAt: poll.created_at,
          isActive: isActive,
          options: options,
          hasUserAnswered: hasUserAnswered,
          userSelectedOptionId: userSelectedOptionId,
          totalAnswers: totalAnswers
        )
      }

      isLoading = false
    } catch {
      isLoading = false
      errorMessage = "Failed to load polls."
    }
  }

  func filteredPolls(_ filter: PollFilter) -> [PollItem] {
    switch filter {
    case .active:
      return polls.filter { $0.isActive }
    case .completed:
      return polls.filter { !$0.isActive }
    case .all:
      return polls
    }
  }

  func submitAnswer(pollId: UUID, optionId: UUID) async {
    errorMessage = nil

    do {
      let supabase = SupabaseService.shared.client

      guard let userId = supabase.auth.currentSession?.user.id else {
        errorMessage = "Not authenticated."
        return
      }

      let payload = PollAnswerInsert(poll_id: pollId, option_id: optionId, user_id: userId)

      _ = try await supabase
        .from("poll_answers")
        .insert(payload)
        .execute()

      await load()
    } catch {
      errorMessage = "Failed to submit answer."
    }
  }
}

struct PollItem: Identifiable {
  let id: UUID
  let question: String
  let description: String?
  let endDate: Date?
  let createdAt: Date
  let isActive: Bool
  let options: [PollOptionItem]
  let hasUserAnswered: Bool
  let userSelectedOptionId: UUID?
  let totalAnswers: Int
}

struct PollOptionItem: Identifiable {
  let id: UUID
  let text: String
  let displayOrder: Int
  let answerCount: Int
}

private struct PollRow: Decodable {
  let id: UUID
  let question: String
  let description: String?
  let end_date: Date?
  let created_at: Date
  let created_by: UUID
}

private struct PollOptionRowDB: Decodable {
  let id: UUID
  let poll_id: UUID
  let option_text: String
  let display_order: Int?
}

private struct PollAnswerRow: Decodable {
  let id: UUID
  let poll_id: UUID
  let option_id: UUID
  let user_id: UUID
}

private struct PollAnswerInsert: Encodable {
  let poll_id: UUID
  let option_id: UUID
  let user_id: UUID
}

private struct PollInsert: Encodable {
  let question: String
  let description: String?
  let end_date: String?
  let created_by: String
}

private struct PollOptionInsert: Encodable {
  let poll_id: String
  let option_text: String
  let display_order: Int
}

private extension DateFormatter {
  static let pollEnd: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateStyle = .short
    formatter.timeStyle = .short
    return formatter
  }()
}
