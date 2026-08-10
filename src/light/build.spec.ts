/**
 * Das Versprechen der offenen Fassung, geprüft am gebauten Ergebnis
 * (Plan-Punkt 71–73).
 *
 * „Ohne Konto, ohne Server" ist keine Beteuerung, sondern eine Eigenschaft des
 * Bündels — und genau so wird sie hier geprüft: kein Netzwerkaufruf, kein
 * Kopplungscode, keine Serveradresse. Ein versehentlich hinzugezogenes Modul
 * mit Server-Anbindung brächte beides mit, ohne dass `typecheck` etwas merkt.
 *
 * **Diese Datei ist der Beleg, auf den sich das README beruft** — sie liegt
 * deshalb im selben Repo wie der Quelltext, den sie prüft. Ein Beleg, der beim
 * Klonenden fehlt, ist kein Beleg.
 *
 * Geprüft wird gegen eine **Liste von Ausgängen, nicht gegen einen einzelnen
 * Namen.** `fetch(` als Zeichenkette abzufragen ließ `navigator.sendBeacon`,
 * `WebSocket`, `EventSource`, `new Image().src` und schon `globalThis.fetch`
 * unbemerkt durch — ein Wächter, der nur den geraden Weg kennt, bewacht nichts.
 *
 * Gebaut wird in den Speicher (`write: false`) — kein `dist/` nötig, damit der
 * Test auch auf einer frisch geklonten Arbeitskopie durchläuft.
 */

import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface LightManifest {
  manifest_version: number;
  name: string;
  version: string;
  minimum_chrome_version: string;
  icons: Record<string, string>;
  action: { default_popup: string; default_icon?: Record<string, string> };
  permissions: string[];
  background?: unknown;
  host_permissions?: unknown;
  optional_host_permissions?: unknown;
  content_scripts: { matches: string[]; js: string[]; run_at: string }[];
}

async function readJson<T>(relative: string): Promise<T> {
  return JSON.parse(await readFile(join(root, relative), 'utf8')) as T;
}

async function bundle(entry: string, format: 'esm' | 'iife'): Promise<string> {
  const result = await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    write: false,
    format,
    target: 'chrome102',
    charset: 'utf8',
    logLevel: 'silent',
  });
  return result.outputFiles.map((file) => file.text).join('\n');
}

/**
 * Jeder Weg, auf dem ein Byte diesen Rechner verlassen könnte.
 *
 * Absichtlich großzügig: ein Treffer heißt „hinsehen", nicht „Fehler". Lieber
 * ein Test, der bei einer harmlosen Umbenennung anschlägt, als einer, der eine
 * Datenübertragung durchwinkt, weil sie anders geschrieben war.
 */
const NETZ_AUSGAENGE: readonly [string, RegExp][] = [
  ['fetch', /\bfetch\b/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['EventSource', /\bEventSource\b/],
  ['RTCPeerConnection', /\bRTCPeerConnection\b/],
  ['navigator.geolocation', /\bgeolocation\b/],
  // Nachrichten an einen Hintergrunddienst — den es hier nicht gibt.
  ['chrome.runtime.sendMessage/connect', /\bchrome\.runtime\.(sendMessage|connect)\b/],
  // Nachladen zur Laufzeit: ein Weg, der die Prüfung des Bündels umginge.
  ['dynamisches import()', /\bimport\s*\(/],
  ['importScripts', /\bimportScripts\b/],
  // Der Klassiker: ein Bild mit den Daten in der Adresse.
  ['new Image()', /new\s+Image\s*\(/],
];

describe('Offene Fassung ohne Server (Plan-Punkt 71-73)', () => {
  let light: string;
  let lightPopup: string;
  let manifest: LightManifest;

  beforeAll(async () => {
    light = await bundle('src/light/content.ts', 'iife');
    lightPopup = await bundle('src/light/popup.ts', 'esm');
    manifest = await readJson<LightManifest>('src/light/manifest.json');
  });

  it('ruft nirgends das Netz', () => {
    for (const [bundle, code] of [
      ['content', light],
      ['popup', lightPopup],
    ] as const) {
      for (const [ausgang, muster] of NETZ_AUSGAENGE) {
        expect(muster.test(code), `${bundle}: ${ausgang}`).toBe(false);
      }
    }
  });

  /**
   * Der Wächter muss anschlagen, sonst bewacht er nichts. Geprüft an einem
   * Bündel, das absichtlich einen Ausgang enthält — ohne diesen Test wäre eine
   * kaputte Liste von einer sauberen Erweiterung nicht zu unterscheiden.
   */
  it('würde einen Netzaufruf auch bemerken', () => {
    const beispiele = [
      'await fetch("https://beispiel.test");',
      'navigator.sendBeacon("/x", "y");',
      'new WebSocket("wss://beispiel.test");',
      'new Image().src = "https://beispiel.test/?d=" + wert;',
      'chrome.runtime.sendMessage({ was: "los" });',
    ];

    for (const beispiel of beispiele) {
      expect(
        NETZ_AUSGAENGE.some(([, muster]) => muster.test(beispiel)),
        beispiel,
      ).toBe(true);
    }
  });

  it('enthält keinen Kopplungs- oder Abgleich-Code', () => {
    for (const code of [light, lightPopup]) {
      expect(code).not.toContain('auth/extension/pair');
      expect(code).not.toContain('Bearer ');
      expect(code).not.toContain('gtue.cache.pointer');
      expect(code).not.toContain('TRUSTED_CONTEXTS');
    }
  });

  it('nennt keine Serveradresse', () => {
    for (const code of [light, lightPopup]) {
      expect(code).not.toContain('gino-hub');
      expect(code).not.toContain('localhost:3333');
    }
  });

  it('kommt ohne Hintergrunddienst aus — es gibt nichts durchzureichen', () => {
    expect(manifest.background).toBeUndefined();
    expect(manifest.permissions).toEqual(['storage']);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toBeUndefined();
  });

  it('ist ein MV3-Manifest und verlangt mindestens Chrome 102', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe('102');
  });

  it('hält die Fassungsnummer mit package.json gleich', async () => {
    const pkg = await readJson<{ version: string }>('package.json');
    expect(manifest.version).toBe(pkg.version);
  });

  it('führt die fremde Marke nicht im Namen', () => {
    // GTÜ ist die Marke eines Dritten. Im Beschreibungstext ist der Bezug eine
    // Tatsachenangabe, im Titel einer öffentlich verteilten Erweiterung wäre er
    // eine Anmaßung — und im Chrome Web Store ein Abmahnrisiko.
    expect(manifest.name).not.toMatch(/GT(Ü|UE)/i);
  });

  it('bringt eigene Icons mit — sonst zeigt Chrome den Buchstaben', () => {
    expect(Object.keys(manifest.icons).sort()).toEqual(['128', '16', '32', '48']);
    expect(manifest.action.default_icon).toEqual(manifest.icons);
  });

  it('greift genau eine Anwendung an', () => {
    expect(manifest.content_scripts).toHaveLength(1);
    expect(manifest.content_scripts[0]?.matches).toEqual(['https://shell-frontend.gtue.world/*']);
  });

  it('bündelt content.js ohne import — Content-Scripts sind keine Module', () => {
    expect(light).not.toMatch(/^\s*import\s/m);
    expect(light).not.toMatch(/^\s*export\s/m);
  });

  it('bringt Textbausteine und Kilometerstand mit — sonst wäre sie kein Köder', () => {
    expect(light).toContain('Bremswerte');
    expect(light).toContain('laufleistung-alt');
  });
});
