# De motor van campaigo-beweging: tekst tekenen, bewegen en wegschrijven naar MP4.
# Alleen Pillow en numpy, plus een ffmpeg die libx264 kan. Geen Chrome.

from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

BREEDTE, HOOGTE = 1080, 1920
FPS = 30

# Veilige zone van Reels: binnen dit vak valt de tekst niet onder de knoppen en het bijschrift.
VEILIG_L, VEILIG_B, VEILIG_R, VEILIG_O = 60, 240, 940, 1480

FONTS_MAP = Path(__file__).resolve().parent.parent / "fonts"
LETTERTYPEN = {
    "outfit": ("Outfit-Bold.ttf", "Outfit-Medium.ttf"),
    "dm sans": ("DMSans-Bold.ttf", "DMSans-Medium.ttf"),
    "dmsans": ("DMSans-Bold.ttf", "DMSans-Medium.ttf"),
}


class InvoerFout(Exception):
    """De invoer klopt niet of past niet. De tekst is geschikt om aan de klant te vertellen."""


class VideoFout(Exception):
    """Er is geen manier om een MP4 te maken, of het maken ging mis."""


# Bewegingen ----------------------------------------------------------------

def klem(x: float, a: float = 0.0, b: float = 1.0) -> float:
    return max(a, min(b, x))


def uit_cubic(t: float) -> float:
    return 1 - (1 - klem(t)) ** 3


def in_uit_cubic(t: float) -> float:
    t = klem(t)
    return 4 * t**3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def in_uit_sinus(t: float) -> float:
    return 0.5 - 0.5 * math.cos(math.pi * klem(t))


# Kleuren -------------------------------------------------------------------

def hex_naar_rgb(waarde: str) -> tuple[int, int, int]:
    h = str(waarde).strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if not re.fullmatch(r"[0-9a-fA-F]{6}", h):
        raise InvoerFout(f'De kleur "{waarde}" begrijp ik niet. Gebruik een kleurcode zoals #1F3A3D.')
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _lum(rgb: tuple[int, int, int]) -> float:
    def kanaal(c: int) -> float:
        s = c / 255
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4

    r, g, b = rgb
    return 0.2126 * kanaal(r) + 0.7152 * kanaal(g) + 0.0722 * kanaal(b)


