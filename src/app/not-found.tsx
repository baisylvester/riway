import Link from "next/link";
export default function NotFound() {
  return (
    <section className="section empty">
      <span className="eyebrow">404</span>
      <h1>A different path awaits.</h1>
      <p>This page could not be found.</p>
      <Link className="button" href="/">
        Return home
      </Link>
    </section>
  );
}
