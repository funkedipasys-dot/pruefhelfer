# Videos für die Projektseite

Die Seite (`docs/index.html`, Abschnitt „Kurz gezeigt") erwartet genau diese drei Dateien:

| Datei | Was | Hinweis |
|---|---|---|
| `erklaervideo.mp4` | H.264/AAC, 1280×720 | Pflicht. Fallback für alle Browser. |
| `erklaervideo.webm` | VP9/Opus, 1280×720 | Optional, wird bevorzugt geladen. Fehlt sie, greift das MP4. |
| `erklaervideo-poster.jpg` | Standbild 1280×720 | Wird vor dem Abspielen gezeigt. Ohne Poster bleibt die Fläche schwarz. |

GitHub Pages liefert die Dateien direkt aus, es gibt keinen Drittanbieter und keine Cookies.
Grenzen von GitHub: max. 100 MB pro Datei, das Repo sollte unter 1 GB bleiben.
Für 60–90 s Screencast ohne Ton reichen 3–8 MB. Bleibt es größer, Bitrate senken statt Auflösung.

Erzeugen aus einer Rohaufnahme (ffmpeg):

```bash
# MP4 (Pflicht)
ffmpeg -i roh.mp4 -vf scale=1280:-2 -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -movflags +faststart -an erklaervideo.mp4

# WebM (optional, meist ~30 % kleiner)
ffmpeg -i roh.mp4 -vf scale=1280:-2 -c:v libvpx-vp9 -crf 34 -b:v 0 -an erklaervideo.webm

# Poster aus Sekunde 2
ffmpeg -i erklaervideo.mp4 -ss 2 -frames:v 1 -q:v 3 erklaervideo-poster.jpg
```

`-an` entfernt die Tonspur. Wenn das Video gesprochenen Ton bekommt, `-an` weglassen
und stattdessen `-c:a aac -b:a 96k` (MP4) bzw. `-c:a libopus -b:a 96k` (WebM) ergänzen.

Solange die Dateien fehlen, zeigt der Abschnitt eine schwarze Fläche mit Abspielbalken.
Erst pushen, wenn mindestens `erklaervideo.mp4` und das Poster hier liegen.
