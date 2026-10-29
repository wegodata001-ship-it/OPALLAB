import { redirect } from "next/navigation";

export default function LegacyRawRedirect() {
  redirect("/inventory");
}
