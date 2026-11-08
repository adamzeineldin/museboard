import { redirect } from "next/navigation";

// The proxy sends signed-out visitors from /jobs to /signin.
export default function Home(): never {
  redirect("/jobs");
}
