import { HomeDashboard } from "@/components/HomeDashboard";
import { LockInBoard } from "@/components/dashboard/LockInBoard";
import { isLockinActive } from "@/lib/config/lockin";
import { localDateKey } from "@/lib/localDate";

// Decided per request: lock-in owns the front page only inside its window.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return isLockinActive(localDateKey()) ? <LockInBoard /> : <HomeDashboard />;
}
