import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConsentBanner } from "@/components/app/consent-banner";
import { parentConsentEnabled } from "@/server/policies/rules";
import { BookingForm } from "@/components/booking/booking-form";
import { requireOnboarded } from "@/server/policies/session";
import { bookingGrid } from "@/server/services/booking";

export const metadata: Metadata = { title: "Book" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ subject?: string; thread?: string; request?: string; week?: string }>;
};

export default async function BookPage({ params, searchParams }: Props) {
  const user = await requireOnboarded(["learner"]);
  const { id } = await params;
  const sp = await searchParams;
  const grid = await bookingGrid(user.id, id, sp.week);
  if (!grid) notFound();

  const weekHref = (week: string) => {
    const q = new URLSearchParams(Object.entries({ ...sp, week }).filter(([, v]) => v) as [string, string][]);
    return `/tutors/${id}/book?${q.toString()}`;
  };
  const consent = user.consent;
  const noOpen = !grid.cells.some((c) => c.state === "open");

  return (
    <div className="flex flex-col">
      <Link href={`/tutors/${id}${sp.subject ? `?subject=${sp.subject}` : ""}`} className="inline-block pt-6 pb-2 text-[13px] whitespace-nowrap">
        ← {grid.tutor.name}
      </Link>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1>Book with {grid.tutor.name}</h1>
        <nav className="flex items-center gap-3" aria-label="Week">
          {grid.prevWeek ? (
            <Link href={weekHref(grid.prevWeek)} aria-label="Previous week" className="no-underline">
              ←
            </Link>
          ) : (
            <span className="text-neutral-400" aria-hidden>
              ←
            </span>
          )}
          <span className="muted">{grid.weekLabel}</span>
          {grid.nextWeek ? (
            <Link href={weekHref(grid.nextWeek)} aria-label="Next week" className="no-underline">
              →
            </Link>
          ) : (
            <span className="text-neutral-400" aria-hidden>
              →
            </span>
          )}
        </nav>
      </div>

      {parentConsentEnabled() && consent && consent.status !== "approved" && (
        <div className="pt-4">
          <ConsentBanner status={consent.status} parentEmail={consent.parentEmail} blocked="book" />
        </div>
      )}
      {grid.capReached && (
        <p className="muted mt-4 mb-0 text-sm">
          {grid.tutor.name} is fully booked this week (max {grid.weeklyCap} sessions).{" "}
          {grid.nextWeek && <Link href={weekHref(grid.nextWeek)}>Try next week →</Link>}
        </p>
      )}
      {!grid.capReached && noOpen && (
        <p className="muted mt-4 mb-0 text-sm">
          {grid.learnerHasAvailability
            ? `No times you're both free this week.`
            : "We don't know when you're free yet, so there's nothing to match."}{" "}
          {grid.nextWeek && <Link href={weekHref(grid.nextWeek)}>Try next week →</Link>}
        </p>
      )}

      <BookingForm
        key={grid.week}
        tutor={grid.tutor}
        subjects={grid.subjects}
        formats={grid.formats}
        spaces={grid.spaces}
        rows={grid.rows}
        days={grid.days}
        cells={grid.cells}
        defaultSubjectId={sp.subject}
        threadId={sp.thread}
        requestId={sp.request}
        canBook={grid.consentOk}
      />
    </div>
  );
}
