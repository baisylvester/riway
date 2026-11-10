import type { Market, Product } from "@/lib/domain";
import { ReferenceShell } from "./reference-shell";
import { ReferenceStage } from "./reference-stage";
import {
  ReferenceProductsMotion,
  ReferenceProductsWheel,
} from "./reference-products-motion";
import { ReferenceProductInformation } from "./reference-product-information";

// Presentation imagery is retained; product copy comes from the published
// catalogue. Legacy ingredient, dosage and benefit copy is not published here.
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
            <span className="hide-mobile">The presentation</span>
          </div>
          <ReferenceStage kind="purtier" />
          <div className="ucopy u0" id="u0">
            <span className="k">The collection</span>
            <h1 className="display h-l">{product.name}</h1>
            <p>Discover the presentation. Scroll to open.</p>
          </div>
          <div className="ucopy u1" id="u1">
            <span className="k">01 — The carton</span>
            <h2 className="display h-m">
              Crafted to be <em>opened.</em>
            </h2>
            <p>The presentation carton opens to reveal the collection.</p>
          </div>
          <div className="ucopy u2" id="u2">
            <span className="k">02 — The jar</span>
            <h2 className="display h-m">
              Care in <em>every detail.</em>
            </h2>
            <p>Explore the jar, its packaging and the PURTIER mark.</p>
          </div>
          <div className="ucopy u3" id="u3">
            <span className="k">03 — Product information</span>
            <h2 className="display h-m">
              A considered <em>presentation.</em>
            </h2>
            <p>Read the product information for your selected market.</p>
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

      <ReferenceProductInformation product={product} market={market} />
      <ReferenceProductsWheel />

      <section className="story hairline">
        <div className="two">
          <div className="media">
            <img
              src="/design/purtier/jar-carton-dark.jpg"
              alt="PURTIER jar and presentation carton"
              style={{ objectFit: "contain" }}
              loading="lazy"
            />
          </div>
          <div>
            <span className="k">The presentation</span>
            <h2 className="display h-l split" style={{ marginTop: 12 }}>
              A collection, <em>in detail.</em>
            </h2>
            <p className="lede" style={{ marginTop: 22 }}>
              Explore the packaging and presentation imagery. Confirm the
              current approved label, directions and availability with RIWAY for
              your market.
            </p>
          </div>
        </div>
      </section>

      <section className="track-sec hairline editions-sec" id="editions">
        <div className="pin">
          <div className="head">
            <div>
              <span className="k">The presentation archive</span>
              <h2 className="display h-l split" style={{ marginTop: 12 }}>
                Through the <em>editions.</em>
              </h2>
            </div>
            <p className="lede">Archival packaging imagery.</p>
          </div>
          <div className="track">
            {Array.from({ length: 7 }, (_, i) => (
              <div className="card" key={i}>
                <img
                  src={`/design/purtier/edition-${i + 1}.jpg`}
                  alt={`PURTIER edition ${i + 1} archival packaging`}
                  loading="lazy"
                />
                <div className="lab">
                  <small>Edition {String(i + 1).padStart(2, "0")}</small>
                  <h3 className="display">The packaging archive</h3>
                </div>
              </div>
            ))}
          </div>
          <div className="prog">
            <i />
          </div>
        </div>
      </section>

      <section className="cta-row hairline" id="contact">
        <h2 className="display split">
          Start with <em>a conversation.</em>
        </h2>
        <a className="btn magnetic" href="/support" data-cursor="Open">
          Contact RIWAY
        </a>
      </section>
    </ReferenceShell>
  );
}
