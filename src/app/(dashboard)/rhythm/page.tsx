import { RhythmBoard } from "@/components/dashboard/RhythmBoard";
import { PageHeader } from "@/components/ui/PageHeader";

export default function RhythmPage() {
  return (
    <>
      <PageHeader kicker="Plan" title="Rhythm" width="max-w-3xl" />
      <RhythmBoard />
    </>
  );
}
