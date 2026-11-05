import { TasksBoard } from "@/components/dashboard/TasksBoard";
import { PageHeader } from "@/components/ui/PageHeader";

export default function TasksPage() {
  return (
    <>
      <PageHeader kicker="Plan" title="Tasks" width="max-w-3xl" />
      <TasksBoard />
    </>
  );
}
