# Regieboek

Wat een goede motion designer weet en de ondernemer niet hoeft te weten. Lees dit voor elke Reel.

## Elke zaak een eigen bewegingsstijl

Campaigo heeft veel klanten. Als ze allemaal dezelfde soort Reel krijgen, wordt het een eenheidsworst: herkenbaar als sjabloon en niet als de zaak. Daarom krijgt elke zaak bij de eerste Reel een eigen bewegingsstijl, en is elke Reel daarna op maat.

Een bewegingsstijl bestaat uit zes keuzes:

| Keuze | Wat het is | Fietsenmaker ("Doorrollen") | Bakkerij ("Rijzen") |
|---|---|---|---|
| **Held** | Eén terugkerend beeld dat bij de zaak hoort en meespeelt | Een fietswiel dat echt rolt | Een deegbol die rijst en tijdens de Reel bakt |
| **Overgang** | Hoe het ene beeld in het volgende overgaat | Het wiel trekt de nieuwe kleur over het beeld | De nieuwe kleur rijst op met een bolle bovenkant |
| **Typografie** | Lettertype, hoofdletters of niet, uitlijning, hoe woorden binnenkomen, hoe nadruk eruitziet | Smalle vette hoofdletters, links, schuiven van rechts binnen, nadruk als gele wegmarkering | Zachte schreefletter, gecentreerd, rijst rustig op, nadruk met een getekende krul |
| **Tempo en klap** | BPM, hoeveel er beweegt, hoe de klap valt | 126, vlot; klap is een harde knip en het wiel remt | 96, rustig; klap is een lange stilte en een groot vlak |
| **Kleurgebruik** | Welke merkkleuren als vlak, welke als accent, in welke volgorde | Donkergroen, wit, geel; klap rood | Bruin, creme, groen; klap mosterd |
| **Geluid** | Klank, toonsoort, akkoordvariant en een eigen geluidje | "fris", ratel van de freewheel, fietsbel | "warm", elektrische piano, zachte druppel |

### Zo ontwerp je hem

1. **Vertrek bij de zaak, niet bij een effect.** Waar zie, hoor of voel je de zaak aan? Een voorwerp (schaar, kraan, sleutel, doos, kopje), een beweging (knippen, stromen, draaien, uitpakken, schenken), een materiaal (hout, deeg, water, stof), een geluid (bel, klik, sissen). Daar komen held, overgang en geluidje uit.
2. **De persoonlijkheid uit Mijn merk bepaalt het tempo en de typografie.** Nuchter en stevig: strak, recht, vlot. Warm en ambachtelijk: zacht, rond, rustig. Speels: veren, kleur, overschieten. Luxe: veel ruimte, dun, langzaam.
3. **Drie richtingen die echt verschillen.** Niet drie kleurvarianten van hetzelfde idee, maar drie verschillende helden of overgangen. Schrijf eerst tien ideeën op (voorwerpen, gebaren, materialen, geluiden, de plek, een vast ritueel van de zaak). Schrap de ideeën die iedereen in die branche als eerste zou bedenken, tenzij je er iets onverwachts mee doet. Kies er drie die kloppen en minstens één die verrast. Gebruik wat je over deze zaak weet uit Mijn merk: hun eigen woorden, hun werkwijze, hun plaats.
4. **Proefjes maken.** Bouw van elke richting een paar seconden met de haak van de eerste Reel. Kijk ze zelf na, en kies de beste drie beelden om te laten zien.
5. **De ondernemer kiest.** Eén zin per richting, in gewone woorden, plus het beeld. Liever een duidelijke keuze dan een mengsel.
6. **Vastleggen.** `beweging.js` (de code, met de onderdelen en een opbouw voor een hele Reel) en `beweging.md` (wat de stijl is, in gewone woorden, plus de muziek van elke Reel).

- **Lettertype kiezen:** past bij de persoonlijkheid, heeft een open licentie, en heeft gewone cijfers. Zet in elk proefje een datum of prijs ("1 december", "€49"), want sommige lettertypen tekenen een 1 als "ı" of laten cijfers dansen.

### Wat je vermijdt

