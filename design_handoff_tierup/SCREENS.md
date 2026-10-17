# TierUp — Screens & Functionality

Each section lists what the screen is for, its layout, and what every control does. Copy in quotes is the exact prototype text. "Toast" means the bottom-center confirmation message.

Global chrome (all logged-in screens):
- **Header:** "TierUp" wordmark + slogan "Team Up, TierUp" (pink, small) on the left. Role-based nav links. Avatar initials on the right.
  - Student nav: Home · Find help · Sessions
  - Tutor nav: Dashboard · Sessions
  - Staff nav: Moderation
- **Role switch** (Student / Tutor / Staff): **prototype only**. In production the role comes from the account (one user can be both learner and tutor, so consider a Learner/Tutor mode toggle).
- **Dark top strip** with jump links: **prototype only**. Don't build it.

---

## 1. Landing (public)
**Purpose:** Explain the product and route visitors into sign-up as a learner or a tutor.
**Layout:** Simple top bar (wordmark, "For schools" link, "Log in" button). Hero with pink kicker "Team Up, TierUp", H1 "Learn it from someone who just aced it.", and subcopy. Two blueprint cards side by side:
- "I need help / Find a tutor", with a primary "Get help →" button that starts onboarding with role = learner.
- "I want to tutor / Earn service hours", with "Become a tutor →" that starts onboarding with role = tutor.

Below the cards, a 3-step "how it works" row: 01 Sign up with your school, 02 Match by subject, 03 Meet in person or online. Step 03 mentions the one-time Meet link.

**Backend:** none (static). "Log in" goes to auth (Google sign-in recommended, so Calendar scopes can be requested for tutors later).

## 2. Onboarding (5 steps)
Stepper tags across the top: 1 Role · 2 School · 3 Subjects · 4 Availability · 5 Consent. Done steps are filled, the current step is outlined, future steps are neutral. "← Back" (on step 1 it returns to Landing) and "Next" (on step 5 it reads "Finish").

1. **Role:** radio cards "I need help" / "I want to tutor".
2. **School:** a **dropdown of DMV private high schools**, grouped by Washington DC / Maryland / Virginia (list is in the prototype source). The last option, "My school isn't listed", shows waitlist copy: tutoring opens there once a teacher signs up. Also: Grade (9th–12th select) and optional school email.
3. **Subjects:** heading changes by role ("What do you need help with?" / "What can you teach?"). There are **85 courses in 8 groups** (English, Math, Science, Social Studies, World Languages, Arts, Computer Science, Business & Electives). Multi-select chips: selected ones are gold-filled with "✓ ", unselected are outlined. A counter above shows "N selected" or "Pick as many as you like". An **"Other"** text input with an Add button (or Enter) adds a custom course, which appears pre-selected in an "Other" group. Tutors also see a note that each subject needs approval from one of their teachers.
4. **Availability:** multi-select chips for Before school, Lunch, After school, Evenings, Weekends. Format segmented control: In person / Online / Both.
5. **Consent:** parent email and a "Send them session summaries" checkbox. Copy: they can browse now but can't book until a parent approves.

**Finish:**
- Learner: goes to Student Home. Toast: "Consent link sent to your parent".
- Tutor: goes to Tutor Dashboard. Toast: "Approval requests sent to your teachers".

**Backend:**
- Create the user profile, school membership, subjects and availability.
- Create a ParentConsent (status pending) and email the parent a tokenized link.
- Tutors: create one TutorSubjectApproval per subject (pending) and email the chosen teacher. **The prototype doesn't collect which teacher.** Add a teacher picker per subject from the school's staff list.

## 3. Student Home
- H1 "Hey {firstName}" with the date kicker, and a "+ Get help" button that goes to Find help.
- **Upcoming sessions** card: each row shows Subject · When (a link to that session), a format tag, "with {tutor} · {where}", and a **"Join Meet"** button if the session is online. Pre-booking chats are excluded.
- **Open requests** card: rows are **expandable** (▸/▾). The status tag reads "N replies" or "Waiting".
  - Expanded with replies: one card per tutor reply (name, time ago, quoted message) with three buttons:
    - **Accept & book**: goes to Booking with that tutor, subject pre-filled.
    - **Message**: opens or creates a pre-booking chat with that tutor for that subject. The tutor's reply becomes the first message.
    - **Profile**: opens the tutor's profile.
  - Expanded with no replies: "No replies yet…" and a "Browse {subject} tutors instead →" link, which opens Find → Browse filtered to that subject.
  - "Post a new request →" opens Find → Post a request.
- **Tutors for your classes:** a grid of tutor cards (avatar, name, subjects). Clicking a card opens their profile.

## 4. Find help (3 modes via a segmented control)
**Browse**
- Left filter column: Subject select, Format checkboxes (In person / Online (Google Meet)), and a "{My school} only" checkbox. Note: you can only meet tutors from other schools online.
- Results: a count ("N tutors for X"), then a grid of cards. Each card shows avatar, name, grade · school, "Teacher-approved" (pink tag), rating ("★ 4.9 (12)" or "New tutor"), a format tag, and the subject list. Click a card to open the profile.
- **Only teacher-approved tutors** appear, and only for the subjects they're approved in.

**Post a request**
- Form: Subject select, "What's going on?" textarea, and "Post to tutors". Toast: "Request posted to approved tutors". Note: requests expire after 48 hours.
- The right column lists responses: name, time ago, quote, and Accept & book / **Message** / Profile.

**Match me**
- "Best matches for {subject}". Shows the top 3 cards with a score tag ("Best match", "#2", "#3") and ✓ reasons:
  - "{n} free times overlap with yours"
  - "Same school: in person works" or "Other school: online via Google Meet"
  - "Rated X by N students"
