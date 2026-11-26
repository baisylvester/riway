import { LocalizedAnchor } from "@/components/localized-link";
import { CookieSettingsButton } from "../consent-manager";

export function ReferenceFooter({ brand = "RIWAY" }: { brand?: string }) {
  if (brand !== "RIWAY")
    return (
      <footer className="foot">
        <div
          className="big"
          style={
            brand === "CONSCIENTIOUS"
              ? { fontSize: "clamp(2.2rem,9.5vw,9.5rem)" }
              : undefined
          }
        >
          {brand}
        </div>
        <div className="cols">
          <div>
            <b>{brand === "PURTIER" ? "PURTIER Placenta" : brand}</b>
            Presentation and packaging from the collection.
          </div>
          <div>
            <b>Houses</b>
            <LocalizedAnchor href="/">RIWAY International</LocalizedAnchor>
            <br />
            <LocalizedAnchor
              href={brand === "PURTIER" ? "/conscientious" : "/purtier"}
            >
              {brand === "PURTIER" ? "CONSCIENTIOUS" : "PURTIER Placenta"}
            </LocalizedAnchor>
          </div>
          <div>
            <b>This page</b>
            {brand === "PURTIER" ? (
              <>
                <LocalizedAnchor href="#product-information">
                  Product information
                </LocalizedAnchor>
                <br />
                <LocalizedAnchor href="#editions">Editions</LocalizedAnchor>
              </>
            ) : (
              <>
                <LocalizedAnchor href="#him">For him</LocalizedAnchor>
                <br />
                <LocalizedAnchor href="#her">For her</LocalizedAnchor>
                <br />
                <LocalizedAnchor href="#gallery">
                  The collection
                </LocalizedAnchor>
                <br />
                <LocalizedAnchor href="#product-information">
                  Product information
                </LocalizedAnchor>
              </>
            )}
          </div>
          <div>
            <b>Contact</b>101 Bedok North Avenue 3<br />
            Singapore 469715
            <br />
            (65) 6531 0188
          </div>
        </div>
        <div className="legal">
          <span>
            Online purchasing is unavailable while market approval, official
            pricing and sales terms are being verified. Contact RIWAY for
            approved product information.
          </span>
          <span>© RIWAY International Group</span>
          <CookieSettingsButton />
        </div>
      </footer>
    );
  return (
    <footer className="foot">
      <div className="big">RIWAY</div>
      <div className="cols">
        <div>
          <b>RIWAY International</b>Showing you the Right Way.
          <br />
          Achieving true freedom through all-round excellence.
        </div>
        <div>
          <b>Houses</b>
          <LocalizedAnchor href="/purtier">PURTIER Placenta</LocalizedAnchor>
          <br />
          <LocalizedAnchor href="/conscientious">CONSCIENTIOUS</LocalizedAnchor>
        </div>
        <div>
          <b>Company</b>
          <LocalizedAnchor href="#story">About</LocalizedAnchor>
          <br />
          <LocalizedAnchor href="#goals">6 Goals</LocalizedAnchor>
          <br />
          <LocalizedAnchor href="#rightway">Golden Deer Award</LocalizedAnchor>
          <br />
          <LocalizedAnchor href="#events">Events</LocalizedAnchor>
        </div>
        <div>
          <b>Contact</b>101 Bedok North Avenue 3<br />
          Singapore 469715
          <br />
          (65) 6531 0188
        </div>
      </div>
      <div className="legal">
        <span>
          RIWAY International does not sell products via any website or any
          internet platform. Distributors of RIWAY International are strictly
          prohibited from selling any RIWAY products via any online means.
        </span>
        <span>© RIWAY International Group</span>
        <CookieSettingsButton />
      </div>
    </footer>
  );
}
