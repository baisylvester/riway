import { z } from "zod";
import { marketSchema } from "./domain";

export const privacyKinds = {
  access: "Access or copy of my data",
  correction: "Correct my data",
  erasure: "Request deletion",
  restriction: "Restrict use of my data",
} as const;
export const privacyStatuses = {
  submitted: "Submitted",
  in_review: "In review",
  needs_information: "More information needed",
  completed: "Completed",
  declined: "Declined",
  withdrawn: "Withdrawn",
} as const;
export const privacyKindSchema = z.enum(
  Object.keys(privacyKinds) as [
    keyof typeof privacyKinds,
    ...(keyof typeof privacyKinds)[],
  ],
);
export const privacyStatusSchema = z.enum(
  Object.keys(privacyStatuses) as [
    keyof typeof privacyStatuses,
    ...(keyof typeof privacyStatuses)[],
  ],
);
const body = (minimum: number) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(2000)
    .regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/);
const reference = z
  .string()
  .max(120)
  .regex(/^[^\u0000-\u001f\u007f]*$/)
  .trim()
  .refine((v) => !v || v.length >= 3);
export const privacyIntakeSchema = z.object({
  market: marketSchema,
  kind: privacyKindSchema,
  details: body(20),
});
export const privacyUpdateSchema = z
  .object({
    id: z.uuid(),
    revision: z.coerce.number().int().nonnegative(),
    operation: z.enum(["message", "withdraw", "review"]),
    status: z.string().default(""),
    message: z.string().default(""),
    verification: reference.default(""),
    reference: reference.default(""),
  })
  .superRefine((v, ctx) => {
    if (v.operation !== "withdraw" && !body(10).safeParse(v.message).success)
      ctx.addIssue({
        code: "custom",
        message: "Enter a message of 10–2000 characters.",
        path: ["message"],
      });
    if (
      v.operation === "review" &&
      !["in_review", "needs_information", "completed", "declined"].includes(
        v.status,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose a review status.",
        path: ["status"],
      });
    if (
      v.operation === "review" &&
      ["completed", "declined"].includes(v.status) &&
      !v.reference
    )
      ctx.addIssue({
        code: "custom",
        message: "Enter a resolution reference.",
        path: ["reference"],
      });
  });
const summary = z.object({
  id: z.uuid(),
  market: marketSchema,
  kind: privacyKindSchema,
  status: privacyStatusSchema,
  revision: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export const privacyListSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  requests: summary.array().max(25),
});
export const privacyDetailSchema = summary.extend({
  details: z.string().max(2000),
  identityVerified: z.boolean(),
  totalEvents: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  events: z
    .object({
      id: z.uuid(),
      byStaff: z.boolean(),
      status: privacyStatusSchema,
      message: z.string().max(2000),
      createdAt: z.iso.datetime({ offset: true }),
    })
    .array()
    .max(25),
});
export type PrivacyDetail = z.infer<typeof privacyDetailSchema>;
export type PrivacyList = z.infer<typeof privacyListSchema>;
export const privacyOpen = (status: string) =>
  ["submitted", "in_review", "needs_information"].includes(status);
export function privacyPage(value: string | string[] | undefined) {
  return typeof value === "string" &&
    /^\d{1,7}$/.test(value) &&
    Number(value) <= 1000000
    ? Number(value)
    : 0;
}
export function privacyProblem(code?: string) {
  if (code === "42501")
    return "Sign in with the account or authorized privacy role for this request.";
  if (code === "40001")
    return "This request changed. Reload before continuing.";
  if (code === "23505")
    return "An open request of this type already exists. Add a message to it below.";
  if (code === "22023" || code === "23514")
    return "Check the request, status and required verification or resolution references.";
  if (code === "P0001")
    return "This change is unavailable. Check the request or try again later.";
  return "Privacy requests could not be reached. Please try again.";
}