def contrast(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    la, lb = _lum(a), _lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def leesbaar(tekst: tuple[int, int, int], vlak: tuple[int, int, int], minimum: float = 4.5) -> tuple[int, int, int]:
    """Houdt de merkkleur als die leesbaar is, anders donker of licht, wat het beste contrast geeft."""
    if contrast(tekst, vlak) >= minimum:
        return tekst
    donker, licht = (20, 22, 26), (255, 255, 255)
    return donker if contrast(donker, vlak) >= contrast(licht, vlak) else licht


# Lettertype ----------------------------------------------------------------

def kies_lettertype(naam: str | None) -> tuple[str, str, str | None]:
    """Geeft (vet, normaal, opmerking). Een eigen TTF of OTF mag ook, met het pad als naam."""
    if naam:
        pad = Path(str(naam))
        if pad.suffix.lower() in (".ttf", ".otf"):
            if not pad.is_file():
                raise InvoerFout(f"Het lettertypebestand {naam} is niet gevonden.")
            return str(pad), str(pad), None
        bekend = LETTERTYPEN.get(str(naam).strip().lower())
        if bekend:
            return str(FONTS_MAP / bekend[0]), str(FONTS_MAP / bekend[1]), None
        vet, normaal = LETTERTYPEN["outfit"]
        return (
            str(FONTS_MAP / vet),
            str(FONTS_MAP / normaal),
            f'Lettertype "{naam}" zit niet in deze skill; Outfit gebruikt. Stuur een TTF-bestand mee om het echte lettertype te gebruiken.',
        )
    vet, normaal = LETTERTYPEN["outfit"]
    return str(FONTS_MAP / vet), str(FONTS_MAP / normaal), None


_font_cache: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def font(pad: str, grootte: int) -> ImageFont.FreeTypeFont:
    sleutel = (pad, grootte)
    if sleutel not in _font_cache:
        _font_cache[sleutel] = ImageFont.truetype(pad, grootte, layout_engine=ImageFont.Layout.BASIC)
    return _font_cache[sleutel]


# Tekst zetten --------------------------------------------------------------

INTERLINIE = 1.16


_kern_cache: dict[str, tuple[dict[tuple[int, int], int], int]] = {}


def _kerning(pad: str) -> tuple[dict[tuple[int, int], int], int]:
    """Laadt de kerning die bij een meegeleverd lettertype hoort. Eigen lettertypen hebben die niet."""
    if pad not in _kern_cache:
        bestand = Path(pad).with_suffix(".kern.json")
        if bestand.is_file():
            data = json.loads(bestand.read_text(encoding="utf-8"))
            _kern_cache[pad] = ({(a, b): v for a, b, v in data["paren"]}, int(data["upem"]))
        else:
            _kern_cache[pad] = ({}, 1000)
    return _kern_cache[pad]


def _plaatsen(regel: str, pad: str, grootte: int) -> tuple[list[float], float]:
    """Geeft de x-positie van elk teken (met kerning) en de totale breedte."""
    f = font(pad, grootte)
    paren, upem = _kerning(pad)
    x, vorige, posities = 0.0, None, []
    for teken in regel:
        if vorige is not None:
            x += paren.get((ord(vorige), ord(teken)), 0) * grootte / upem
        posities.append(x)
        x += f.getlength(teken)
        vorige = teken
    return posities, x


def _breedte(regel: str, pad: str, grootte: int) -> float:
    return _plaatsen(regel, pad, grootte)[1]


def _afbreken(tekst: str, pad: str, grootte: int, max_b: float) -> list[str] | None:
    """Verdeelt woorden over regels met zo gelijk mogelijke lengtes. None als een woord niet past."""
    woorden = tekst.split()
    n = len(woorden)
    maten = [_breedte(w, pad, grootte) for w in woorden]
    if not woorden or max(maten) > max_b:
        return None
    spatie = font(pad, grootte).getlength(" ")
    beste = [math.inf] * (n + 1)
    beste[n] = 0.0
    knip = [n] * (n + 1)
    for i in range(n - 1, -1, -1):
        b = -spatie
        for j in range(i, n):
            b += maten[j] + spatie
            if b > max_b:
                break
            over = max_b - b
            kost = over * over if j < n - 1 else (over * 0.45) ** 2
            if j == n - 1 and j == i and n > 1:
                kost += (max_b * 0.55) ** 2  # liever geen los laatste woord
            kost += beste[j + 1]
            if kost < beste[i]:
                beste[i] = kost
                knip[i] = j + 1
    regels, i = [], 0
    while i < n:
        regels.append(" ".join(woorden[i : knip[i]]))
        i = knip[i]
    return regels


@dataclass
class Tekstzet:
    regels: list[str]
    grootte: int
    breedte: float
    hoogte: float
    pad: str

    @property
    def regelhoogte(self) -> int:
        return round(self.grootte * INTERLINIE)


def zet_tekst(tekst: str, pad: str, max_b: int, max_h: int, groot: int, klein: int) -> Tekstzet:
    """Zoekt de grootste letter waarbij de tekst binnen het vak past."""
    tekst = " ".join(str(tekst).split())
    if not tekst:
        raise InvoerFout("Er is een lege tekst meegegeven.")
    for s in range(groot, klein - 1, -2):
        f = font(pad, s)
        regels = _afbreken(tekst, pad, s, max_b)
        if regels is None:
            continue
        asc, desc = f.getmetrics()
        h = asc + desc + (len(regels) - 1) * round(s * INTERLINIE)
        if h <= max_h:
            return Tekstzet(regels, s, max(_breedte(r, pad, s) for r in regels), h, pad)
    begin = tekst if len(tekst) <= 60 else tekst[:57] + "..."
    raise InvoerFout(f'Deze tekst past niet leesbaar in beeld: "{begin}". Maak hem korter.')


@dataclass
class Laag:
    """Een getekend stuk (tekst of vorm) op een vaste plek, met eigen kleur."""

    x: int
    y: int
    alpha: np.ndarray  # float32, 0 tot 255
    kleur: tuple[int, int, int]

    @property
    def vak(self) -> tuple[int, int, int, int]:
        h, b = self.alpha.shape
        return self.x, self.y, self.x + b, self.y + h


def bijgesneden(alpha: np.ndarray, x: int, y: int) -> tuple[np.ndarray, int, int]:
    rijen = np.flatnonzero(alpha.any(axis=1))
    kol = np.flatnonzero(alpha.any(axis=0))
    if rijen.size == 0:
        raise VideoFout("Lege tekstlaag: het lettertype tekent deze tekst niet.")
    y0, y1, x0, x1 = rijen[0], rijen[-1] + 1, kol[0], kol[-1] + 1
    return alpha[y0:y1, x0:x1], x + int(x0), y + int(y0)


def tekst_laag(zet: Tekstzet, x: int, y: int, kleur: tuple[int, int, int], uitlijning: str = "links") -> Laag:
    f = font(zet.pad, zet.grootte)
    asc, desc = f.getmetrics()
    rh = zet.regelhoogte
    b = int(math.ceil(zet.breedte)) + 4
    h = asc + desc + (len(zet.regels) - 1) * rh + 4
    masker = Image.new("L", (b, h), 0)
    d = ImageDraw.Draw(masker)
    for i, regel in enumerate(zet.regels):
        posities, totaal = _plaatsen(regel, zet.pad, zet.grootte)
        lx = 0.0 if uitlijning == "links" else (zet.breedte - totaal) / 2
        for teken, px in zip(regel, posities):
            if not teken.isspace():
                d.text((lx + px, asc + i * rh), teken, font=f, fill=255, anchor="ls")
    a, lx, ty = bijgesneden(np.asarray(masker, dtype=np.float32), x, y)
    return Laag(lx, ty, a, kleur)


def vorm_laag(x: int, y: int, b: int, h: int, straal: int, kleur: tuple[int, int, int]) -> Laag:
    """Een afgerond vlak, zacht aan de randen door het groter te tekenen en te verkleinen."""
    schaal = 3
    groot = Image.new("L", (b * schaal, h * schaal), 0)
    ImageDraw.Draw(groot).rounded_rectangle((0, 0, b * schaal - 1, h * schaal - 1), radius=straal * schaal, fill=255)
    klein = groot.resize((b, h), Image.Resampling.LANCZOS)
    return Laag(x, y, np.asarray(klein, dtype=np.float32), kleur)


def plak(frame: np.ndarray, laag: Laag, dy: float = 0.0, dekking: float = 1.0) -> None:
    """Zet een laag op het beeld. Een halve pixel schuiven kan ook, dus langzame beweging hapert niet."""
    if dekking <= 0.002:
        return
    heel = math.floor(dy)
    deel = dy - heel
    a = laag.alpha
    if deel > 0.004:
        gemengd = np.zeros((a.shape[0] + 1, a.shape[1]), dtype=np.float32)
        gemengd[:-1] += a * (1 - deel)
        gemengd[1:] += a * deel
        a = gemengd
    y0, x0 = laag.y + heel, laag.x
    y1, x1 = y0 + a.shape[0], x0 + a.shape[1]
    ky0, kx0, ky1, kx1 = max(y0, 0), max(x0, 0), min(y1, HOOGTE), min(x1, BREEDTE)
    if ky0 >= ky1 or kx0 >= kx1:
        return
    stuk = a[ky0 - y0 : ky1 - y0, kx0 - x0 : kx1 - x0]
    if dekking < 0.998:
        stuk = stuk * dekking
    gebied = frame[ky0:ky1, kx0:kx1].astype(np.float32)
    kleur = np.array(laag.kleur, dtype=np.float32)
    uit = gebied + (kleur - gebied) * (stuk[..., None] / 255.0)
    frame[ky0:ky1, kx0:kx1] = (uit + 0.5).astype(np.uint8)


def effen(kleur: tuple[int, int, int]) -> np.ndarray:
    return np.full((HOOGTE, BREEDTE, 3), kleur, dtype=np.uint8)


def controleer_veilig(lagen: list[Laag], wat: str, opmerkingen: list[str]) -> list[list[int]]:
    """Bewaakt dat alle tekst echt binnen de veilige zone valt."""
    vakken: list[list[int]] = []
    for laag in lagen:
        l, b, r, o = laag.vak
        vakken.append([l, b, r, o])
        if l < VEILIG_L or r > VEILIG_R or b < VEILIG_B or o > VEILIG_O:
            raise VideoFout(f"{wat} valt buiten de veilige zone ({l}, {b}, {r}, {o}).")
    return vakken


# ffmpeg vinden -------------------------------------------------------------

def _kan_h264(exe: str) -> bool:
    try:
        uit = subprocess.run([exe, "-hide_banner", "-encoders"], capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return uit.returncode == 0 and "libx264" in uit.stdout


def _uit_imageio() -> str | None:
    try:
        import imageio_ffmpeg  # type: ignore
    except ImportError:
        return None
    try:
        exe = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # pakket zonder binary voor dit platform
        return None
    try:
        os.chmod(exe, 0o755)
    except OSError:
        pass
    return exe if _kan_h264(exe) else None


def pakket_installeren(pakket: str) -> bool:
    """Installeert via pip in een eigen map, zodat er niets in het systeem verandert."""
    map_ = Path(tempfile.gettempdir()) / "campaigo-pakketten"
    map_.mkdir(parents=True, exist_ok=True)
    if str(map_) not in sys.path:
        sys.path.insert(0, str(map_))
    try:
        uit = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "--timeout", "20", "--retries", "1", "--target", str(map_), pakket],
            capture_output=True,
            text=True,
            timeout=240,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return uit.returncode == 0


def vind_ffmpeg() -> tuple[str, str]:
    """Geeft (pad, route). Volgorde: ffmpeg op het systeem, imageio-ffmpeg, imageio-ffmpeg via pip."""
    exe = shutil.which("ffmpeg")
    if exe and _kan_h264(exe):
        return exe, "systeem"
    gevonden = _uit_imageio()
    if gevonden:
        return gevonden, "imageio-ffmpeg"
    if pakket_installeren("imageio-ffmpeg"):
        import importlib

        importlib.invalidate_caches()
        gevonden = _uit_imageio()
        if gevonden:
            return gevonden, "imageio-ffmpeg (via pip)"
    raise VideoFout(
        "Hier kan ik geen MP4 maken: er is geen videoprogramma (ffmpeg) en installeren lukt niet, "
        "waarschijnlijk omdat netwerktoegang voor pakketten uit staat."
    )


# Video schrijven -----------------------------------------------------------

class Encoder:
    """Stuurt beelden naar ffmpeg. Stil geluidsspoor erbij, zodat het bestand bij elke speler en bij Meta klopt."""

    def __init__(self, exe: str, pad: str, seconden: float):
        self.foutlog = tempfile.TemporaryFile()
        # 25 Mbps is de grens van Meta; dit blijft eronder en houdt 30 seconden onder de 30 MB van claude.ai.
        maxrate = min(12.0, 27 * 8 / max(seconden, 1.0) * 0.9)
        cmd = [
            exe, "-y", "-hide_banner", "-loglevel", "error", "-nostdin",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-video_size", f"{BREEDTE}x{HOOGTE}", "-framerate", str(FPS), "-i", "pipe:0",
            "-f", "lavfi", "-t", f"{seconden + 0.2:.3f}", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-map", "0:v", "-map", "1:a",
            "-vf", "scale=out_color_matrix=bt709:out_range=limited,format=yuv420p",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-profile:v", "high",
            "-bf", "0", "-g", str(FPS * 2), "-flags", "+cgop",
            "-maxrate", f"{maxrate:.1f}M", "-bufsize", f"{maxrate * 2:.1f}M",
            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
            "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2", "-t", f"{seconden:.3f}",
            "-movflags", "+faststart", "-use_editlist", "0", "-avoid_negative_ts", "disabled",
            "-f", "mp4", pad,
        ]
        self.proces = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=self.foutlog)

    def schrijf(self, frame: np.ndarray) -> None:
        assert self.proces.stdin is not None
        try:
            self.proces.stdin.write(frame.tobytes())
        except (BrokenPipeError, OSError) as e:
            raise VideoFout(self._melding(f"ffmpeg stopte tijdens het maken van de video ({e}).")) from e

    def _melding(self, begin: str) -> str:
        self.foutlog.seek(0)
        detail = self.foutlog.read().decode("utf-8", "replace").strip()
        return f"{begin} {detail[-400:]}".strip()

    def sluit(self) -> None:
        assert self.proces.stdin is not None
        try:
            self.proces.stdin.close()
        except OSError:
            pass
        if self.proces.wait() != 0:
            raise VideoFout(self._melding("ffmpeg gaf een fout."))
        self.foutlog.close()


