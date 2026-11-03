import Link from "next/link";
import Image from "next/image";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Globe2,
  HeartHandshake,
  Compass,
} from "lucide-react";
import { catalogue } from "@/lib/data";
import { ProductArt, ProductCard } from "@/components/product-card";
export default async function Home() {
  const { products } = await catalogue();
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="gold-line" /> PURPOSE. PEOPLE. POSSIBILITIES.
          </span>
          <h1>
            A better tomorrow
            <br />
            begins with <em>you.</em>
          </h1>
          <p>
            Discover a world inspired by possibility.
            <br />
            Exceptional collections. Meaningful connections.
            <br />
            One shared journey forward.
          </p>
          <div className="hero-buttons">
            <Link className="button" href="/shop">
              Explore our collections <ArrowUpRight size={17} />
            </Link>
            <Link className="text-link" href="/about">
              The RIWAY story <ArrowRight size={17} />
            </Link>
          </div>
          <div className="hero-bottom">
            <span className="hero-number">
              01 <span>/ 02</span>
            </span>
            <span className="slider-line" />
            <a href="#collections" aria-label="Scroll to collections">
              <ArrowDown size={17} />
            </a>
          </div>
        </div>
        <div className="hero-visual">
          <span className="hero-orbit orbit-one" />
          <span className="hero-orbit orbit-two" />
          <div className="hero-watermark">PURTIER</div>
          <ProductArt
            product={{ slug: "purtier-placenta", name: "PURTIER PLACENTA" }}
            hero
          />
          <div className="hero-caption">
            <span className="eyebrow">THE SIGNATURE COLLECTION</span>
            <h2>PURTIER PLACENTA</h2>
            <Link href="/shop/purtier-placenta">
              Discover the collection <ArrowUpRight size={15} />
            </Link>
          </div>
          <span className="vertical-caption">
            RIWAY INTERNATIONAL · EST. 2008
          </span>
        </div>
      </section>
      <div className="brand-strip">
        <span>Rooted in Singapore. Connected to the world.</span>
        <div>
          <Globe2 size={18} /> A global community
        </div>
        <span className="strip-divider" />
        <div>
          <HeartHandshake size={18} /> People at our heart
        </div>
        <span className="strip-divider" />
        <div>
          <Compass size={18} /> A shared direction
        </div>
      </div>
      <section className="section" id="collections">
        <div className="section-heading">
          <div>
            <span className="eyebrow">CONSIDERED. DISTINCTIVE. RIWAY.</span>
            <h2>Extraordinary, by nature.</h2>
          </div>
          <Link className="text-link" href="/shop">
            View all collections <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="products-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
        <p className="collection-notice">
          Explore our product range. Online sales are awaiting market approvals.
        </p>
      </section>
      <section className="world-section">
        <div className="world-photo">
          <Image
            src="/images/pegasus.jpg"
            alt="RIWAY Baby Pegasus yachts at sea"
            fill
            sizes="(max-width: 760px) 100vw, 50vw"
          />
        </div>
        <div className="world-copy">
          <span className="eyebrow">MORE THAN A DESTINATION</span>
          <h2>
            A shared vision.
            <br />
            An extraordinary journey.
          </h2>
          <p>
            Since 2008, RIWAY has brought people together around a belief in
            possibility. From Singapore to our international community, it is
            our people who give that vision life.
          </p>
          <Link className="button button-light" href="/about">
            Step into our world <ArrowUpRight size={17} />
          </Link>
        </div>
      </section>
      <section className="section community">
        <span className="eyebrow">TOGETHER, WE GO FURTHER</span>
        <h2>
          Your next chapter
          <br />
          starts with a connection.
        </h2>
        <p>
          Learn about RIWAY membership, our community,
          <br />
          and the people behind the journey.
        </p>
        <Link className="button" href="/membership">
          Discover the opportunity <ArrowUpRight size={17} />
        </Link>
        <div className="community-links">
          <Link href="/stories">
            Our stories <ArrowUpRight size={18} />
          </Link>
          <Link href="/events">
            Moments that connect us <ArrowUpRight size={18} />
          </Link>
          <Link href="/support">
            We’re here to help <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
    </>
  );
}
