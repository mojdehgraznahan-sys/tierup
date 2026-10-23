"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { z } from "zod";
import { finishOnboarding } from "@/app/onboarding/actions";
import { Button, Field } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { SchoolGroup, SubjectGroup } from "@/server/services/catalog";
import {
  COURSE_GRADES,
  STUDENT_GRADES,
  TIME_BLOCKS,
  customKey,
  customName,
  emailDomain,
  isCustomKey,
  type ClassInfo,
  type OnboardingInput,
} from "@/lib/validation/onboarding";

type Role = "learner" | "tutor";
type Block = (typeof TIME_BLOCKS)[number]["value"];
type FormatChoice = "in_person" | "online" | "both";
type CourseGrade = (typeof COURSE_GRADES)[number];
type Endorsement = { teacherEmail: string; courseGrade?: CourseGrade };

const BASE_STEPS = ["Role", "School", "Subjects", "Availability"];
const NOT_LISTED = "__none";
const isEmail = (v: string) => z.string().email().safeParse(v.trim()).success;

type Props = {
  initialRole: Role;
  /** Adds the parent consent step (PARENT_CONSENT=true). */
  consentEnabled: boolean;
  initialFirstName: string;
  initialLastName: string;
  accountEmail: string;
  schoolGroups: SchoolGroup[];
  subjectGroups: SubjectGroup[];
};

