#!/usr/bin/env python3
"""Maakt van een invoerbestand (JSON) een Reel als MP4: 1080x1920, 30 fps, H.264, yuv420p.

Gebruik:
  python maak_reel.py invoer.json --uit reel.mp4
  python maak_reel.py invoer.json --stills map --alleen-stills   (alleen begin, midden en eind als plaatje)

Het resultaat staat als JSON op stdout. Exit-code: 0 gelukt, 2 invoer klopt niet,
3 video maken kan hier niet, 4 video is gemaakt maar voldoet niet.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import time
from pathlib import Path


def meld(uitkomst: dict, code: int) -> None:
    print(json.dumps(uitkomst, ensure_ascii=False))
    sys.exit(code)


def zorg_voor_pakketten() -> None:
    """Pillow en numpy zijn normaal al aanwezig; zo niet, dan via pip in een eigen map."""
    import importlib

    map_ = Path(tempfile.gettempdir()) / "campaigo-pakketten"
    if map_.is_dir() and str(map_) not in sys.path:
        sys.path.insert(0, str(map_))
    ontbreekt = []
    for importnaam, pakket in (("PIL", "Pillow"), ("numpy", "numpy")):
        try:
            importlib.import_module(importnaam)
        except ImportError:
            ontbreekt.append(pakket)
    if not ontbreekt:
        return
    import subprocess

    map_.mkdir(parents=True, exist_ok=True)
    if str(map_) not in sys.path:
        sys.path.insert(0, str(map_))
    uit = subprocess.run(
        [sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "--timeout", "20", "--retries", "1", "--target", str(map_), *ontbreekt],
        capture_output=True,
        text=True,
    )
    importlib.invalidate_caches()
    if uit.returncode != 0:
        meld({"ok": False, "soort": "omgeving", "uitleg": f"Pakketten ontbreken en installeren lukt niet: {', '.join(ontbreekt)}."}, 3)


def main() -> None:
    p = argparse.ArgumentParser(description="Maakt een Reel als MP4 uit een JSON-invoer.")
    p.add_argument("invoer", help="pad naar invoer.json")
    p.add_argument("--uit", default="reel.mp4", help="pad van de MP4")
    p.add_argument("--stills", help="map voor begin-, midden- en eindbeeld als PNG")
    p.add_argument("--alleen-stills", action="store_true", help="maak alleen de plaatjes, geen video")
    args = p.parse_args()

    zorg_voor_pakketten()
    from PIL import Image

    import motor
    import sjablonen

    start = time.perf_counter()
    try:
        pad_invoer = Path(args.invoer)
        try:
            invoer = json.loads(pad_invoer.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            raise motor.InvoerFout(f"Het invoerbestand kan ik niet lezen: {e}") from e
        reel = sjablonen.maak_sjabloon(invoer, pad_invoer.resolve().parent)

        if args.stills:
            map_stills = Path(args.stills)
            map_stills.mkdir(parents=True, exist_ok=True)
            for naam, i in (("begin", 0), ("midden", getattr(reel, "midden", reel.aantal // 2)), ("eind", reel.aantal - 1)):
                Image.fromarray(reel.frame(i)).save(map_stills / f"{naam}.png")
        if args.alleen_stills:
            meld({"ok": True, "stills": str(args.stills), "seconden": round(reel.seconden, 2), "opmerkingen": reel.stijl.opmerkingen}, 0)

        exe, route = motor.vind_ffmpeg()
        doel = Path(args.uit)
        doel.parent.mkdir(parents=True, exist_ok=True)
        klaar_voorbereiden = time.perf_counter()
        encoder = motor.Encoder(exe, str(doel), reel.aantal / motor.FPS)
        try:
            for i in range(reel.aantal):
                frame = reel.frame(i)
                encoder.schrijf(frame)
                if i % (motor.FPS * 2) == 0:
                    print(f"  {i}/{reel.aantal} beelden", file=sys.stderr, flush=True)
        finally:
            encoder.sluit()
        rekentijd = time.perf_counter() - start
        samenvatting, fouten = motor.controleer_bestand(str(doel), exe, reel.aantal / motor.FPS)
        uitkomst = {
            "ok": not fouten,
            "pad": str(doel),
            "seconden": round(reel.aantal / motor.FPS, 2),
            "mb": round(doel.stat().st_size / 1_000_000, 2),
            "beelden": reel.aantal,
            "route": route,
            "rekentijd_s": round(rekentijd, 1),
            "voorbereiding_s": round(klaar_voorbereiden - start, 1),
            "controle": samenvatting,
            "fouten": fouten,
            "tekstvakken": reel.vakken,
            "opmerkingen": reel.stijl.opmerkingen,
        }
        meld(uitkomst, 0 if not fouten else 4)
    except motor.InvoerFout as e:
        meld({"ok": False, "soort": "invoer", "uitleg": str(e)}, 2)
    except motor.VideoFout as e:
        meld({"ok": False, "soort": "video", "uitleg": str(e)}, 3)


if __name__ == "__main__":
    main()
