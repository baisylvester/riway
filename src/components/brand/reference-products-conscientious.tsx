import type { Market, Product } from "@/lib/domain";
import { ReferenceShell } from "./reference-shell";
import { ReferenceStage } from "./reference-stage";
import {
  ReferenceProductsMotion,
  ReferenceProductsBottles,
} from "./reference-products-motion";
import { ReferenceProductInformation } from "./reference-product-information";

export function ReferenceConscientious({
  product,
  market,
}: {
  product: Product;
  market: Market;
}) {
  return (
    <ReferenceShell brand="CONSCIENTIOUS">
      <ReferenceProductsMotion kind="conscientious" />
      <section className="unbox consc" id="hero">
        <div className="stage">
          <div className="ghost" aria-hidden="true">
            CONSCIENTIOUS
          </div>
          <div className="top-k">
            <span>{product.name}</span>
            <span className="hide-mobile">The presentation</span>
          </div>
          <ReferenceStage kind="conscientious" />
          <div className="ucopy u0" id="u0">
            <span className="k">For him &amp; for her</span>
            <h1 className="display h-l">{product.name}</h1>
            <p>Discover the collection. Scroll to open.</p>
          </div>
          <div className="ucopy u1" id="u1">
            <span className="k">01 — The presentation</span>
            <h2 className="display h-m">
              A collection, <em>revealed.</em>
            </h2>
            <p>Lift the lid to explore the presentation.</p>
          </div>
          <div className="ucopy u2" id="u2">
            <span className="k">02 — The packaging</span>
            <h2 className="display h-m">
              Care in <em>every detail.</em>
            </h2>
            <p>Explore the collection for him and for her.</p>
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

      <section className="split-hero" id="split">
        <ReferenceProductsBottles />
        {(["him", "her"] as const).map((side) => (
          <div
            className={`side ${side}`}
            id={side === "him" ? "sideHim" : "sideHer"}
            role="button"
            tabIndex={0}
            aria-label={`Explore CONSCIENTIOUS for ${side}`}
            data-cursor={`For ${side}`}
            key={side}
          >
            <div className="deco" />
            <div className="wm">CONSCIENTIOUS · FOR {side.toUpperCase()}</div>
            <div className="t">
              <small>The collection</small>
              <h2 className="display">
                For <em>{side}.</em>
              </h2>
              <p>Explore the packaging and presentation.</p>
            </div>
          </div>
        ))}
        <div className="mid" aria-hidden="true">
          &amp;
        </div>
        <div className="pick hide-mobile" style={{ color: "var(--ivory)" }}>
          Choose a side
        </div>
      </section>

      <div className="toggle" id="toggle">
        <button type="button" data-side="him">
          For him
        </button>
        <button type="button" data-side="her">
          For her
        </button>
      </div>

      {(["him", "her"] as const).map((side) => (
        <section className="side-sec hairline" id={side} key={side}>
          <div className="product">
            <div className="pstage">
              <ReferenceStage kind={side} />
            </div>
            <div>
              <span className="k">The collection · For {side}</span>
              <h2 className="display h-l split-t" style={{ marginTop: 12 }}>
                Presented <em>for {side}.</em>
              </h2>
              <p className="lede" style={{ marginTop: 22 }}>
                Explore the presentation imagery. For ingredients, directions
                and approved labels, read the product information for your
                market and contact RIWAY.
              </p>
              <a
                className="btn magnetic"
                href="#product-information"
                style={{ marginTop: 26 }}
              >
                Product information
              </a>
            </div>
          </div>
        </section>
      ))}

      <section className="gallery hairline" id="gallery">
        <div className="row">
          <div>
            <span className="k">As presented</span>
            <h2 className="display h-l split-t" style={{ marginTop: 12 }}>
              The collection, <em>in the light.</em>
            </h2>
          </div>
          <p className="lede">
            Presentation boxes and packaging from the collection.
          </p>
        </div>
        <div className="gal">
          <figure className="g1">
            <img
              src="/design/conscientious/collection.jpg"
              alt="CONSCIENTIOUS collection presentation"
              loading="lazy"
            />
          </figure>
          <figure className="g2">
            <img
              src="/design/conscientious/her-spray-box.jpg"
              alt="CONSCIENTIOUS for her presentation box"
              loading="lazy"
            />
          </figure>
          <figure className="g3">
            <img
              src="/design/conscientious/masks-pair.jpg"
              alt="CONSCIENTIOUS mask packaging for him and for her"
              loading="lazy"
            />
          </figure>
        </div>
      </section>

      <section className="cta-row hairline" id="contact">
        <h2 className="display split-t">
          Start with <em>a conversation.</em>
        </h2>
        <a className="btn magnetic" href="/support" data-cursor="Open">
          Contact RIWAY
        </a>
      </section>
    </ReferenceShell>
  );
}