def _kijk_in_boxen(data: bytes, start: int, eind: int, gevonden: list[str]) -> None:
    containers = {b"moov", b"trak", b"mdia", b"minf", b"stbl"}
    i = start
    while i + 8 <= eind:
        grootte = int.from_bytes(data[i : i + 4], "big")
        soort = data[i + 4 : i + 8]
        kop = 8
        if grootte == 1:
            grootte = int.from_bytes(data[i + 8 : i + 16], "big")
            kop = 16
        elif grootte == 0:
            grootte = eind - i
        if grootte < kop or i + grootte > eind:
            return
        gevonden.append(soort.decode("latin-1"))
        if soort in containers:
            _kijk_in_boxen(data, i + kop, i + grootte, gevonden)
        i += grootte


def _bovenste_boxen(pad: str) -> list[tuple[str, int, int]]:
    uit: list[tuple[str, int, int]] = []
    grootte_bestand = os.path.getsize(pad)
    with open(pad, "rb") as f:
        i = 0
        while i + 8 <= grootte_bestand:
            f.seek(i)
            kop = f.read(16)
            g = int.from_bytes(kop[:4], "big")
            soort = kop[4:8].decode("latin-1")
            if g == 1:
                g = int.from_bytes(kop[8:16], "big")
            elif g == 0:
                g = grootte_bestand - i
            if g < 8:
                break
            uit.append((soort, i, g))
            i += g
    return uit


