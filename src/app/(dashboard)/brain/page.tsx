import { BrainBoard } from "@/components/dashboard/BrainBoard";
import { PageHeader } from "@/components/ui/PageHeader";

export default function BrainPage() {
  return (
    <>
      <PageHeader kicker="Mind" title="Brain" width="max-w-2xl" />
      <BrainBoard />
    </>
  );
}
