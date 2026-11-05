import { GoalsBoard } from "@/components/dashboard/GoalsBoard";
import { PageHeader } from "@/components/ui/PageHeader";

export default function GoalsPage() {
  return (
    <>
      <PageHeader kicker="Plan" title="Goals" width="max-w-3xl" />
      <GoalsBoard />
    </>
  );
}