- De voorbeelden overnemen. De bakkerij en de fietsenmaker in deze skill laten zien hoe het moet, maar een andere bakker krijgt geen rijzende bol en een andere fietsenmaker geen rollend wiel. Kies iets eigens.
- De stip die van zin naar zin springt, de camera door een wereld van kaarten en de zwiep tussen foto's (`voorbeelden/stijlen/`) zijn studies. Leer ervan hoe timing en beweging werken; gebruik ze nooit zoals ze zijn.
- Effecten om het effect: elke beweging moet bij de zaak horen of het lezen helpen.
- Geen trillende camera, glitches, neon, robots of AI-beelden.

### Elke volgende Reel

- Dezelfde stijl, zodat de zaak herkenbaar is. Maar op maat: het verhaal, de opbouw en de details passen bij het onderwerp. De held mag iets nieuws doen dat bij het onderwerp past (de bol krijgt bij een kerstbericht poedersuiker, het wiel een lampje bij "vroeg donker").
- Wissel `toon` en `variant` van de muziek, en noteer ze in beweging.md.
- Na vijf of zes Reels mag de stijl groeien: een tweede overgang, een nieuwe vorm van de held. Laat het de ondernemer weten.

## Verhaalvormen

Elke vorm maak je in de eigen bewegingsstijl van de zaak.

| Vorm | Wanneer | Opbouw | Lengte |
|---|---|---|---|
| **Eén boodschap** | Een aanbod, aankondiging, mening, misverstand rechtzetten | Haak, 2 tot 4 korte zinnen, één klap, oproep | 12 tot 22 s |
| **Uitleg in stappen** | Tips, een werkwijze, "zo werkt het" | Haak, 2 tot 5 stappen (eventueel met foto), oproep | 15 tot 30 s |
| **Eigen beeld** | De zaak heeft goede foto's of video's | Haak op het sterkste beeld, 3 tot 6 beelden met korte tekst, oproep | 12 tot 25 s |

## De haak

Het eerste beeld en de eerste anderhalve seconde beslissen of iemand blijft kijken. **De volledige haak staat er vanaf het allereerste beeld**: daar begint de Reel als hij in de feed vanzelf afspeelt. De render meldt in `eersteBeeld` welke tekst daar leesbaar is.

- Hooguit acht woorden. Concreet en specifiek.
- Werkt goed: een getal ("Ons brood rijst 24 uur."), een tegenstelling ("Duurder. En toch goedkoper."), een misverstand dat de doelgroep heeft ("Een offerte aanvragen kost niets."), een vraag die de kijker zichzelf stelt ("Waarom lekt je kraan altijd 's nachts?"), het resultaat eerst ("Zo ziet je badkamer er over drie dagen uit.").
- Niet: "Welkom", "Hoi allemaal", de naam van de zaak als eerste woorden, vage beloftes.
- Geen klikaas dat de Reel niet waarmaakt.

## De omslag

De omslag staat in het profielraster en bij Reels. Daar beslist iemand of hij erop tikt. Kies hem met `R.omslag(b)`; de render geeft hem als `export/omslag.jpg` en als `omslag_ms` voor Campaigo.
- Meestal de haak, als die helemaal staat. Soms is de klap sterker: kies het beeld dat zonder context nieuwsgierig maakt.
- In het profiel snijdt Instagram boven en onder een stuk weg. Zet de kern daarom midden in beeld, ongeveer tussen y 420 en 1500.
- Geen beeld midden in een overgang, en geen beeld met alleen de afzender.

## De tekst

- Eén gedachte per zin, liefst twee tot zes woorden.
- `*nadruk*` op het ene woord dat ertoe doet, hooguit één keer per zin en drie keer per Reel. Een nadruk mag niet over een lange woordgroep gaan: dan past hij niet op één regel.
- Eén klap per Reel: de kern in twee tot vier woorden, na de opbouw, zonder nadruk (de klap is zelf al de nadruk).
- De oproep: één concrete actie met wanneer of waar. "Kom *proeven*." met "Zaterdag vanaf 7:00 in de Hoofdstraat". Heeft de ondernemer een codewoord in Campaigo, dan werkt "Reageer *OFFERTE*" heel goed: wie dat woord onder de post zet, krijgt vanzelf een bericht.
- Taal: de stem en de je- of u-vorm uit Mijn merk. Geen gedachtestreepjes en geen AI-taal ("ontdek", "in een wereld waar", "laten we eerlijk zijn", "het is niet X, het is Y"). Geen verzonnen cijfers, klantverhalen of beloftes, en geen opsomming van wat een dienst inhoudt als de ondernemer dat niet zei.

