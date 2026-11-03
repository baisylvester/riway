import Link from "next/link";
import { BrandMotion } from "@/components/brand/brand-motion";
import { catalogue, content, currentMarket } from "@/lib/data";
import { GoalsHero, GoalsList } from "@/components/brand/brand-interactions";
import {
  Houses,
  Unboxing,
  RightWayTrack,
  Recognition,
} from "@/components/brand/editorial";
export default async function Home() {
  const [{ products }, events, market] = await Promise.all([
    catalogue(),
    content("event"),
    currentMarket(),
  ]);
  const purtier = products.find((p) => p.slug === "purtier-placenta");
  const conscientious = products.find((p) => p.slug === "conscientious");
  const upcoming = events
    .filter(
      (e) =>
        (!e.market || e.market === market) &&
        e.starts_at &&
        new Date(e.starts_at) > new Date(),
    )
    .slice(0, 4);
  return (
    <BrandMotion>
      <GoalsHero />
      <section className="rw-section rw-manifesto" id="story">
        <div>
          <span className="eyebrow">About RIWAY</span>
          <h2>
            People at the heart.
            <br />
            Possibility on
            <br />
            <em>the horizon.</em>
          </h2>
          <p>
            Since 2008, RIWAY has brought people together around a belief in
            possibility. From Singapore to our international community, it is
            our people who give that vision life.
          </p>
          <Link className="text-link" href="/about">
            Step into our world ↗
          </Link>
          <div className="rw-meta">
            <span>
              <b>2008</b>Founded in Singapore
            </span>
            <span>
              <b>RIWAY</b>A shared direction
            </span>
            <span>
              <b>Together</b>People at our heart
            </span>
          </div>
        </div>
        <img
          src="/design/riway/hero-skyline.jpg"
          alt="A RIWAY leader looking across the city"
          loading="lazy"
        />
      </section>
      <Houses
        purtier={purtier ? `/shop/${purtier.slug}` : undefined}
        conscientious={
          conscientious ? `/shop/${conscientious.slug}` : undefined
        }
      />
      {purtier && <Unboxing kind="purtier" href={`/shop/${purtier.slug}`} />}
      {conscientious && (
        <Unboxing kind="conscientious" href={`/shop/${conscientious.slug}`} />
      )}
      <GoalsList />
      <RightWayTrack />
      <Recognition />
      <section className="rw-section rw-dark rw-events" id="events">
        <div className="rw-section-heading">
          <div>
            <span className="eyebrow">Events</span>
            <h2>
              Where the
              <br />
              <em>spirit gathers.</em>
            </h2>
          </div>
          <Link className="rw-pill" href="/events">
            Explore events ↗
          </Link>
        </div>
        <div
          className="rw-event-archive"
          aria-label="RIWAY event archive imagery"
        >
          {[
            ["gala-stage.jpg", "RIWAY gala stage"],
            ["tlm-istanbul.jpg", "RIWAY community meeting"],
            ["fire-stage.jpg", "RIWAY event performance"],
            ["crowd.jpg", "RIWAY community audience"],
          ].map(([image, alt]) => (
            <img
              key={image}
              src={`/design/riway/${image}`}
              alt={alt}
              loading="lazy"
            />
          ))}
        </div>
        <p className="small">Moments from the RIWAY image archive.</p>
        {upcoming.length ? (
          <div className="rw-event-list">
            {upcoming.map((e) => (
              <Link key={e.id} href={`/events/${e.slug}`}>
                <h3>{e.title}</h3>
                <p>{e.excerpt}</p>
                <span>View event ↗</span>
              </Link>
            ))}
          </div>
        ) : (
          <p>
            Confirmed, approved event details will appear on our events page.
          </p>
        )}
      </section>
      <section className="rw-section rw-product-cta" id="contact">
        <span className="eyebrow">Together, we go further</span>
        <h2>
          Your next chapter
          <br />
          <em>starts with a connection.</em>
        </h2>
        <Link className="rw-pill" href="/membership">
          Discover membership ↗
        </Link>
        <div className="rw-utility-links">
          <Link href="/shop">Live catalogue</Link>
          <Link href="/stories">Our stories</Link>
          <Link href="/distributor">Distributor area</Link>
          <Link href="/support">Contact & support</Link>
        </div>
        <p className="small">
          Online purchasing is unavailable. Explore the collections and save
          products to your review bag.
        </p>
      </section>
    </BrandMotion>
  );
}
