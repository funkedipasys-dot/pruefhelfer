/**
 * Hintergrunddienst der offenen Fassung — **nur für den Leerlauf.**
 *
 * Bis 0.20.0 kam Lite ohne aus: der Service Worker der Pro-Fassung hält den
 * Geräte-Token vom Content-Script fern, und ohne Token entfiel der Grund. Die
 * FSD-Automatik im Leerlauf braucht aber `chrome.idle`, und das steht einem
 * Content-Script nicht offen (Christian am 2026-09-12: „für Pro und Lite").
 *
 * **Kein Netz, keine Nachrichten.** Das Versprechen „ohne Server" gilt auch
 * hier; `src/light/build.spec.ts` prüft das gebaute Bündel gegen dieselbe
 * Liste von Ausgängen wie Content-Script und Popup. Der Weg zur Seite ist
 * `chrome.storage.local`: hier wird geschrieben, dort mit `onChanged` gelesen
 * — Lite sperrt den Speicher nicht auf `TRUSTED_CONTEXTS`, es liegt nichts
 * darin, was die Seite nicht sehen dürfte.
 *
 * Schwelle drei Minuten, fest, systemweit; `locked` zählt wie `idle` — wie in
 * der Pro-Fassung (`src/sw.ts`).
 */

// Die Schlüssel stehen wörtlich auch in `content.ts` und `popup.ts`: ein
// Import von hier zöge die Aufrufe oben ins Bündel der Seite.
const FSD_LEERLAUF_KEY = 'fsd.leerlauf';
const FSD_LEERLAUF_S = 180;

const merkeLeerlauf = (zustand: string): void => {
  void chrome.storage.local.set({ [FSD_LEERLAUF_KEY]: zustand !== 'active' }).catch(() => {
    // Speicher voll oder Kontext verwaist — dann bleibt der alte Wert stehen.
  });
};

chrome.idle.setDetectionInterval(FSD_LEERLAUF_S);
chrome.idle.onStateChanged.addListener(merkeLeerlauf);

// ponytail: bei jedem Start des Workers den Stand frisch holen, statt der Seite
// eine Frage-Antwort zu bauen. Ein veralteter Wert aus der letzten Sitzung
// überlebt so höchstens bis zum ersten Ereignis — und die Seite selbst stellt
// bei echter Bedienung ohnehin sofort still.
void chrome.idle.queryState(FSD_LEERLAUF_S).then(merkeLeerlauf);
