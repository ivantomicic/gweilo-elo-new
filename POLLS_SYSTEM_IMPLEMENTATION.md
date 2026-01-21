# Polls System Implementation Guide

This document describes the database schema, API structure, and frontend state flow for the polling system, following the same patterns as Sessions and No-Shows.

## Database Schema

### Tables

#### `polls`
Main table storing poll questions and metadata.

**Columns:**
- `id` (UUID, PK) - Primary key
- `question` (TEXT, NOT NULL) - The poll question
- `end_date` (TIMESTAMP WITH TIME ZONE, NULLABLE) - Optional end date for the poll
  - `NULL` = poll stays open indefinitely
  - If set, poll automatically closes after this date
- `created_by` (UUID, FK → auth.users) - Admin who created the poll
- `created_at` (TIMESTAMP WITH TIME ZONE) - Creation timestamp

**Constraints:**
- Question cannot be empty (trimmed length > 0)

#### `poll_options`
Stores answer options for each poll.

**Columns:**
- `id` (UUID, PK) - Primary key
- `poll_id` (UUID, FK → polls) - Reference to parent poll
- `option_text` (TEXT, NOT NULL) - The answer option text
- `display_order` (INTEGER, NOT NULL) - Order for displaying options (0, 1, 2, ...)

**Constraints:**
- Option text cannot be empty
- Unique `(poll_id, display_order)` to prevent duplicate ordering

#### `poll_answers`
Stores user answers to polls (one answer per user per poll).

**Columns:**
- `id` (UUID, PK) - Primary key
- `poll_id` (UUID, FK → polls) - Reference to poll
- `option_id` (UUID, FK → poll_options) - Selected option
- `user_id` (UUID, FK → auth.users) - User who answered
- `answered_at` (TIMESTAMP WITH TIME ZONE) - When the answer was submitted

**Constraints:**
- Unique `(poll_id, user_id)` - Enforces one answer per user per poll

### Indexes

- `polls`: `created_by`, `created_at DESC`, `end_date` (partial, where not null)
- `poll_options`: `poll_id`, `(poll_id, display_order)`
- `poll_answers`: `poll_id`, `user_id`, `option_id`

### Row Level Security (RLS) Policies

#### Polls
- **SELECT**: All authenticated users can read polls
- **INSERT**: Admin only
- **UPDATE**: Admin only
- **DELETE**: Admin only

#### Poll Options
- **SELECT**: All authenticated users can read options
- **INSERT/UPDATE/DELETE**: Admin only

#### Poll Answers
- **SELECT**: All authenticated users can read answers (for results)
- **INSERT**: Users can insert their own answers, with checks:
  - Must be their own user_id
  - Poll must not be closed (end_date check)
  - User must not have already answered (enforced by unique constraint + policy check)
- **UPDATE/DELETE**: Not allowed (answers are immutable)

### Helper Functions

#### `is_poll_active(poll_uuid UUID) → BOOLEAN`
Returns `true` if poll has no end_date or end_date is in the future.

#### `has_user_answered_poll(poll_uuid UUID, user_uuid UUID) → BOOLEAN`
Returns `true` if user has already answered the poll.

#### `get_poll_results(poll_uuid UUID) → TABLE`
Returns answer counts per option for a poll, ordered by display_order.

## API Routes Structure

Following the pattern from `/api/no-shows`, create:

### `GET /api/polls`
Fetch all polls with their options and answer counts.

**Security:** All authenticated users

**Query Parameters:**
- `status` (optional): `"active"` | `"completed"` | `"all"` (default: `"all"`)
  - `active`: Polls that are still open (no end_date or end_date > NOW)
  - `completed`: Polls that have ended (end_date < NOW) or polls where user has answered

**Response:**
```json
{
  "polls": [
    {
      "id": "uuid",
      "question": "What is your favorite sport?",
      "endDate": "2025-02-01T00:00:00Z" | null,
      "createdAt": "2025-01-29T10:00:00Z",
      "createdBy": "uuid",
      "isActive": true,
      "options": [
        {
          "id": "uuid",
          "text": "Tennis",
          "displayOrder": 0,
          "answerCount": 5
        },
        {
          "id": "uuid",
          "text": "Basketball",
          "displayOrder": 1,
          "answerCount": 3
        }
      ],
      "hasUserAnswered": false,
      "totalAnswers": 8
    }
  ]
}
```

**Implementation Notes:**
- Use `is_poll_active()` function to determine if poll is active
- Use `has_user_answered_poll()` to check if current user has answered
- Use `get_poll_results()` to get answer counts
- Join with `poll_options` to get options
- Filter by `status` query parameter

