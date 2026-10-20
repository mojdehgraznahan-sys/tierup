"use client";

import { useState, useTransition } from "react";
import { addSlotAction, removeSlotAction, setGoalAction, setSpacesAction, setTutorCapAction, updateSlotAction } from "@/app/(app)/staff/actions";
import { Button, Card, Field, Tag } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/server/errors";

type Block = "before_school" | "lunch" | "after_school" | "evening";
const BLOCKS: { value: Block; label: string }[] = [
  { value: "before_school", label: "Before school" },
  { value: "lunch", label: "Lunch" },
  { value: "after_school", label: "After school" },
  { value: "evening", label: "Evening" },
];

type Slot = { id: string; label: string; time: string; block: string; inUse: number };
type Props = {
  goal: number;
  spaces: string[];
  staffDomains: string[];
  slots: Slot[];
  tutors: { id: string; name: string; cap: number; paused: boolean }[];
};

function useRun() {
  const flash = useToast();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult<{ toast: string }>>, onOk?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      flash(r.ok ? r.toast : r.error);
      if (r.ok) onOk?.();
    });
  return { pending, run };
}

export function SchoolSettings(props: Props) {
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <GoalCard goal={props.goal} />
      <SpacesCard spaces={props.spaces} />
      <SlotsCard slots={props.slots} />
      <CapsCard tutors={props.tutors} />
      <Card kicker="Staff sign-up">
        <p className="m-0 text-sm">
          Teachers become staff by signing in with{" "}
          {props.staffDomains.length ? props.staffDomains.map((d) => <code key={d} className="font-mono">@{d}</code>).reduce((a, b) => <>{a}, {b}</>) : "a verified school email"}.
        </p>
        <span className="muted text-xs">To change the school&apos;s staff domains, contact TierUp.</span>
      </Card>
    </div>
  );
}

function GoalCard({ goal }: { goal: number }) {
  const { pending, run } = useRun();
  const [value, setValue] = useState(goal);
  return (
    <Card kicker="Service-hour goal" className="gap-3">
      <div className="flex items-end gap-2">
        <Field label="Hours per school year" htmlFor="goal">
          <input id="goal" type="number" min={1} max={500} className="input w-32" value={value} onChange={(e) => setValue(Number(e.target.value))} />
        </Field>
        <Button variant="primary" disabled={pending} onClick={() => run(() => setGoalAction(value))}>
          Save
        </Button>
      </div>
      <span className="muted text-xs">Shown on every tutor&apos;s dashboard progress bar.</span>
    </Card>
  );
}

function SpacesCard({ spaces }: { spaces: string[] }) {
  const { pending, run } = useRun();
  const [list, setList] = useState(spaces);
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v.length >= 2 && !list.some((s) => s.toLowerCase() === v.toLowerCase())) setList([...list, v]);
    setDraft("");
  };
  return (
    <Card kicker="Approved spaces for in-person sessions" className="gap-3">
      <div className="flex flex-wrap gap-2">
        {list.map((s) => (
          <span key={s} className="tag tag-neutral gap-1.5 py-1 text-xs">
            {s}
            <button type="button" aria-label={`Remove ${s}`} className="cursor-pointer px-0.5 text-sm leading-none" onClick={() => setList(list.filter((x) => x !== s))}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          aria-label="New space"
          className="input"
          placeholder="e.g. Room 112 (Science)"
          maxLength={60}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button onClick={add}>Add</Button>
      </div>
      <Button variant="primary" className="self-start" disabled={pending} onClick={() => run(() => setSpacesAction(list))}>
        Save spaces
      </Button>
    </Card>
  );
}

function SlotRow({ slot }: { slot: Slot }) {
  const { pending, run } = useRun();
  const [label, setLabel] = useState(slot.label);
  const [time, setTime] = useState(slot.time);
  const [block, setBlock] = useState(slot.block as Block);
  return (
    <tr>
      <td>
        <input aria-label="Label" className="input" maxLength={20} value={label} onChange={(e) => setLabel(e.target.value)} />
      </td>
      <td>
        <input aria-label="Start time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
      </td>
      <td>
        <select aria-label="Part of the day" className="input" value={block} onChange={(e) => setBlock(e.target.value as Block)}>
          {BLOCKS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      </td>
      <td className="muted text-xs whitespace-nowrap">{slot.inUse} free time{slot.inUse === 1 ? "" : "s"}</td>
      <td className="text-right whitespace-nowrap">
        <Button disabled={pending} onClick={() => run(() => updateSlotAction(slot.id, { label, time, block }))}>
          Save
        </Button>{" "}
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => {
            const warn = slot.inUse ? ` Students lose ${slot.inUse} free time${slot.inUse === 1 ? "" : "s"} marked in it.` : "";
            if (window.confirm(`Remove "${slot.label}"?${warn} Booked sessions aren't affected.`)) run(() => removeSlotAction(slot.id));
          }}
        >
          Remove
        </Button>
      </td>
    </tr>
  );
}

function SlotsCard({ slots }: { slots: Slot[] }) {
  const { pending, run } = useRun();
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("");
  const [block, setBlock] = useState<Block>("after_school");
  return (
    <Card kicker="Bell-time slots" className="gap-3">
      <p className="muted m-0 text-[13px]">The rows on the booking grid and in students&apos; free-time settings. Sessions are 45 minutes.</p>
      <div className="overflow-x-auto">
        <table className="table min-w-[640px]">
          <thead>
            <tr>
              <th>Label</th>
              <th>Starts</th>
              <th>Part of the day</th>
              <th>In use</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {slots.map((s) => (
              <SlotRow key={s.id + s.time + s.label} slot={s} />
            ))}
            <tr>
              <td>
                <input aria-label="New slot label" className="input" placeholder="e.g. Advisory" maxLength={20} value={label} onChange={(e) => setLabel(e.target.value)} />
              </td>
              <td>
                <input aria-label="New slot start time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
              </td>
              <td>
                <select aria-label="New slot part of the day" className="input" value={block} onChange={(e) => setBlock(e.target.value as Block)}>
                  {BLOCKS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </td>
              <td />
              <td className="text-right">
                <Button
                  variant="primary"
                  disabled={pending || !label.trim() || !time}
                  onClick={() =>
                    run(
                      () => addSlotAction({ label, time, block }),
                      () => {
                        setLabel("");
                        setTime("");
                      },
                    )
                  }
                >
                  Add slot
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CapRow({ tutor }: { tutor: Props["tutors"][number] }) {
  const { pending, run } = useRun();
  const [cap, setCap] = useState(tutor.cap);
  return (
    <tr>
      <td>
        {tutor.name} {tutor.paused && <Tag tone="outline">Paused</Tag>}
      </td>
      <td>
        <input aria-label={`Weekly cap for ${tutor.name}`} type="number" min={0} max={15} className="input w-24" value={cap} onChange={(e) => setCap(Number(e.target.value))} />
      </td>
      <td className="text-right">
        <Button disabled={pending || cap === tutor.cap} onClick={() => run(() => setTutorCapAction(tutor.id, cap))}>
          Save
        </Button>
      </td>
    </tr>
  );
}

function CapsCard({ tutors }: { tutors: Props["tutors"] }) {
  return (
    <Card kicker="Tutor weekly caps" className="gap-3">
      <p className="muted m-0 text-[13px]">Most sessions a tutor can have booked in one week. 0 stops new bookings without hiding them.</p>
      {tutors.length === 0 ? (
        <span className="muted text-sm">No tutors yet.</span>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Tutor</th>
              <th>Sessions per week</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tutors.map((t) => (
              <CapRow key={t.id} tutor={t} />
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
