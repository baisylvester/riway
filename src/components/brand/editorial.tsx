import Link from "next/link";
import { ProductStage } from "./product-stage";
import { EditionWheel, ThemeGallery } from "./brand-interactions";
export function Unboxing({
  kind,
  href,
}: {
  kind: "purtier" | "conscientious";
  href: string;
}) {
  const purtier = kind === "purtier";
  return (
    <section
      className={`rw-unboxing ${purtier ? "rw-dark" : "rw-blush"}`}
      data-unboxing={kind}
      aria-label={`${purtier ? "PURTIER" : "CONSCIENTIOUS"} packaging sequence`}
    >
      <div className="rw-unbox-sticky">
        <span className="rw-ghost" aria-hidden="true">
          {purtier ? "PURTIER" : "CONSCIENTIOUS"}
        </span>
        <div className="rw-topline">
          <span>{purtier ? "PURTIER PLACENTA" : "CONSCIENTIOUS"}</span>
          <span>The house, unboxed</span>
        </div>
        <ProductStage kind={kind} dark={purtier} />
        <div className="rw-unbox-copy">
          <span className="eyebrow">The presentation</span>
          <h2>
            {purtier ? (
              <>
                Considered.
                <br />
                <em>Inside and out.</em>
              </>
            ) : (
              <>
                A collection of
                <br />
                <em>contrasts.</em>
              </>
            )}
          </h2>
          <p>
            {purtier
              ? "Discover the signature collection and its distinctive presentation."
              : "Black and blush. Explore CONSCIENTIOUS through its packaging and collection photography."}
          </p>
          <Link className="rw-pill" href={href}>
            Explore the collection ↗
          </Link>
        </div>
        <ol className="rw-unbox-steps" aria-label="Unboxing sequence">
          <li>01 · The box</li>
          <li>02 · The reveal</li>
          <li>03 · The collection</li>
          <li>04 · The detail</li>
        </ol>
      </div>
    </section>
  );
}
export function Houses({
  purtier,
  conscientious,
}: {
  purtier?: string;
  conscientious?: string;
}) {
  const houses = [
    [
      "The company",
      "RIWAY",
      "International",
      "/about",
      "/design/riway/emblem-gold.jpg",
      "RIWAY gold emblem",
    ],
    [
      "Nutrition",
      "PURTIER",
      "Placenta",
      purtier || "/shop",
      "/design/purtier/carton-7th.jpg",
      "PURTIER burgundy presentation carton",
    ],
    [
      "Personal care",
      "CONSCIENTIOUS",
      "The collection",
      conscientious || "/shop",
      "/design/conscientious/collection.jpg",
      "CONSCIENTIOUS collection with presentation boxes",
    ],
  ];
  return (
    <section
      className="rw-houses"
      id="collections"
      aria-label="The three houses"
    >
      {houses.map(([category, title, subtitle, href, image, alt], i) => (
        <Link className="rw-house" href={href} key={title}>
          <span className="rw-house-number">0{i + 1}</span>
          <div>
            <span className="eyebrow">{category}</span>
            <h2>
              {title}
              <br />
              <em>{subtitle}</em>
            </h2>
          </div>
          <img src={image} alt={alt} loading="lazy" />
          <span className="rw-house-link">
            Discover the house <span>↗</span>
          </span>
        </Link>
      ))}
    </section>
  );
}
export function RightWayTrack() {
  const cards = [
    [
      "Golden Deer Award",
      "/design/riway/supreme-night.jpg",
      "RIWAY recognition stage",
    ],
    [
      "RIWAY Foundation",
      "/design/riway/foundation-hands.jpg",
      "Hands joined together",
    ],
    ["Baby Pegasus", "/design/riway/yacht-1.jpg", "Baby Pegasus yacht at sea"],
    [
      "Our community",
      "/design/riway/tlm-istanbul.jpg",
      "RIWAY community gathering",
    ],
    [
      "A world of connections",
      "/design/riway/hero-skyline.jpg",
      "Looking across the city",
    ],
  ];
  return (
    <section className="rw-section rw-track-section" id="rightway">
      <div className="rw-section-heading">
        <div>
          <span className="eyebrow">The Right Way</span>
          <h2>
            One world.
            <br />
            <em>Many possibilities.</em>
          </h2>
        </div>
        <p>
          Discover our company, the RIWAY Foundation, the Golden Deer Award and
          Baby Pegasus through RIWAY’s official channels.
        </p>
      </div>
      <div
        className="rw-track"
        tabIndex={0}
        role="region"
        aria-label="The RIWAY world, scroll to explore"
      >
        {cards.map(([title, image, alt], i) => (
          <Link className="rw-track-card" href="/about" key={title}>
            <img src={image} alt={alt} loading="lazy" />
            <span className="eyebrow">0{i + 1} — RIWAY International</span>
            <h3>{title}</h3>
            <span>Explore our world ↗</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
export function Recognition() {
  return (
    <section className="rw-section rw-recognition">
      <div>
        <span className="eyebrow">Recognition</span>
        <h2>
          A shared vision.
          <br />
          <em>A meaningful journey.</em>
        </h2>
        <p>
          Discover the Golden Deer Award and the people behind the RIWAY story.
          Additional corporate and leadership content will be published
          following editorial approval.
        </p>
        <Link className="text-link" href="/about">
          The RIWAY story ↗
        </Link>
      </div>
      <img
        src="/design/riway/supreme-night.jpg"
        alt="RIWAY recognition event stage"
        loading="lazy"
      />
    </section>
  );
}
export function ProductEditorial({
  slug,
  href,
}: {
  slug: string;
  href: string;
}) {
  if (slug !== "purtier-placenta" && slug !== "conscientious") return null;
  const purtier = slug === "purtier-placenta";
  return (
    <div className="rw-brand">
      <Unboxing kind={purtier ? "purtier" : "conscientious"} href={href} />
      {purtier ? (
        <>
          <section className="rw-section rw-product-manifesto">
            <span className="eyebrow">PURTIER PLACENTA</span>
            <h2>
              Exceptional collections.
              <br />
              <em>A considered presentation.</em>
            </h2>
            <p>
              Discover our signature nutrition collection. Product ingredients,
              directions and label information remain subject to RIWAY’s
              approved market-specific content.
            </p>
            <Link className="rw-pill" href="#product-review">
              Product details & review bag ↗
            </Link>
          </section>
          <EditionWheel />
          <section className="rw-editorial-pair">
            <img
              src="/design/purtier/deer-forest.jpg"
              alt="Deer in a green forest, PURTIER editorial photography"
              loading="lazy"
            />
            <div>
              <span className="eyebrow">The collection</span>
              <h2>
                Extraordinary,
                <br />
                <em>by nature.</em>
              </h2>
              <p>
                Explore PURTIER PLACENTA. For official product information,
                contact RIWAY and read the approved label for your market.
              </p>
              <Link className="text-link" href="/support">
                Product enquiries ↗
              </Link>
            </div>
          </section>
          <section className="rw-editorial-pair rw-reverse">
            <img
              src="/design/purtier/lab-glass.jpg"
              alt="Laboratory glassware from the supplied PURTIER editorial imagery"
              loading="lazy"
            />
            <div>
              <span className="eyebrow">Product information</span>
              <h2>
                Care in
                <br />
                <em>every detail.</em>
              </h2>
              <p>
                Approved ingredient and dosage information will appear here when
                supplied. No therapeutic claims are approved for this
                development preview.
              </p>
            </div>
          </section>
          <section className="rw-section rw-dark">
            <span className="eyebrow">The presentation archive</span>
            <h2>
              A collection,
              <br />
              <em>through the editions.</em>
            </h2>
            <div
              className="rw-track rw-editions"
              tabIndex={0}
              role="region"
              aria-label="PURTIER packaging archive"
            >
              {Array.from({ length: 7 }, (_, i) => (
                <figure key={i}>
                  <img
                    src={`/design/purtier/edition-${i + 1}.jpg`}
                    alt={`PURTIER edition ${i + 1} archival packaging`}
                    loading="lazy"
                  />
                  <figcaption>Edition 0{i + 1}</figcaption>
                </figure>
              ))}
            </div>
            <p className="small">
              Packaging archive imagery. Current product identity and
              availability are shown in the product details above.
            </p>
          </section>
        </>
      ) : (
        <>
          <ThemeGallery />
          <section className="rw-section rw-product-manifesto">
            <span className="eyebrow">Personal care · Product information</span>
            <h2>
              A ritual,
              <br />
              <em>considered.</em>
            </h2>
            <p>
              Ingredients, directions and label information are awaiting RIWAY’s
              approved market-specific content. Contact RIWAY for official
              product information.
            </p>
            <Link className="rw-pill" href="#product-review">
              Product details & review bag ↗
            </Link>
          </section>
        </>
      )}
      <section className="rw-section rw-product-cta">
        <span className="eyebrow">Your next chapter</span>
        <h2>
          It starts with
          <br />
          <em>a connection.</em>
        </h2>
        <Link className="rw-pill" href="/support">
          Contact & support ↗
        </Link>
        <p>
          Products may be saved for review. Online purchasing is unavailable.
        </p>
      </section>
    </div>
  );
}
