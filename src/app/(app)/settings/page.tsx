import type { Metadata } from "next";
import {
  AvailabilitySection,
  BasicsSection,
  BioSection,
  LearnerSubjectsSection,
  ParentSection,
  PrivacySection,
  StaffNameSection,
  TutorSubjectsSection,
} from "@/components/settings/sections";
import { requireOnboarded } from "@/server/policies/session";
import { subjectGroups } from "@/server/services/catalog";
import { settingsView } from "@/server/services/profile";
import { parentConsentEnabled, transcriptsEnabled } from "@/server/policies/rules";
import { currentConsents } from "@/server/services/privacy-consent";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireOnboarded();
  const [v, groups, consents] = await Promise.all([settingsView(user.id), subjectGroups(), currentConsents(user.id)]);
  const isStaff = v.roles.includes("staff");
  const isLearner = v.roles.includes("learner");
  const isTutor = v.roles.includes("tutor");

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <div className="pt-8">
        <span className="kicker">{v.school?.name ?? "Your account"}</span>
        <h1 className="mt-1">Settings</h1>
      </div>

      {isStaff ? (
        <StaffNameSection name={v.staffName} />
      ) : (
        <BasicsSection firstName={v.firstName} lastName={v.lastName} grade={v.grade} schoolEmail={v.schoolEmail} formats={v.formats} />
      )}
      {isTutor && <BioSection bio={v.bio} />}
      {(isLearner || isTutor) && <AvailabilitySection slots={v.slots} selected={v.availability} hasSchool={!!v.school} />}
      {isLearner && <LearnerSubjectsSection subjects={v.learnerSubjects} groups={groups} />}
      {isTutor && <TutorSubjectsSection subjects={v.tutorSubjects} groups={groups} staffDomain={v.school?.staffDomain ?? null} />}
      {(isLearner || isTutor) && <PrivacySection askTranscripts={transcriptsEnabled()} transcripts={consents.transcripts} analytics={consents.analytics} />}
      {parentConsentEnabled() && v.consent && <ParentSection parentEmail={v.consent.parentEmail} status={v.consent.status} sendSummaries={v.consent.sendSummaries} />}
    </div>
  );
}
