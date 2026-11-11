# De drie sjablonen. Elk geeft een object met .aantal, .seconden, .frame(i) en .vakken.
# Regel voor elk sjabloon: beeld 0 is al af, want Instagram gebruikt zonder coverkeuze het eerste beeld.

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

from motor import (
    BREEDTE,
    FPS,
    HOOGTE,
    VEILIG_B,
    VEILIG_L,
    VEILIG_O,
    VEILIG_R,
    InvoerFout,
    Laag,
    controleer_veilig,
    effen,
    hex_naar_rgb,
    in_uit_cubic,
    in_uit_sinus,
    kies_lettertype,
    klem,
    leesbaar,
    plak,
    tekst_laag,
    uit_cubic,
    vorm_laag,
    zet_tekst,
)

VEILIG_BREEDTE = VEILIG_R - VEILIG_L
VEILIG_HOOGTE = VEILIG_O - VEILIG_B

# Neutrale standaard als het merkprofiel niets zegt. Bewust niet de kleuren van Campaigo.
STANDAARD = {"achtergrond": "#EFE7DB", "vlak": "#1F3A3D", "accent": "#C8963E", "tekst": "#1E2328"}

# Tijden in seconden.
T_UIT = 0.24
T_VEEG = 0.7
T_IN = 0.55
T_EIND = 1.2  # het laatste beeld blijft langer staan


@dataclass
class Stijl:
    achtergrond: tuple[int, int, int]
    vlak: tuple[int, int, int]
    accent: tuple[int, int, int]
    tekst: tuple[int, int, int]
    vet: str
    normaal: str
    afzender: str | None
    opmerkingen: list[str] = field(default_factory=list)

    def vlakken(self) -> list[tuple[int, int, int]]:
        return [self.achtergrond, self.vlak, self.accent]


def lees_stijl(invoer: dict) -> Stijl:
    merk = invoer.get("merk") or {}
    if not isinstance(merk, dict):
        raise InvoerFout('"merk" moet een blok zijn met kleuren en lettertype.')
    kleuren = {**STANDAARD, **{k: v for k, v in (merk.get("kleuren") or {}).items() if v}}
    vet, normaal, opmerking = kies_lettertype(merk.get("lettertype"))
    stijl = Stijl(
        achtergrond=hex_naar_rgb(kleuren["achtergrond"]),
        vlak=hex_naar_rgb(kleuren["vlak"]),
        accent=hex_naar_rgb(kleuren["accent"]),
        tekst=hex_naar_rgb(kleuren["tekst"]),
        vet=vet,
        normaal=normaal,
        afzender=(str(merk.get("afzender")).strip() or None) if merk.get("afzender") else None,
    )
    if opmerking:
        stijl.opmerkingen.append(opmerking)
    return stijl


def teksten(invoer: dict, sleutel: str, minimum: int, maximum: int) -> list[str]:
    waarde = invoer.get(sleutel)
    if not isinstance(waarde, list) or not all(isinstance(z, str) and z.strip() for z in waarde):
        raise InvoerFout(f'"{sleutel}" moet een lijst met teksten zijn.')
    if not minimum <= len(waarde) <= maximum:
        raise InvoerFout(f'"{sleutel}" moet {minimum} tot {maximum} teksten bevatten, nu {len(waarde)}.')
    return [" ".join(z.split()) for z in waarde]


def leestijd(tekst: str) -> float:
    return max(1.1, 0.30 * len(tekst.split()) + 0.45)


def verdeel_tijd(
    leestijden: list[float],
    vast: float,
    gevraagd: float | None,
    laagste: float = 8.0,
    hoogste: float = 15.0,
) -> list[float]:
    """Rekt of krimpt de leestijden zodat de Reel binnen de gewenste duur valt."""
    if gevraagd is not None:
        if not 4 <= float(gevraagd) <= 30:
            raise InvoerFout('"duur" moet tussen 4 en 30 seconden liggen.')
        laagste = hoogste = float(gevraagd)
    som = sum(leestijden)
    totaal = som + vast
    if totaal < laagste:
        factor = (laagste - vast) / som
    elif totaal > hoogste:
        factor = (hoogste - vast) / som
    else:
        return leestijden
    if factor < 0.78:
        raise InvoerFout(
            f"Dit is te veel tekst voor {hoogste:.0f} seconden. Haal er een zin uit, maak de zinnen korter of vraag om een langere Reel."
        )
    return [t * factor for t in leestijden]


def _afzender_laag(stijl: Stijl, kleur: tuple[int, int, int], y: int) -> Laag:
    zet = zet_tekst(stijl.afzender or "", stijl.normaal, VEILIG_BREEDTE, 80, 34, 26)
    return tekst_laag(zet, VEILIG_L, y, kleur)


