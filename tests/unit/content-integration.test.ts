import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ db: vi.fn() }));
const { bodyBlocks, pickSections, slugCandidates } =
  await import("@/lib/cms-pages");
const { productContentRequestSchema } = await import("@/lib/product-content");
const { listingRequestSchema } = await import("@/lib/distributor-directory");

describe("CMS page sections", () => {
  it("prefers the most specific published entry", () => {
    expect(slugCandidates("about-history", "PH")).toEqual([
      "about-history-ph-en",
      "about-history-ph",
      "about-history",
    ]);
    const rows = [
      { slug: "about-history", title: "Global", body: "Global text" },
      { slug: "about-history-ph", title: "Philippines", body: "PH text" },
      { slug: "about-foundation", title: "Foundation", body: "  " },
    ];
    const sections = pickSections(
      ["about-history", "about-foundation", "about-leadership"],
      "PH",
      rows,
    );
    expect(sections).toEqual([
      { key: "about-history", title: "Philippines", body: "PH text" },
    ]);
    expect(pickSections(["about-history"], "SG", rows)[0].title).toBe("Global");
  });

  it("resolves a translated entry before the English fallback", () => {
    const rows = [
      { slug: "support-contacts", title: "Contacts", body: "English" },
      { slug: "support-contacts-fil", title: "Mga contact", body: "Filipino" },
    ];
    expect(pickSections(["support-contacts"], "PH", rows, "fil")[0].body).toBe(
      "Filipino",
    );
    expect(pickSections(["support-contacts"], "PH", rows)[0].body).toBe(
      "English",
    );
  });

  it("turns plain text into headings, lists and paragraphs without HTML", () => {
    expect(
      bodyBlocks(
        "## Our story\n\nFirst line\ncontinues.\n\n- One\n- Two\n\n<script>x</script>",
      ),
    ).toEqual([
      { type: "heading", text: "Our story" },
      { type: "paragraph", text: "First line continues." },
      { type: "list", items: ["One", "Two"] },
      { type: "paragraph", text: "<script>x</script>" },
    ]);
  });
});

describe("content inputs", () => {
  const base = {
    productId: "4f8a2c10-1111-4222-8333-444455556666",
    market: "PH",
    ingredients: "",
    usage: "",
    labelNotes: "",
    regulatoryStatement: "",
    videoUrl: "",
    status: "draft",
    approvalReference: "",
  };
  it("accepts only YouTube or Vimeo video links", () => {
    expect(productContentRequestSchema.safeParse(base).success).toBe(true);
    for (const videoUrl of [
      "https://www.youtube.com/watch?v=abc_123",
      "https://youtu.be/abc123",
      "https://vimeo.com/12345",
    ])
      expect(
        productContentRequestSchema.safeParse({ ...base, videoUrl }).success,
      ).toBe(true);
    for (const videoUrl of [
      "https://evil.example/watch?v=1",
      "javascript:alert(1)",
      "https://www.youtube.com/watch?v=1&x=<b>",
    ])
      expect(
        productContentRequestSchema.safeParse({ ...base, videoUrl }).success,
      ).toBe(false);
  });

  it("keeps directory cities to plain names", () => {
    expect(
      listingRequestSchema.parse({ listed: "on", city: " Quezon City " }),
    ).toEqual({ listed: true, city: "Quezon City" });
    expect(
      listingRequestSchema.safeParse({ listed: "on", city: "<script>" })
        .success,
    ).toBe(false);
  });
});
