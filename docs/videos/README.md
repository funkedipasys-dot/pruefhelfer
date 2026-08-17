# Videos für die Projektseite

Die Seite (`docs/index.html`, Abschnitt „Kurz gezeigt") lädt genau diese zwei Dateien:

| Datei | Was | Stand |
|---|---|---|
| `erklaervideo.mp4` | H.264/AAC, 1280×720, mit Ton | vorhanden — 17,1 MB, 8:36 |
| `erklaervideo-poster.jpg` | Standbild 1280×720 | vorhanden — 26 KB |

Eine `erklaervideo.webm` gibt es bewusst nicht. Sie wäre rund 30 % kleiner, aber solange die
Datei fehlt, würde die zugehörige `<source>`-Zeile bei jedem Seitenaufruf einen 404 erzeugen.
Wer WebM ergänzt, trägt die `<source>`-Zeile in `index.html` wieder ein — vor dem MP4.

GitHub Pages liefert die Dateien direkt aus, es gibt keinen Drittanbieter und keine Cookies.

## Grenzen, die hier zählen

- **100 MB pro Datei** ist GitHubs hartes Limit, ab 50 MB kommt eine Warnung. 17 MB sind unkritisch.
- **Kein Git LFS.** GitHub Pages liefert LFS-Dateien nicht aus — der Browser bekäme die
  Pointer-Textdatei statt des Videos. Die MP4 wird ganz normal committet.
- **Jede committete Fassung bleibt in der History.** Erst die Fassung festlegen, dann committen —
  sonst wächst das Repo um die Summe aller Versuche.
- **Bandbreite:** Pages hat ein weiches Limit von 100 GB/Monat, das sind hier grob 5.000
  vollständige Abrufe.

## Neu erzeugen

Immer aus dem unkomprimierten Master encoden, nie aus einer bereits komprimierten Fassung —
sonst summieren sich die Artefakte.

```bash
ffmpeg -i master.mp4 -vf scale=1280:-2 -c:v libx264 -crf 26 -preset slow \
  -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 96k erklaervideo.mp4

ffmpeg -i erklaervideo.mp4 -ss 2 -frames:v 1 -q:v 3 erklaervideo-poster.jpg
```

`-movflags +faststart` ist nicht optional: ohne das liegt der Index am Dateiende und der Browser
lädt erst alles herunter, bevor er abspielt.

Bei einem Screencast ohne Ton `-c:a aac -b:a 96k` durch `-an` ersetzen. Screencast-Material
komprimiert sehr gut, weil sich zwischen den Frames wenig ändert — bei zu großer Datei die
Bitrate senken (CRF erhöhen), nicht die Auflösung.
