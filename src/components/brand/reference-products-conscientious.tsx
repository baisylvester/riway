import type { CSSProperties } from "react";
import { ReferenceShell } from "./reference-shell";
import { ReferenceStage } from "./reference-stage";
import {
  ReferenceProductsMotion,
  ReferenceProductsBottles,
} from "./reference-products-motion";

/** Source markup from conscientious.html, translated to JSX. */
export function ReferenceConscientious() {
  return (
    <ReferenceShell brand="CONSCIENTIOUS">
      <ReferenceProductsMotion kind="conscientious" />
      <section className="unbox consc" id="hero">
        <div className="stage">
          <div className="ghost" aria-hidden="true">
            CONSCIENTIOUS
          </div>
          <div className="top-k">
            <span>CONSCIENTIOUS</span>
            <span className="hide-mobile">Exclusively developed by RIWAY</span>
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
            <p>Lift the lid. Each essence rests in its own white cradle.</p>
          </div>
          <div className="ucopy u2" id="u2">
            <span className="k">02 — The essence</span>
            <h2 className="display h-m">
              An essence spray of <em>golden</em> proportions.
            </h2>
            <p>
              Gold and 27 patented botanical ingredients, for him and for her.
            </p>
          </div>
          <div className="ucopy u3" id="u3">
            <span className="k">03 — The ritual</span>
            <h2 className="display h-m">
              Spray five to eight times. <em>Then the mask.</em>
            </h2>
            <p>
              Cleansing Repairing Mask for him. Brightening Firming Mask for
              her.
            </p>
            <a className="btn magnetic" href="#split" data-cursor="Open">
              Choose a side
            </a>
          </div>
          <div className="scroll" aria-hidden="true"></div>
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
          <div className="deco"></div>
          <div className="wm">CONSCIENTIOUS · FOR HIM</div>
          <div className="t">
            <small>Essence spray · Cleansing repairing mask</small>
            <h2 className="display">
              Unleash your <em>alluring</em> appeal.
            </h2>
            <p>
              An essence spray of golden proportions. Confidence and charisma,
              in a single bottle.
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
          <div className="deco"></div>
          <div className="wm">CONSCIENTIOUS · FOR HER</div>
          <div className="t">
            <small>Essence spray · Brightening firming mask</small>
            <h2 className="display">
              Your <em>exquisite</em> ritual.
            </h2>
            <p>
              Emerge with your skin reborn. Dazzling radiance, silky smooth
              skin.
            </p>
          </div>
        </div>
        <div
          className="pick hide-mobile"
          style={{ color: "var(--ivory)" } as CSSProperties}
        >
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

      <section className="side-sec" id="him">
        <div className="product">
          <div className="pstage">
            <ReferenceStage kind="him" />
          </div>
          <div>
            <span className="k">For him · Essence spray</span>
            <h2
              className="display h-l split-t"
              style={{ marginTop: "12px" } as CSSProperties}
            >
              Elixir for the <em>skin.</em>
            </h2>
            <p className="lede" style={{ marginTop: "22px" } as CSSProperties}>
              A waterless essence spray with gold and 27 patented botanical
              ingredients. Experience perfect skin care in a single bottle, and
              indulge in the highest level of luxury.
            </p>
            <div
              className="claims"
              style={{ marginTop: "clamp(30px,4vw,50px)" } as CSSProperties}
            >
              <div className="claim">
                <span className="i">01</span>
                <b>Intense hydration</b>
                <p>Boosts intense hydration.</p>
              </div>
              <div className="claim">
                <span className="i">02</span>
                <b>Elasticity and firmness</b>
                <p>Increases the skin’s elasticity and firmness.</p>
              </div>
              <div className="claim">
                <span className="i">03</span>
                <b>Sebum and pores</b>
                <p>Regulates excessive sebum and tightens pores.</p>
              </div>
              <div className="claim">
                <span className="i">04</span>
                <b>Even tone</b>
                <p>Evens skin tone and lightens dark spots.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="deco-line"></div>
        <div className="two">
          <div className="photo media">
            <img
              src="/design/conscientious/masks-pair.jpg"
              alt="CONSCIENTIOUS Cleansing Repairing Mask sachet for him"
              style={{ "--pos": "16% center" } as CSSProperties}
            />
          </div>
          <div>
            <span className="k">For him · Cleansing repairing mask</span>
            <h2
              className="display h-l split-t"
              style={{ marginTop: "12px" } as CSSProperties}
            >
              The cleansing mask for the <em>extraordinarily successful.</em>
            </h2>
            <p className="lede" style={{ marginTop: "22px" } as CSSProperties}>
              Confidence and charisma. Experience miracles in a moment.
            </p>
            <div
              className="ritual"
              style={{ marginTop: "clamp(30px,4vw,50px)" } as CSSProperties}
            >
              <div>
                <b>Radiance</b>
                <p>Improves radiance immediately after application.</p>
              </div>
              <div>
                <b>Texture</b>
                <p>Improves texture by removing dead skin cells.</p>
              </div>
              <div>
                <b>Fit</b>
                <p>Hugs your skin tightly.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="side-sec hairline" id="her">
        <div className="product">
          <div>
            <span className="k">For her · Essence spray</span>
            <h2
              className="display h-l split-t"
              style={{ marginTop: "12px" } as CSSProperties}
            >
              Essence spray of <em>golden</em> proportions.
            </h2>
            <p className="lede" style={{ marginTop: "22px" } as CSSProperties}>
              Gold helps repair skin damage while adding radiance and glow.
              After cleansing, spray five to eight times evenly over the entire
              face.
            </p>
            <div
              className="claims"
              style={{ marginTop: "clamp(30px,4vw,50px)" } as CSSProperties}
            >
              <div className="claim">
                <span className="i">01</span>
                <b>Fine lines</b>
                <p>Smoothens fine lines.</p>
              </div>
              <div className="claim">
                <span className="i">02</span>
                <b>Elasticity and firmness</b>
                <p>Improves elasticity and firmness.</p>
              </div>
              <div className="claim">
                <span className="i">03</span>
                <b>Soothe and protect</b>
                <p>Soothes, calms and protects.</p>
              </div>
              <div className="claim">
                <span className="i">04</span>
                <b>Radiance</b>
                <p>Adds radiance and glow.</p>
              </div>
            </div>
          </div>
          <div className="pstage">
            <ReferenceStage kind="her" />
          </div>
        </div>
        <div className="deco-line"></div>
        <div className="two">
          <div>
            <span className="k">For her · Brightening firming mask</span>
            <h2
              className="display h-l split-t"
              style={{ marginTop: "12px" } as CSSProperties}
            >
              Emerge with your skin <em>reborn.</em>
            </h2>
            <p className="lede" style={{ marginTop: "22px" } as CSSProperties}>
              Love yourself. Dazzling radiance, silky smooth skin.
            </p>
            <div
              className="ritual"
              style={{ marginTop: "clamp(30px,4vw,50px)" } as CSSProperties}
            >
              <div>
                <b>Immediate glow</b>
                <p>Experience an immediate glow.</p>
              </div>
              <div>
                <b>Moisture</b>
                <p>Exceptional moisturising effect and water retention.</p>
              </div>
              <div>
                <b>Nutrients</b>
                <p>A super nutrient booster. Crystal clear.</p>
              </div>
            </div>
          </div>
          <div className="photo media">
            <img
              src="/design/conscientious/masks-pair.jpg"
              alt="CONSCIENTIOUS Brightening Firming Mask sachet for her"
              style={{ "--pos": "84% center" } as CSSProperties}
            />
          </div>
        </div>
      </section>

      <section className="science" id="science">
        <div className="row">
          <div>
            <span className="k">The science</span>
            <h2
              className="display h-l split-t"
              style={{ marginTop: "12px" } as CSSProperties}
            >
              Potent, highly concentrated, <em>patented.</em>
            </h2>
          </div>
          <p className="lede">
            Micro-emulsification and anti-pollutant defence technology.
            Paraben-free and silicone-free.
          </p>
        </div>
        <div className="sci-grid" id="sci">
          <div className="sci">
            <b data-to="27">27</b>
            <span>Patented ingredients</span>
          </div>
          <div className="sci">
            <b>Au</b>
            <span>Gold, in both sprays</span>
          </div>
          <div className="sci">
            <b data-to="0">0</b>
            <span>Parabens, silicones</span>
          </div>
          <div className="sci">
            <b>5–8</b>
            <span>Sprays, after cleansing</span>
          </div>
        </div>
      </section>

      <section className="gallery hairline" id="gallery">
        <div className="row">
          <div>
            <span className="k">As presented</span>
            <h2
              className="display h-l split-t"
              style={{ marginTop: "12px" } as CSSProperties}
            >
              The collection, <em>in the light.</em>
            </h2>
          </div>
          <p className="lede">
            The essence sprays and masks for him and for her, in their
            presentation boxes.
          </p>
        </div>
        <div className="gal">
          <figure className="g1">
            <img
              src="/design/conscientious/collection.jpg"
              alt="CONSCIENTIOUS mask boxes, sachets and essence sprays for him and for her on silver plinths"
            />
          </figure>
          <figure className="g2">
            <img
              src="/design/conscientious/her-spray-box.jpg"
              alt="CONSCIENTIOUS for her essence sprays in their open presentation box"
            />
          </figure>
          <figure className="g3">
            <img
              src="/design/conscientious/masks-pair.jpg"
              alt="CONSCIENTIOUS mask sachets for him and for her"
            />
          </figure>
        </div>
      </section>

      <section className="cta-row hairline" id="contact">
        <h2 className="display split-t">
          Indulge in the highest level of <em>luxury.</em>
        </h2>
        <a className="btn magnetic" href="/support" data-cursor="Open">
          Find a distributor
        </a>
      </section>
    </ReferenceShell>
  );
}
