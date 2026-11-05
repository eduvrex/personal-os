import { SpendingBoard } from "@/components/dashboard/SpendingBoard";
import { PageHeader } from "@/components/ui/PageHeader";

export default function SpendingPage() {
  return (
    <>
      <PageHeader kicker="Money" title="Spending" width="max-w-3xl" />
      <SpendingBoard />
    </>
  );
}
