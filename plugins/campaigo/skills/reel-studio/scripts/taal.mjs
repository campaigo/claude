/**
 * Taal van de meldingen van de Reel-studio. Staat er naast de map scripts een taal.json met { "taal": "en" },
 * dan zijn de meldingen Engels. Zonder dat bestand (of bij een leesfout) blijven ze Nederlands.
 *   import { tt } from "./taal.mjs";   tt("Nederlandse tekst", "English text")
 */
import fs from "fs";
import { fileURLToPath } from "url";

function leesTaal() {
  try {
    return JSON.parse(fs.readFileSync(fileURLToPath(new URL("../taal.json", import.meta.url)), "utf8")).taal === "en";
  } catch {
    return false;
  }
}

export const EN = leesTaal();

export function tt(nl, en) {
  return EN ? en : nl;
}
