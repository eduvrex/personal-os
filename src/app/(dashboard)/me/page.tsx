import { ProfileSection } from "@/components/dashboard/ProfileSection";
import { KnowledgeBaseSection } from "@/components/dashboard/KnowledgeBaseSection";
import { PlansSection } from "@/components/dashboard/PlansSection";
import { ResumeSection } from "@/components/dashboard/ResumeSection";
import { PersonalSpace } from "@/components/dashboard/PersonalSpace";
import { BackupSection } from "@/components/dashboard/BackupSection";
import { CalendarFeedsSection } from "@/components/dashboard/CalendarFeedsSection";
import { ConnectionsPanel } from "@/components/dashboard/ConnectionsPanel";
import { PageHeader } from "@/components/ui/PageHeader";

export default function MePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeader kicker="Operator" title="Me" />
      <ProfileSection />
      <KnowledgeBaseSection />
      <PlansSection />
      <ResumeSection />
      <PersonalSpace />
      <CalendarFeedsSection />
      <ConnectionsPanel />
      <BackupSection />
    </div>
  );
}
