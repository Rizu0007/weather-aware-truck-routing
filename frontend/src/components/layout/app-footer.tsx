const SOURCES = [
  { label: "Open-Meteo.com", href: "https://open-meteo.com/", note: "weather, CC BY 4.0" },
  { label: "OSRM", href: "https://project-osrm.org/", note: "routing" },
  { label: "Photon", href: "https://photon.komoot.io/", note: "places" },
  { label: "OpenFreeMap", href: "https://openfreemap.org/", note: "map tiles" },
];

/** Data credits: Open-Meteo's licence requires attribution; OSM data is in tiles, routes and places. */
export function AppFooter() {
  return (
    <footer className="border-t border-border text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap gap-x-4 gap-y-1 px-4 py-3">
        {SOURCES.map((source) => (
          <span key={source.label}>
            <a href={source.href} className="underline underline-offset-2 hover:text-foreground">
              {source.label}
            </a>{" "}
            ({source.note})
          </span>
        ))}
        <span>
          Map data ©{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            className="underline underline-offset-2 hover:text-foreground"
          >
            OpenStreetMap contributors
          </a>
        </span>
      </div>
    </footer>
  );
}
