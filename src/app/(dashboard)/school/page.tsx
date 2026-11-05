import { SchoolBoard } from "@/components/dashboard/SchoolBoard";
import { PageHeader } from "@/components/ui/PageHeader";

export default function SchoolPage() {
  return (
    <>
      <PageHeader kicker="School" title="School" width="max-w-4xl" />
      <SchoolBoard />
    </>
  );
}
