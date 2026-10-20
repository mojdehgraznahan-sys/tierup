import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageButton } from "@/components/discovery/message-button";
import { ReportButton } from "@/components/discovery/report-button";
import { Avatar, ButtonLink, Card, Tag } from "@/components/ui/primitives";
import { formatLabel } from "@/server/policies/discoverability";
import { requireOnboarded } from "@/server/policies/session";
import { tutorProfile } from "@/server/services/discovery";
import { ratingText } from "@/lib/format";

export const metadata: Metadata = { title: "Tutor" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ subject?: string }> };

export default async function TutorProfilePage({ params, searchParams }: Props) {
  const user = await requireOnboarded(["learner"]);
  const { id } = await params;
  const { subject } = await searchParams;
  const tutor = await tutorProfile({ id: user.id, schoolId: user.schoolId }, id);
  if (!tutor) notFound();

  const subjectId = tutor.subjects.some((s) => s.id === subject) ? subject : undefined;
  const bookHref = `/tutors/${tutor.id}/book${subjectId ? `?subject=${subjectId}` : ""}`;

  return (
    <div className="flex flex-col">
      <Link href={subjectId ? `/find?subject=${subjectId}` : "/find"} className="inline-block pt-6 pb-2 text-[13px]">
        ← Back to results
      </Link>
      <div className="grid items-start gap-9 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-[18px]">
            <Avatar name={tutor.name} size={84} />
            <div className="flex flex-col gap-1.5">
              <h1>{tutor.name}</h1>
              <span className="muted">
                {[tutor.grade && `${tutor.grade} grade`, tutor.schoolName, `${tutor.sessionCount} session${tutor.sessionCount === 1 ? "" : "s"}`]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <div className="flex flex-wrap gap-1.5">
                <Tag tone="accent-2">{tutor.endorsers.length ? `Approved by ${tutor.endorsers.join(", ")}` : "Teacher-approved"}</Tag>
                <Tag tone="neutral">{ratingText(tutor.rating)}</Tag>
                <Tag tone="outline">{formatLabel(tutor.formats)}</Tag>
              </div>
            </div>
          </div>

          {/* Phones: book/message right under the name, not after the reviews (wireframe 1k). */}
          <div className="flex gap-2 md:hidden">
            <ButtonLink href={bookHref} variant="primary" className="flex-1 py-[9px]">
              See times
            </ButtonLink>
            <MessageButton tutorId={tutor.id} subjectId={subjectId} className="btn btn-secondary flex-1" />
          </div>

          {tutor.bio && (
            <section>
              <span className="kicker">About</span>
              <p className="mt-1.5 mb-0 text-pretty">{tutor.bio}</p>
            </section>
          )}

          <section>
            <span className="kicker">Subjects</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {tutor.subjects.map((s) => (
                <Tag key={s.id} tone="outline" className="px-3 py-1 text-[13px]">
                  {s.name}
                </Tag>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2.5">
            <span className="kicker">Recent reviews</span>
            {tutor.reviews.length === 0 && <span className="muted text-sm">No reviews yet.</span>}
            {tutor.reviews.map((r) => (
              <Card key={r.id} className="gap-1 p-3.5">
                <span className="text-sm">&ldquo;{r.text}&rdquo;</span>
                <span className="card-meta">{r.by}</span>
              </Card>
            ))}
          </section>
        </div>

        <Card blueprint className="gap-2.5 md:sticky md:top-4">
          <span className="card-title">Book a session</span>
          <span className="card-meta">Free · 45 min</span>
          <span className="text-[13px]">Next open: {tutor.nextOpen ?? "no open times in the next two weeks"}</span>
          <ButtonLink href={bookHref} variant="primary" className="mt-1.5 w-full py-[9px]">
            See times
          </ButtonLink>
          <MessageButton tutorId={tutor.id} subjectId={subjectId} />
          <ReportButton againstUserId={tutor.id} />
        </Card>
      </div>
    </div>
  );
}
