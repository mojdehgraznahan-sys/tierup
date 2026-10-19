import Link from "next/link";
import { ButtonLink, Card } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/format";
import { MessageButton } from "./message-button";

export type ResponseData = { id: string; tutorId: string; tutorName: string; message: string; createdAt: Date };

/** A tutor's reply to a request: Accept & book / Message / Profile. */
export function ResponseCard({ response, subjectId, requestId }: { response: ResponseData; subjectId: string; requestId: string }) {
  return (
    <Card className="gap-1.5 p-3">
      <div className="flex justify-between gap-2">
        <b>{response.tutorName}</b>
        <span className="card-meta">{timeAgo(response.createdAt)}</span>
      </div>
      <span className="text-sm">&ldquo;{response.message}&rdquo;</span>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/tutors/${response.tutorId}/book?subject=${subjectId}&request=${requestId}`} variant="primary">
          Accept &amp; book
        </ButtonLink>
        <MessageButton tutorId={response.tutorId} subjectId={subjectId} seedResponseId={response.id} />
        <Link href={`/tutors/${response.tutorId}?subject=${subjectId}`} className="btn btn-ghost">
          Profile
        </Link>
      </div>
    </Card>
  );
}
