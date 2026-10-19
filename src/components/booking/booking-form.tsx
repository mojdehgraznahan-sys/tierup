"use client";

import clsx from "clsx";
import { useState, useTransition } from "react";
import type { Format } from "@prisma/client";
import { createBookingAction } from "@/app/(app)/tutors/[id]/book/actions";
import { Button, Card, Field } from "@/components/ui/primitives";
import type { CellState } from "@/lib/booking";
import { minuteLabel } from "@/lib/time";

type Cell = { weekday: number; startMinute: number; startsAt: string; state: CellState };

type Props = {
  tutor: { id: string; name: string };
  subjects: { id: string; name: string }[];
  formats: Format[];
  spaces: string[];
  rows: { label: string; startMinute: number }[];
  days: { weekday: number; label: string; date: string }[];
  cells: Cell[];
  defaultSubjectId?: string;
  threadId?: string;
  requestId?: string;
  canBook: boolean;
};

const CELL_TEXT: Record<CellState, string> = { open: "Open", none: "", past: "", busy: "Taken", full: "Full" };

export function BookingForm(props: Props) {
  const [selected, setSelected] = useState<Cell | null>(null);
  const [subjectId, setSubjectId] = useState(
    props.subjects.some((s) => s.id === props.defaultSubjectId) ? props.defaultSubjectId! : props.subjects[0]!.id,
  );
  const inPersonOk = props.formats.includes("in_person");
  const [format, setFormat] = useState<Format>(inPersonOk ? "in_person" : "online");
  const [location, setLocation] = useState(props.spaces[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const rowLabel = (minute: number) => props.rows.find((r) => r.startMinute === minute)?.label ?? minuteLabel(minute);
  const day = (weekday: number) => props.days.find((d) => d.weekday === weekday)!;
  const summary = selected
    ? `${day(selected.weekday).label} ${day(selected.weekday).date} · ${rowLabel(selected.startMinute)} · ${format === "online" ? "Google Meet" : location}`
    : "Pick an open time on the grid";

  const confirm = () =>
    startTransition(async () => {
      if (!selected) return;
      setError(null);
      const result = await createBookingAction({
        tutorId: props.tutor.id,
        subjectId,
        startsAt: selected.startsAt,
        format,
        location: format === "in_person" ? location : undefined,
        threadId: props.threadId,
        requestId: props.requestId,
      });
      if (result && !result.ok) {
        setError(result.error);
        if (/taken|fully booked|too soon/.test(result.error)) setSelected(null);
      }
    });

  return (
    <div className="grid items-start gap-8 pt-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex flex-col gap-2.5 overflow-x-auto">
        <div role="grid" aria-label="Times you're both free" className="flex min-w-[460px] flex-col gap-1.5 text-[13px]">
          <div role="row" className="grid grid-cols-[70px_repeat(5,minmax(0,1fr))] gap-1.5">
            <span />
            {props.days.map((d) => (
              <b key={d.weekday} role="columnheader" className="text-center">
                {d.label}
                <span className="block text-[11px] font-normal text-neutral-600">{d.date}</span>
              </b>
            ))}
          </div>
          {props.rows.map((row) => (
            <div key={row.startMinute} role="row" className="grid grid-cols-[70px_repeat(5,minmax(0,1fr))] items-center gap-1.5">
              <span role="rowheader" className="muted">
                {row.label}
              </span>
              {props.days.map((d) => {
                const cell = props.cells.find((c) => c.weekday === d.weekday && c.startMinute === row.startMinute)!;
                const isSelected = selected?.startsAt === cell.startsAt;
                const open = cell.state === "open";
                return (
                  <button
                    key={d.weekday}
                    type="button"
                    role="gridcell"
                    disabled={!open}
                    aria-selected={isSelected}
                    aria-label={`${d.label} ${d.date} ${row.label}: ${open ? (isSelected ? "selected" : "open") : cell.state === "none" ? "not available" : cell.state}`}
                    onClick={() => setSelected(cell)}
                    className={clsx(
                      "grid h-10 place-items-center border text-xs",
                      isSelected
                        ? "cursor-pointer border-accent bg-accent text-bg"
                        : open
                          ? "cursor-pointer border-divider bg-accent-200 text-accent-800 hover:bg-accent-300"
                          : "cursor-default border-divider bg-transparent text-neutral-500",
                    )}
                  >
                    {isSelected ? "Selected" : CELL_TEXT[cell.state]}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="muted flex gap-[18px] pt-1 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 bg-accent-200" />
            You&apos;re both free
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 bg-accent" />
            Selected
          </span>
        </div>
      </div>

      <Card className="gap-3.5">
        <Field label="Subject" htmlFor="book-subject">
          <select id="book-subject" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {props.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="field">
          <span className="field-label">Format</span>
          <div className="seg" role="radiogroup" aria-label="Format">
            <label className="seg-opt" title={inPersonOk ? undefined : "In person only works with tutors at your school"}>
              <input type="radio" name="format" checked={format === "in_person"} disabled={!inPersonOk} onChange={() => setFormat("in_person")} />
              In person
            </label>
            <label className="seg-opt">
              <input type="radio" name="format" checked={format === "online"} disabled={!props.formats.includes("online")} onChange={() => setFormat("online")} />
              Online
            </label>
          </div>
        </div>
        {format === "in_person" ? (
          <Field label="Where" htmlFor="book-where">
            <select id="book-where" className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
              {props.spaces.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div className="flex gap-2 bg-accent-100 p-2.5 text-xs leading-[1.45] text-accent-800">
            <span aria-hidden>●</span>
            <span>
              We&apos;ll create a <b>one-time Google Meet</b> for this session. It only works for this time slot and expires
              when the session ends.
            </span>
          </div>
        )}
        <div className="border-t border-divider pt-3 text-[13px]">
          <b>{summary}</b>
        </div>
        <span className="muted text-xs">Your parent gets a notification when you book.</span>
        {error && (
          <p role="alert" className="m-0 border border-accent-2-300 bg-accent-2-100 px-3 py-2 text-sm text-accent-2-800">
            {error}
          </p>
        )}
        <Button variant="primary" className="w-full py-2.5" disabled={!selected || !props.canBook || pending} onClick={confirm}>
          {pending ? "Booking…" : "Confirm booking"}
        </Button>
      </Card>
    </div>
  );
}