export function OnboardingWizard(props: Props) {
  const router = useRouter();
  const flash = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const STEPS = props.consentEnabled ? [...BASE_STEPS, "Consent"] : BASE_STEPS;
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role>(props.initialRole);
  const [firstName, setFirstName] = useState(props.initialFirstName);
  const [lastName, setLastName] = useState(props.initialLastName);
  const [schoolId, setSchoolId] = useState("");
  const [waitlistName, setWaitlistName] = useState("");
  const [grade, setGrade] = useState(10);
  const [schoolEmail, setSchoolEmail] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [customs, setCustoms] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [endorsements, setEndorsements] = useState<Record<string, Endorsement>>({});
  const [classes, setClasses] = useState<Record<string, ClassInfo>>({});
  const [blocks, setBlocks] = useState<Block[]>(["after_school"]);
  const [format, setFormat] = useState<FormatChoice>("both");
  const [parentEmail, setParentEmail] = useState("");
  const [sendSummaries, setSendSummaries] = useState(true);

  const allSchools = props.schoolGroups.flatMap((g) => g.schools);
  const school = allSchools.find((s) => s.id === schoolId);
  const subjectName = (key: string) =>
    isCustomKey(key) ? customName(key) : props.subjectGroups.flatMap((g) => g.subjects).find((s) => s.id === key)?.name ?? key;

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  function addOther() {
    const name = other.trim().replace(/\s+/g, " ");
    if (name.length < 2) return;
    const key = customKey(name);
    setCustoms((c) => (c.includes(name) ? c : [...c, name]));
    setSelected((s) => (s.includes(key) ? s : [...s, key]));
    setOther("");
  }

  function setEndorsement(key: string, patch: Partial<Endorsement>) {
    setError(null);
    setEndorsements((e) => ({ ...e, [key]: { ...(e[key] ?? { teacherEmail: "" }), ...patch } }));
  }

  function setClass(key: string, patch: Partial<ClassInfo>) {
    setError(null);
    setClasses((c) => ({ ...c, [key]: { ...c[key], ...patch } }));
  }

  /** Client-side check for the current step; the server re-validates everything. */
  function stepError(): string | null {
    if (step === 1) {
      if (!firstName.trim() || !lastName.trim()) return "Enter your first and last name.";
      if (!schoolId) return "Pick your school.";
      if (schoolId === NOT_LISTED && waitlistName.trim().length < 2) return "Tell us your school's name.";
      if (schoolEmail && !isEmail(schoolEmail)) return "Check your school email.";
    }
    if (step === 2) {
      if (selected.length === 0) return "Pick at least one subject.";
      if (role === "learner") {
        for (const key of selected) {
          const email = classes[key]?.teacherEmail?.trim() ?? "";
          if (!email) continue;
          if (!isEmail(email)) return `Check the teacher's email for ${subjectName(key)}.`;
          if (school?.staffDomain && emailDomain(email) !== school.staffDomain) return `Use your teacher's school email (…@${school.staffDomain}).`;
        }
      }
      if (role === "tutor") {
        for (const key of selected) {
          const email = endorsements[key]?.teacherEmail?.trim() ?? "";
          if (!isEmail(email)) return `Add a teacher's email for ${subjectName(key)}.`;
          if (email.toLowerCase() === props.accountEmail.toLowerCase()) return "Your endorsing teacher can't be you.";
          if (school?.staffDomain && emailDomain(email) !== school.staffDomain) {
            return `Use your teacher's school email (…@${school.staffDomain}).`;
          }
        }
      }
    }
    if (step === 3 && blocks.length === 0) return "Pick at least one time you're usually free.";
    if (step === 3 && !props.consentEnabled && role === "learner" && parentEmail.trim()) {
      if (!isEmail(parentEmail)) return "Check your parent's email.";
      if (parentEmail.trim().toLowerCase() === props.accountEmail.toLowerCase()) return "Enter your parent's email, not your own.";
    }
    if (step === 4 && props.consentEnabled) {
      if (!isEmail(parentEmail)) return "Enter your parent's email.";
      if (parentEmail.trim().toLowerCase() === props.accountEmail.toLowerCase()) return "Enter your parent's email, not your own.";
    }
    return null;
  }

  function next() {
    const problem = stepError();
    setError(problem);
    if (problem) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      window.scrollTo(0, 0);
      return;
    }
    const input: OnboardingInput = {
      role,
      firstName,
      lastName,
      school: schoolId === NOT_LISTED ? { kind: "unlisted", schoolName: waitlistName } : { kind: "listed", schoolId },
      grade,
      schoolEmail,
      subjectKeys: selected,
      endorsements: role === "tutor" ? Object.fromEntries(selected.map((k) => [k, endorsements[k]!])) : {},
      classes: role === "learner" ? Object.fromEntries(selected.filter((k) => classes[k]).map((k) => [k, classes[k]!])) : {},
      blocks,
      format,
      ...(props.consentEnabled ? { parentEmail, sendSummaries } : role === "learner" && parentEmail.trim() ? { parentEmail } : {}),
    };
    startTransition(async () => {
      const result = await finishOnboarding(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      flash(result.toast);
      router.push(result.redirectTo);
    });
  }

  function back() {
    setError(null);
    if (step === 0) router.push("/");
    else setStep(step - 1);
  }

  const groups = [...props.subjectGroups, ...(customs.length ? [{ name: "Other", subjects: customs.map((c) => ({ id: customKey(c), name: c })) }] : [])];
  const firstTeacher = selected.map((k) => endorsements[k]?.teacherEmail?.trim()).find((e) => e && isEmail(e));

  return (
    <>
      <ol className="m-0 flex list-none flex-wrap gap-2 border-b border-divider p-0 pt-3 pb-7" aria-label="Sign-up steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={clsx("tag px-3 py-[5px] text-xs", i === step ? "tag-outline" : i < step ? "tag-accent" : "tag-neutral")}
          >
            {i + 1} {label}
          </li>
        ))}
      </ol>

      <div className="flex max-w-[560px] flex-col gap-[18px] py-9">
        {step === 0 && (
          <>
            <h2>How will you use TierUp?</h2>
            {(
              [
                ["learner", "I need help", "Find tutors for my classes"],
                ["tutor", "I want to tutor", "Help others and earn service hours"],
              ] as const
            ).map(([value, title, sub]) => (
              <label key={value} className="radio card flex-row p-4">
                <input type="radio" name="role" checked={role === value} onChange={() => setRole(value)} />
                <span className="dot" />
                <span className="flex flex-col">
                  <b>{title}</b>
                  <span className="muted text-[13px]">{sub}</span>
                </span>
              </label>
            ))}
          </>
        )}

        {step === 1 && (
          <>
            <h2>Which school do you go to?</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" htmlFor="first">
                <input id="first" className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
              </Field>
              <Field label="Last name" htmlFor="last">
                <input id="last" className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
              </Field>
            </div>
            <p className="muted -mt-2 m-0 text-xs">Other students see your first name and last initial.</p>
            <Field label="School" htmlFor="school">
              <select id="school" className="input" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
                <option value="" disabled>
                  Select your school
                </option>
                {props.schoolGroups.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <option value={NOT_LISTED}>My school isn&apos;t listed</option>
              </select>
            </Field>
            {schoolId === NOT_LISTED && (
              <>
                <span className="muted text-[13px]">
                  We&apos;ll add your school to the waitlist. Tutoring opens there once a teacher signs up.
                </span>
                <Field label="School name" htmlFor="wl">
                  <input id="wl" className="input" value={waitlistName} onChange={(e) => setWaitlistName(e.target.value)} />
                </Field>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Grade" htmlFor="grade">
                <select id="grade" className="input" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
                  {STUDENT_GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}th
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="School email (optional)" htmlFor="semail">
                <input id="semail" type="email" className="input" placeholder="you@school.org" value={schoolEmail} onChange={(e) => setSchoolEmail(e.target.value)} />
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>{role === "tutor" ? "What can you teach?" : "What do you need help with?"}</h2>
            <span className="muted text-[13px]">{selected.length ? `${selected.length} selected` : "Pick as many as you like"}</span>
            {groups.map((g) => (
              <div key={g.name} className="flex flex-col gap-2">
                <span className="kicker">{g.name}</span>
                <div className="flex flex-wrap gap-2">
                  {g.subjects.map((s) => {
                    const on = selected.includes(s.id);
                    return (
                      <button key={s.id} type="button" className="chip" aria-pressed={on} onClick={() => setSelected(toggle(selected, s.id))}>
                        {on && "✓ "}
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <Field label="Other" htmlFor="other">
              <div className="flex gap-2">
                <input
                  id="other"
                  className="input"
                  placeholder="Type a course that isn't listed"
                  value={other}
                  maxLength={60}
                  onChange={(e) => setOther(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addOther();
                    }
                  }}
                />
                <Button type="button" onClick={addOther}>
                  Add
                </Button>
              </div>
            </Field>

            {role === "learner" && selected.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-divider pt-4">
                <span className="kicker">Your classes (optional)</span>
                <p className="muted m-0 text-[13px]">
                  Add your class and teacher, and your teacher gets a weekly summary of what you worked on with tutors.
                  {school?.staffDomain && ` Use their school email (…@${school.staffDomain}).`}
                </p>
                {selected.map((key) => (
                  <div key={key} className="grid gap-2 sm:grid-cols-[150px_1fr_1fr_1fr] sm:items-end">
                    <span className="text-sm font-semibold sm:pb-2">{subjectName(key)}</span>
                    <input aria-label={`Class for ${subjectName(key)}`} className="input" maxLength={60} placeholder="Class (e.g. Period 3)" value={classes[key]?.className ?? ""} onChange={(e) => setClass(key, { className: e.target.value })} />
                    <input aria-label={`Teacher name for ${subjectName(key)}`} className="input" maxLength={80} placeholder="Teacher name" value={classes[key]?.teacherName ?? ""} onChange={(e) => setClass(key, { teacherName: e.target.value })} />
                    <input aria-label={`Teacher email for ${subjectName(key)}`} type="email" className="input" placeholder="teacher@school.org" value={classes[key]?.teacherEmail ?? ""} onChange={(e) => setClass(key, { teacherEmail: e.target.value })} />
                  </div>
                ))}
              </div>
            )}

            {role === "tutor" && (
              <div className="flex flex-col gap-3 border-t border-divider pt-4">
                <span className="kicker">Endorsing teachers</span>
                <p className="muted m-0 text-[13px]">
                  Each subject needs approval from one of your teachers. We&apos;ll email them a one-click link.
                  {school?.staffDomain && ` Use their school email (…@${school.staffDomain}).`}
                </p>
                {selected.length === 0 && <span className="muted text-[13px]">Pick a subject above first.</span>}
                {selected.map((key) => (
                  <div key={key} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[150px_1fr_auto] sm:items-end">
                    <span className="col-span-2 text-sm font-semibold sm:col-span-1 sm:pb-2">{subjectName(key)}</span>
                    <input
                      aria-label={`Teacher email for ${subjectName(key)}`}
                      type="email"
                      className="input"
                      placeholder="teacher@school.org"
                      value={endorsements[key]?.teacherEmail ?? ""}
                      onChange={(e) => setEndorsement(key, { teacherEmail: e.target.value })}
                    />
                    <select
                      aria-label={`Your grade in ${subjectName(key)}`}
                      className="input w-auto"
                      value={endorsements[key]?.courseGrade ?? ""}
                      onChange={(e) => setEndorsement(key, { courseGrade: (e.target.value || undefined) as CourseGrade | undefined })}
                    >
                      <option value="">Your grade</option>
                      {COURSE_GRADES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                {firstTeacher && selected.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost self-start text-[13px]"
                    onClick={() => selected.forEach((k) => setEndorsement(k, { teacherEmail: firstTeacher }))}
                  >
                    Use {firstTeacher} for all subjects
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h2>When are you usually free?</h2>
            <div className="flex flex-wrap gap-2">
              {TIME_BLOCKS.map((b) => {
                const on = blocks.includes(b.value);
                return (
                  <button key={b.value} type="button" className="chip" aria-pressed={on} onClick={() => setBlocks(toggle(blocks, b.value))}>
                    {on && "✓ "}
                    {b.label}
                  </button>
                );
              })}
            </div>
            <div className="field">
              <span className="field-label">Format</span>
              <div className="seg" role="radiogroup" aria-label="Format">
                {(
                  [
                    ["in_person", "In person"],
                    ["online", "Online"],
                    ["both", "Both"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="seg-opt">
                    <input type="radio" name="format" checked={format === value} onChange={() => setFormat(value)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <p className="muted m-0 text-[13px]">You can fine-tune exact days and times later in Settings.</p>
            {!props.consentEnabled && role === "learner" && (
              <Field label="Parent or guardian email (optional)" htmlFor="fyi-parent">
                <input id="fyi-parent" type="email" className="input" placeholder="parent@email.com" value={parentEmail} onChange={(e) => { setError(null); setParentEmail(e.target.value); }} />
                <span className="muted mt-1 block text-xs">They&apos;ll get a short summary after each session, as an FYI. They can turn these off anytime.</span>
              </Field>
            )}
          </>
        )}

        {step === 4 && props.consentEnabled && (
          <>
            <h2>Parent or guardian consent</h2>
            <p className="muted m-0">
              We&apos;ll send them a consent link. You can browse in the meantime, but you can&apos;t{" "}
              {role === "tutor" ? "tutor" : "book"} until they approve.
            </p>
            <Field label="Parent email" htmlFor="pemail">
              <input id="pemail" type="email" className="input" placeholder="parent@email.com" value={parentEmail} onChange={(e) => {
                setError(null);
                setParentEmail(e.target.value);
              }} />
            </Field>
            <label className="radio">
              <input type="checkbox" checked={sendSummaries} onChange={(e) => setSendSummaries(e.target.checked)} />
              <span className="dot" />
              Send them session summaries
            </label>
          </>
        )}

        {error && (
          <p role="alert" className="m-0 border border-accent-2-300 bg-accent-2-100 px-3 py-2 text-sm text-accent-2-800">
            {error}
          </p>
        )}

        <div className="flex justify-between pt-3">
          <Button variant="ghost" onClick={back} disabled={pending}>
            ← Back
          </Button>
          <Button variant="primary" className="px-[18px] py-[9px]" onClick={next} disabled={pending}>
            {step === STEPS.length - 1 ? (pending ? "Finishing…" : "Finish") : "Next"}
          </Button>
        </div>
        {step === 0 && (
          <p className="muted m-0 text-[13px]">
            Are you a teacher? <Link href="/for-schools">Set up your school</Link>.
          </p>
        )}
      </div>
    </>
  );
}
