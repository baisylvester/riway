"use client";
import { useRef, useState } from "react";
import { ProductStage } from "./product-stage";
const goals = [
  [
    "Financial",
    "Possibility, with purpose.",
    "Explore RIWAY membership and its current requirements. Membership is not a guarantee of income.",
  ],
  [
    "Health",
    "Care for the everyday.",
    "Discover our nutrition collection. Approved market-specific product information remains essential.",
  ],
  [
    "Social",
    "A world of connections.",
    "A shared journey across cultures and communities.",
  ],
  [
    "Family",
    "People at the heart.",
    "Meaningful connections begin with the people closest to us.",
  ],
  [
    "Mental",
    "A considered direction.",
    "Creating the next chapter with care and purpose.",
  ],
  [
    "Spiritual",
    "One shared journey.",
    "People, purpose and possibility are at the heart of our community.",
  ],
];
export function GoalsHero() {
  const [active, setActive] = useState(-1);
  const drag = useRef<number | null>(null);
  const controls = useRef<HTMLDivElement>(null);
  function move(index: number) {
    const next = (index + goals.length) % goals.length;
    setActive(next);
    controls.current
      ?.querySelectorAll("button")
      [next]?.focus({ preventScroll: true });
  }
  return (
    <section className="rw-hero" aria-labelledby="rw-hero-title">
      <span className="rw-ghost" aria-hidden="true">
        RIWAY
      </span>
      <div className="rw-topline">
        <span>Singapore · Since 2008</span>
        <span>Six goals · One right way</span>
      </div>
      <ProductStage kind="jar" />
      <div
        ref={controls}
        className="rw-wheel"
        aria-label="Six goals"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            move(active + 1);
          }
          if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            move(active - 1);
          }
          if (e.key === "Home") {
            e.preventDefault();
            move(0);
          }
          if (e.key === "End") {
            e.preventDefault();
            move(5);
          }
        }}
        onPointerDown={(e) => {
          drag.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (drag.current !== null && Math.abs(e.clientX - drag.current) > 45)
            move(active + (e.clientX < drag.current ? 1 : -1));
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div className="rw-wheel-ring" aria-hidden="true" />
        {goals.map(([label], i) => (
          <button
            key={label}
            type="button"
            aria-pressed={active === i}
            aria-controls="rw-goal-caption"
            style={{ "--angle": `${i * 60}deg` } as React.CSSProperties}
            onClick={() => setActive(i)}
          >
            <span>
              {label}
              <small>Goal {String(i + 1).padStart(2, "0")}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="rw-caption" id="rw-goal-caption" aria-live="polite">
        <span className="eyebrow">
          {active < 0
            ? "Purpose. People. Possibilities."
            : `${String(active + 1).padStart(2, "0")} — ${goals[active][0]}`}
        </span>
        <h1 id="rw-hero-title">
          {active < 0 ? (
            <>
              Showing you the <em>Right Way.</em>
            </>
          ) : (
            goals[active][1]
          )}
        </h1>
        <p>
          {active < 0
            ? "Six goals. One shared journey forward. Explore the wheel."
            : goals[active][2]}
        </p>
        <a className="text-link" href="#collections">
          Explore our collections ↗
        </a>
      </div>
      <div className="rw-hero-index" aria-hidden="true">
        {String(Math.max(active + 1, 1)).padStart(2, "0")}
        <small>
          Six perspectives.
          <br />
          One direction.
        </small>
      </div>
    </section>
  );
}
export function GoalsList() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="rw-section" id="goals">
      <span className="eyebrow">Six goals</span>
      <h2>
        A life with <em>direction.</em>
      </h2>
      <div className="rw-goals-list">
        {goals.map(([label, , description], i) => (
          <div key={label}>
            <button
              type="button"
              aria-expanded={open === i}
              aria-controls={`goal-${i}`}
              onClick={() => setOpen(open === i ? null : i)}
            >
              <small>0{i + 1}</small>
              <span>{label}</span>
              <b aria-hidden="true">{open === i ? "−" : "+"}</b>
            </button>
            <p id={`goal-${i}`} hidden={open !== i}>
              {description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
export function EditionWheel() {
  const [edition, setEdition] = useState(7);
  return (
    <section
      className="rw-section rw-edition-section"
      aria-labelledby="edition-title"
    >
      <span className="eyebrow">PURTIER · The presentation archive</span>
      <h2 id="edition-title">
        A story, <em>in editions.</em>
      </h2>
      <div className="rw-edition-wheel">
        <img
          src={`/design/purtier/edition-${edition}.jpg`}
          alt={`PURTIER edition ${edition} archival packaging`}
          loading="lazy"
        />
        <div
          className="rw-edition-options"
          role="group"
          aria-label="Packaging archive edition"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              const next =
                ((edition - 1 + (e.key === "ArrowRight" ? 1 : 6)) % 7) + 1;
              setEdition(next);
              e.currentTarget
                .querySelectorAll("button")
                [next - 1]?.focus({ preventScroll: true });
            }
          }}
        >
          {Array.from({ length: 7 }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={edition === i + 1}
              onClick={() => setEdition(i + 1)}
              style={
                { "--angle": `${(i * 360) / 7}deg` } as React.CSSProperties
              }
            >
              Edition 0{i + 1}
            </button>
          ))}
        </div>
      </div>
      <p className="small">
        Packaging archive imagery. Current product identity and availability are
        shown in the product details above.
      </p>
    </section>
  );
}
export function ThemeGallery() {
  const [theme, setTheme] = useState<"him" | "her">("him");
  return (
    <section className={`rw-theme rw-theme-${theme}`} id="collection-themes">
      <div className="rw-section">
        <span className="eyebrow">CONSCIENTIOUS · The collection</span>
        <h2>
          Two expressions.
          <br />
          <em>One considered collection.</em>
        </h2>
        <div
          className="rw-theme-buttons"
          role="group"
          aria-label="Collection visual theme"
        >
          {(["him", "her"] as const).map((t) => (
            <button
              type="button"
              key={t}
              aria-pressed={theme === t}
              onClick={() => setTheme(t)}
            >
              For {t}
            </button>
          ))}
        </div>
        <p className="rw-theme-note">
          Visual themes show the collection’s presentation. They do not select a
          purchasable variant.
        </p>
        <div className="rw-theme-grid">
          <figure>
            <img
              src={
                theme === "him"
                  ? "/design/conscientious/him-her-sets.jpg"
                  : "/design/conscientious/her-spray-box.jpg"
              }
              alt={
                theme === "him"
                  ? "Black and blush CONSCIENTIOUS presentation sets"
                  : "CONSCIENTIOUS blush essence spray presentation box"
              }
              loading="lazy"
            />
            <figcaption>
              {theme === "him"
                ? "The presentation sets"
                : "Inside the presentation box"}
            </figcaption>
          </figure>
          <figure>
            <img
              src="/design/conscientious/masks-pair.jpg"
              alt="CONSCIENTIOUS mask sachets in black and blush"
              loading="lazy"
            />
            <figcaption>The collection, in detail</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
