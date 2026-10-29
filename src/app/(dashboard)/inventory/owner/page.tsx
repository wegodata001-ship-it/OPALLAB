import { redirect } from "next/navigation";

export default function LegacyOwnerRedirect() {
  redirect("/inventory");
}
