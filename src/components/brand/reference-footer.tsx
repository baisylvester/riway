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
            {brand === "PURTIER" ? (
              <>
                Revolutionary. Cutting edge.
                <br />
                Optimal care, since the first edition.
              </>
            ) : (
              <>Exclusively developed by RIWAY International.</>
            )}
          </div>
          <div>
            <b>Houses</b>
            <a href="/">RIWAY International</a>
            <br />
            <a href={brand === "PURTIER" ? "/conscientious" : "/purtier"}>
              {brand === "PURTIER" ? "CONSCIENTIOUS" : "PURTIER Placenta"}
            </a>
          </div>
          <div>
            <b>This page</b>
            {brand === "PURTIER" ? (
              <>
                <a href="#story">Our story</a>
                <br />
                <a href="#ingredients">Ingredients</a>
                <br />
                <a href="#editions">Editions</a>
              </>
            ) : (
              <>
                <a href="#him">For him</a>
                <br />
                <a href="#her">For her</a>
                <br />
                <a href="#science">The science</a>
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
            {brand === "PURTIER"
              ? "Distributors of RIWAY International are strictly prohibited from selling any RIWAY products via any online means."
              : "RIWAY International does not sell products via any website or any internet platform."}
          </span>
          <span>© RIWAY International Group</span>
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
          <a href="/purtier">PURTIER Placenta</a>
          <br />
          <a href="/conscientious">CONSCIENTIOUS</a>
        </div>
        <div>
          <b>Company</b>
          <a href="#story">About</a>
          <br />
          <a href="#goals">6 Goals</a>
          <br />
          <a href="#rightway">Golden Deer Award</a>
          <br />
          <a href="#events">Events</a>
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
      </div>
    </footer>
  );
}
