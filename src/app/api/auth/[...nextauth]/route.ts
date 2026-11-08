import { handlers } from "@/lib/auth";
import { withMagicLinkGuard } from "./magic-link-guard";

export const GET = handlers.GET;
// Direct sign-in POSTs get the same magic-link limits as the sign-in form.
export const POST = withMagicLinkGuard(handlers.POST);