### `POST /api/polls`
Create a new poll (admin-only).

**Security:** Admin only (verify via `verifyAdmin()`)

**Request Body:**
```json
{
  "question": "What is your favorite sport?",
  "options": [
    "Tennis",
    "Basketball",
    "Football"
  ],
  "endDate": "2025-02-01T00:00:00Z" | null
}
```

**Response:**
```json
{
  "poll": {
    "id": "uuid",
    "question": "...",
    "endDate": "...",
    "createdAt": "...",
    "options": [...]
  }
}
```

**Implementation Notes:**
- Insert into `polls` table
- Insert each option into `poll_options` with sequential `display_order` (0, 1, 2, ...)
- Return created poll with options

### `POST /api/polls/[pollId]/answer`
Submit an answer to a poll (all authenticated users).

**Security:** All authenticated users (RLS enforces one answer per user)

**Request Body:**
```json
{
  "optionId": "uuid"
}
```

**Response:**
```json
{
  "answer": {
    "id": "uuid",
    "pollId": "uuid",
    "optionId": "uuid",
    "userId": "uuid",
    "answeredAt": "2025-01-29T10:00:00Z"
  }
}
```

**Implementation Notes:**
- Check if poll is active (not closed)
- Check if user has already answered (RLS + unique constraint will enforce)
- Insert into `poll_answers`
- Return created answer

## Frontend State Flow

### Page Structure (`app/polls/page.tsx`)

Similar to `app/no-shows/page.tsx`:

```typescript
function PollsPageContent() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refetchPolls, setRefetchPolls] = useState<(() => void) | null>(null);

  // Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      const role = await getUserRole();
      setIsAdmin(role === "admin");
    };
    checkAdmin();
  }, []);

  return (
    <SidebarProvider>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader
          title={t.pages.polls}
          actionLabel={isAdmin ? t.polls.newPoll : undefined}
          actionOnClick={isAdmin ? () => setDrawerOpen(true) : undefined}
          actionIcon="solar:add-circle-bold"
        />
        <PollsView
          onRefetchReady={(refetch) => {
            setRefetchPolls(() => refetch);
          }}
        />
      </SidebarInset>
      {isAdmin && (
        <CreatePollDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onInsertSuccess={() => {
            if (refetchPolls) {
              refetchPolls();
            }
          }}
        />
      )}
    </SidebarProvider>
  );
}
```

### Main View Component (`app/polls/_components/polls-view.tsx`)

Similar to `app/no-shows/_components/no-shows-view.tsx`, but with tabs:

```typescript
export function PollsView({ onRefetchReady }: PollsViewProps) {
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch polls based on active tab
  const fetchPolls = useCallback(async (status: "active" | "completed") => {
    // Call GET /api/polls?status=active or ?status=completed
    // Update polls state
  }, []);

  useEffect(() => {
    fetchPolls(activeTab);
  }, [activeTab, fetchPolls]);

  return (
    <div className="space-y-6 px-4 lg:px-6">
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "active" | "completed")}>
        <TabsList>
          <TabsTrigger value="active">{t.polls.tabs.active}</TabsTrigger>
          <TabsTrigger value="completed">{t.polls.tabs.completed}</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Polls List */}
      <PollsList polls={polls} loading={loading} onAnswer={handleAnswer} />
    </div>
  );
}
```

### Create Poll Drawer (`app/polls/_components/create-poll-drawer.tsx`)

Similar to `app/no-shows/_components/add-no-show-drawer.tsx`:

```typescript
export function CreatePollDrawer({
  open,
  onClose,
  onInsertSuccess,
}: CreatePollDrawerProps) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>([""]);
  const [endDate, setEndDate] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    // Validate: question not empty, at least 2 options
    // Call POST /api/polls
    // On success: close drawer, trigger refetch
  };

  const addOption = () => {
    setOptions([...options, ""]);
  };

  const removeOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t.polls.drawer.title}</SheetTitle>
        </SheetHeader>

        {/* Form fields */}
        <Input
          label={t.polls.drawer.question}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />

        {/* Options list with add/remove buttons */}
        {options.map((option, index) => (
          <div key={index} className="flex gap-2">
            <Input
              value={option}
              onChange={(e) => {
                const newOptions = [...options];
                newOptions[index] = e.target.value;
                setOptions(newOptions);
              }}
              placeholder={t.polls.drawer.optionPlaceholder(index + 1)}
            />
            {options.length > 2 && (
              <Button onClick={() => removeOption(index)} variant="ghost">
                Remove
              </Button>
            )}
          </div>
        ))}

        <Button onClick={addOption} variant="outline">
          {t.polls.drawer.addOption}
        </Button>

        {/* Optional end date */}
        <Input
          label={t.polls.drawer.endDate}
          type="datetime-local"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />

        <SheetFooter>
          <Button onClick={handleSave} disabled={saving || !isValid}>
            {saving ? t.settings.saving : t.settings.save}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

### Poll Card Component (`app/polls/_components/poll-card.tsx`)

Display individual poll with answer options:

```typescript
type PollCardProps = {
  poll: Poll;
  onAnswer: (pollId: string, optionId: string) => void;
};

