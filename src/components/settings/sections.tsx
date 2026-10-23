"use client";

import clsx from "clsx";
import { useState, useTransition } from "react";
import {
  addLearnerSubjectAction,
  addTutorSubjectAction,
  removeLearnerSubjectAction,
  removeTutorSubjectAction,
  setAvailabilityAction,
  updateBasicsAction,
  updateBioAction,
  updateParentAction,
  updateStaffNameAction,
} from "@/app/(app)/settings/actions";
import { Button, Card, Field, Tag } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/server/errors";
import { COURSE_GRADES, STUDENT_GRADES } from "@/lib/validation/onboarding";
import { WEEKDAYS } from "@/lib/time";
import { CONSENT_COPY } from "@/lib/consent";
import { savePrivacyAction } from "@/app/(app)/actions";

type Result = ActionResult<{ toast: string }>;

/** Runs a settings action; shows its toast, or the error inline. */
function useSave() {
  const flash = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const save = (fn: () => Promise<Result>, onOk?: () => void) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (!result.ok) return setError(result.error);
      flash(result.toast);
      onOk?.();
    });
  return { pending, error, save };
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="m-0 border border-accent-2-300 bg-accent-2-100 px-3 py-2 text-sm text-accent-2-800">
      {error}
    </p>
  );
}

type FormatChoice = "in_person" | "online" | "both";
const formatChoice = (formats: string[]): FormatChoice =>
  formats.includes("in_person") && formats.includes("online") ? "both" : formats.includes("in_person") ? "in_person" : "online";

export function BasicsSection(props: { firstName: string; lastName: string; grade: number | null; schoolEmail: string; formats: string[] }) {
  const { pending, error, save } = useSave();
  const [firstName, setFirstName] = useState(props.firstName);
  const [lastName, setLastName] = useState(props.lastName);
  const [grade, setGrade] = useState(props.grade ?? 10);
  const [schoolEmail, setSchoolEmail] = useState(props.schoolEmail);
  const [format, setFormat] = useState<FormatChoice>(formatChoice(props.formats));

  return (
    <Card id="about" kicker="About you" className="gap-3.5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" htmlFor="s-first">
          <input id="s-first" className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
        </Field>
        <Field label="Last name" htmlFor="s-last">
          <input id="s-last" className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
        </Field>
      </div>
      <p className="muted -mt-1.5 m-0 text-xs">Other students see your first name and last initial.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Grade" htmlFor="s-grade">
          <select id="s-grade" className="input" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
            {STUDENT_GRADES.map((g) => (
              <option key={g} value={g}>
                {g}th
              </option>
            ))}
          </select>
        </Field>
        <Field label="School email (optional)" htmlFor="s-semail">
          <input id="s-semail" type="email" className="input" value={schoolEmail} onChange={(e) => setSchoolEmail(e.target.value)} />
        </Field>
      </div>
      <div className="field">
        <span className="field-label">How you meet</span>
        <div className="seg" role="radiogroup" aria-label="How you meet">
          {(
            [
              ["in_person", "In person"],
              ["online", "Online"],
              ["both", "Both"],
            ] as const
          ).map(([v, l]) => (
            <label key={v} className="seg-opt">
              <input type="radio" name="s-format" checked={format === v} onChange={() => setFormat(v)} />
              {l}
            </label>
          ))}
        </div>
      </div>
      <ErrorLine error={error} />
      <Button
        variant="primary"
        className="self-start"
        disabled={pending}
        onClick={() => save(() => updateBasicsAction({ firstName, lastName, grade, schoolEmail, format }))}
      >
        Save
      </Button>
    </Card>
  );
}

export function StaffNameSection({ name }: { name: string }) {
  const { pending, error, save } = useSave();
  const [value, setValue] = useState(name);
  return (
    <Card id="about" kicker="About you" className="gap-3.5">
      <Field label="Your name, as students know you" htmlFor="s-staff">
        <input id="s-staff" className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ms. Ortiz" />
      </Field>
      <ErrorLine error={error} />
      <Button variant="primary" className="self-start" disabled={pending} onClick={() => save(() => updateStaffNameAction(value))}>
        Save
      </Button>
    </Card>
  );
}

export function BioSection({ bio }: { bio: string }) {
  const { pending, error, save } = useSave();
  const [value, setValue] = useState(bio);
  return (
    <Card id="bio" kicker="Your tutor bio" className="gap-3.5">
      <Field label="What learners see on your profile" htmlFor="s-bio">
        <textarea
          id="s-bio"
          className="input min-h-[110px]"
          maxLength={500}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="What you're good at and how you like to help. e.g. I work through your actual homework instead of reteaching the chapter."
        />
      </Field>
      <span className="muted -mt-2 text-xs">{value.length}/500 · No phone numbers, emails or social handles.</span>
      <ErrorLine error={error} />
      <Button variant="primary" className="self-start" disabled={pending} onClick={() => save(() => updateBioAction(value))}>
        Save bio
      </Button>
    </Card>
  );
}

