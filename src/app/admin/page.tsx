import Link from "next/link";
import { dismissWaitlistAction, markSchoolAddedAction, verifyStaffRequestAction } from "./actions";
import { AddSchoolForm, DomainEditor } from "@/components/admin/admin-forms";
import { ActionButton } from "@/components/staff/action-button";
import { Card, Tag } from "@/components/ui/primitives";
import { requireAdmin } from "@/server/policies/session";
import { schoolsOverview, waitlist } from "@/server/services/admin";
import { timeAgo } from "@/lib/format";

type Props = { searchParams: Promise<{ tab?: string; q?: string }> };

export default async function AdminPage({ searchParams }: Props) {
  const admin = await requireAdmin();
  const { tab: raw, q } = await searchParams;
  const tab = raw === "schools" ? "schools" : "waitlist";
  const list = await waitlist(admin);
  const waitingCount = list.staff.length + list.students.length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-8">
        <h1>TierUp admin</h1>
        <nav className="seg" aria-label="Admin sections">
          <Link href="/admin" className="seg-opt" aria-current={tab === "waitlist" ? "page" : undefined}>
            Waitlist{waitingCount ? ` (${waitingCount})` : ""}
          </Link>
          <Link href="/admin?tab=schools" className="seg-opt" aria-current={tab === "schools" ? "page" : undefined}>
            Schools
          </Link>
        </nav>
      </div>
      {tab === "waitlist" ? <Waitlist list={list} /> : <Schools admin={admin} q={q} />}
    </div>
  );
}

function Waitlist({ list }: { list: Awaited<ReturnType<typeof waitlist>> }) {
  return (
    <>
      <Card kicker="Teachers waiting for staff access" className="gap-0">
        {list.staff.length === 0 && <span className="muted text-sm">Nobody waiting.</span>}
        {list.staff.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-divider py-3 first-of-type:border-t-0">
            <div className="flex flex-col">
              <b className="text-sm">{e.email}</b>
              <span className="card-meta">
                {e.school?.name} · {timeAgo(e.createdAt)}
                {e.school?.staffEmailDomains.length ? ` · school already uses @${e.school.staffEmailDomains.join(", @")}` : ""}
              </span>
              {e.freeMail && <span className="text-xs text-accent-2-800">Personal email address: can&apos;t verify a domain from it. Ask the teacher to use their school email.</span>}
            </div>
            <div className="flex gap-2">
              {!e.freeMail && (
                <ActionButton
                  action={verifyStaffRequestAction.bind(null, e.id)}
                  variant="primary"
                  confirm={`Make @${e.domain} a staff domain for ${e.school?.name}? Anyone with an @${e.domain} address will be able to sign up as staff there. Only do this if you've confirmed the domain belongs to the school.`}
                >
                  Verify @{e.domain}
                </ActionButton>
              )}
              <ActionButton action={dismissWaitlistAction.bind(null, e.id)} variant="ghost">
                Dismiss
              </ActionButton>
            </div>
          </div>
        ))}
      </Card>

      <Card kicker="Students whose school isn't listed" className="gap-0">
        {list.students.length === 0 && <span className="muted text-sm">Nobody waiting.</span>}
        {list.students.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-divider py-3 first-of-type:border-t-0">
            <div className="flex flex-col">
              <b className="text-sm">{e.schoolName}</b>
              <span className="card-meta">
                {e.email} · {timeAgo(e.createdAt)}
              </span>
            </div>
            <div className="flex gap-2">
              <Link href={`/admin?tab=schools&q=${encodeURIComponent(e.schoolName)}`} className="btn btn-secondary">
                Find or add school
              </Link>
              <ActionButton action={markSchoolAddedAction.bind(null, e.id)}>Mark added</ActionButton>
              <ActionButton action={dismissWaitlistAction.bind(null, e.id)} variant="ghost">
                Dismiss
              </ActionButton>
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}

async function Schools({ admin, q }: { admin: { email: string }; q?: string }) {
  const schools = await schoolsOverview(admin, q);
  return (
    <>
      <form className="flex gap-2" role="search">
        <input type="hidden" name="tab" value="schools" />
        <input name="q" aria-label="Search schools" className="input max-w-sm" placeholder="Search schools" defaultValue={q} />
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
      </form>
      <div className="overflow-x-auto">
        <table className="table min-w-[860px]">
          <thead>
            <tr>
              <th>School</th>
              <th>Status</th>
              <th>Staff</th>
              <th>Students</th>
              <th>Waiting</th>
              <th>Staff email domains</th>
            </tr>
          </thead>
          <tbody>
            {schools.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.name} <span className="muted text-xs">· {s.state}</span> {s.isDemo && <Tag tone="neutral">Demo</Tag>}
                </td>
                <td>
                  <Tag tone={s.active ? "accent" : "neutral"}>{s.active ? "Open" : "Not open"}</Tag>
                </td>
                <td>{s.staff}</td>
                <td>{s.students}</td>
                <td>{s.waiting || ""}</td>
                <td>
                  <DomainEditor schoolId={s.id} schoolName={s.name} domains={s.domains} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {schools.length === 0 && <p className="muted m-0">No schools match &ldquo;{q}&rdquo;.</p>}
      <AddSchoolForm defaultName={schools.length === 0 ? q : ""} />
    </>
  );
}
