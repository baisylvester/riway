import { currentLocale } from "@/lib/locale-server";
import Link from "@/components/localized-link";
import Image from "next/image";
import { currentMarket } from "@/lib/data";
import { cmsSections, pageKeys } from "@/lib/cms-pages";
import { CmsSections } from "@/components/cms-sections";
export const metadata = { title: "Our world" };
export default async function About() {
  // Approved history, leadership, Golden Deer Award, Foundation and Baby
  // Pegasus sections, when published.
  const sections = await cmsSections(
    pageKeys.about,
    await currentMarket(),
    await currentLocale(),
  );
  return (
    <>
      <section className="section page-section">
        <span className="eyebrow">THE RIWAY STORY</span>
        <h1>
          People at the heart.
          <br />
          Possibility on the horizon.
        </h1>
        <div className="two-column">
          <div className="page-prose">
            <p className="lead">
              Founded in Singapore in 2008, RIWAY International connects a
              community across Asia and Europe.
            </p>
            <p>
              Our next chapter brings our corporate world, product collections
              and member experience into one considered digital home.
            </p>
            <h2>A world of connections.</h2>
            <p>
              Discover our company, the RIWAY Foundation, the Golden Deer Award
              and Baby Pegasus through RIWAY’s official channels. Additional
              corporate and leadership content will be published following
              editorial approval.
            </p>
            <Link className="button" href="https://www.riway.com/">
              Visit the current official website ↗
            </Link>
          </div>
          <div className="world-photo">
            <Image
              src="/images/pegasus.jpg"
              alt="Baby Pegasus, part of the RIWAY story"
              fill
              sizes="(max-width:760px) 100vw, 50vw"
            />
          </div>
        </div>
      </section>
      <CmsSections sections={sections} />
      <section className="section">
        <div className="cards">
          {[
            [
              "01",
              "Our people",
              "A shared journey across cultures and communities.",
            ],
            [
              "02",
              "Our collections",
              "Discover PURTIER PLACENTA and CONSCIENTIOUS.",
            ],
            [
              "03",
              "Our direction",
              "Creating the next chapter with care and purpose.",
            ],
          ].map(([n, t, p]) => (
            <div className="card" key={n}>
              <span className="eyebrow">{n}</span>
              <h2>{t}</h2>
              <p>{p}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
