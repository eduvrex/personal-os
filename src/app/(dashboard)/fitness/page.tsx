import { FitnessBoard } from "@/components/dashboard/FitnessBoard";
import { PageHeader } from "@/components/ui/PageHeader";

export default function FitnessPage() {
  return (
    <>
      <PageHeader kicker="Body" title="Fitness" width="max-w-3xl" />
      <FitnessBoard />
    </>
  );
}
