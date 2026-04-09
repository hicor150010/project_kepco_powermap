import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import MapClient from "@/components/map/MapClient";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <MapClient isAdmin={user.role === "admin"} email={user.email} />;
}
