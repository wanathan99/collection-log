#!/usr/bin/env python3
"""Scrapes the OSRS Wiki Collection Log table into collection-log/data/items.json."""

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

SOURCE_URL = "https://oldschool.runescape.wiki/w/Collection_log/Table"
CATEGORY_PAGE_URL = "https://oldschool.runescape.wiki/w/Collection_log"
BASE = "https://oldschool.runescape.wiki"
OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "items.json"
USER_AGENT = "collection-log-tracker/1.0 (personal project; contact: nathanwang115@gmail.com)"

CATEGORIES = ("Bosses", "Raids", "Clues", "Minigames", "Other")

# The /Table page's "Collections" source labels sometimes differ from the
# h3 heading names used to group sources on the main Collection_log page
# (combined boss variants, reworded activity names, etc). Map the ones that
# differ here; anything not listed is looked up by its own name directly.
# A value of None means "no matching heading - default to Other" (e.g.
# Venators is regular monsters with no section of their own on that page).
SOURCE_HEADING_OVERRIDES = {
    "Chest (Barrows)": "Barrows Chests",
    "Callisto": "Callisto and Artio",
    "Crazy Archaeologist": "Crazy archaeologist",
    "Deranged archaeologist": "Deranged Archaeologist",
    "TzHaar Fight Cave": "The Fight Caves",
    "Thermonuclear Smoke Devil": "Thermonuclear smoke devil",
    "Venenatis": "Venenatis and Spindel",
    "Vet'ion": "Vet'ion and Calvar'ion",
    "Reward casket (beginner)": "Beginner Treasure Trails",
    "Reward casket (easy)": "Easy Treasure Trails",
    "Reward casket (medium)": "Medium Treasure Trails",
    "Reward casket (hard)": "Hard Treasure Trails",
    "Reward casket (elite)": "Elite Treasure Trails",
    "Reward casket (master)": "Master Treasure Trails",
    "Scroll case": "Scroll Cases",
    "Treasure Trails": "Shared Treasure Trail Rewards",
    "Shades of Mort'ton (minigame)": "Shades of Mort'ton",
    "Vale Totems (minigame)": "Vale Totems",
    "Boat paint": "Boat Paints",
    "Elder chaos druid": "Elder Chaos Druids",
    "Lost schematics": "Lost Schematics",
    "Monkey (Monkey Madness II)": "Monkey Backpacks",
    "Ocean encounters": "Ocean Encounters",
    "Sailing": "Sailing Miscellaneous",
    "Stone chest (House on the Hill)": "Fossil Island Notes",
    "Pet": "Skilling Pets",
    "Pets": "All Pets",
    "Venators": None,
}


def fetch_html(url):
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=30) as resp:
        return resp.read()


def parse_comp(text):
    text = text.strip().rstrip("%")
    try:
        return float(text)
    except ValueError:
        return None


def scrape_heading_categories():
    """Walks the main Collection_log page's h2/h3 headings to map each
    source heading (h3) to its top-level category (h2: Bosses/Raids/Clues/
    Minigames/Other)."""
    html = fetch_html(CATEGORY_PAGE_URL)
    soup = BeautifulSoup(html, "html.parser")

    heading_to_category = {}
    current_category = None
    for div in soup.find_all("div", class_="mw-heading"):
        classes = div.get("class") or []
        heading = div.find(["h2", "h3"])
        if heading is None:
            continue
        name = re.sub(r"\[edit.*?\]\s*$", "", heading.get_text(strip=True)).strip()

        if "mw-heading2" in classes:
            current_category = name if name in CATEGORIES else None
        elif "mw-heading3" in classes and current_category:
            heading_to_category[name] = current_category

    return heading_to_category


def category_for(source, heading_to_category):
    if source in heading_to_category:
        return heading_to_category[source]
    if source in SOURCE_HEADING_OVERRIDES:
        target = SOURCE_HEADING_OVERRIDES[source]
        return heading_to_category.get(target, "Other") if target else "Other"
    return "Other"


def scrape():
    html = fetch_html(SOURCE_URL)
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", class_="collection-log")
    if table is None:
        raise RuntimeError("Could not find the collection log table on the page")

    rows = table.find_all("tr")[1:]  # skip header
    items = []
    for i, row in enumerate(rows):
        cells = row.find_all("td")
        if len(cells) < 3:
            continue

        item_cell, source_cell, comp_cell = cells[0], cells[1], cells[2]

        img = item_cell.find("img")
        item_link = None
        for a in item_cell.find_all("a"):
            if "mw-file-description" in (a.get("class") or []):
                continue
            item_link = a
            break

        source_link = source_cell.find("a")

        items.append({
            "id": i,
            "item": (item_link.get("title") or item_link.get_text(strip=True)) if item_link else item_cell.get_text(strip=True),
            "itemUrl": (BASE + item_link["href"]) if item_link and item_link.get("href") else None,
            "img": (BASE + img["src"]) if img and img.get("src") else None,
            "source": (source_link.get("title") or source_link.get_text(strip=True)) if source_link else source_cell.get_text(strip=True),
            "sourceUrl": (BASE + source_link["href"]) if source_link and source_link.get("href") else None,
            "comp": parse_comp(comp_cell.get_text()),
        })

    # Some collection log slots share a generic display name (e.g. 26 distinct
    # "Ancient page" entries under "My Notes", each with its own completion
    # rate) - label them so they read as distinct rows instead of duplicates.
    counts = Counter((it["item"], it["source"]) for it in items)
    seen = defaultdict(int)
    for it in items:
        key = (it["item"], it["source"])
        if counts[key] > 1:
            seen[key] += 1
            it["label"] = f"{it['item']} ({seen[key]}/{counts[key]})"
        else:
            it["label"] = it["item"]

    return items


def main():
    items = scrape()
    if len(items) < 1000:
        print(f"Only found {len(items)} items, expected 1000+; aborting to avoid clobbering good data.", file=sys.stderr)
        sys.exit(1)

    heading_to_category = scrape_heading_categories()
    if len(heading_to_category) < 50:
        print(f"Only found {len(heading_to_category)} category headings, expected 100+; aborting.", file=sys.stderr)
        sys.exit(1)

    for it in items:
        it["category"] = category_for(it["source"], heading_to_category)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(items)} items to {OUT_PATH}")


if __name__ == "__main__":
    main()
