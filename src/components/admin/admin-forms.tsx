"use client";

import { useState, useTransition } from "react";
import { addDomainAction, addSchoolAction, removeDomainAction } from "@/app/admin/actions";
import { Button, Card, Field } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

/** A school's staff email domains: remove with ×, add by typing one. */
export function DomainEditor({ schoolId, schoolName, domains }: { schoolId: string; schoolName: string; domains: string[] }) {
  const flash = useToast();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const add = () =>
    startTransition(async () => {
      const r = await addDomainAction(schoolId, draft);
      flash(r.ok ? r.toast : r.error);
      if (r.ok) setDraft("");
    });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {domains.map((d) => (
        <span key={d} className="tag tag-accent gap-1.5 py-1 font-mono text-xs">
          @{d}
          <button
            type="button"
            aria-label={`Remove ${d} from ${schoolName}`}
            className="cursor-pointer px-0.5 text-sm leading-none"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Remove @${d}? New teachers with it can't sign up as staff; existing staff keep access.`)) return;
              startTransition(async () => {
                const r = await removeDomainAction(schoolId, d);
                flash(r.ok ? r.toast : r.error);
              });
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        aria-label={`Add a staff domain for ${schoolName}`}
        className="input w-40 min-h-8 py-1 text-xs"
        placeholder="school.org"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            add();
          }
        }}
      />
      <Button className="px-2 py-1 text-xs" disabled={pending || !draft.trim()} onClick={add}>
        Add
      </Button>
    </div>
  );
}

export function AddSchoolForm({ defaultName = "" }: { defaultName?: string }) {
  const flash = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(defaultName);
  const [state, setState] = useState<"DC" | "MD" | "VA">("VA");
  const [city, setCity] = useState("");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Card kicker="Add a school" className="gap-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_auto_1fr]">
        <Field label="Name" htmlFor="ns-name">
          <input id="ns-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="State" htmlFor="ns-state">
          <select id="ns-state" className="input" value={state} onChange={(e) => setState(e.target.value as "DC" | "MD" | "VA")}>
            <option value="DC">DC</option>
            <option value="MD">MD</option>
            <option value="VA">VA</option>
          </select>
        </Field>
        <Field label="City (optional)" htmlFor="ns-city">
          <input id="ns-city" className="input" value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
      </div>
      <Field label="Staff email domain (optional, only if the school confirmed it)" htmlFor="ns-domain">
        <input id="ns-domain" className="input" placeholder="school.org" value={domain} onChange={(e) => setDomain(e.target.value)} />
      </Field>
      {error && (
        <p role="alert" className="m-0 text-sm text-accent-2-800">
          {error}
        </p>
      )}
      <Button
        variant="primary"
        className="self-start"
        disabled={pending || name.trim().length < 3}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await addSchoolAction({ name, state, city, domain });
            if (!r.ok) return setError(r.error);
            flash(r.toast);
            setName("");
            setCity("");
            setDomain("");
          })
        }
      >
        Add school
      </Button>
    </Card>
  );
}