# Sjabloon 1: tekst op kleurvlakken, zin voor zin ------------------------------

class TekstOpVlakken:
    def __init__(self, invoer: dict):
        self.stijl = s = lees_stijl(invoer)
        zinnen = teksten(invoer, "zinnen", 2, 6)
        vlakken = [hex_naar_rgb(k) for k in invoer["vlakken"]] if invoer.get("vlakken") else s.vlakken()
        overgangen = len(zinnen) - 1
        vast = overgangen * (T_UIT + T_VEEG + T_IN) + T_EIND
        lezen = verdeel_tijd([leestijd(z) for z in zinnen], vast, invoer.get("duur"))

        self.scenes = []
        t, alle_lagen = 0.0, []
        heeft_afzender = bool(s.afzender)
        tekst_max_h = VEILIG_HOOGTE - (150 if heeft_afzender else 60)
        for i, zin in enumerate(zinnen):
            vlak = vlakken[i % len(vlakken)]
            kleur = leesbaar(s.tekst, vlak)
            accent = leesbaar(s.accent, vlak, 2.0)
            zet = zet_tekst(zin, s.vet, VEILIG_BREEDTE, tekst_max_h, 112, 56)
            streep_h = 12
            ruimte = 44
            blok_h = zet.hoogte + streep_h + ruimte
            onder_marge = 90 if heeft_afzender else 0
            top = VEILIG_B + int((VEILIG_HOOGTE - onder_marge - blok_h) / 2)
            streep = vorm_laag(VEILIG_L, top, 110, streep_h, 6, accent)
            tekst = tekst_laag(zet, VEILIG_L, top + streep_h + ruimte, kleur)
            lagen = [streep, tekst]
            basis = effen(vlak)
            if heeft_afzender:
                af = _afzender_laag(s, kleur, VEILIG_O - 58)
                plak(basis, af, dekking=0.8)
                alle_lagen.append(af)
            alle_lagen += lagen

            scene = {"basis": basis, "lagen": lagen, "in": t if i else None}
            t += (T_IN if i else 0) + lezen[i]
            if i < overgangen:
                scene["uit"] = t
                t += T_UIT
                scene["veeg"] = t
                t += T_VEEG
            self.scenes.append(scene)
        t += T_EIND
        self.seconden = t
        self.aantal = round(t * FPS)
        self.vakken = controleer_veilig(alle_lagen, "De tekst", s.opmerkingen)
        # Het middenbeeld voor de plaatjes: een moment waarop de middelste zin rustig staat.
        midden = self.scenes[len(self.scenes) // 2]
        self.midden = round(((midden["in"] or 0.0) + T_IN + 0.3) * FPS)

    def frame(self, i: int) -> np.ndarray:
        t = i / FPS
        n = len(self.scenes)
        # Zoek de scene die nu het beeld bepaalt.
        k = 0
        for j in range(n - 1, -1, -1):
            start = self.scenes[j]["in"]
            if start is not None and t >= start:
                k = j
                break
        sc = self.scenes[k]

        if sc.get("veeg") is not None and t >= sc["veeg"]:
            # Het vlak van de volgende zin schuift rustig omhoog. Geen tekst in beeld.
            volgende = self.scenes[k + 1]
            v = in_uit_cubic((t - sc["veeg"]) / T_VEEG)
            grens = round(HOOGTE * (1 - v))
            beeld = sc["basis"].copy()
            if grens < HOOGTE:
                beeld[grens:] = volgende["basis"][grens:]
            return beeld

        beeld = sc["basis"].copy()
        if sc["in"] is not None and t < sc["in"] + T_IN:
            v = uit_cubic((t - sc["in"]) / T_IN)
            dekking, dy = v, 34 * (1 - v)
        elif sc.get("uit") is not None and t >= sc["uit"]:
            v = (t - sc["uit"]) / T_UIT
            dekking, dy = 1 - in_uit_sinus(v), -10 * in_uit_sinus(v)
        else:
            dekking, dy = 1.0, 0.0
        for laag in sc["lagen"]:
            plak(beeld, laag, dy=dy, dekking=dekking)
        return beeld


# Sjabloon 2: eigen foto met rustige beweging en tekst --------------------------

class FotoMetTekst:
    ZOOM = 0.08  # acht procent over de hele Reel

    def __init__(self, invoer: dict, map_invoer: Path):
        self.stijl = s = lees_stijl(invoer)
        zinnen = teksten(invoer, "zinnen", 1, 3)
        pad = Path(str(invoer.get("foto", "")))
        if not pad.is_absolute():
            pad = map_invoer / pad
        if not pad.is_file():
            raise InvoerFout(f"De foto {invoer.get('foto')} is niet gevonden.")
        try:
            with Image.open(pad) as bron:
                foto = ImageOps.exif_transpose(bron).convert("RGB")
        except Exception as e:
            raise InvoerFout(f"Deze foto kan ik niet openen ({type(e).__name__}). Stuur een JPEG of PNG.") from e

        # Bijsnijden naar 9:16 met wat ruimte voor het inzoomen, zonder onnodig grote bewerkingen.
        ruimte = 1.0 + self.ZOOM + 0.02
        doel_b, doel_h = round(BREEDTE * ruimte), round(HOOGTE * ruimte)
        focus_y = klem(float(invoer.get("focus_y", 0.42)))
        self.foto = ImageOps.fit(foto, (doel_b, doel_h), Image.Resampling.LANCZOS, centering=(0.5, focus_y))

        vlak = hex_naar_rgb(invoer["paneel"]) if invoer.get("paneel") else s.vlak
        kleur = leesbaar(s.tekst, vlak)
        marge = 44
        binnen_b = VEILIG_BREEDTE - 2 * marge
        afzender_h = 66 if s.afzender else 0
        zetten = [zet_tekst(z, s.vet, binnen_b, 460, 74, 44) for z in zinnen]
        tekst_h = max(z.hoogte for z in zetten)
        paneel_h = int(tekst_h + 2 * marge + afzender_h)
        paneel_y = VEILIG_O - paneel_h
        self.paneel = vorm_laag(VEILIG_L, paneel_y, VEILIG_BREEDTE, paneel_h, 34, vlak)

        self.teksten: list[Laag] = []
        for zet in zetten:
            # Bij meerdere zinnen krijgen ze dezelfde bovenkant, dus de tekst springt niet.
            self.teksten.append(tekst_laag(zet, VEILIG_L + marge, paneel_y + marge, kleur))
        lagen = [self.paneel] + list(self.teksten)
        self.afzender = None
        if s.afzender:
            self.afzender = _afzender_laag(s, kleur, paneel_y + paneel_h - marge - 30)
            self.afzender.x = VEILIG_L + marge
            lagen.append(self.afzender)

        overgang = T_UIT + T_IN
        vast = (len(zinnen) - 1) * overgang + T_EIND
        lezen = verdeel_tijd([leestijd(z) for z in zinnen], vast, invoer.get("duur"))
        self.scenes = []
        t = 0.0
        for i in range(len(zinnen)):
            sc = {"in": t if i else None}
            t += (T_IN if i else 0) + lezen[i]
            if i < len(zinnen) - 1:
                sc["uit"] = t
                t += T_UIT
            self.scenes.append(sc)
        t += T_EIND
        self.seconden = t
        self.aantal = round(t * FPS)
        self.vakken = controleer_veilig(lagen, "De tekst", s.opmerkingen)
        midden = self.scenes[len(self.scenes) // 2]
        self.midden = round(((midden["in"] or 0.0) + T_IN + 0.3) * FPS)

    def _beeld(self, t: float) -> np.ndarray:
        v = in_uit_sinus(t / self.seconden)
        zoom = 1.0 + self.ZOOM * v
        b, h = self.foto.size
        # Affine: stap per doelpixel in de bronfoto, gecentreerd.
        stap = 1.0 / zoom * (b / (BREEDTE * (1.0 + self.ZOOM + 0.02)))
        x0 = (b - BREEDTE * stap) / 2
        y0 = (h - HOOGTE * stap) / 2
        uit = self.foto.transform((BREEDTE, HOOGTE), Image.Transform.AFFINE, (stap, 0, x0, 0, stap, y0), Image.Resampling.BILINEAR)
        return np.asarray(uit).copy()

    def frame(self, i: int) -> np.ndarray:
        t = i / FPS
        beeld = self._beeld(t)
        plak(beeld, self.paneel)
        if self.afzender is not None:
            plak(beeld, self.afzender, dekking=0.8)
        k = 0
        for j in range(len(self.scenes) - 1, -1, -1):
            start = self.scenes[j]["in"]
            if start is not None and t >= start:
                k = j
                break
        sc = self.scenes[k]
        if sc["in"] is not None and t < sc["in"] + T_IN:
            v = uit_cubic((t - sc["in"]) / T_IN)
            dekking, dy = v, 18 * (1 - v)
        elif sc.get("uit") is not None and t >= sc["uit"]:
            v = (t - sc["uit"]) / T_UIT
            dekking, dy = 1 - in_uit_sinus(v), 0.0
        else:
            dekking, dy = 1.0, 0.0
        plak(beeld, self.teksten[k], dy=dy, dekking=dekking)
        return beeld


# Sjabloon 3: een lijstje of tips, punt voor punt -------------------------------

class Lijstje:
    def __init__(self, invoer: dict):
        self.stijl = s = lees_stijl(invoer)
        punten = teksten(invoer, "punten", 2, 6)
        titel = invoer.get("titel")
        if not isinstance(titel, str) or not titel.strip():
            raise InvoerFout('Een lijstje heeft een "titel" nodig: die staat meteen in beeld en is de cover.')
        vlak = hex_naar_rgb(invoer["vlak"]) if invoer.get("vlak") else s.achtergrond
        kleur = leesbaar(s.tekst, vlak)
        accent = leesbaar(s.accent, vlak, 3.0)
        cijferkleur = leesbaar(vlak, accent)
        self.basis = effen(vlak)
        alle_lagen: list[Laag] = []

        titel_zet = zet_tekst(titel, s.vet, VEILIG_BREEDTE, 360, 96, 56)
        self.titel = tekst_laag(titel_zet, VEILIG_L, VEILIG_B + 10, kleur)
        y = int(VEILIG_B + 10 + titel_zet.hoogte + 56)
        beschikbaar = VEILIG_O - y - (70 if s.afzender else 0)
        tussen = 34
        rondje = 76
        tekst_x = VEILIG_L + rondje + 28
        tekst_b = VEILIG_R - tekst_x
        per_punt = (beschikbaar - tussen * (len(punten) - 1)) / len(punten)
        if per_punt < 70:
            raise InvoerFout("Te veel punten voor een leesbaar lijstje. Hou het op vijf punten of minder.")

        # Eén lettergrootte voor alle punten: pak de kleinste die alles laat passen.
        grootte = 68
        while True:
            zetten = [zet_tekst(p, s.normaal, tekst_b, int(per_punt), grootte, grootte) if self._past(p, s.normaal, tekst_b, per_punt, grootte) else None for p in punten]
            if all(z is not None for z in zetten):
                break
            grootte -= 2
            if grootte < 40:
                raise InvoerFout("De punten zijn te lang voor een leesbaar lijstje. Maak ze korter.")

        self.punten = []
        genummerd = invoer.get("genummerd", True)
        for n, zet in enumerate(zetten, 1):
            assert zet is not None
            hoogte = max(rondje, int(zet.hoogte))
            top = y
            rondje_top = top + 4
            lagen = [vorm_laag(VEILIG_L, rondje_top, rondje, rondje, 38, accent)]
            if genummerd:
                nz = zet_tekst(str(n), s.vet, rondje - 16, rondje - 16, 44, 28)
                cijfer = tekst_laag(nz, VEILIG_L, rondje_top, cijferkleur)
                # Cijfer netjes in het midden van het rondje.
                cijfer.x = VEILIG_L + (rondje - cijfer.alpha.shape[1]) // 2
                cijfer.y = rondje_top + (rondje - cijfer.alpha.shape[0]) // 2
                lagen.append(cijfer)
            lagen.append(tekst_laag(zet, tekst_x, top, kleur))
            self.punten.append(lagen)
            alle_lagen += lagen
            y += hoogte + tussen
        alle_lagen.append(self.titel)

        if s.afzender:
            af = _afzender_laag(s, kleur, VEILIG_O - 58)
            plak(self.basis, af, dekking=0.8)
            alle_lagen.append(af)

        titel_hold = max(1.0, leestijd(titel) * 0.8)
        vast = titel_hold + T_IN * len(punten) + T_EIND
        lezen = verdeel_tijd([max(0.9, leestijd(p) * 0.85) for p in punten], vast, invoer.get("duur"))
        t = titel_hold
        self.starts = []
        for d in lezen:
            self.starts.append(t)
            t += T_IN + d
        t += T_EIND
        self.seconden = t
        self.aantal = round(t * FPS)
        self.vakken = controleer_veilig(alle_lagen, "De tekst", s.opmerkingen)

    @staticmethod
    def _past(tekst: str, pad: str, breedte: int, hoogte: float, grootte: int) -> bool:
        try:
            zet_tekst(tekst, pad, breedte, int(hoogte), grootte, grootte)
        except InvoerFout:
            return False
        return True

    def frame(self, i: int) -> np.ndarray:
        t = i / FPS
        beeld = self.basis.copy()
        plak(beeld, self.titel)
        for start, lagen in zip(self.starts, self.punten):
            if t < start:
                break
            v = uit_cubic((t - start) / T_IN)
            for laag in lagen:
                plak(beeld, laag, dy=28 * (1 - v), dekking=v)
        return beeld


def maak_sjabloon(invoer: dict, map_invoer: Path):
    soort = invoer.get("sjabloon")
    if soort == "tekst":
        return TekstOpVlakken(invoer)
    if soort == "foto":
        return FotoMetTekst(invoer, map_invoer)
    if soort == "lijst":
        return Lijstje(invoer)
    raise InvoerFout('Kies een sjabloon: "tekst", "foto" of "lijst".')

