import { z } from "zod";
import { marketSchema, markets } from "./domain";

const kindSchema = z.enum(["package", "promotion"]);
const statusSchema = z.enum(["draft", "review", "archived"]);
const positiveMinor = z.number().int().min(1).max(100000000);
const revisionSchema = z.number().int().min(0).max(2147483647);
const uniqueIds = (ids: string[]) =>
  new Set(ids.map((id) => id.toLowerCase())).size === ids.length;

export const packageDefinitionSchema = z
  .object({
    components: z
      .array(
        z
          .object({
            productId: z.uuid(),
            quantity: z.number().int().min(1).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(30)
      .refine((items) => uniqueIds(items.map((item) => item.productId)), {
        message: "Choose each component product only once.",
      }),
    retailMinor: positiveMinor.nullable(),
    memberMinor: positiveMinor.nullable(),
  })
  .strict();

// Authoring uses UTC with seconds and at most millisecond precision. The ISO
// validator also rejects normalized impossible dates such as 31 February.
const authoringDateSchema = z.iso
  .datetime()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/)
  .refine((value) => {
    const year = Number(value.slice(0, 4));
    return year >= 1900 && year <= 2100;
  }, "Use a UTC date between 1900 and 2100.");

export const promotionDefinitionSchema = z
  .object({
    productIds: z
      .array(z.uuid())
      .min(1)
      .max(30)
      .refine(uniqueIds, { message: "Choose each target product only once." }),
    discountType: z.enum(["percent", "fixed"]),
    discountValue: positiveMinor,
    minimumSubtotalMinor: z.number().int().min(0).max(100000000),
    maximumDiscountMinor: positiveMinor.nullable(),
    voucherCode: z
      .string()
      .regex(/^[A-Z0-9-]{3,40}$/)
      .nullable(),
    startsAt: authoringDateSchema,
    endsAt: authoringDateSchema,
    audience: z.enum(["all", "retail", "member"]),
    usageLimit: z.number().int().min(1).max(1000000).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.discountType === "percent" && value.discountValue > 10000) {
      context.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: "Percentage discounts use 1 to 10,000 basis points.",
      });
    }
    if (value.discountType === "fixed" && value.maximumDiscountMinor !== null) {
      context.addIssue({
        code: "custom",
        path: ["maximumDiscountMinor"],
        message: "A maximum discount applies only to percentage discounts.",
      });
    }
    if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "End time must be after start time.",
      });
    }
  });

const inputFields = {
  draftId: z.uuid().nullable(),
  market: marketSchema,
  name: z.string().trim().min(2).max(120),
  status: statusSchema,
  expectedRevision: revisionSchema,
};

export const commerceDraftInputSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        ...inputFields,
        kind: z.literal("package"),
        definition: packageDefinitionSchema,
      })
      .strict(),
    z
      .object({
        ...inputFields,
        kind: z.literal("promotion"),
        definition: promotionDefinitionSchema,
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (
      (value.draftId === null && value.expectedRevision !== 0) ||
      (value.draftId !== null && value.expectedRevision < 1)
    ) {
      context.addIssue({
        code: "custom",
        path: ["expectedRevision"],
        message:
          "New drafts start at revision zero; edits need a saved revision.",
      });
    }
  });

// PostgreSQL serializes server timestamps with offsets and microseconds.
const recordTimestampSchema = z.iso.datetime({ offset: true }).max(40);
const recordFields = {
  id: z.uuid(),
  market: marketSchema,
  currency: z.enum(["PHP", "SGD", "MYR"]),
  name: z.string().min(2).max(120),
  status: statusSchema,
  revision: revisionSchema.min(1),
  createdBy: z.uuid(),
  updatedBy: z.uuid(),
  createdAt: recordTimestampSchema,
  updatedAt: recordTimestampSchema,
};

export const commerceDraftRecordSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        ...recordFields,
        kind: z.literal("package"),
        definition: packageDefinitionSchema,
      })
      .strict(),
    z
      .object({
        ...recordFields,
        kind: z.literal("promotion"),
        definition: promotionDefinitionSchema,
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (markets[value.market].currency !== value.currency) {
      context.addIssue({
        code: "custom",
        path: ["currency"],
        message: "Currency must match the draft market.",
      });
    }
  });

export const commerceDraftListSchema = z
  .object({
    drafts: z.array(commerceDraftRecordSchema).max(50),
    markets: z
      .array(marketSchema)
      .max(3)
      .refine((values) => new Set(values).size === values.length),
    hasMore: z.boolean(),
    page: z.number().int().min(1).max(1000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.drafts.some((draft) => !value.markets.includes(draft.market))) {
      context.addIssue({
        code: "custom",
        path: ["drafts"],
        message: "Draft records must belong to a permitted market.",
      });
    }
  });

export type DraftKind = z.infer<typeof kindSchema>;
export type DraftStatus = z.infer<typeof statusSchema>;
export type PackageDefinition = z.infer<typeof packageDefinitionSchema>;
export type PromotionDefinition = z.infer<typeof promotionDefinitionSchema>;
export type CommerceDraft = z.infer<typeof commerceDraftRecordSchema>;
