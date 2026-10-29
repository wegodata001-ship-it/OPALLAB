import { redirect } from "next/navigation";

export default function LegacyPartsRedirect() {
  redirect("/inventory");
}
