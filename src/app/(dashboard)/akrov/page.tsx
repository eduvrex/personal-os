import { AkrovBoard } from "@/components/dashboard/AkrovBoard";
import { PageHeader } from "@/components/ui/PageHeader";

export default function AkrovPage() {
  return (
    <>
      <PageHeader kicker="Work" title="Akrov" width="max-w-3xl" />
      <AkrovBoard />
    </>
  );
}
