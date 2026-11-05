import { ReflectBoard } from "@/components/dashboard/ReflectBoard";
import { PageHeader } from "@/components/ui/PageHeader";

export default function ReflectPage() {
  return (
    <>
      <PageHeader kicker="Mind" title="Reflect" width="max-w-2xl" />
      <ReflectBoard />
    </>
  );
}
