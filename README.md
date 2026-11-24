# Digital Fingerprint

Demo didattica di browser fingerprinting: cosa sa di te una pagina web appena la apri, senza
cookie. Codice aperto e nessun backend: l'autore non raccoglie nulla.

Sito: https://digital-fingerprint.albgri.com/ (anche https://albgri.github.io/digital-fingerprint/)

## Cosa mostra

Senza chiedere niente, appena la pagina si apre:
- un ritratto in poche frasi: quello che chi raccoglie questi dati ne dedurrebbe
- un ID ricavato da nove valori del browser e dell'hardware (quelli con l'asterisco), con una stima
  di quanto ti distingue dagli altri, e le visite precedenti in cui ti ha riconosciuto
- browser, lingue, schermo, processore, scheda video (WebGL e WebGPU), impronte canvas e audio,
  con il rumore che alcuni browser aggiungono all'audio per difendersi
- IP pubblico, con luogo e fornitore di rete, e indirizzi che escono da WebRTC
- indizio di VPN: IP di un datacenter, oppure fuso del sistema che non segna la stessa ora di
  quello dell'IP
- batteria, presenza di telecamera, microfono, altoparlanti e Bluetooth, sensori
- Client Hints, font installati, voci di sintesi vocale, preferenze del sistema, spazio del
  browser e navigazione privata, blocco della pubblicita', tastiera e formati regionali, calcoli ed
  emoji, schermi e finestra
- movimenti del mouse, clic, scorrimento e tasti premuti sulla pagina
- periferiche svelate dai gesti: controller da gioco, frequenza del mouse, rotella o touchpad, penna
- estensioni installate: portafogli di criptovalute, strumenti per programmatori, Grammarly e Dark
  Reader dalle tracce nella pagina; su Chrome ed Edge altre 1157 dai loro file interni (elenco
  del 2022 di [Extension Fingerprints](https://github.com/yuesir/extension-fingerprints), MIT)
- velocita' reale della connessione, scaricando fino a 10 MB dal sito stesso

Una seconda pagina, "E se qualcuno salvasse questi dati?" (`server/`), spiega cosa ne farebbe chi
li conserva su un server: profili che sopravvivono alla pulizia, supercookie, collegamento fra
siti e dispositivi, compravendita fra data broker, e come difendersi.

La pagina e' in italiano o in inglese, chiara o scura a scelta, con data e ora di Roma in alto
(sul telefono in fondo).

Con un permesso, una scheda alla volta:
- posizione GPS e indirizzo
- nomi di telecamere, microfoni e altoparlanti, piu' una foto dalla fotocamera frontale che resta
  sulla pagina
- sensori di movimento in tempo reale
- condivisione dello schermo
- testo negli appunti
- dispositivi USB e Bluetooth scelti dal visitatore: numero di serie, firmware, batteria, modello

## Cosa esce dal browser

Niente verso l'autore: nessun analytics, nessun cookie suo, nessun server suo. La pagina contatta solo:
- `api64.ipify.org` e `api.ipify.org`, per l'IP pubblico
- `ipwho.is`, per luogo, fornitore di rete e fuso dell'IP (limite di 1000 richieste al giorno
  per tutto il sito: oltre, queste righe dicono "limite del servizio")
- `stun.l.google.com` e `stun1.l.google.com`, server STUN di Google, per gli indirizzi WebRTC
- `nominatim.openstreetmap.org`, solo dopo il permesso di posizione, per trasformare le coordinate
  in un indirizzo

La ricerca delle estensioni interroga indirizzi `chrome-extension://`, interni al browser: non esce
niente. Questi servizi vedono il tuo IP quando li contatti, e l'hosting (GitHub Pages, piu' Cloudflare per
digital-fingerprint.albgri.com) riceve le normali richieste di ogni sito. Su digital-fingerprint.albgri.com Cloudflare controlla
anche in ogni pagina se chi la apre usa un browser o un programma automatico, e puo' salvarne
l'esito in un cookie tecnico (`cf_clearance`), che non serve a profilare chi visita. Per deciderlo
legge dal browser dati simili a quelli che mostra questa demo.

ID, cronologia delle visite e prima lettura della batteria restano nel localStorage del tuo
browser, per mostrarti che la pagina ti riconosce, insieme alla lingua e al tema scelti. Si
cancellano con il pulsante in fondo alla pagina, che lascia solo lingua e tema, oppure
dalle impostazioni del browser, con i dati del sito.

## Provarla in locale

Nessun build step, ma serve un server: aperta come file, alcune API non funzionano. Dalla cartella
del repo:

    python -m http.server 8000 --bind 127.0.0.1

poi http://localhost:8000/. Con http://127.0.0.1:8000/ la riga del luogo dice quasi sempre
"limite del servizio", perche' ipwho.is conta le richieste per indirizzo del sito, e quello e'
lo stesso per chiunque provi la pagina in locale.

## Licenza

[AGPL-3.0](LICENSE).

L'elenco delle reti di datacenter in `js/reti-datacenter.js` viene da
[bad-asn-list](https://github.com/brianhama/bad-asn-list) di Brian Hamachek, con licenza MIT,
riportata in testa al file.

I caratteri in `css/caratteri/`, Alegreya e Atkinson Hyperlegible Next, hanno la licenza SIL Open
Font License 1.1, nei file `OFL-*.txt` della stessa cartella.
