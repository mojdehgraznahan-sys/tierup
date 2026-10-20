"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { postRequestAction } from "@/app/(app)/discovery-actions";
import { Button, Field } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

type Option = { id: string; name: string };
type Group = { name: string; subjects: Option[] };

/** Updates one or more URL search params, keeping the rest. */
function useParamSetter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
}

export function SubjectSelect({ subjects, value, allLabel, label }: { subjects: Option[]; value?: string; allLabel?: string; label?: string }) {
  const set = useParamSetter();
  // Local state so the control updates instantly; the URL (and results) follow.
  const [current, setCurrent] = useState(value ?? "");
  return (
    <select
      id="subject"
      aria-label={label}
      className="input"
      value={current}
      onChange={(e) => {
        setCurrent(e.target.value);
        set({ subject: e.target.value || null });
      }}
    >
      {allLabel && <option value="">{allLabel}</option>}
      {subjects.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

type Filters = { inPerson: boolean; online: boolean; sameSchoolOnly: boolean };

export function BrowseFilters({ subjects, subjectId, filters, schoolName }: { subjects: Option[]; subjectId?: string; filters: Filters; schoolName: string | null }) {
  const set = useParamSetter();
  const [local, setLocal] = useState(filters);
  const box = (key: "in" | "on" | "mine", field: keyof Filters, checked: boolean, def: boolean) => {
    setLocal((f) => ({ ...f, [field]: checked }));
    set({ [key]: checked === def ? null : checked ? "1" : "0" });
  };

  return (
    <div className="flex flex-col gap-3.5 text-sm">
      <Field label="Subject" htmlFor="subject">
        <SubjectSelect subjects={subjects} value={subjectId} allLabel="All subjects" />
      </Field>
      <span className="kicker">Format</span>
      <label className="radio">
        <input type="checkbox" checked={local.inPerson} onChange={(e) => box("in", "inPerson", e.target.checked, true)} />
        <span className="dot" />
        In person
      </label>
      <label className="radio">
        <input type="checkbox" checked={local.online} onChange={(e) => box("on", "online", e.target.checked, true)} />
        <span className="dot" />
        Online (Google Meet)
      </label>
      {schoolName && (
        <>
          <span className="kicker">School</span>
          <label className="radio">
            <input type="checkbox" checked={local.sameSchoolOnly} onChange={(e) => box("mine", "sameSchoolOnly", e.target.checked, false)} />
            <span className="dot" />
            {schoolName} only
          </label>
        </>
      )}
      <p className="muted m-0 text-xs">You can only meet tutors from other schools online.</p>
    </div>
  );
}

export function RequestForm({ groups, defaultSubjectId }: { groups: Group[]; defaultSubjectId?: string }) {
  const router = useRouter();
  const flash = useToast();
  const [subjectId, setSubjectId] = useState(defaultSubjectId ?? "");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await postRequestAction({ subjectId, description });
      if (!result.ok) return setError(result.error);
      flash(result.toast);
      setDescription("");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3.5">
      <h3>Describe what you need</h3>
      <Field label="Subject" htmlFor="req-subject">
        <select id="req-subject" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="" disabled>
            Pick a subject
          </option>
          {groups.map((g) => (
            <optgroup key={g.name} label={g.name}>
              {g.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <Field label="What's going on?" htmlFor="req-text">
        <textarea
          id="req-text"
          className="input"
          maxLength={500}
          placeholder="e.g. Test on cell respiration Friday, the Krebs cycle confuses me"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {error && (
        <p role="alert" className="m-0 border border-accent-2-300 bg-accent-2-100 px-3 py-2 text-sm text-accent-2-800">
          {error}
        </p>
      )}
      <Button variant="primary" className="self-start px-[18px] py-[9px]" onClick={submit} disabled={pending || !subjectId}>
        {pending ? "Posting…" : "Post to tutors"}
      </Button>
      <p className="muted m-0 text-xs">Requests expire after 48 hours if nobody accepts.</p>
    </div>
  );
}