- Buttons: Book, View profile.

## 5. Tutor Profile
- "← Back to results". Header: large avatar, name, "{grade} grade · {school} · {n} sessions", and tags: "Approved by {teacher}" (pink), rating, format.
- Sections: About (bio), Subjects (tags), Recent reviews (quote + "grade · subject · month").
- Sticky right card "Book a session": "Free · 45 min", next open slot, **See times** (goes to Booking), **Message** (opens or creates a pre-booking chat), and "⚑ Report" (toast confirming staff were notified).

## 6. Booking
- "← {tutor}" back link. H1 "Book with {tutor}". Week label.
- **Week grid**, 5 days × 4 time rows (Lunch, 3:30, 4:30, 7:00 pm). A cell is clickable only where **both** the tutor and the learner are free; those show light gold with "Open". The selected cell is solid gold, "Selected". A legend sits under the grid.
- Right panel:
  - Subject select (the tutor's approved subjects).
  - Format: In person / Online. In person is **disabled** if the tutor is at another school or is online-only.
  - If in person: a "Where" select (approved school spaces: Library, Room 204 (Math), Learning commons).
  - If online: an info box saying a **one-time Google Meet** will be created for this session, works only for this slot, and expires when the session ends.
  - Summary line (slot · location), "Your parent gets a notification when you book.", and **Confirm booking** (disabled until a slot is picked).
- **Blocked if the learner's parent consent is not approved** (the prototype doesn't enforce this; production must).

## 7. Booking confirmation
- Kicker "Booked", H1 "You're set with {tutor}", then subject · when · 45 min.
- Online: blueprint card "One-time Google Meet created" with a "Single-use" tag, the link in a monospace box, and 4 facts: Opens 10 min before start · Expires when the session ends · Only you and {tutor} can join · Added to both calendars. Buttons: Copy link (toast), Go to session.
- In person: card "Meet at {place}", "Check in on the app when you arrive.", and Go to session.

## 8. Sessions (messaging + session detail)
Three columns:
- **Left: thread list.** Each item shows subject, tutor · when, and a status (Confirmed / Done / Not booked). The selected thread is tinted.
- **Middle: chat.** The header shows the other person and "School staff can view this chat". Messages are right-aligned (tinted) for me, left-aligned for them. Input + Send, and Enter sends.
- **Right: session details.** Subject, when (or "Not booked yet"), format tag.
  - Online: "One-time Google Meet" box with the link, "Single-use · expires at session end · join and leave times are logged", **Join Google Meet**, Copy link.
  - In person: 📍 location.
  - Pre-booking chat: "Chat first and agree on a topic and time, then book when you're ready." and **Book with {tutor}**, which goes to Booking with the subject pre-filled. When booked, **this same thread becomes the session** and the chat history is kept.
  - Booked session: **"Mark complete & review"** opens the Review modal.
  - "⚑ Report a problem".

## 9. Review modal
- Title "How was {subject} with {tutor}?". 5 clickable stars, tag chips (Explained clearly, Patient, On time, Prepared), and an optional textarea.
- Cancel / Submit (disabled until at least 1 star). Submit marks the session Done, which counts as learner confirmation. Toast: "Thanks! {tutor}'s 0.75 hrs went to their teacher for sign-off".
- The wireframes also propose confirming whether the session happened (Yes / No-show / Cut short) and private low-rating routing to staff (1y, 1aa). Recommended to include.

## 10. Tutor Dashboard
- H1 "Hey {firstName}".
- **Service hours card:** big number of approved hours, "/ 40 goal" (make the goal configurable per school), a **pink progress bar**, "{x}h waiting for teacher sign-off", and "Export log" (toast; production should export a PDF/CSV for the school).
- **Completed sessions** list in the same card ("Check to log hours"). Each row has a square checkbox, subject · learner, date · duration, and a status tag ("0.75h", "1h logged", "1h approved", "Rejected").
  - Checking logs the hours and sends them to the teacher (toast). Unchecking removes them from the log.
  - Rows that are already approved or rejected are locked, with an explanatory toast.
- **Your upcoming sessions:** rows with a Join Meet button for online ones, plus "Log session notes".
- **Open requests in your subjects:** a list of rows with subject + quote, learner · source ("Open request" / "Auto-match · 92%" / "Direct booking"), when · format, and **Accept** / **Pass**.
  - Accept removes the row and adds it to upcoming sessions. If online, a Meet link is created. Toast: "Accepted. One-time Meet created: …"
  - Header shows "N open · max 3 sessions/week". The weekly cap should be enforced.

## 11. Staff — Moderation (4 tabs)
**Tutor approvals:** table with Student, Subject, Grade, Parent consent (✓ Given / Pending), and an action. **Approve is disabled until the parent has consented.** Approve and Revoke toggle, with a toast. Approval is per subject and revocable at any time.

**Service hours:**
- Summary "N waiting · Xh total" and **"Approve all confirmed (N)"**, which only covers rows the learner confirmed.
- Table: Tutor, Learner, Subject, Session, Hours, Learner confirmed (✓ Yes / Not yet), and Reject / Approve buttons. After a decision, a status tag shows instead.
- Approving adds the hours to the tutor's total. Rejecting notifies the tutor.

**Reports:** a report card (title, filed by / against, chat excerpt with the flagged line highlighted). Actions: Dismiss, Warn, **Pause tutor**, Notify parents. The status tag updates.

**Session log:** table with When, Tutor → Learner, Subject, Format, Meet link ("… · single-use" or —), Status. Pre-booking chats are excluded.

Staff should only see data for **their own school**.
