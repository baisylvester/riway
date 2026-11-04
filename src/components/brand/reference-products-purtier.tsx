import type { CSSProperties } from "react";
import { ReferenceShell } from "./reference-shell";
import { ReferenceStage } from "./reference-stage";
import {
  ReferenceProductsMotion,
  ReferenceProductsWheel,
} from "./reference-products-motion";

/** Source markup from purtier.html, translated to JSX. */
export function ReferencePurtier() {
  return (
    <ReferenceShell brand="PURTIER">
      <ReferenceProductsMotion kind="purtier" />
      <section className="unbox" id="hero">
        <div className="stage">
          <div className="ghost" aria-hidden="true">
            PURTIER
          </div>
          <div className="top-k">
            <span>PURTIER Placenta</span>
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
              <em>Revolutionary.</em> Cutting edge.
            </h2>
            <p>
              Nested in its tray: fluted porcelain, gunmetal cap, the red serif
              mark.
            </p>
          </div>
          <div className="ucopy u3" id="u3">
            <span className="k">03 — The capsules</span>
            <h2 className="display h-m">
              Fourteen ingredients, <em>one</em> capsule.
            </h2>
            <p>Deer placenta and nature’s gifts, preserved at their best.</p>
            <a className="btn magnetic" href="#ingredients" data-cursor="Open">
              Our ingredients
            </a>
          </div>
          <div className="scroll" aria-hidden="true"></div>
        </div>
      </section>

      <section className="manifesto" id="story">
        <span className="k">Optimal care</span>
        <p className="scrub">
          Since its inception from the 1st Edition, PURTIER Placenta has
          supported <em>optimal care</em> for your health. It has won the hearts
          of people from all over the world by supporting its users with a peace
          of mind through the <em>union of its formula</em>, where each precious
          ingredient had been carefully selected for its effects.
        </p>
        <div className="meta">
          <div>
            <b data-to="7">7</b>Editions
          </div>
          <div>
            <b data-to="14">14</b>Ingredients, one capsule
          </div>
          <div>
            <b data-to="5">5</b>Exclusive premium formulas
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
              style={
                {
                  objectFit: "cover",
                  padding: "0",
                  background: "none",
                } as CSSProperties
              }
            />
          </div>
          <div>
            <span className="k">Our story</span>
            <h2
              className="display h-l split"
              style={{ marginTop: "12px" } as CSSProperties}
            >
              Nature’s gifts, <em>restorative</em> by design.
            </h2>
            <p className="lede" style={{ marginTop: "22px" } as CSSProperties}>
              Combining cutting-edge technology with nutritional nature’s gifts,
              PURTIER Placenta utilises the restorative powers of deer placenta
              for an expertly formulated health supplement supercharged with
              nutrient-rich ingredients.
            </p>
          </div>
        </div>
      </section>
      <section className="story">
        <div className="two">
          <div>
            <span className="k">Your trust</span>
            <h2
              className="display h-l split"
              style={{ marginTop: "12px" } as CSSProperties}
            >
              True to its purpose, <em>embracing</em> progress.
            </h2>
            <p className="lede" style={{ marginTop: "22px" } as CSSProperties}>
              Remaining true to its purpose whilst embracing progress, we
              continually seek to further improve on PURTIER Placenta’s formula.
              Today RIWAY, with its unique patents, has developed the optimal
              ratio for wholesome nutrition.
            </p>
          </div>
          <div className="media">
            <img
              src="/design/purtier/lab-glass.jpg"
              alt="Laboratory glassware"
              style={
                {
                  objectFit: "cover",
                  padding: "0",
                  background: "none",
                } as CSSProperties
              }
            />
          </div>
        </div>
      </section>

      <section className="cinema" id="cinema">
        <div className="stage">
          <div className="spot"></div>
          <ReferenceStage kind="jar" />
          <div className="vig"></div>
          <div className="copy c0" id="c0">
            <h2 className="display">
              Unique <em>masterpiece.</em>
            </h2>
            <p
              style={
                { margin: "14px auto 0", textAlign: "center" } as CSSProperties
              }
            >
              Virtually all you need, in a capsule.
            </p>
          </div>
          <div className="copy c1" id="c1">
            <span className="k">The formula</span>
            <h2 className="display">
              A streamlined mix of <em>fourteen.</em>
            </h2>
            <p>
              Each ingredient carefully selected for its suitability and blended
              to ensure the highest absorption by the body. Every ingredient is
              added in moderation.
            </p>
            <div className="chips">
              <span>CerviCenta</span>
              <span>NucleiClavem</span>
              <span>VelveCenta</span>
              <span>Nginxzen</span>
              <span>Actsirtone</span>
              <span>Squalene</span>
              <span>Borage oil</span>
              <span>Avocado oil</span>
              <span>Tomato</span>
              <span>Marine collagen</span>
              <span>Brown seaweed</span>
              <span>Evening primrose</span>
              <span>Apple polyphenols</span>
              <span>Aloe vera</span>
            </div>
          </div>
          <div className="copy c2" id="c2">
            <span className="k">Forefront of technology</span>
            <h2 className="display">
              Preserved at its <em>best.</em>
            </h2>
            <p>
              Advanced technology ensures the process and preservation of
              nutrients are maintained in their most optimal condition, to
              facilitate effective absorption in the body.
            </p>
            <a className="btn magnetic" href="#ingredients" data-cursor="Open">
              Our ingredients
            </a>
          </div>
        </div>
      </section>

      <section className="section">
        <div
          className="row"
          style={{ marginBottom: "clamp(30px,5vw,60px)" } as CSSProperties}
        >
          <div>
            <span className="k">The benefits</span>
            <h2
              className="display h-l split"
              style={{ marginTop: "12px" } as CSSProperties}
            >
              Support, <em>every day.</em>
            </h2>
          </div>
          <p className="lede">
            The body’s ability to rejuvenate cells slows down as we age. PURTIER
            Placenta helps support our body in today’s fast-paced and
            stress-prone society.
          </p>
        </div>
        <div className="benefits" id="benefits">
          <div className="ben">
            <span className="i">01</span>
            <div>
              <b>Metabolism</b>
              <p>Supports the body’s daily energy needs.</p>
            </div>
          </div>
          <div className="ben">
            <span className="i">02</span>
            <div>
              <b>Circulation</b>
              <p>Supports healthy circulation.</p>
            </div>
          </div>
          <div className="ben">
            <span className="i">03</span>
            <div>
              <b>Skin health</b>
              <p>Supports the skin from within.</p>
            </div>
          </div>
          <div className="ben">
            <span className="i">04</span>
            <div>
              <b>Immune defences</b>
              <p>Supports the body’s natural defences.</p>
            </div>
          </div>
          <div className="ben">
            <span className="i">05</span>
            <div>
              <b>Gut and digestion</b>
              <p>Supports gut and digestive health.</p>
            </div>
          </div>
          <div className="ben">
            <span className="i">06</span>
            <div>
              <b>Vitality</b>
              <p>
                Start your plan to support your energy levels, health and
                wellbeing, today.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="ing-head hairline" id="ingredients">
        <div className="row">
          <div>
            <span className="k">Premium &amp; precious</span>
            <h2
              className="display h-l split"
              style={{ marginTop: "12px" } as CSSProperties}
            >
              Fourteen, <em>in moderation.</em>
            </h2>
          </div>
          <p className="lede">Per capsule. Hover an ingredient.</p>
        </div>
      </div>
      <section className="ingredients">
        <div className="glist" id="glist">
          <div className="gitem">
            <div
              className="ph"
              style={
                {
                  backgroundImage: "url(/design/purtier/deer-snow.jpg)",
                } as CSSProperties
              }
            ></div>
            <span className="n">01 · Deer placenta</span>
            <div>
              <h4>CerviCenta</h4>
              <p>
                The latest extraction technology extracts the nutritional
                components, with impeccable compatibility with the other
                components, to provide the energy needed for our daily lives.
              </p>
            </div>
            <span className="mg">100 mg</span>
          </div>
          <div className="gitem">
            <div
              className="ph"
              style={
                {
                  backgroundImage: "url(/design/purtier/lab-strawberry.jpg)",
                } as CSSProperties
              }
            ></div>
            <span className="n">02 · White strawberry</span>
            <div>
              <h4>NucleiClavem</h4>
              <p>
                Powerful, nutrient extracts derived from different parts of
                white strawberries, combined with high-end technology to obtain
                unique components.
              </p>
            </div>
            <span className="mg">100 mg</span>
          </div>
          <div className="gitem">
            <div
              className="ph"
              style={
                {
                  backgroundImage: "url(/design/purtier/deer-forest.jpg)",
                } as CSSProperties
              }
            ></div>
            <span className="n">03 · Deer antler</span>
            <div>
              <h4>VelveCenta</h4>
              <p>
                Natural proteins, amino acids, minerals and trace elements, in a
                well-proportioned formula complementing CerviCenta.
              </p>
            </div>
            <span className="mg">50 mg</span>
          </div>
          <div className="gitem">
            <div
              className="ph"
              style={
                {
                  backgroundImage: "url(/design/purtier/ing-ginseng.jpg)",
                } as CSSProperties
              }
            ></div>
            <span className="n">04 · Ginseng</span>
            <div>
              <h4>Nginxzen</h4>
              <p>
                High-quality ginseng planted in New Zealand’s volcanic soil for
                more than ten years, reaching its best condition.
              </p>
            </div>
            <span className="mg">50 mg</span>
          </div>
          <div className="gitem">
            <div
              className="ph"
              style={
                {
                  backgroundImage: "url(/design/purtier/ing-lingzhi.jpg)",
                } as CSSProperties
              }
            ></div>
            <span className="n">05 · Antler lingzhi</span>
            <div>
              <h4>Actsirtone</h4>
              <p>
                Carefully selected antler lingzhi, its active components
                released and broken down into smaller molecules for easier
                absorption.
              </p>
            </div>
            <span className="mg">100 mg</span>
          </div>
          <div className="gitem">
            <div
              className="ph"
              style={
                {
                  backgroundImage: "url(/design/purtier/tube-gold.jpg)",
                } as CSSProperties
              }
            ></div>
            <span className="n">06</span>
            <div>
              <h4>Squalene</h4>
            </div>
            <span className="mg">100 mg</span>
          </div>
          <div className="gitem">
            <div
              className="ph"
              style={
                {
                  backgroundImage: "url(/design/purtier/ing-borage.jpg)",
                } as CSSProperties
              }
            ></div>
            <span className="n">07</span>
            <div>
              <h4>Borage oil</h4>
            </div>
            <span className="mg">100 mg</span>
          </div>
          <div className="gitem">
            <div
              className="ph"
              style={
                {
                  backgroundImage: "url(/design/purtier/ing-avocado.jpg)",
                } as CSSProperties
              }
            ></div>
            <span className="n">08</span>
            <div>
              <h4>Avocado oil</h4>
            </div>
            <span className="mg">100 mg</span>
          </div>
          <div className="gitem">
            <div
              className="ph"
              style={
                {
                  backgroundImage: "url(/design/purtier/ing-tomato.jpg)",
                } as CSSProperties
              }
            ></div>
            <span className="n">09</span>
            <div>
              <h4>Tomato extract</h4>
            </div>
            <span className="mg">70 mg</span>
          </div>
          <div className="gitem">
            <div
              className="ph"
              style={
                {
                  backgroundImage: "url(/design/purtier/lab-blue.jpg)",
                } as CSSProperties
              }
            ></div>
            <span className="n">10</span>
            <div>
              <h4>Marine collagen</h4>
            </div>
            <span className="mg">50 mg</span>
          </div>
          <div className="gitem">
            <div
              className="ph"
              style={
                {
                  backgroundImage: "url(/design/purtier/ing-bowl.jpg)",
                } as CSSProperties
              }
            ></div>
            <span className="n">11</span>
            <div>
              <h4>Brown seaweed</h4>
            </div>
            <span className="mg">50 mg</span>
          </div>
          <div className="gitem">
            <div
              className="ph"
              style={
                {
                  backgroundImage: "url(/design/purtier/ing-primrose.jpg)",
                } as CSSProperties
              }
            ></div>
            <span className="n">12</span>
            <div>
              <h4>Evening primrose oil</h4>
            </div>
            <span className="mg">50 mg</span>
          </div>
          <div className="gitem">
            <div
              className="ph"
              style={
                {
                  backgroundImage: "url(/design/purtier/molecule.jpg)",
                } as CSSProperties
              }
            ></div>
            <span className="n">13 · 125:1 polyphenols</span>
            <div>
              <h4>Apple extract</h4>
            </div>
            <span className="mg">20 mg</span>
          </div>
          <div className="gitem">
            <div
              className="ph"
              style={
                {
                  backgroundImage: "url(/design/purtier/ing-aloe.jpg)",
                } as CSSProperties
              }
            ></div>
            <span className="n">14</span>
            <div>
              <h4>Aloe vera extract</h4>
            </div>
            <span className="mg">10 mg</span>
          </div>
        </div>
      </section>

      <section className="track-sec hairline editions-sec" id="editions">
        <div className="pin">
          <div className="head">
            <div>
              <span className="k">Seven editions</span>
              <h2
                className="display h-l"
                style={{ marginTop: "12px" } as CSSProperties}
              >
                An <em>evolution,</em> not a relaunch.
              </h2>
            </div>
            <span
              className="mono hide-mobile"
              style={{ color: "var(--muted)" } as CSSProperties}
            >
              Scroll to travel
            </span>
          </div>
          <div className="track">
            <div className="card">
              <img
                src="/design/purtier/edition-1.jpg"
                alt="PURTIER Placenta 1st edition"
              />
              <div className="lab">
                <small>Edition I</small>
                <h3 className="display">The beginning</h3>
              </div>
            </div>
            <div className="card">
              <img
                src="/design/purtier/edition-2.jpg"
                alt="PURTIER Placenta 2nd edition"
              />
              <div className="lab">
                <small>Edition II</small>
                <h3 className="display">Refined, not replaced</h3>
              </div>
            </div>
            <div className="card">
              <img
                src="/design/purtier/edition-3.jpg"
                alt="PURTIER Placenta 3rd edition"
              />
              <div className="lab">
                <small>Edition III</small>
                <h3 className="display">A union of ingredients</h3>
              </div>
            </div>
            <div className="card">
              <img
                src="/design/purtier/edition-4.jpg"
                alt="PURTIER Placenta 4th edition"
              />
              <div className="lab">
                <small>Edition IV</small>
                <h3 className="display">Trusted around the world</h3>
              </div>
            </div>
            <div className="card">
              <img
                src="/design/purtier/edition-5.jpg"
                alt="PURTIER Placenta 5th edition"
              />
              <div className="lab">
                <small>Edition V</small>
                <h3 className="display">The technology matures</h3>
              </div>
            </div>
            <div className="card">
              <img
                src="/design/purtier/edition-6.jpg"
                alt="PURTIER Placenta 6th edition"
              />
              <div className="lab">
                <small>Edition VI</small>
                <h3 className="display">Closer to cutting edge</h3>
              </div>
            </div>
            <div className="card">
              <img
                src="/design/purtier/edition-7.jpg"
                alt="PURTIER Placenta 7th edition"
              />
              <div className="lab">
                <small>Edition VII · Now</small>
                <h3 className="display">Revolutionary</h3>
              </div>
            </div>
            <div
              className="card"
              style={
                {
                  background: "var(--ink)",
                  color: "var(--ivory)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                } as CSSProperties
              }
            >
              <div>
                <span
                  className="k"
                  style={{ color: "var(--gold)" } as CSSProperties}
                >
                  Next
                </span>
                <h3
                  className="display"
                  style={
                    {
                      fontSize: "clamp(2rem,3vw,3rem)",
                      marginTop: "10px",
                    } as CSSProperties
                  }
                >
                  The eighth
                  <br />
                  is being written.
                </h3>
              </div>
            </div>
          </div>
          <div className="prog">
            <i></i>
          </div>
        </div>
      </section>

      <section className="cta-row hairline" id="contact">
        <h2 className="display split">
          The seventh, <em>in hand.</em>
        </h2>
        <a className="btn magnetic" href="/support" data-cursor="Open">
          Find a distributor
        </a>
      </section>
      <p className="disc">
        Always read the label and use them as directed. See a healthcare
        professional if any symptoms surface or persist. RIWAY International
        does not sell products via any website or any internet platform.
      </p>
    </ReferenceShell>
  );
}
