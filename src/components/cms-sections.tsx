import { bodyBlocks, type CmsSection } from "@/lib/cms-pages";

// Renders compliance-published CMS page sections as plain text (no HTML).
export function CmsSections({ sections }: { sections: CmsSection[] }) {
  if (!sections.length) return null;
  return (
    <>
      {sections.map((s) => (
        <section
          className="section page-section page-prose"
          key={s.key}
          data-cms-section={s.key}
          lang={s.locale ?? "en"}
        >
          <h2>{s.title}</h2>
          {bodyBlocks(s.body).map((b, i) =>
            b.type === "heading" ? (
              <h3 key={i}>{b.text}</h3>
            ) : b.type === "list" ? (
              <ul key={i}>
                {b.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            ) : (
              <p key={i}>{b.text}</p>
            ),
          )}
        </section>
      ))}
    </>
  );
}
