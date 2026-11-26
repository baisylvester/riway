import { LocalizedAnchor } from "@/components/localized-link";
import type { CSSProperties } from "react";
import type { Market, Product } from "@/lib/domain";
import { ReferenceShell } from "./reference-shell";
import { ReferenceStage } from "./reference-stage";
import {
  ReferenceProductsMotion,
  ReferenceProductsBottles,
} from "./reference-products-motion";
import { ReferenceProductInformation } from "./reference-product-information";

const details = [
  ["The presentation", "Explore the bottle and its presentation box."],
  ["The collection", "Compare the visual collections for him and for her."],
  [
    "The label",
    "Refer to the approved label for product details and directions.",
  ],
  ["Your market", "Confirm current availability with RIWAY for your country."],
] as const;
const ritual = [
  ["Discover", "Explore the presentation imagery."],
  ["Review", "Read the approved product information for your market."],
  ["Ask", "Contact RIWAY with questions about the collection."],
] as const;

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
            <span className="hide-mobile">The collection</span>
          </div>
          <ReferenceStage kind="conscientious" />
          <div className="ucopy u0" id="u0">
            <span className="k">For him &amp; for her</span>
            <h1 className="display h-l">
              Indulge in the highest level <em>of luxury.</em>
            </h1>
            <p>Two essences, two rituals. Scroll to open.</p>
          </div>
          <div className="ucopy u1" id="u1">
            <span className="k">01 — The presentation</span>
            <h2 className="display h-m">
              Your doorway to an <em>exquisite</em> life.
            </h2>
            <p>
              Lift the lid. Each presentation rests in its own white cradle.
            </p>
          </div>
          <div className="ucopy u2" id="u2">
            <span className="k">02 — The packaging</span>
            <h2 className="display h-m">
              A presentation of <em>golden</em> proportions.
            </h2>
            <p>Explore the collection for him and for her.</p>
          </div>
          <div className="ucopy u3" id="u3">
            <span className="k">03 — The collection</span>
            <h2 className="display h-m">
              The details, <em>revealed.</em>
            </h2>
            <p>
              Discover the presentation, then review the product information for
              your market.
            </p>
            <LocalizedAnchor
              className="btn magnetic"
              href="#product-information"
              data-cursor="Open"
            >
              Product information
            </LocalizedAnchor>
          </div>
          <div className="scroll" aria-hidden="true" />
        </div>
      </section>

      <section className="split-hero" id="split">
        <ReferenceProductsBottles />
        <div
          className="side him"
          id="sideHim"
          role="button"
          tabIndex={0}
          aria-label="Explore CONSCIENTIOUS for him"
          data-cursor="For him"
        >
          <div className="deco" />
          <div className="wm">CONSCIENTIOUS · FOR HIM</div>
          <div className="t">
            <small>The collection for him</small>
            <h2 className="display">
              Unleash your <em>alluring</em> appeal.
            </h2>
            <p>
              A presentation in dark tones, gold detailing and considered forms.
            </p>
          </div>
        </div>
        <div className="mid" aria-hidden="true">
          &amp;
        </div>
        <div
          className="side her"
          id="sideHer"
          role="button"
          tabIndex={0}
          aria-label="Explore CONSCIENTIOUS for her"
          data-cursor="For her"
        >
          <div className="deco" />
          <div className="wm">CONSCIENTIOUS · FOR HER</div>
          <div className="t">
            <small>The collection for her</small>
            <h2 className="display">
              Your <em>exquisite</em> ritual.
            </h2>
            <p>
              A presentation in light tones, gold detailing and considered
              forms.
            </p>
          </div>
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

      {(["him", "her"] as const).map((side) => {
        const presentation = (
          <div className="pstage">
            <ReferenceStage kind={side} />
          </div>
        );
        const copy = (
          <div>
            <span className="k">For {side} · The presentation</span>
            <h2 className="display h-l split-t" style={{ marginTop: 12 }}>
              {side === "him" ? (
                <>
                  A collection, <em>considered.</em>
                </>
              ) : (
                <>
                  A presentation of <em>golden</em> proportions.
                </>
              )}
            </h2>
            <p className="lede" style={{ marginTop: 22 }}>
              Discover the CONSCIENTIOUS collection for {side}. Explore its
              presentation and refer to the approved product information for
              your market before use.
            </p>
            <div
              className="claims"
              style={{ marginTop: "clamp(30px,4vw,50px)" }}
            >
              {details.map(([name, description], index) => (
                <div className="claim" key={name}>
                  <span className="i">0{index + 1}</span>
                  <b>{name}</b>
                  <p>{description}</p>
                </div>
              ))}
            </div>
          </div>
        );
        const photo = (
          <div className="photo media">
            <img
              src="/design/conscientious/masks-pair.jpg"
              alt={`CONSCIENTIOUS mask presentation for ${side}`}
              style={
                {
                  "--pos": side === "him" ? "16% center" : "84% center",
                } as CSSProperties
              }
              loading="lazy"
            />
          </div>
        );
        const mask = (
          <div>
            <span className="k">For {side} · The mask presentation</span>
            <h2 className="display h-l split-t" style={{ marginTop: 12 }}>
              {side === "him" ? (
                <>
                  Designed to be <em>discovered.</em>
                </>
              ) : (
                <>
                  A moment, <em>for you.</em>
                </>
              )}
            </h2>
            <p className="lede" style={{ marginTop: 22 }}>
              The mask presentation, photographed alongside the collection.
              Confirm the current label, directions and availability with RIWAY.
            </p>
            <div
              className="ritual"
              style={{ marginTop: "clamp(30px,4vw,50px)" }}
            >
              {ritual.map(([name, description]) => (
                <div key={name}>
                  <b>{name}</b>
                  <p>{description}</p>
                </div>
              ))}
            </div>
          </div>
        );
        return (
          <section
            className={`side-sec${side === "her" ? " hairline" : ""}`}
            id={side}
            key={side}
          >
            <div className="product">
              {side === "him" ? (
                <>
                  {presentation}
                  {copy}
                </>
              ) : (
                <>
                  {copy}
                  {presentation}
                </>
              )}
            </div>
            <div className="deco-line" />
            <div className="two">
              {side === "him" ? (
                <>
                  {photo}
                  {mask}
                </>
              ) : (
                <>
                  {mask}
                  {photo}
                </>
              )}
            </div>
          </section>
        );
      })}

      <section className="science" id="science">
        <div className="row">
          <div>
            <span className="k">A closer look</span>
            <h2 className="display h-l split-t" style={{ marginTop: 12 }}>
              Care, <em>in every detail.</em>
            </h2>
          </div>
          <p className="lede">
            Explore the presentation, compare the collections and read the
            product information approved for your market.
          </p>
        </div>
        <div className="sci-grid" id="sci">
          {[
            "Discover the presentation",
            "Compare the collections",
            "Read the approved label",
            "Contact RIWAY",
          ].map((label, index) => (
            <div className="sci" key={label}>
              <b>0{index + 1}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="gallery hairline" id="gallery">
        <div className="row">
          <div>
            <span className="k">As presented</span>
            <h2 className="display h-l split-t" style={{ marginTop: 12 }}>
              The collection, <em>in the light.</em>
            </h2>
          </div>
          <p className="lede">
            Presentation imagery of the collections for him and for her, in
            their boxes.
          </p>
        </div>
        <div className="gal">
          <figure className="g1">
            <img
              src="/design/conscientious/collection.jpg"
              alt="CONSCIENTIOUS mask boxes, sachets and essence sprays for him and for her on silver plinths"
              loading="lazy"
            />
          </figure>
          <figure className="g2">
            <img
              src="/design/conscientious/her-spray-box.jpg"
              alt="CONSCIENTIOUS for her essence sprays in their open presentation box"
              loading="lazy"
            />
          </figure>
          <figure className="g3">
            <img
              src="/design/conscientious/masks-pair.jpg"
              alt="CONSCIENTIOUS mask sachets for him and for her"
              loading="lazy"
            />
          </figure>
        </div>
      </section>
      <ReferenceProductInformation product={product} market={market} />
      <section className="cta-row hairline" id="contact">
        <h2 className="display split-t">
          Indulge in the highest level of <em>luxury.</em>
        </h2>
        <LocalizedAnchor
          className="btn magnetic"
          href="/support"
          data-cursor="Open"
        >
          Contact RIWAY
        </LocalizedAnchor>
      </section>
    </ReferenceShell>
  );
}
