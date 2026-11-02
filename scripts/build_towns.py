"""Builds backend/trips/data/towns.tsv.gz, the towns used as via-points for extra routes.

Source: GeoNames (CC BY 4.0), https://download.geonames.org/export/dump/
  cities1000.zip       places with 1,000+ people
  admin1CodesASCII.txt state and province names

Usage: python3 scripts/build_towns.py <folder with cities1000.txt and admin1CodesASCII.txt>
"""

import csv
import gzip
import sys
from pathlib import Path

COUNTRIES = {"US", "CA", "MX"}
# Towns and cities only: no neighbourhoods (PPLX), historical or abandoned places.
FEATURES = {"PPL", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLC"}
OUT = Path(__file__).resolve().parent.parent / "backend/trips/data/towns.tsv.gz"


def main(source: Path) -> None:
    states = {}
    with open(source / "admin1CodesASCII.txt", encoding="utf-8") as f:
        for code, name, _ascii, _id in csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            states[code] = name

    rows = []
    with open(source / "cities1000.txt", encoding="utf-8") as f:
        for r in csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            country, feature = r[8], r[7]
            if country not in COUNTRIES or feature not in FEATURES:
                continue
            state = states.get(f"{country}.{r[10]}", "")
            rows.append((r[1], state, country, f"{float(r[4]):.4f}", f"{float(r[5]):.4f}", r[14]))

    rows.sort(key=lambda row: (row[2], row[1], row[0]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    text = "name\tstate\tcountry\tlat\tlon\tpopulation\n"
    text += "".join("\t".join(row) + "\n" for row in rows)
    # mtime=0: the same data gives the same bytes, so git sees no change on a rebuild.
    OUT.write_bytes(gzip.compress(text.encode("utf-8"), mtime=0))
    print(f"{len(rows)} towns -> {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
