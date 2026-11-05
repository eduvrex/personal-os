import { CalendarBoard } from "@/components/dashboard/CalendarBoard";
import { PageHeader } from "@/components/ui/PageHeader";

export default function CalendarPage() {
  return (
    <>
      <PageHeader kicker="Plan" title="Calendar" width="max-w-6xl" />
      <CalendarBoard />
    </>
  );
}
