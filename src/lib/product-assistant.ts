import { z } from "zod";
export const assistantRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("knowledge"),
    question: z.string().trim().min(3).max(600),
    consent: z.literal(true),
  }),
  z.object({ mode: z.literal("order"), orderId: z.uuid() }),
]);
export const assistantSourceSchema = z.object({
  id: z.string(),
  title: z.string().max(160),
  text: z.string().max(30000),
  url: z.string().startsWith("/"),
  approvedAt: z.string(),
});
export type AssistantSource = z.infer<typeof assistantSourceSchema>;
export function restrictedQuestion(question: string) {
  return /\b(medic(al|ine|ation)|diagnos\w*|treat(ment)?|cur(e|es|ing)|disease|cancer|diabet\w*|pregnan\w*|breastfeed\w*|symptom\w*|dosage|pain|therap\w*|side.effect\w*|prescri\w*)\b|治疗|治療|癌|糖尿病|怀孕|懷孕|疾病|ubat|penyakit|kanser|gamot|sakit|buntis/i.test(
    question.normalize("NFKC"),
  );
}
export function selectCandidates(question: string, sources: AssistantSource[]) {
  // Only terms also present in the public approved corpus leave the server.
  // Names, account IDs, order numbers and arbitrary prompt instructions do not.
  const tokens = [
    ...new Set(
      question
        .normalize("NFKC")
        .toLocaleLowerCase()
        .match(/[\p{L}]{3,32}/gu) ?? [],
    ),
  ];
  const scored = sources
    .flatMap((source) =>
      source.text
        .split(/\n\s*\n/)
        .filter((text) => text.trim())
        .map((text, index) => ({
          ...source,
          id: `${source.id}:${index}`,
          text: text.trim().slice(0, 1800),
          score: tokens.filter((token) =>
            (source.title + " " + text).toLocaleLowerCase().includes(token),
          ).length,
        })),
    )
    .filter((source) => source.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  const publicTerms = tokens
    .filter((token) =>
      scored.some((source) =>
        (source.title + " " + source.text).toLocaleLowerCase().includes(token),
      ),
    )
    .slice(0, 24);
  return {
    sources: scored.map(({ score, ...source }) => source),
    terms: publicTerms,
  };
}
export const assistantResponseSchema = z.object({
  message: z.string(),
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      text: z.string(),
      url: z.string(),
    }),
  ),
  handoff: z.literal("/support"),
});
