"use client";

import { useState, useTransition } from "react";
import { completeAndReviewAction } from "@/app/(app)/sessions/actions";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useDialog } from "@/components/ui/use-dialog";
import { LOW_RATING, REVIEW_TAGS } from "@/lib/review";

type Happened = "yes" | "cut_short" | "no_show";
type Tag = (typeof REVIEW_TAGS)[number];

const HAPPENED: [Happened, string][] = [
  ["yes", "Yes"],
  ["cut_short", "Cut short"],
  ["no_show", "Tutor didn't show"],
];
const STAR_WORDS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

type Props = { sessionId: string; subjectName: string; tutorName: string; defaultOpen?: boolean };

/** "Mark complete & review" (SCREENS.md › 9): submitting confirms the session for the tutor's hours. */
export function ReviewButton({ sessionId, subjectName, tutorName, defaultOpen = false }: Props) {
  const flash = useToast();
  const { open, setOpen, trigger, dialog } = useDialog(defaultOpen);
  const [happened, setHappened] = useState<Happened>("yes");
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [tags, setTags] = useState<Tag[]>([]);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  const noShow = happened === "no_show";
  const ready = noShow || stars > 0;
  const shown = hover || stars;
  const toggleTag = (t: Tag) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const submit = () =>
    startTransition(async () => {
      const result = await completeAndReviewAction(sessionId, {
        happened,
        stars: noShow ? undefined : stars,
        tags: noShow ? [] : tags,
        comment: comment.trim() || undefined,
      });
      flash(result.ok ? result.toast : result.error);
      if (result.ok) setOpen(false);
    });

  return (
    <>
      <Button ref={trigger} variant="primary" aria-haspopup="dialog" className="w-full py-[9px]" onClick={() => setOpen(true)}>
        Mark complete &amp; review
      </Button>
      {open && (
        <div className="dialog-backdrop" onClick={() => !pending && setOpen(false)}>
          <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="review-title" className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3 id="review-title" className="text-xl">
              How was {subjectName} with {tutorName}?
            </h3>

            <div className="field">
              <span className="field-label" id="review-happened">
                Did the session happen?
              </span>
              <div className="seg" role="radiogroup" aria-labelledby="review-happened">
                {HAPPENED.map(([value, label]) => (
                  <label key={value} className="seg-opt px-3 text-[13px]">
                    <input type="radio" name="review-happened" checked={happened === value} onChange={() => setHappened(value)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {!noShow && (
              <>
                <div className="field">
                  <span className="field-label" id="review-stars">
                    Your rating
                  </span>
                  <div className="flex items-center gap-3">
                    <div role="radiogroup" aria-labelledby="review-stars" className="flex" onMouseLeave={() => setHover(0)}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <label
                          key={n}
                          onMouseEnter={() => setHover(n)}
                          className="cursor-pointer px-0.5 text-[28px] leading-none has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-accent"
                        >
                          <input type="radio" name="review-stars" className="sr-only" checked={stars === n} onChange={() => setStars(n)} />
                          <span aria-hidden className={n <= shown ? "text-accent" : "text-neutral-300"}>
                            ★
                          </span>
                          <span className="sr-only">
                            {n} star{n === 1 ? "" : "s"}, {STAR_WORDS[n]}
                          </span>
                        </label>
                      ))}
                    </div>
                    <span className="muted text-sm" aria-hidden>
                      {STAR_WORDS[shown]}
                    </span>
                  </div>
                </div>

                <div className="field">
                  <span className="field-label" id="review-tags">
                    What went well? (optional)
                  </span>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="review-tags">
                    {REVIEW_TAGS.map((t) => (
                      <button key={t} type="button" className="chip" aria-pressed={tags.includes(t)} onClick={() => toggleTag(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="field">
              <label htmlFor="review-comment">{noShow ? "What happened? (optional)" : "Anything else? (optional)"}</label>
              <textarea id="review-comment" className="input" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>

            <p className="muted m-0 text-xs">
              {noShow
                ? "School staff will be told privately so they can follow up."
                : stars > 0 && stars <= LOW_RATING
                  ? `Submitting confirms ${tutorName}'s service hours. Low ratings are also shared privately with school staff.`
                  : `Submitting confirms ${tutorName}'s service hours.`}
            </p>

            <div className="flex justify-end gap-2">
              <Button onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submit} disabled={!ready || pending}>
                {pending ? "Sending…" : "Submit"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
