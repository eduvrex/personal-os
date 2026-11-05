import { ApplicationsBoard } from "@/components/dashboard/ApplicationsBoard";
import { TailorPanel } from "@/components/dashboard/TailorPanel";
import { PageHeader } from "@/components/ui/PageHeader";

export default function ApplyPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader kicker="School" title="Apply" width="max-w-6xl" />
      <ApplicationsBoard />
      <div className="mx-auto w-full max-w-6xl">
        <TailorPanel />
      </div>
    </div>
  );
}
