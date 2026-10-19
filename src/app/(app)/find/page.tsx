import type { Metadata } from "next";
import Link from "next/link";
import { Card, ButtonLink, Tag } from "@/components/ui/primitives";
import { BrowseFilters, RequestForm, SubjectSelect } from "@/components/discovery/find-controls";
import { ResponseCard } from "@/components/discovery/response-card";
import { TutorCard } from "@/components/discovery/tutor-card";
import { db } from "@/server/db";
import { requireOnboarded } from "@/server/policies/session";
import { subjectGroups } from "@/server/services/catalog";
import { browseTutors, matchTutors, subjectsWithTutors } from "@/server/services/discovery";
import { myOpenRequests } from "@/server/services/requests";

export const metadata: Metadata = { title: "Find help" };

type Mode = "browse" | "request" | "match";
const MODES: [Mode, string][] = [
  ["browse", "Browse"],
  ["request", "Post a request"],
  ["match", "Match me"],
];

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function FindPage({ searchParams }: Props) {
  const user = await requireOnboarded(["learner"]);
  const params = await searchParams;
  const mode: Mode = params.mode === "request" || params.mode === "match" ? params.mode : "browse";
  const viewer = { id: user.id, schoolId: user.schoolId };

  const modeHref = (m: Mode) => {
    const q = new URLSearchParams();
    if (m !== "browse") q.set("mode", m);
    if (params.subject) q.set("subject", params.subject);
    const s = q.toString();
    return `/find${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-8 pb-5">
        <h1>Find help</h1>
        <nav className="seg" aria-label="Ways to find help">
          {MODES.map(([m, label]) => (
            <Link key={m} href={modeHref(m)} className="seg-opt" aria-current={m === mode ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
      {mode === "browse" && <Browse viewer={viewer} params={params} schoolName={user.school?.name ?? null} />}
      {mode === "request" && <Request userId={user.id} subjectId={params.subject} />}
      {mode === "match" && <MatchMe viewer={viewer} subjectId={params.subject} />}
    </div>
  );
}

async function Browse({
  viewer,
  params,
  schoolName,
}: {
  viewer: { id: string; schoolId: string | null };
  params: Record<string, string | undefined>;
  schoolName: string | null;
}) {
  const filters = { inPerson: params.in !== "0", online: params.on !== "0", sameSchoolOnly: params.mine === "1" && !!viewer.schoolId };
  const subjects = await subjectsWithTutors(viewer);
  const subjectId = subjects.some((s) => s.id === params.subject) ? params.subject : undefined;
  const tutors = await browseTutors(viewer, { subjectId, ...filters });
  const subjectName = subjects.find((s) => s.id === subjectId)?.name;

  return (
    <div className="grid gap-7 md:grid-cols-[200px_minmax(0,1fr)]">
      <BrowseFilters subjects={subjects} subjectId={subjectId} filters={filters} schoolName={schoolName} />
      <div className="flex flex-col gap-3">
        <b>
          {tutors.length} tutor{tutors.length === 1 ? "" : "s"}
          {subjectName ? ` for ${subjectName}` : ""}
        </b>
        {tutors.length === 0 ? (
          <Card className="border-dashed p-6 text-sm">
            <span className="muted">No approved tutors match these filters yet.</span>
            <Link href={`/find?mode=request${subjectId ? `&subject=${subjectId}` : ""}`} className="text-sm">
              Post a request instead →
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
            {tutors.map((t) => (
              <TutorCard key={t.id} tutor={t} subjectId={subjectId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function Request({ userId, subjectId }: { userId: string; subjectId?: string }) {
  const [groups, mine, requests] = await Promise.all([
    subjectGroups(),
    db.learnerSubject.findMany({ where: { userId }, include: { subject: true } }),
    myOpenRequests(userId),
  ]);
  const custom = mine.filter((m) => m.subject.isCustom).map((m) => ({ id: m.subjectId, name: m.subject.name }));
  const allGroups = custom.length ? [{ name: "Your other courses", subjects: custom }, ...groups] : groups;
  const latest = requests[0];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-8">
      <RequestForm groups={allGroups} defaultSubjectId={subjectId ?? mine[0]?.subjectId} />
      <div className="flex flex-col gap-3">
        <span className="kicker">Responses{latest ? ` · ${latest.responses.length}` : ""}</span>
        {latest ? (
          <>
            <span className="muted text-[13px]">
              {latest.subjectName}: {latest.description}
            </span>
            {latest.responses.map((r) => (
              <ResponseCard key={r.id} response={r} subjectId={latest.subjectId} />
            ))}
            {latest.responses.length === 0 && (
              <Card className="border-dashed p-6 text-sm">
                <span className="muted">No replies yet. Approved {latest.subjectName} tutors have been notified.</span>
              </Card>
            )}
            {requests.length > 1 && (
              <Link href="/home" className="text-[13px]">
                See all {requests.length} open requests →
              </Link>
            )}
          </>
        ) : (
          <Card className="border-dashed p-6 text-sm">
            <span className="muted">Tutor responses show up here.</span>
          </Card>
        )}
      </div>
    </div>
  );
}

async function MatchMe({ viewer, subjectId }: { viewer: { id: string; schoolId: string | null }; subjectId?: string }) {
  const subjects = await subjectsWithTutors(viewer);
  if (subjects.length === 0) {
    return <p className="muted m-0">No approved tutors yet. Post a request and we&apos;ll notify tutors as they&apos;re approved.</p>;
  }
  const mine = await db.learnerSubject.findMany({ where: { userId: viewer.id }, select: { subjectId: true } });
  const chosen =
    subjects.find((s) => s.id === subjectId) ?? subjects.find((s) => mine.some((m) => m.subjectId === s.id)) ?? subjects[0]!;
  const matches = await matchTutors(viewer, chosen.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="muted m-0">
          Best matches for <b className="text-ink">{chosen.name}</b> based on your classes and free time.
        </p>
        <div className="w-56">
          <SubjectSelect subjects={subjects} value={chosen.id} />
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5">
        {matches.map((t, i) => (
          <Card key={t.id} blueprint className="gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="card-title">{t.name}</span>
              <Tag tone="accent">{i === 0 ? "Best match" : `#${i + 1}`}</Tag>
            </div>
            <span className="card-meta">{[t.grade, t.schoolName].filter(Boolean).join(" · ")}</span>
            {t.reasons.map((why) => (
              <span key={why} className="text-[13px]">
                ✓ {why}
              </span>
            ))}
            <div className="mt-1 flex gap-2">
              <ButtonLink href={`/tutors/${t.id}/book?subject=${chosen.id}`} variant="primary">
                Book
              </ButtonLink>
              <Link href={`/tutors/${t.id}?subject=${chosen.id}`} className="btn btn-ghost">
                View profile
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