export function AvailabilitySection({ slots, selected, hasSchool }: { slots: { id: string; label: string }[]; selected: string[]; hasSchool: boolean }) {
  const { pending, error, save } = useSave();
  const [cells, setCells] = useState<string[]>(selected);
  const toggle = (key: string) => setCells((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));

  if (!hasSchool) {
    return (
      <Card id="availability" kicker="When you're free">
        <p className="muted m-0 text-sm">Your school isn&apos;t on TierUp yet, so there&apos;s no timetable to pick from.</p>
      </Card>
    );
  }
  return (
    <Card id="availability" kicker="When you're free" className="gap-3.5">
      <p className="muted m-0 text-[13px]">Tap the times you can usually meet. Booking only offers times you and your tutor are both free.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-separate border-spacing-1.5 text-[13px]">
          <thead>
            <tr>
              <th />
              {WEEKDAYS.map((d) => (
                <th key={d} scope="col" className="font-semibold">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.id}>
                <th scope="row" className="muted pr-1 text-left font-normal whitespace-nowrap">
                  {slot.label}
                </th>
                {WEEKDAYS.map((d, i) => {
                  const key = `${i + 1}:${slot.id}`;
                  const on = cells.includes(key);
                  return (
                    <td key={d} className="p-0">
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`${d} ${slot.label}`}
                        onClick={() => toggle(key)}
                        className={clsx(
                          "grid h-10 w-full place-items-center border text-xs",
                          on ? "border-accent bg-accent font-semibold text-ink" : "border-divider bg-transparent text-neutral-600 hover:bg-accent-100",
                        )}
                      >
                        {on ? "Free" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ErrorLine error={error} />
      <Button variant="primary" className="self-start" disabled={pending} onClick={() => save(() => setAvailabilityAction(cells))}>
        Save times
      </Button>
    </Card>
  );
}

type Group = { name: string; subjects: { id: string; name: string }[] };

function SubjectPicker({ groups, value, onChange, id }: { groups: Group[]; value: string; onChange: (v: string) => void; id: string }) {
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Pick a subject</option>
      {groups.map((g) => (
        <optgroup key={g.name} label={g.name}>
          {g.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </optgroup>
      ))}
      <option value="__other">Other (type it in)</option>
    </select>
  );
}

export function LearnerSubjectsSection({ subjects, groups }: { subjects: { id: string; name: string }[]; groups: Group[] }) {
  const { pending, error, save } = useSave();
  const [pick, setPick] = useState("");
  const [custom, setCustom] = useState("");
  const add = () =>
    save(
      () => addLearnerSubjectAction(pick === "__other" ? { customName: custom } : { subjectId: pick }),
      () => {
        setPick("");
        setCustom("");
      },
    );
  return (
    <Card id="classes" kicker="Classes you want help with" className="gap-3.5">
      <div className="flex flex-wrap gap-2">
        {subjects.length === 0 && <span className="muted text-sm">None yet.</span>}
        {subjects.map((s) => (
          <span key={s.id} className="tag tag-neutral gap-1.5 py-1 text-xs">
            {s.name}
            <button type="button" aria-label={`Remove ${s.name}`} className="cursor-pointer px-0.5 text-sm leading-none" disabled={pending} onClick={() => save(() => removeLearnerSubjectAction(s.id))}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Add a class" htmlFor="s-add-class">
          <SubjectPicker id="s-add-class" groups={groups} value={pick} onChange={setPick} />
        </Field>
        <Button disabled={pending || !pick || (pick === "__other" && custom.trim().length < 2)} onClick={add}>
          Add
        </Button>
      </div>
      {pick === "__other" && <input aria-label="Course name" className="input" maxLength={60} placeholder="Course name" value={custom} onChange={(e) => setCustom(e.target.value)} />}
      <ErrorLine error={error} />
    </Card>
  );
}

const TUTOR_STATUS = {
  pending: { label: "Waiting for teacher", tone: "neutral" },
  approved: { label: "✓ Approved", tone: "accent" },
  revoked: { label: "Revoked", tone: "outline" },
} as const;

export function TutorSubjectsSection(props: {
  subjects: { id: string; name: string; status: keyof typeof TUTOR_STATUS; teacher: string | null }[];
  groups: Group[];
  staffDomain: string | null;
}) {
  const { pending, error, save } = useSave();
  const [pick, setPick] = useState("");
  const [custom, setCustom] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [courseGrade, setCourseGrade] = useState("");
  const add = () =>
    save(
      () =>
        addTutorSubjectAction({
          ...(pick === "__other" ? { customName: custom } : { subjectId: pick }),
          teacherEmail,
          courseGrade: (courseGrade || undefined) as (typeof COURSE_GRADES)[number] | undefined,
        }),
      () => {
        setPick("");
        setCustom("");
        setCourseGrade("");
      },
    );
  return (
    <Card id="tutoring" kicker="Subjects you tutor" className="gap-3.5">
      <div className="flex flex-col">
        {props.subjects.length === 0 && <span className="muted text-sm">None yet.</span>}
        {props.subjects.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-divider py-2 first-of-type:border-t-0">
            <div className="flex flex-col">
              <b className="text-sm">{s.name}</b>
              {s.teacher && <span className="card-meta">{s.teacher}</span>}
            </div>
            <span className="flex items-center gap-2">
              <Tag tone={TUTOR_STATUS[s.status].tone}>{TUTOR_STATUS[s.status].label}</Tag>
              <button
                type="button"
                className="btn btn-ghost text-xs"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Stop tutoring ${s.name}? Learners won't see you for it. Past sessions and hours are kept.`)) {
                    save(() => removeTutorSubjectAction(s.id));
                  }
                }}
              >
                Remove
              </button>
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 border-t border-divider pt-3">
        <span className="text-sm font-semibold">Add a subject</span>
        <Field label="Subject" htmlFor="s-add-tutor">
          <SubjectPicker id="s-add-tutor" groups={props.groups} value={pick} onChange={setPick} />
        </Field>
        {pick === "__other" && <input aria-label="Course name" className="input" maxLength={60} placeholder="Course name" value={custom} onChange={(e) => setCustom(e.target.value)} />}
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Field label="Endorsing teacher's email" htmlFor="s-teacher">
            <input
              id="s-teacher"
              type="email"
              className="input"
              placeholder={props.staffDomain ? `teacher@${props.staffDomain}` : "teacher@school.org"}
              value={teacherEmail}
              onChange={(e) => setTeacherEmail(e.target.value)}
            />
          </Field>
          <Field label="Your grade" htmlFor="s-cgrade">
            <select id="s-cgrade" className="input" value={courseGrade} onChange={(e) => setCourseGrade(e.target.value)}>
              <option value="">—</option>
              {COURSE_GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <ErrorLine error={error} />
        <Button className="self-start" disabled={pending || !pick || !teacherEmail} onClick={add}>
          Send approval request
        </Button>
      </div>
    </Card>
  );
}

export function ParentSection(props: { parentEmail: string; status: "pending" | "approved" | "declined"; sendSummaries: boolean }) {
  const { pending, error, save } = useSave();
  const [parentEmail, setParentEmail] = useState(props.parentEmail);
  const [sendSummaries, setSendSummaries] = useState(props.sendSummaries);
  const changing = parentEmail.trim().toLowerCase() !== props.parentEmail.toLowerCase();
  return (
    <Card id="parent" kicker="Parent or guardian" className="gap-3.5">
      <div className="flex items-center gap-2 text-sm">
        Consent:
        <Tag tone={props.status === "approved" ? "accent" : props.status === "declined" ? "outline" : "neutral"}>
          {props.status === "approved" ? "✓ Approved" : props.status === "declined" ? "Declined" : "Waiting"}
        </Tag>
      </div>
      <Field label="Parent email" htmlFor="s-parent">
        <input id="s-parent" type="email" className="input" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} />
      </Field>
      <label className="radio">
        <input type="checkbox" checked={sendSummaries} onChange={(e) => setSendSummaries(e.target.checked)} />
        <span className="dot" />
        Send them session summaries
      </label>
      {changing && (
        <p className="m-0 text-[13px] text-accent-2-800">
          We&apos;ll send a new consent link to this address.{" "}
          {props.status === "approved" ? "Until they approve, you can't book or tutor." : ""}
        </p>
      )}
      <ErrorLine error={error} />
      <Button variant="primary" className="self-start" disabled={pending} onClick={() => save(() => updateParentAction({ parentEmail, sendSummaries }))}>
        Save
      </Button>
    </Card>
  );
}

/** Transcription and de-identified analytics, each opt-in (same choices as the privacy pop-up). */
export function PrivacySection(props: { askTranscripts: boolean; transcripts: boolean; analytics: boolean }) {
  const { pending, error, save } = useSave();
  const [transcripts, setTranscripts] = useState(props.transcripts);
  const [analytics, setAnalytics] = useState(props.analytics);
  return (
    <Card id="privacy" kicker="Privacy" className="gap-3.5">
      {props.askTranscripts && (
        <label className="radio items-start">
          <input type="checkbox" checked={transcripts} onChange={(e) => setTranscripts(e.target.checked)} />
          <span className="dot mt-0.5 shrink-0" />
          {CONSENT_COPY.transcripts.label}
        </label>
      )}
      <label className="radio items-start">
        <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
        <span className="dot mt-0.5 shrink-0" />
        {CONSENT_COPY.analytics.label}
      </label>
      <p className="muted m-0 text-xs">Turning transcription off stops it for sessions you&apos;ve already booked too.</p>
      <ErrorLine error={error} />
      <Button
        variant="primary"
        className="self-start"
        disabled={pending}
        onClick={() => save(() => savePrivacyAction({ transcripts: props.askTranscripts ? transcripts : undefined, analytics }))}
      >
        Save
      </Button>
    </Card>
  );
}
