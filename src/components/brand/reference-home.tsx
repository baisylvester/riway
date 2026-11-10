import type React from "react";
import { ReferenceShell } from "./reference-shell";
import { ReferenceStage } from "./reference-stage";
import type { Market } from "@/lib/domain";
import {
  eventZones,
  formatEventDate,
  formatEventTime,
  upcomingEvents,
  type EventEntry,
} from "@/lib/events";
export function ReferenceHome({
  events = [],
  market = "PH",
  eventsUnavailable = false,
}: {
  events?: EventEntry[];
  market?: Market;
  eventsUnavailable?: boolean;
}) {
  const upcoming = upcomingEvents(events, market).slice(0, 4);
  return (
    <ReferenceShell>
      <section className="hero" id="hero" data-cursor="Drag">
        <div className="ghost" aria-hidden="true">
          RIWAY
        </div>
        <div className="top-k">
          <span>Singapore · since July 2008</span>
          <span className="hide-mobile">Six goals · one right way</span>
        </div>
        <div className="shadow"></div>
        <ReferenceStage kind="jar" />
        <div className="wheel">
          <div className="ring" id="ring"></div>
        </div>
        <div className="caption">
          <div className="k" id="capK">
            True essence of life
          </div>
          <h1 className="display h-m" id="capH">
            Showing you the <em>Right Way.</em>
          </h1>
          <p id="capP">Six goals that make a life whole. Turn the wheel.</p>
        </div>
        <div className="hint hide-mobile">
          <b id="hintN">01</b>Scroll or drag
          <br />
          the wheel
        </div>
        <div className="strip" id="strip"></div>
        <div className="scroll" aria-hidden="true"></div>
      </section>

      <section className="manifesto" id="story">
        <span className="k">About RIWAY</span>
        <p className="scrub">
          Since July 2008, the goal of creating RIWAY is to allow more people to
          enjoy an even better life through an <em>excellent brand</em>, a
          platform for everyone to achieve their dreams and goals. By providing
          an established and right platform, RIWAY empowers you to achieve{" "}
          <em>true freedom</em> while advocating the culture of righteousness
          and virtues.
        </p>
        <div className="meta">
          <div>
            <b data-to="2008"></b>Founded, Singapore
          </div>
          <div>
            <b data-to="12" data-suffix="+"></b>Markets, Asia and Europe
          </div>
          <div>
            <b data-to="1"></b>Health product, perfected for years
          </div>
        </div>
        <div className="photo">
          <img
            src="/design/riway/hero-skyline.jpg"
            alt="A RIWAY leader looking over the city"
          />
        </div>
      </section>

      <section className="houses" id="houses">
        <a
          className="house"
          href="#story"
          style={
            {
              "--tint": "linear-gradient(160deg,#e9e5dd,#dcd7cd)",
            } as React.CSSProperties
          }
          data-cursor="Enter"
        >
          <span className="num">01</span>
          <div>
            <div className="k">The company</div>
            <h3 className="display">
              RIWAY
              <br />
              International
            </h3>
          </div>
          <div className="fig">
            <img
              src="/design/riway/emblem-gold.jpg"
              alt="RIWAY golden emblem"
              style={{ objectFit: "cover" } as React.CSSProperties}
            />
          </div>
          <span className="cta">
            Our story{" "}
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            >
              <path d="M1 7h12M8 2l5 5-5 5" />
            </svg>
          </span>
        </a>
        <a
          className="house"
          href="/purtier"
          style={
            {
              "--tint": "linear-gradient(160deg,#fff,#efece6)",
            } as React.CSSProperties
          }
          data-cursor="Discover"
        >
          <span className="num">02</span>
          <div>
            <div className="k">Health</div>
            <h3 className="display">
              PURTIER
              <br />
              Placenta
            </h3>
          </div>
          <div className="fig">
            <img
              src="/design/purtier/carton-7th.jpg"
              alt="The PURTIER Placenta 7th Edition carton"
              style={{ objectFit: "cover" } as React.CSSProperties}
            />
          </div>
          <span className="cta">
            The seventh edition{" "}
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            >
              <path d="M1 7h12M8 2l5 5-5 5" />
            </svg>
          </span>
        </a>
        <a
          className="house"
          href="/conscientious"
          style={
            {
              "--tint": "linear-gradient(160deg,#f3e3e6,#e9e5dd)",
            } as React.CSSProperties
          }
          data-cursor="Explore"
        >
          <span className="num">03</span>
          <div>
            <div className="k">Beauty</div>
            <h3 className="display">
              CONSCIENTIOUS
              <br />
              for him &amp; her
            </h3>
          </div>
          <div className="fig">
            <img
              src="/design/conscientious/collection.jpg"
              alt="CONSCIENTIOUS mask boxes, sachets and essence sprays for him and for her"
              style={{ objectFit: "cover" } as React.CSSProperties}
            />
          </div>
          <span className="cta">
            Choose a side{" "}
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            >
              <path d="M1 7h12M8 2l5 5-5 5" />
            </svg>
          </span>
        </a>
      </section>

      <section className="unbox compact" id="purtierUnbox">
        <div className="stage">
          <div className="ghost" aria-hidden="true">
            PURTIER
          </div>
          <div className="top-k">
            <span>The houses · 01</span>
            <span className="hide-mobile">Health</span>
          </div>
          <ReferenceStage kind="purtier" />
          <div className="ucopy u0">
            <span className="k">Health · PURTIER Placenta</span>
            <h2 className="display h-l">
              The luxury <em>of health.</em>
            </h2>
            <p>Presented as it deserves to be. Scroll to open.</p>
          </div>
          <div className="ucopy u1">
            <span className="k">01 — The carton</span>
            <h2 className="display h-m">
              Crafted to be <em>opened.</em>
            </h2>
            <p>Burgundy, brushed, silver-lettered. The lid lifts away.</p>
          </div>
          <div className="ucopy u2">
            <span className="k">02 — The jar</span>
            <h2 className="display h-m">
              <em>Revolutionary.</em> Cutting edge.
            </h2>
            <p>
              Nested in its tray: fluted porcelain, gunmetal cap, the red serif
              mark.
            </p>
          </div>
          <div className="ucopy u3">
            <span className="k">03 — The capsules</span>
            <h2 className="display h-m">
              Fourteen ingredients, <em>one</em> capsule.
            </h2>
            <p>Deer placenta and nature’s gifts, preserved at their best.</p>
            <a className="btn magnetic" href="/purtier" data-cursor="Open">
              Discover PURTIER
            </a>
          </div>
        </div>
      </section>

      <section className="unbox consc compact" id="conscUnbox">
        <div className="stage">
          <div className="ghost" aria-hidden="true">
            CONSCIENTIOUS
          </div>
          <div className="top-k">
            <span>The houses · 02</span>
            <span className="hide-mobile">Beauty</span>
          </div>
          <ReferenceStage kind="conscientious" />
          <div className="ucopy u0">
            <span className="k">Beauty · CONSCIENTIOUS</span>
            <h2 className="display h-l">
              Indulge in the highest level <em>of luxury.</em>
            </h2>
            <p>Two essences, two rituals. Scroll to open.</p>
          </div>
          <div className="ucopy u1">
            <span className="k">01 — The presentation</span>
            <h2 className="display h-m">
              Your doorway to an <em>exquisite</em> life.
            </h2>
            <p>Lift the lid. Each essence rests in its own white cradle.</p>
          </div>
          <div className="ucopy u2">
            <span className="k">02 — The essence</span>
            <h2 className="display h-m">
              An essence spray of <em>golden</em> proportions.
            </h2>
            <p>
              Gold and 27 patented botanical ingredients, for him and for her.
            </p>
          </div>
          <div className="ucopy u3">
            <span className="k">03 — The ritual</span>
            <h2 className="display h-m">
              Spray five to eight times. <em>Then the mask.</em>
            </h2>
            <p>
              Cleansing Repairing Mask for him. Brightening Firming Mask for
              her.
            </p>
            <a
              className="btn magnetic"
              href="/conscientious"
              data-cursor="Open"
            >
              Explore CONSCIENTIOUS
            </a>
          </div>
        </div>
      </section>

      <section className="goals" id="goals">
        <div className="row">
          <div>
            <span className="k">6 Goals</span>
            <h2
              className="display h-l split"
              style={{ marginTop: "12px" } as React.CSSProperties}
            >
              The true <em>essence</em> of life.
            </h2>
          </div>
          <p className="lede">
            All-round excellence is six goals, held together. Hover or tap one.
          </p>
        </div>
        <div className="list">
          <div className="goal">
            <span className="n">01</span>
            <h3 className="display">Financial</h3>
            <p>
              To provide a platform to achieve financial freedom and master the
              abilities to meet market demands.
            </p>
          </div>
          <div className="goal">
            <span className="n">02</span>
            <h3 className="display">Health</h3>
            <p>
              To have a healthy body so as to achieve a better quality of life,
              and the ability to realise our dream.
            </p>
          </div>
          <div className="goal">
            <span className="n">03</span>
            <h3 className="display">Social</h3>
            <p>
              To expand the social circle, and exert a positive influence on
              everyone in the circle.
            </p>
          </div>
          <div className="goal">
            <span className="n">04</span>
            <h3 className="display">Family</h3>
            <p>
              To help more families seek the concept of happiness in creating a
              warm and loving family.
            </p>
          </div>
          <div className="goal">
            <span className="n">05</span>
            <h3 className="display">Mental</h3>
            <p>
              To provide the right thoughts, and constantly enrich ourselves to
              raise our thinking to a higher level.
            </p>
          </div>
          <div className="goal">
            <span className="n">06</span>
            <h3 className="display">Spiritual</h3>
            <p>
              To implement the spirit of Integrity, Righteousness and Positivity
              so as to achieve spiritual wealth and become a trustworthy person.
            </p>
          </div>
        </div>
      </section>

      <section className="track-sec hairline" id="rightway">
        <div className="pin">
          <div className="head">
            <div>
              <span className="k">The right way</span>
              <h2
                className="display h-l"
                style={{ marginTop: "12px" } as React.CSSProperties}
              >
                Culture, <em>recognition,</em> giving back.
              </h2>
            </div>
            <span
              className="mono hide-mobile"
              style={{ color: "var(--muted)" } as React.CSSProperties}
            >
              Scroll to travel
            </span>
          </div>
          <div className="track">
            <div className="card dark">
              <div
                className="bg"
                style={
                  {
                    background:
                      "url(/design/riway/emblem-gold.jpg) center/cover",
                  } as React.CSSProperties
                }
              ></div>
              <div>
                <span className="k">Golden Deer Award</span>
                <h3 className="display">Faith and perseverance</h3>
              </div>
              <div>
                <span className="yr">2010</span>
                <p>
                  The annual honour for RIWAY’s top leader, awarded every year
                  since 2010. Sixteen laureates and counting.
                </p>
              </div>
            </div>
            <div className="card dark">
              <div
                className="bg"
                style={
                  {
                    background:
                      "url(/design/riway/foundation-hands.jpg) center/cover",
                  } as React.CSSProperties
                }
              ></div>
              <div>
                <span className="k">RIWAY Foundation</span>
                <h3 className="display">An act of kindness</h3>
              </div>
              <div>
                <span
                  className="fig"
                  data-to="8880000"
                  data-prefix="SGD "
                ></span>
                <p>
                  Raised at the “Light Up A Million Hearts Together” charity
                  auction, April 2019.
                </p>
              </div>
            </div>
            <div className="card dark">
              <div
                className="bg"
                style={
                  {
                    background: "url(/design/riway/yacht-1.jpg) center/cover",
                  } as React.CSSProperties
                }
              ></div>
              <div>
                <span className="k">Baby Pegasus</span>
                <h3 className="display">Captain of your destiny</h3>
              </div>
              <div>
                <span className="yr">2015</span>
                <p>
                  The private yacht gifted to Team Elite Pegasus and Team
                  Supreme. Riding the wind and waves.
                </p>
              </div>
            </div>
            <div className="card dark">
              <div
                className="bg"
                style={
                  {
                    background:
                      "url(/design/riway/tlm-istanbul.jpg) center/cover",
                  } as React.CSSProperties
                }
              ></div>
              <div>
                <span className="k">Top Leaders Meeting</span>
                <h3 className="display">Around the world</h3>
              </div>
              <div>
                <span className="fig">Istanbul · Hawaii · Bangkok</span>
                <p>
                  Leaders gather each year in a new city. The meeting is the
                  reward.
                </p>
              </div>
            </div>
            <div className="card">
              <div>
                <span className="k">Markets</span>
                <h3 className="display">Asia and Europe</h3>
              </div>
              <div>
                <span className="fig" data-to="12" data-suffix="+"></span>
                <p>
                  Singapore, Malaysia, Indonesia, Taiwan, Japan, Hong Kong,
                  Thailand, Philippines, Cambodia, Prague, Warsaw, Budapest.
                </p>
              </div>
            </div>
            <div className="card dark">
              <div
                className="bg"
                style={
                  {
                    background:
                      "url(/design/riway/foundation-hands.jpg) center/cover",
                    filter: "grayscale(1)",
                  } as React.CSSProperties
                }
              ></div>
              <div>
                <span className="k">Relief</span>
                <h3 className="display">Eight countries</h3>
              </div>
              <div>
                <span className="yr">2020</span>
                <p>
                  Foundation donations of necessities, masks, test kits and
                  oxygen generators during COVID-19.
                </p>
              </div>
            </div>
          </div>
          <div className="prog">
            <i></i>
          </div>
        </div>
      </section>

      <section className="section hairline">
        <div className="gda">
          <div>
            <span className="k">Golden Deer Award</span>
            <h2
              className="display h-l split"
              style={{ marginTop: "12px" } as React.CSSProperties}
            >
              The symbol of <em>faith</em> and perseverance.
            </h2>
            <p
              className="lede"
              style={{ marginTop: "22px" } as React.CSSProperties}
            >
              It surrounds with a ferocious aura and guides the fearless and
              undaunted to forge ahead with courage. One laureate a year.
            </p>
            <div className="faces">
              <img src="/design/riway/gda-1.png" alt="Golden Deer laureate" />
              <img src="/design/riway/gda-2.png" alt="Golden Deer laureate" />
              <img src="/design/riway/gda-3.png" alt="Golden Deer laureate" />
              <img src="/design/riway/gda-4.png" alt="Golden Deer laureate" />
            </div>
          </div>
          <div className="roll" id="roll">
            <div>
              <b>2025</b>
              <span>Lin Chin Ying</span>
              <i>An Explorer Who Breaks Through on His Own Initiative</i>
            </div>
            <div>
              <b>2024</b>
              <span>Hasim</span>
              <i>The Fearless Navigator</i>
            </div>
            <div>
              <b>2023</b>
              <span>Tan Kim Lee</span>
              <i>The Earnest and Resolute Achiever</i>
            </div>
            <div>
              <b>2022</b>
              <span>Celest Zhang</span>
              <i>The Invincible Executor</i>
            </div>
            <div>
              <b>2021</b>
              <span>Feng Yu En</span>
              <i>The Gentle and Capable Dream-Builder</i>
            </div>
            <div>
              <b>2020</b>
              <span>Chiu Yen Hao</span>
              <i>A Brilliant and Ambitious Winner</i>
            </div>
            <div>
              <b>2019</b>
              <span>Efendi</span>
              <i>A Leading and Courageous Practitioner</i>
            </div>
            <div>
              <b>2018</b>
              <span>May Yang</span>
              <i>An Intelligent Visionary</i>
            </div>
            <div>
              <b>2017</b>
              <span>Tan Su Thiam</span>
              <i>A Determined and Courageous Strategist</i>
            </div>
            <div>
              <b>2016</b>
              <span>Joe Lee</span>
              <i>A Dedicated and Brave Creator</i>
            </div>
            <div>
              <b>2015</b>
              <span>Victor Tan</span>
              <i>The Focused and Studious Thinker</i>
            </div>
            <div>
              <b>2014</b>
              <span>Andy Saw</span>
              <i>The Brave Revolutionary</i>
            </div>
            <div>
              <b>2013</b>
              <span>David Yeo</span>
              <i>The Ambitious Idealist</i>
            </div>
            <div>
              <b>2012</b>
              <span>Low Chin Joo</span>
              <i>The Educator who Amasses Talents</i>
            </div>
            <div>
              <b>2011</b>
              <span>Dato’ Albert Ang</span>
              <i>The Good Samaritan Standing Tall</i>
            </div>
            <div>
              <b>2010</b>
              <span>Simon Wong</span>
              <i>The Heroic and Dauntless Fighter</i>
            </div>
          </div>
        </div>
      </section>

      <section className="events" id="events">
        <div className="head">
          <div>
            <span
              className="k"
              style={{ color: "var(--gold)" } as React.CSSProperties}
            >
              Events
            </span>
            <h2
              className="display h-l"
              style={{ marginTop: "12px" } as React.CSSProperties}
            >
              Where the <em>spirit</em> gathers.
            </h2>
          </div>
          <p className="lede">
            Published gatherings for your selected market and global events.
            Dates and times are shown in {eventZones[market].label}.
          </p>
        </div>
        <div className="ev-row" id={upcoming.length ? "evrow" : undefined}>
          {upcoming.length ? (
            upcoming.map((event) => (
              <a className="ev" href={`/events/${event.slug}`} key={event.id}>
                <img
                  src="/design/riway/emblem-gold.jpg"
                  alt=""
                  loading="lazy"
                  style={{
                    objectFit: "contain",
                    padding: "clamp(30px,5vw,70px)",
                    opacity: 0.35,
                  }}
                />
                <div className="t">
                  <small>
                    <time dateTime={event.starts_at!}>
                      {formatEventDate(event.starts_at!, market)} ·{" "}
                      {formatEventTime(event.starts_at!, market)}
                    </time>
                  </small>
                  <h3 className="display">{event.title}</h3>
                  <p>{event.location}</p>
                </div>
              </a>
            ))
          ) : (
            <p
              className="lede"
              style={{ gridColumn: "1 / -1", padding: "40px var(--gutter)" }}
            >
              {eventsUnavailable
                ? "Event details are temporarily unavailable. Please try the calendar again later."
                : "Confirmed, approved event details will appear here. No upcoming events are currently published for this market."}
            </p>
          )}
        </div>
        <div style={{ padding: "24px var(--gutter)" }}>
          <a className="btn magnetic" href="/events" data-cursor="Open">
            View regional calendar
          </a>
        </div>
        <div className="marq marquee">
          <div>
            <span>Leadership Training Seminar</span>
            <span>Top Leaders Meeting</span>
            <span>Leaders Recognition Night</span>
            <span>Gala Dinner</span>
            <span>Team Supreme Night</span>
            <span>Pegasus Night</span>
          </div>
          <div aria-hidden="true">
            <span>Leadership Training Seminar</span>
            <span>Top Leaders Meeting</span>
            <span>Leaders Recognition Night</span>
            <span>Gala Dinner</span>
            <span>Team Supreme Night</span>
            <span>Pegasus Night</span>
          </div>
        </div>
        <div className="cta-row dark" id="contact">
          <h2 className="display split">
            Find your <em>right way</em> in.
          </h2>
          <a className="btn magnetic" href="/support" data-cursor="Open">
            Find a distributor
          </a>
        </div>
      </section>
    </ReferenceShell>
  );
}
