import type { Market, Product } from "@/lib/domain";
import { ReferenceShell } from "./reference-shell";
import { ReferenceStage } from "./reference-stage";
import {
  ReferenceProductsMotion,
  ReferenceProductsWheel,
} from "./reference-products-motion";
import { ReferenceProductInformation } from "./reference-product-information";

// Restore the reference layout without embedding unapproved product claims.
const archive = [
  ["deer-snow.jpg", "Winter", "A deer in the snow."],
  ["lab-strawberry.jpg", "Colour", "A study in colour and texture."],
  ["deer-forest.jpg", "The forest", "A stag in its woodland setting."],
  ["ing-ginseng.jpg", "Roots", "Botanical shapes in close detail."],
  ["ing-lingzhi.jpg", "Forms", "Natural forms from the visual archive."],
  ["tube-gold.jpg", "Light", "Golden light and reflective surfaces."],
  ["ing-borage.jpg", "Borage", "Botanical photography from the archive."],
  ["ing-avocado.jpg", "Avocado", "Colour and texture from the natural world."],
  ["ing-tomato.jpg", "Tomato", "A close study of colour and form."],
  ["lab-blue.jpg", "Blue", "Glass, light and a blue palette."],
  ["ing-bowl.jpg", "Textures", "An arrangement of natural textures."],
  ["ing-primrose.jpg", "Primrose", "A floral study from the visual archive."],
  [
    "molecule.jpg",
    "Patterns",
    "Patterns and shapes in the presentation archive.",
  ],
  ["ing-aloe.jpg", "Aloe", "A botanical close-up from the archive."],
] as const;
const details = [
  ["The collection", "Explore the jar, carton and presentation imagery."],
  ["The editions", "Travel through the seven editions shown in the archive."],
  ["Your market", "Review the product information for your selected country."],
  ["The label", "Confirm the approved label and directions with RIWAY."],
  ["Availability", "Contact RIWAY for current availability in your market."],
  ["A conversation", "Find the information you need before making a decision."],
] as const;

