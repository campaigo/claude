# Herkomst

Deze skill is gebaseerd op **claude-reel-editor** van Nicola Pocock (@getgitgirl), https://github.com/nicolapocock/claude-reel-editor, uitgebracht onder de MIT-licentie (hieronder).

Overgenomen of omgezet naar Node en het Nederlands:
- de keten om een stem op te schonen (ruisonderdrukking, poort, EQ, de-esser, compressie, luidheid in twee stappen naar -14 LUFS) in `scripts/voorbereiden.mjs`;
- het knippen in stukken met korte fades op elke knip (`scripts/monteren.mjs`) en de tempostanden met pauzes en ademruimte (`scripts/knippen.mjs`);
- het idee van een controlepagina met tabbladen voor knippen, beelden, ondertitels, geluid en kleur, met een ruwe montage die meteen meespeelt (`pagina/`).

Nieuw in deze versie: alles draait lokaal (ook de controlepagina) op de Reel-studio van Campaigo, Nederlandse spraak met tijden per woord, een tweede ronde uitschrijven voor stukken die het spraakmodel oversloeg, knippen op de stilste plek, nakijken van de montage op afgekapte woorden, en plaatsen via Campaigo.

Niet meegeleverd maar bij het inrichten opgehaald:
- transformers.js (`@huggingface/transformers`, Apache-licentie 2.0) en ONNX Runtime (MIT-licentie), via npm;
- het spraakmodel Whisper large-v3-turbo van OpenAI (MIT-licentie), in de ONNX-versie van onnx-community, via huggingface.co.

---

MIT License

Copyright (c) 2026 Nicola Pocock (getgitgirl)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
