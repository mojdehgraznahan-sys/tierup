"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { finishStaffOnboarding } from "@/app/onboarding/actions";
import { Button, Card, Field } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { SchoolGroup } from "@/server/services/catalog";

type Props = { schoolGroups: SchoolGroup[]; accountEmail: string; defaultName: string };

export function StaffOnboardingForm({ schoolGroups, accountEmail, defaultName }: Props) {
  const router = useRouter();
  const flash = useToast();
  const [pending, startTransition] = useTransition();
  const [schoolId, setSchoolId] = useState("");
  const [displayName, setDisplayName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [waitlisted, setWaitlisted] = useState<string | null>(null);

  const school = schoolGroups.flatMap((g) => g.schools).find((s) => s.id === schoolId);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await finishStaffOnboarding({ schoolId, displayName });
      if (!result.ok) return setError(result.error);
      if (result.status === "waitlisted") return setWaitlisted(result.schoolName);
      flash("You're set up as staff");
      router.push("/staff");
    });
  }

  if (waitlisted) {
    return (
      <Card blueprint kicker="On the list" className="gap-2 p-6">
        <div className="card-title">We&apos;ll verify {waitlisted}</div>
        <p className="muted m-0 text-sm">
          We haven&apos;t confirmed {waitlisted}&apos;s staff email domain yet. We&apos;ve saved your request for{" "}
          <b>{accountEmail}</b> and will email you when staff sign-up opens.
        </p>
      </Card>
    );
  }

  return (
    <form
      className="flex flex-col gap-[18px]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="School" htmlFor="school">
        <select id="school" className="input" value={schoolId} onChange={(e) => setSchoolId(e.target.value)} required>
          <option value="" disabled>
            Select your school
          </option>
          {schoolGroups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <Field label="Your name, as students know you" htmlFor="dname">
        <input id="dname" className="input" placeholder="Ms. Ortiz" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      </Field>
      <p className="muted m-0 text-[13px]">
        Signed in as <b>{accountEmail}</b>.
        {school?.staffDomain && ` Staff at this school sign in with an …@${school.staffDomain} address.`}
      </p>
      {error && (
        <p role="alert" className="m-0 border border-accent-2-300 bg-accent-2-100 px-3 py-2 text-sm text-accent-2-800">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" className="px-[18px] py-[9px]" disabled={pending || !schoolId}>
          {pending ? "Checking…" : "Finish"}
        </Button>
      </div>
    </form>
  );
}