export function ReferencePurtier({
  product,
  market,
}: {
  product: Product;
  market: Market;
}) {
  return (
    <ReferenceShell brand="PURTIER">
      <ReferenceProductsMotion kind="purtier" />
      <section className="unbox" id="hero">
        <div className="stage">
          <div className="ghost" aria-hidden="true">
            PURTIER
          </div>
          <div className="top-k">
            <span>{product.name}</span>
            <span className="hide-mobile">The luxury of health</span>
          </div>
          <ReferenceStage kind="purtier" />
          <div className="ucopy u0" id="u0">
            <span className="k">Seventh edition</span>
            <h1 className="display h-l">
              The luxury <em>of health.</em>
            </h1>
            <p>Presented as it deserves to be. Scroll to open.</p>
          </div>
          <div className="ucopy u1" id="u1">
            <span className="k">01 — The carton</span>
            <h2 className="display h-m">
              Crafted to be <em>opened.</em>
            </h2>
            <p>Burgundy, brushed, silver-lettered. The lid lifts away.</p>
          </div>
          <div className="ucopy u2" id="u2">
            <span className="k">02 — The jar</span>
            <h2 className="display h-m">
              Care in <em>every detail.</em>
            </h2>
            <p>
              Nested in its tray: the fluted jar, dark cap and red serif mark.
            </p>
          </div>
          <div className="ucopy u3" id="u3">
            <span className="k">03 — The collection</span>
            <h2 className="display h-m">
              A considered <em>presentation.</em>
            </h2>
            <p>
              Discover the collection and review the product information for
              your market.
            </p>
            <a
              className="btn magnetic"
              href="#product-information"
              data-cursor="Open"
            >
              Product information
            </a>
          </div>
          <div className="scroll" aria-hidden="true" />
        </div>
      </section>
      <section className="manifesto" id="story">
        <span className="k">The collection</span>
        <p className="scrub">
          From the first edition to the seventh, explore the{" "}
          <em>presentation of PURTIER.</em> A visual journey through the jar,
          the carton and the details that make up the collection. Discover the
          archive, then review the <em>product information for your market.</em>
        </p>
        <div className="meta">
          <div>
            <b data-to="7">7</b>Archived editions
          </div>
          <div>
            <b data-to="14">14</b>Visual studies
          </div>
          <div>
            <b data-to="3">3</b>Market information notices
          </div>
        </div>
      </section>
      <ReferenceProductsWheel />
      <section className="story hairline">
        <div className="two">
          <div className="media">
            <img
              src="/design/purtier/deer-forest.jpg"
              alt="A stag in the forest"
              style={{ objectFit: "cover", padding: 0, background: "none" }}
              loading="lazy"
            />
          </div>
          <div>
            <span className="k">The visual story</span>
            <h2 className="display h-l split" style={{ marginTop: 12 }}>
              Nature, <em>in the frame.</em>
            </h2>
            <p className="lede" style={{ marginTop: 22 }}>
              The natural world forms part of the collection’s photographic
              presentation. Explore the imagery, colours and textures of the
              original visual archive.
            </p>
          </div>
        </div>
      </section>
      <section className="story">
        <div className="two">
          <div>
            <span className="k">A closer look</span>
            <h2 className="display h-l split" style={{ marginTop: 12 }}>
              True to its identity, <em>in every detail.</em>
            </h2>
            <p className="lede" style={{ marginTop: 22 }}>
              From glass and light to the burgundy carton and red lettering, the
              archive brings the collection into focus. Current product details
              are provided separately for your selected market.
            </p>
          </div>
          <div className="media">
            <img
              src="/design/purtier/lab-glass.jpg"
              alt="Glassware from the presentation archive"
              style={{ objectFit: "cover", padding: 0, background: "none" }}
              loading="lazy"
            />
          </div>
        </div>
      </section>
      <section className="cinema" id="cinema">
        <div className="stage">
          <div className="spot" />
          <ReferenceStage kind="jar" />
          <div className="vig" />
          <div className="copy c0" id="c0">
            <h2 className="display">
              A considered <em>presentation.</em>
            </h2>
            <p style={{ margin: "14px auto 0", textAlign: "center" }}>
              The collection, seen from another perspective.
            </p>
          </div>
          <div className="copy c1" id="c1">
            <span className="k">The visual archive</span>
            <h2 className="display">
              A study in <em>detail.</em>
            </h2>
            <p>
              Photography, packaging and presentation. Explore the visual
              studies in the archive; confirm product composition and directions
              from the approved label for your market.
            </p>
            <div className="chips">
              {archive.map(([, name]) => (
                <span key={name}>{name}</span>
              ))}
            </div>
          </div>
          <div className="copy c2" id="c2">
            <span className="k">The collection</span>
            <h2 className="display">
              Presented at its <em>best.</em>
            </h2>
            <p>
              A closer look at the colours, textures and details of the
              presentation archive.
            </p>
            <a className="btn magnetic" href="#ingredients" data-cursor="Open">
              Explore the archive
            </a>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="row" style={{ marginBottom: "clamp(30px,5vw,60px)" }}>
          <div>
            <span className="k">Discover PURTIER</span>
            <h2 className="display h-l split" style={{ marginTop: 12 }}>
              The details, <em>together.</em>
            </h2>
          </div>
          <p className="lede">
            Explore the presentation and find current product information for
            your market. RIWAY can help with questions about labels, directions
            and availability.
          </p>
        </div>
        <div className="benefits" id="benefits">
          {details.map(([name, description], index) => (
            <div className="ben" key={name}>
              <span className="i">0{index + 1}</span>
              <div>
                <b>{name}</b>
                <p>{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <div className="ing-head hairline" id="ingredients">
        <div className="row">
          <div>
            <span className="k">The visual archive</span>
            <h2 className="display h-l split" style={{ marginTop: 12 }}>
              Nature, <em>in detail.</em>
            </h2>
          </div>
          <p className="lede">
            Photographic studies from the presentation archive. These images do
            not establish product ingredients or quantities; refer to the
            approved market-specific label.
          </p>
        </div>
      </div>
      <section className="ingredients">
        <div className="glist" id="glist">
          {archive.map(([image, name, description], index) => (
            <div className="gitem" key={image}>
              <div
                className="ph"
                style={{ backgroundImage: `url(/design/purtier/${image})` }}
              />
              <span className="n">
                {String(index + 1).padStart(2, "0")} · Visual study
              </span>
              <div>
                <h4>{name}</h4>
                <p>{description}</p>
              </div>
              <span className="mg">Archive</span>
            </div>
          ))}
        </div>
      </section>
      <section className="track-sec hairline editions-sec" id="editions">
        <div className="pin">
          <div className="head">
            <div>
              <span className="k">Seven editions</span>
              <h2 className="display h-l" style={{ marginTop: 12 }}>
                An <em>evolution,</em> in presentation.
              </h2>
            </div>
            <span
              className="mono hide-mobile"
              style={{ color: "var(--muted)" }}
            >
              Scroll to travel
            </span>
          </div>
          <div className="track">
            {["I", "II", "III", "IV", "V", "VI", "VII"].map(
              (edition, index) => (
                <div className="card" key={edition}>
                  <img
                    src={`/design/purtier/edition-${index + 1}.jpg`}
                    alt={`PURTIER edition ${index + 1} archival packaging`}
                    loading="lazy"
                  />
                  <div className="lab">
                    <small>Edition {edition}</small>
                    <h3 className="display">The packaging archive</h3>
                  </div>
                </div>
              ),
            )}
            <div
              className="card"
              style={{
                background: "var(--ink)",
                color: "var(--ivory)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
              }}
            >
              <div>
                <span className="k" style={{ color: "var(--gold)" }}>
                  Discover
                </span>
                <h3
                  className="display"
                  style={{ fontSize: "clamp(2rem,3vw,3rem)", marginTop: 10 }}
                >
                  Every edition,
                  <br />a different presentation.
                </h3>
              </div>
            </div>
          </div>
          <div className="prog">
            <i />
          </div>
        </div>
      </section>
      <ReferenceProductInformation product={product} market={market} />
      <section className="cta-row hairline" id="contact">
        <h2 className="display split">
          The collection, <em>in detail.</em>
        </h2>
        <a className="btn magnetic" href="/support" data-cursor="Open">
          Contact RIWAY
        </a>
      </section>
    </ReferenceShell>
  );
}
