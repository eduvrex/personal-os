import { WishlistBoard } from "@/components/dashboard/WishlistBoard";
import { PageHeader } from "@/components/ui/PageHeader";

export default function WishlistPage() {
  return (
    <>
      <PageHeader kicker="Money" title="Wishlist" width="max-w-3xl" />
      <WishlistBoard />
    </>
  );
}
