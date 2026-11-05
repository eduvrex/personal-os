import { FinanceBoard } from "@/components/dashboard/FinanceBoard";
import { PageHeader } from "@/components/ui/PageHeader";

export default function FinancePage() {
  return (
    <>
      <PageHeader kicker="Money" title="Finance" width="max-w-3xl" />
      <FinanceBoard />
    </>
  );
}
