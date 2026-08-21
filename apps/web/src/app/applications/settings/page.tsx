import { redirect } from "next/navigation";

export default function ApplicationSettingsRedirectPage() {
  redirect("/profile");
}
