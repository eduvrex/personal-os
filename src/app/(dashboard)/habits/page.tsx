import { HabitsBoard } from "@/components/dashboard/HabitsBoard";
import { PageHeader } from "@/components/ui/PageHeader";

export default function HabitsPage() {
  return (
    <>
      <PageHeader kicker="Plan" title="Habits" />
      <HabitsBoard />
    </>
  );
}
