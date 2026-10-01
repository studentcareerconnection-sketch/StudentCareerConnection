"""Command-line entry point for all UCI scrapers.

Examples:
  python scrape.py all                          # everything, current WebSoc term
  python scrape.py courses                      # catalogue course descriptions
  python scrape.py programs                     # catalogue program pages (sample plans, fallback rules)
  python scrape.py anteater                     # degree requirements from Anteater API (DegreeWorks)
  python scrape.py prereqs                      # registrar prerequisite logic trees
  python scrape.py websoc --term 2026-92 --term 2027-03
  python scrape.py websoc --term all --cache-websoc   # every term WebSoc offers (~2h)
  python scrape.py websoc --dept "I&C SCI" --dept COMPSCI
  python scrape.py websoc --list-terms
"""
import argparse

from scrapers import anteater, catalogue_courses, catalogue_programs, prerequisites, websoc
from scrapers.common import Fetcher


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("target", choices=["all", "courses", "programs", "anteater", "prereqs", "websoc"])
    ap.add_argument("--term", action="append", help="WebSoc YearTerm value, e.g. 2026-92 (repeatable), or 'all'")
    ap.add_argument("--dept", action="append", help="Only these WebSoc departments (repeatable)")
    ap.add_argument("--list-terms", action="store_true", help="Print available WebSoc terms and exit")
    ap.add_argument("--delay", type=float, default=1.0, help="Seconds between requests (default 1)")
    ap.add_argument("--no-cache", action="store_true", help="Ignore cached catalogue pages")
    ap.add_argument("--cache-websoc", action="store_true",
                    help="Reuse cached WebSoc responses (off by default: enrollment numbers change constantly)")
    args = ap.parse_args()

    catalogue = Fetcher(delay=args.delay, use_cache=not args.no_cache)
    soc = Fetcher(delay=args.delay, use_cache=args.cache_websoc)

    if args.list_terms:
        for value, name in websoc.get_form_options(soc)[0]:
            print(f"{value:10} {name}")
        return

    if args.target in ("all", "courses"):
        catalogue_courses.main(catalogue)
    if args.target in ("all", "programs"):
        catalogue_programs.main(catalogue)
    if args.target in ("all", "anteater"):
        anteater.main(catalogue)
    if args.target in ("all", "prereqs"):
        prerequisites.main(catalogue)
    if args.target in ("all", "websoc"):
        websoc.main(soc, args.term, args.dept)


if __name__ == "__main__":
    main()