## Rust en klap

Goede beweging zit in het contrast tussen rust en klap, niet in zoveel mogelijk bewegen.
- Weinig tegelijk in beeld. Eén held per moment.
- Een echte stilte vlak voor het belangrijkste moment (zet daar geen muzieksectie).
- Langer stilstaan op het woord dat moet blijven hangen.

## Tempo en lengte

- Elke beweging valt op de tel. Reken de leestijd uit de tekst: ongeveer 2,5 tel plus 0,5 tel per woord.
- Rustig merk (zorg, uitvaart, therapie, advies): 90 tot 100 BPM. Veel energie (sport, horeca, events, fietsen): 120 tot 128.
- Korter is veiliger. Reels die helemaal bekeken worden, doen het beter.

## Kleur

- Alleen de merkkleuren. Gebruik `R.kleur.leesbaar` voor de tekstkleur op elk vlak: grote tekst minstens 3:1, kleine tekst 4,5:1.
- Zijn alle merkkleuren licht of allemaal donker, voeg dan een bijna-zwart of wit toe. Geen nieuwe kleuren verzinnen.

## Geluid

Elke Reel krijgt eigen muziek en geluidjes, door code gemaakt en precies op de beweging. Daar zitten geen rechten van anderen op.
- `klank`: "warm", "fris" of "stevig". Hoort bij de bewegingsstijl.
- `toon` (0 tot 11) en `variant` (0 tot 3) per Reel wisselen.
- `geluid: "effecten"`: alleen de geluidjes. Kies dit als er muziek van Instagram onder komt (via `muziek_zoeken` en `muziek_id` bij het klaarzetten); zet dan `muziek_volume` op 100 en `video_volume` rond 40.
- `geluid: "stil"`: geen geluid.
- Veel mensen kijken zonder geluid. De Reel moet zonder geluid volledig te volgen zijn.

## Beeld van de ondernemer

- Alleen eigen beeld, of beeld dat de ondernemer mag gebruiken. Geen beelden van internet.
- Herkenbare mensen alleen als die toestemming gaven. Vraag ernaar als je twijfelt.
- Kies scherpe foto's met een duidelijk onderwerp. Liever vier goede foto's dan acht matige.
- Video: een stuk van 2 tot 5 seconden zonder schokken. Het geluid van de video gaat er nog niet onder.

## Controlelijst

Loop dit na op de beelden uit `--controle`, voordat de ondernemer iets ziet:

1. Staat de hele haak op het eerste beeld (`eersteBeeld`), en snap je hem zonder geluid? Werkt de omslag (`export/omslag.jpg`) ook klein, in het midden van het beeld?
2. Is alle tekst groot genoeg en goed leesbaar op zijn ondergrond?
3. Geen waarschuwingen meer: niets buiten de veilige zone, geen meldingen, geen beelden die afhangen van het vorige beeld.
4. Ziet het eruit als deze zaak, en niet als een voorbeeld of een andere klant?
5. Spelling en woordkeus kloppen, en het klinkt als Mijn merk.
6. Kloppen de feiten (adres, tijd, prijs)? Niets verzonnen.
7. Staat de nadruk op het goede woord, en hooguit drie keer?
8. Is de oproep concreet, en staat de afzender er goed?

## Feedback vertalen

| De ondernemer zegt | Jij doet |
|---|---|
| "Sneller", "meer vaart" | Minder woorden per zin, of een hoger tempo binnen de stijl. |
| "Rustiger" | Lager tempo, langere stiltes, minder geluidjes. |
| "Groter" | Minder woorden per zin: de tekst wordt dan vanzelf groter. |
| "Andere kleuren" | Andere volgorde van de merkkleuren in de stijl. |
| "Te lang" | Een zin of stap eruit. Niet alles sneller maken. |
| "Saai" | Een sterkere haak, een klap, of de held iets laten doen dat bij het onderwerp past. |
| "Lijkt op die van ..." | Dan is de stijl niet eigen genoeg: andere held of overgang. |
| "Ander muziekje" | Andere `toon` of `variant`, of muziek van Instagram met `geluid: "effecten"`. |
