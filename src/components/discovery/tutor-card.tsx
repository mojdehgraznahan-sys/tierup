import Link from "next/link";
import { Avatar, Tag } from "@/components/ui/primitives";
import { formatLabel } from "@/server/policies/discoverability";
import type { TutorCard as TutorCardData } from "@/server/services/discovery";
import { ratingText } from "@/lib/format";

/** Browse result card: the whole card links to the tutor's profile. */
export function TutorCard({ tutor, subjectId }: { tutor: TutorCardData; subjectId?: string }) {
  return (
    <Link
      href={`/tutors/${tutor.id}${subjectId ? `?subject=${subjectId}` : ""}`}
      className="card gap-2.5 p-4 text-ink no-underline hover:bg-ink/[.03] hover:text-ink"
    >
      <div className="flex items-center gap-3">
        <Avatar name={tutor.name} size={42} />
        <div className="flex flex-col">
          <span className="card-title">{tutor.name}</span>
          <span className="card-meta">{[tutor.grade, tutor.schoolName].filter(Boolean).join(" · ")}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Tag tone="accent-2">Teacher-approved</Tag>
        <Tag tone="neutral">{ratingText(tutor.rating)}</Tag>
        <Tag tone="outline">{formatLabel(tutor.formats)}</Tag>
      </div>
      <span className="muted text-[13px]">{tutor.subjects.map((s) => s.name).join(" · ")}</span>
    </Link>
  );
}

/** Compact card for "Tutors for your classes". */
export function TutorMiniCard({ tutor }: { tutor: TutorCardData }) {
  return (
    <Link href={`/tutors/${tutor.id}`} className="card flex-row items-center gap-3 p-3.5 text-ink no-underline hover:bg-ink/[.03] hover:text-ink">
      <Avatar name={tutor.name} size={38} />
      <div className="flex min-w-0 flex-col">
        <b>{tutor.name}</b>
        <span className="muted truncate text-xs">{tutor.subjects.map((s) => s.name).join(" · ")}</span>
      </div>
    </Link>
  );
}
