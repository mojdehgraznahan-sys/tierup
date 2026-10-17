# TierUp — User Journeys

## A. Learner: sign up → first online session → review
1. Landing → **Get help →**
2. Onboarding: Role = "I need help" → School (DMV dropdown) + grade → Subjects (multi-select, or Other) → Availability + format → Parent email → **Finish**
3. System: create the account and a pending ParentConsent, then email the parent. The learner lands on **Student Home**. They can browse but **can't book until the parent approves**.
4. Parent clicks the email link → consent page (not designed yet; simple approve/decline page) → consent = approved.
5. Learner: **Find help → Browse** → filter by subject → open a **Tutor Profile**.
6. *(Optional, recommended)* **Message** → a pre-booking chat opens in Sessions. They agree on the topic and time.
7. **See times** (or **Book with {tutor}** from the chat) → **Booking** → pick an overlapping slot → Format = Online → **Confirm booking**.
8. System:
   - Create the Session (status confirmed).
   - Create a **one-time Google Meet** through the Calendar API.
   - Send calendar invites to the learner and tutor.
   - Notify the parent.
   - Turn the pre-booking thread into the session thread.
9. **Booking confirmation**: shows the Meet link → Go to session.
10. At session time: **Join Google Meet**. The link opens 10 minutes before the start and expires at the end.
11. After the session: **Mark complete & review** → stars + tags → Submit. This counts as **learner confirmation**.

## B. Learner: post a request
1. Home → "Post a new request →" (or Find → Post a request).
2. Subject + description → **Post to tutors**.
3. System: notify approved tutors in that subject (at the learner's school, plus tutors at other schools who are online-capable). The request expires after 48 hours.
4. Tutors respond. Responses show under Home → **Open requests** (expand the row) and in Find → Post a request.
5. For each response, the learner can do one of three things:
   - **Accept & book** → Booking (Journey A, step 7).
   - **Message** → pre-booking chat seeded with the tutor's reply (Journey A, step 6).
   - **Profile** → see the tutor first.
6. No replies → "Browse {subject} tutors instead →".

## C. Learner: auto-match
1. Find → **Match me** → see the top 3 tutors with reasons (schedule overlap, same school, rating).
2. **Book** → Booking, or **View profile**.

## D. Tutor: sign up → approval → first session → hours
1. Landing → **Become a tutor →** → Onboarding with Role = tutor. Subjects = "What can you teach?" (production: pick an endorsing teacher per subject).
2. Finish → system creates a pending approval per subject, emails each teacher, and emails the parent for consent.
3. Staff approve each subject (only after parent consent). Then the tutor appears in Browse, Match and request notifications **for approved subjects only**.
4. Tutor Dashboard → **Open requests** → **Accept** (or Pass). If online, a Meet link is created.
5. The tutor also receives direct bookings and messages from learners (Sessions).
6. After the session: the learner reviews (confirming it happened). The session moves to **Completed sessions** on the dashboard.
7. Tutor **checks the box** to log hours. The hours go to staff for sign-off and show as "waiting for teacher sign-off".
8. Staff approve → the hours are added to the service-hours total and progress bar. If staff reject, the tutor is notified and the row is locked as "Rejected".
9. **Export log** → a PDF/CSV for school service-hour requirements.

## E. Staff
1. **Tutor approvals:** review pending tutor subjects → Approve (requires parent consent) → can Revoke at any time.
2. **Service hours:** approve or reject logged hours. "Approve all confirmed" bulk-approves only learner-confirmed sessions.
3. **Reports:** review the flagged chat → Dismiss / Warn / Pause tutor / Notify parents.
4. **Session log:** audit every session, including Meet links and join/leave times.

## F. Safety touchpoints (every journey)
- Every chat shows "School staff can view this chat".
- "⚑ Report" on the profile and the session.
- In-person sessions only in approved school spaces. Students from other schools can only meet online.
- Parents get notified of bookings, and session summaries if they opted in.
