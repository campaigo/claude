"""Taal van de meldingen van de scripts. Staat er naast de map scripts een taal.json met "taal": "en",
dan zijn de meldingen Engels. Zonder dat bestand (of bij een leesfout) blijven ze Nederlands.

    from taal import tt
    tt("Nederlandse tekst", "English text")
"""

import json
from pathlib import Path


def _taal_is_en() -> bool:
    try:
        data = json.loads((Path(__file__).resolve().parent.parent / "taal.json").read_text(encoding="utf-8"))
        return data.get("taal") == "en"
    except (OSError, ValueError, AttributeError):
        return False


EN = _taal_is_en()


def tt(nl: str, en: str) -> str:
    return en if EN else nl