def controleer_bestand(pad: str, exe: str, seconden: float) -> tuple[dict, list[str]]:
    """Controleert het eindbestand tegen de eisen van Meta, zonder ffprobe (die zit niet in imageio-ffmpeg)."""
    fouten: list[str] = []
    boxen = _bovenste_boxen(pad)
    namen = [b[0] for b in boxen]
    moov_voor = "moov" in namen and "mdat" in namen and namen.index("moov") < namen.index("mdat")
    if not moov_voor:
        fouten.append("moov staat niet vooraan in het bestand")
    binnen: list[str] = []
    for naam, start, grootte in boxen:
        if naam == "moov":
            with open(pad, "rb") as f:
                f.seek(start)
                data = f.read(grootte)
            _kijk_in_boxen(data, 8, grootte, binnen)
    if "edts" in binnen:
        fouten.append("bestand bevat een edit list (Meta wil die niet)")

    uit = subprocess.run([exe, "-hide_banner", "-i", pad], capture_output=True, text=True, errors="replace")
    info = uit.stderr
    video = re.search(r"Video: (\w+).*?, (yuv\w+)\(?([^,)]*)\)?.*?(\d{3,5})x(\d{3,5})", info)
    fps = re.search(r"([\d.]+) fps", info)
    audio = re.search(r"Audio: (\w+).*?(\d+) Hz, (\w+)", info)
    duur = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info)
    if not video:
        fouten.append("geen videospoor gevonden")
    else:
        if video.group(1) != "h264":
            fouten.append(f"codec is {video.group(1)}, niet h264")
        if video.group(2) != "yuv420p":
            fouten.append(f"beeldopslag is {video.group(2)}, niet yuv420p")
        if (int(video.group(4)), int(video.group(5))) != (BREEDTE, HOOGTE):
            fouten.append(f"formaat is {video.group(4)}x{video.group(5)}")
    if not fps or abs(float(fps.group(1)) - FPS) > 0.01:
        fouten.append("beeldsnelheid is niet 30 fps")
    if not audio or audio.group(1) != "aac":
        fouten.append("geen AAC-geluidsspoor")
    elif int(audio.group(2)) > 48000:
        fouten.append("geluid boven 48 kHz")
    werkelijk = None
    if duur:
        werkelijk = int(duur.group(1)) * 3600 + int(duur.group(2)) * 60 + float(duur.group(3))
        if abs(werkelijk - seconden) > 0.15:
            fouten.append(f"duur is {werkelijk:.2f} s, verwacht {seconden:.2f} s")
        if werkelijk < 3:
            fouten.append("korter dan 3 seconden (minimum van Instagram)")
    mb = os.path.getsize(pad) / 1_000_000
    if mb > 30:
        fouten.append(f"bestand is {mb:.1f} MB, downloaden in claude.ai kan tot 30 MB")
    samenvatting = {
        "codec": video.group(1) if video else None,
        "pixelformaat": video.group(2) if video else None,
        "formaat": f"{video.group(4)}x{video.group(5)}" if video else None,
        "fps": float(fps.group(1)) if fps else None,
        "geluid": f"{audio.group(1)} {audio.group(2)} Hz {audio.group(3)}" if audio else None,
        "seconden": werkelijk,
        "moov_vooraan": moov_voor,
        "edit_list": "edts" in binnen,
    }
    return samenvatting, fouten
