# Handoff: TierUp — Peer Tutoring Platform

**Slogan:** Team Up, TierUp

## Overview
TierUp connects high-school students who need help ("learners") with students who tutor ("tutors") for **volunteer / service hours**. Launch market: **private high schools in the DMV** (DC, Maryland, Virginia). Three roles: **Student (learner)**, **Tutor**, and **Staff (teacher/admin)**.

Core ideas:
- Three ways to connect: **Browse**, **Post a request** (tutors respond), and **Match me** (auto-match by subject + schedule).
- Sessions can be **in person** (approved school spaces only) or **online**. Every online session gets a **one-time Google Meet link** of its own.
- Students can **message a tutor before booking**.
- Safety: **teacher approval of tutors (per subject)**, **parent consent** for under-18s, **staff-visible chats and session logs**, and a **Report** action everywhere.
- Tutors **log service hours** per completed session. **Staff approve or reject** them.

## About the design files
The HTML files in this bundle are **design references**. They are prototypes that show the intended look and behavior, not production code. All data is mocked in memory, and the Meet links are fake. The task is to **build this as a real application**: frontend, backend, auth, database, and the Google Calendar/Meet integration. If no codebase exists yet, choose an appropriate stack (suggested: Next.js + TypeScript + Postgres/Prisma + NextAuth with Google; any equivalent is fine).

## Fidelity
- `TierUp Prototype.html`: **high fidelity** for colors, type and layout, and the **source of truth for behavior**. Recreate the look closely.
- `TierUp Wireframes.html`: **low fidelity**. Explores 3 layout options per screen, including mobile layouts (1c, 1f, 1i, 1k, 1o, 1r, 1u, 1x). Use it for mobile/responsive intent and for alternate ideas. The prototype wins wherever the two differ.

## Files in this bundle
| File | What it is |
|---|---|
| `TierUp Prototype.html` | Standalone clickable prototype (opens offline). Top dark strip = jump links; header has a Student/Tutor/Staff role switch. |
| `TierUp Wireframes.html` | Standalone wireframe canvas (pan/zoom) of all 10 screens × 3 options. |
| `SCREENS.md` | Every screen: purpose, layout, components, copy, and behavior. |
| `USER_JOURNEYS.md` | End-to-end flows for each role, step by step. |
| `BACKEND.md` | Data model, permissions, API endpoints, Google Meet integration, notifications, jobs. |
| `screenshots/` | 20 PNGs of the prototype screens (01-landing … 20-staff-session-log), named by screen and matching SCREENS.md. |
| `PROMPT.md` | A ready-to-paste prompt for Claude Code that kicks off the build. |

Start with `PROMPT.md`.

## Design tokens
**Colors**
| Token | Hex | Use |
|---|---|---|
| Background | `#FDFBF7` | Page ground |
| Surface | `#EDE0D9` | Subtle fills (e.g. Meet link box) |
| Text / Ink | `#3B2314` | Body text, top strip, toasts, dark fields |
| Primary accent | `#DDA15E` | Primary buttons, links, selected chips, selected slots, active nav |
| Secondary accent | `#D954AA` | Kickers / sub-labels, "Teacher-approved" badges, service-hours progress bar, slogan |
| Divider | `#3B2314` @ 18% | Hairline borders |

Tonal ramps (100→800):
- Gold: `#fbf2e7 #f5e0c6 #eccb9f #e4b47a #DDA15E #c0854a #96663a #6b482a`
- Pink: `#fbeef6 #f6d5ea #eeb2d8 #e585c1 #D954AA #c13d93 #9b2d75 #722156`
- Neutral (100→900): `#faf3ef #ede2dc #ddcfc7 #c2b1a7 #a28f84 #827064 #64534a #4a3a31 #3B2314`

Tints: light steps (100–200) for selected/hover fills; deep steps (700–800) for text on tints.

**Typography**
- Headings: **Archivo** (Google Fonts, variable), weight **800**, width (`font-stretch`) **112%**, letter-spacing −0.01em. The client originally wanted *Oilvare Base* (a licensed font). Swap it in if they supply the file.
- Body: **Barlow** 400/500/600.
- Sizes seen: landing H1 64px/1.0; page H1 ~40px; card titles 22–28px; body 14–16px; meta 12–13px; kickers 11–12px uppercase, letter-spaced, pink.

**Shape and style (Industry design-system language)**
- Square corners (radius ~4px max). Hairline 1px borders.
- "Blueprint" cards: transparent, hairline frame, small "+" registration marks at the 4 corners.
- The primary button is the only solid-filled object (gold).
- Disabled = 45% opacity. Focus = 2px accent outline, 2px offset.
- Toasts: dark ink pill at bottom center that auto-dismisses after ~2.6s.

## Assets
No images. Avatars are neutral circles (replace with real profile photos). Icons are text glyphs (⚑ report, ✓, ▸/▾). Suggested replacement: Lucide icons at stroke 1.5.

## Out of scope in the prototype (needs real implementation)
Auth, real school/teacher data, email delivery, Google Calendar/Meet API, persistence, notifications, real auto-match scoring, file uploads, mobile layouts (see wireframes), and accessibility pass.
