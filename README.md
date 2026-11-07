# Digital Fingerprint

Demo didattica di browser fingerprinting: cosa sa di te una pagina web appena la apri, senza
cookie. Codice aperto e nessun backend: l'autore non raccoglie nulla.

Sito: https://df.albgri.com/ (anche https://albgri.github.io/digital-fingerprint/)

## Cosa mostra

Senza chiedere niente, appena la pagina si apre:
- un ID ricavato da nove valori del browser e dell'hardware (quelli con l'asterisco), con una stima
  di quanto ti distingue dagli altri, e le visite precedenti in cui ti ha riconosciuto
- browser, lingue, schermo, processore, scheda video (WebGL e WebGPU), impronte canvas e audio
- IP pubblico e indirizzi che escono da WebRTC
- batteria, presenza di telecamera, microfono e altoparlanti, sensori
- Client Hints, font installati, voci di sintesi vocale, preferenze del sistema, spazio del
  browser e navigazione privata, tastiera e formati regionali, calcoli ed emoji, schermi e finestra
- movimenti del mouse, clic, scorrimento e tasti premuti sulla pagina
- velocita' reale della connessione, scaricando fino a 10 MB dal sito stesso

La pagina e' in italiano o in inglese, con un orologio nel fuso orario che scegli.

Con un permesso, una scheda alla volta:
- posizione GPS e indirizzo
- nomi di telecamere, microfoni e altoparlanti, piu' una foto dalla fotocamera frontale che resta
  sulla pagina
- sensori di movimento in tempo reale
- condivisione dello schermo
- testo negli appunti

## Cosa esce dal browser

Niente verso l'autore: nessun analytics, nessun cookie, nessun server suo. La pagina contatta solo:
- `api64.ipify.org` e `api.ipify.org`, per l'IP pubblico
- `stun.l.google.com` e `stun1.l.google.com`, server STUN di Google, per gli indirizzi WebRTC
- `nominatim.openstreetmap.org`, solo dopo il permesso di posizione, per trasformare le coordinate
  in un indirizzo

Questi servizi vedono il tuo IP quando li contatti, e l'hosting (GitHub Pages, piu' Cloudflare per
df.albgri.com) riceve le normali richieste di ogni sito.

ID, cronologia delle visite e prima lettura della batteria restano nel localStorage del tuo
browser, per mostrarti che la pagina ti riconosce, insieme alla lingua e al fuso scelti. Si
cancellano con il pulsante in fondo alla pagina, che lascia solo lingua e fuso scelti, oppure
dalle impostazioni del browser, con i dati del sito.

## Provarla in locale

Nessun build step, ma serve un server: aperta come file, alcune API non funzionano. Dalla cartella
del repo:

    python -m http.server 8000 --bind 127.0.0.1

poi http://127.0.0.1:8000/

## Licenza

[AGPL-3.0](LICENSE).
