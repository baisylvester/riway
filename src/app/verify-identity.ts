"use server";
import { auth, reverificationError } from "@clerk/nextjs/server";
export async function verifyStaffIdentity() {
  const identity = await auth();
  const requirement = { level: "multi_factor", afterMinutes: 15 } as const;
  if (!identity.has({ reverification: requirement }))
    return reverificationError(requirement);
  return { verified: true };
}