export function PollCard({ poll, onAnswer }: PollCardProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedOption) return;
    setSubmitting(true);
    await onAnswer(poll.id, selectedOption);
    setSubmitting(false);
  };

  // If user already answered, show results
  if (poll.hasUserAnswered) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{poll.question}</CardTitle>
          {poll.endDate && (
            <p className="text-sm text-muted-foreground">
              Ended: {formatDate(poll.endDate)}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {/* Show results with answer counts */}
          {poll.options.map((option) => (
            <div key={option.id} className="flex justify-between">
              <span>{option.text}</span>
              <span>{option.answerCount} votes</span>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // If poll is closed, show message
  if (!poll.isActive) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{poll.question}</CardTitle>
          <p className="text-sm text-muted-foreground">This poll has ended.</p>
        </CardHeader>
      </Card>
    );
  }

  // Active poll - show answer options
  return (
    <Card>
      <CardHeader>
        <CardTitle>{poll.question}</CardTitle>
        {poll.endDate && (
          <p className="text-sm text-muted-foreground">
            Ends: {formatDate(poll.endDate)}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {poll.options.map((option) => (
            <Button
              key={option.id}
              variant={selectedOption === option.id ? "default" : "outline"}
              onClick={() => setSelectedOption(option.id)}
              className="w-full justify-start"
            >
              {option.text}
            </Button>
          ))}
        </div>
        <Button
          onClick={handleSubmit}
          disabled={!selectedOption || submitting}
          className="mt-4 w-full"
        >
          {submitting ? t.polls.submitting : t.polls.submit}
        </Button>
      </CardContent>
    </Card>
  );
}
```

### State Management Flow

1. **Initial Load:**
   - `PollsView` fetches polls based on active tab (`active` or `completed`)
   - Filters on backend via `status` query parameter
   - Updates `polls` state

2. **Answering a Poll:**
   - User selects an option in `PollCard`
   - Clicks submit button
   - `PollCard` calls `onAnswer(pollId, optionId)`
   - `PollsView` calls `POST /api/polls/[pollId]/answer`
   - On success, refetch polls (poll moves to "completed" tab for that user)

3. **Creating a Poll (Admin):**
   - Admin clicks "New Poll" button in `SiteHeader`
   - Opens `CreatePollDrawer`
   - Admin fills form: question, options (min 2), optional end date
   - Submits via `POST /api/polls`
   - On success, drawer closes, polls refetch

4. **Tab Switching:**
   - User switches between "Active" and "Completed" tabs
   - `PollsView` refetches with new `status` parameter
   - Active tab: Shows polls where `isActive = true` AND `hasUserAnswered = false`
   - Completed tab: Shows polls where `isActive = false` OR `hasUserAnswered = true`

## Localization Keys

Add to `lib/i18n/sr.ts`:

```typescript
polls: {
  title: "Ankete",
  newPoll: "Nova anketa",
  tabs: {
    active: "Aktivne",
    completed: "Završene"
  },
  drawer: {
    title: "Kreiraj anketu",
    question: "Pitanje",
    questionPlaceholder: "Unesite pitanje ankete",
    addOption: "Dodaj opciju",
    optionPlaceholder: (n: number) => `Opcija ${n}`,
    endDate: "Datum završetka (opciono)",
    save: "Sačuvaj",
    cancel: "Otkaži"
  },
  submit: "Pošalji odgovor",
  submitting: "Slanje...",
  alreadyAnswered: "Već ste odgovorili na ovu anketu",
  pollEnded: "Anketa je završena",
  votes: "glasova",
  // ... more keys as needed
}
```

## Summary

- **Database:** 3 tables (`polls`, `poll_options`, `poll_answers`) with RLS policies
- **API:** 3 routes (`GET /api/polls`, `POST /api/polls`, `POST /api/polls/[pollId]/answer`)
- **Frontend:** Page with tabs, drawer for creation, cards for display
- **Permissions:** Admin creates, all users read/answer
- **State:** Tab-based filtering, refetch on answer/create

Follows the same patterns as No-Shows and Sessions for consistency.
