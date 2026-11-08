/**
 * File: fingerprint-extra.js
 * Author: AlbGri
 * Copyright: (c) 2025 Alberto G. - Licensed under AGPL-3.0
 * Created: 2026-11-06
 * Description: Tecniche di fingerprinting aggiuntive, senza permessi e senza server.
 *              Ogni raccolta restituisce le righe {voce, value} di una sezione, che
 *              fingerprint-viewer.js mostra insieme alle altre. I testi fissi sono messaggi
 *              I18n.m, tradotti quando si mostrano. Nessuna entra nell'ID persistente:
 *              cambierebbe l'ID di tutti e la cronologia delle visite ripartirebbe da zero.
 */

(function() {
    'use strict';

    const m = window.I18n.m;
    const NON_DISPONIBILE = m('valore.nonDisponibile');
    const SOLO_CHROMIUM = m('valore.soloChromeEdge');
    const NESSUNO = m('valore.nessuno');
    const NESSUNA = m('valore.nessuna');
    // Tetto per ogni raccolta: una API che non risponde non deve fermare la pagina
    const LIMITE_MS = 2000;

    function hash(valore) {
        return window.FingerprintUtils.simpleHash(String(valore));
    }

    function siNo(valore) {
        return m(valore ? 'valore.si' : 'valore.no');
    }

    /**
     * Client Hints ad alta entropia: Chrome ed Edge li danno a qualsiasi pagina che li chiede,
     * e dicono molto piu' dello user agent, che da anni e' congelato su valori generici.
     */
    async function clientHints() {
        const uaData = navigator.userAgentData;
        if (!uaData || !uaData.getHighEntropyValues) {
            return [{ voce: 'clientHints', value: SOLO_CHROMIUM }];
        }
        const h = await uaData.getHighEntropyValues([
            'architecture', 'bitness', 'model', 'platformVersion', 'fullVersionList', 'formFactors'
        ]);

        // Windows 10 e 11 hanno lo stesso user agent; la versione della piattaforma no:
        // da 13 in su e' Windows 11
        let sistema = `${h.platform} ${h.platformVersion}`;
        if (h.platform === 'Windows') {
            const major = parseInt(h.platformVersion, 10);
            const nome = major >= 13 ? 'Windows 11' : major > 0 ? 'Windows 10' : m('valore.windows7o8');
            sistema = m('valore.conNota', { valore: sistema, nota: nome });
        }

        // I marchi finti come "Not A(Brand" servono solo a confondere i parser: si tolgono
        const versioni = (h.fullVersionList || [])
            .filter(b => !/not.?a.?brand/i.test(b.brand))
            .map(b => `${b.brand} ${b.version}`)
            .join(', ');

        return [
            { voce: 'sistema', value: sistema },
            { voce: 'modello', value: h.model || m('valore.modelloComputer') },
            { voce: 'architettura', value: h.architecture ? `${h.architecture} ${h.bitness} bit` : NON_DISPONIBILE },
            { voce: 'versioni', value: versioni || NON_DISPONIBILE },
            { voce: 'tipo', value: (h.formFactors || []).join(', ') || NON_DISPONIBILE }
        ];
    }

    // Font da cercare, con l'indizio che danno se presenti (chiave indizio.*). La scelta
    // privilegia quelli legati a un sistema operativo o a un programma: sono loro a
    // distinguere le persone.
    const FONT_CANDIDATI = [
        ['Segoe UI', 'windows'], ['Segoe Fluent Icons', 'windows11'],
        ['Bahnschrift', 'windows10'], ['Cascadia Code', 'windowsTerminal'],
        ['Calibri', 'officeWindows'], ['Aptos', 'microsoft365'],
        ['Century Gothic', 'office'], ['Garamond', 'office'],
        ['Book Antiqua', 'office'], ['Cambria', ''], ['Consolas', ''], ['Candara', ''],
        ['Gabriola', ''], ['Malgun Gothic', ''], ['Yu Gothic', ''],
        ['Helvetica Neue', 'macosIos'], ['Menlo', 'macos'], ['Monaco', 'macos'],
        ['Avenir', 'macosIos'], ['Futura', 'macosIos'], ['Gill Sans', 'macosIos'],
        ['PingFang SC', 'macosIos'],
        ['DejaVu Sans', 'linux'], ['Liberation Sans', 'linuxLibreoffice'], ['Ubuntu', 'ubuntu'],
        ['Cantarell', 'gnome'], ['Noto Sans', 'linuxAndroid'],
        ['Roboto', 'androidChromeos'], ['Droid Sans', 'android'],
        ['Linux Libertine G', 'libreoffice'], ['Carlito', 'libreoffice'], ['Caladea', 'libreoffice'],
        ['Myriad Pro', 'adobe'], ['Minion Pro', 'adobe'],
        ['Fira Code', 'programmatori'], ['JetBrains Mono', 'jetbrains'],
        ['Source Code Pro', 'programmatori'],
        ['Open Sans', ''], ['Lato', ''], ['Arial', ''], ['Times New Roman', ''], ['Courier New', ''],
        ['Verdana', ''], ['Georgia', ''], ['Comic Sans MS', ''], ['Impact', ''], ['Tahoma', ''],
        ['Trebuchet MS', '']
    ];

    /**
     * Font installati senza chiedere niente: si misura la larghezza di un testo scritto con il
     * font cercato e, come riserva, un font generico. Se la larghezza cambia rispetto al solo
     * font generico, il font cercato c'e'. Safari e Firefox con resistFingerprinting limitano
     * la tecnica ai font di sistema.
     */
    function fontInstallati() {
        const ctx = document.createElement('canvas').getContext('2d');
        const testo = 'mmmmmmmmmmlli1WQ@#';
        const generici = ['monospace', 'sans-serif', 'serif'];
        const larghezzaBase = {};
        generici.forEach(g => {
            ctx.font = `72px ${g}`;
            larghezzaBase[g] = ctx.measureText(testo).width;
        });

        const trovati = FONT_CANDIDATI.filter(([nome]) => generici.some(g => {
            ctx.font = `72px "${nome}", ${g}`;
            return ctx.measureText(testo).width !== larghezzaBase[g];
        }));
        const indizi = [...new Set(trovati.map(([, indizio]) => indizio).filter(Boolean))];

        return [
            { voce: 'trovati', value: m('sezione.font.trovatiValore', { n: trovati.length, totale: FONT_CANDIDATI.length }) },
            { voce: 'elenco', value: trovati.map(([nome]) => nome).join(', ') || NESSUNO },
            { voce: 'indizi', value: indizi.length ? indizi.map(i => m(`indizio.${i}`)) : NESSUNO },
            { voce: 'impronta', value: hash(trovati.map(([nome]) => nome).join(',')) }
        ];
    }

    /**
     * Voci di sintesi vocale: l'elenco dipende dal sistema operativo e dai pacchetti di lingua
     * installati. Chrome le carica in ritardo, quindi si aspetta l'evento voiceschanged.
     */
    async function vociSintesi() {
        const synth = window.speechSynthesis;
        if (!synth) {
            return [{ voce: 'sintesi', value: NON_DISPONIBILE }];
        }
        const voci = await new Promise(resolve => {
            const subito = synth.getVoices();
            if (subito.length) {
                resolve(subito);
                return;
            }
            synth.addEventListener('voiceschanged', () => resolve(synth.getVoices()), { once: true });
            setTimeout(() => resolve(synth.getVoices()), 1000);
        });

        const locali = voci.filter(v => v.localService);
        const lingue = [...new Set(voci.map(v => v.lang))];
        const nomi = locali.map(v => v.name).join(' ');
        let indizio = NESSUNO;
        if (/Microsoft/.test(nomi)) {
            indizio = 'Windows';
        } else if (voci.some(v => /com\.apple/.test(v.voiceURI))) {
            indizio = m('indizio.macosIos');
        } else if (/espeak/i.test(nomi)) {
            indizio = 'Linux';
        }

        return [
            { voce: 'installate', value: m('sezione.voci.installateValore', { locali: locali.length, online: voci.length - locali.length }) },
            { voce: 'sistema', value: locali.map(v => v.name).join(', ') || NESSUNA },
            { voce: 'lingue', value: `${lingue.length}: ${lingue.slice(0, 12).join(', ')}${lingue.length > 12 ? '...' : ''}` },
            { voce: 'indizio', value: indizio },
            { voce: 'impronta', value: voci.length ? hash(voci.map(v => v.voiceURI).join(',')) : NON_DISPONIBILE }
        ];
    }

    /**
     * Scheda video: WebGPU dice produttore e architettura anche dove il renderer WebGL e'
     * mascherato; i limiti di WebGL cambiano da un modello all'altro e da un driver all'altro.
     */
    async function schedaVideo() {
        const items = [];

        if (navigator.gpu) {
            const adapter = await navigator.gpu.requestAdapter();
            if (adapter) {
                // adapter.info nei Chrome recenti, requestAdapterInfo() in quelli prima del 2024
                const info = adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : {});
                const limiti = [];
                for (const chiave in adapter.limits) {
                    limiti.push(`${chiave}=${adapter.limits[chiave]}`);
                }
                items.push(
                    { voce: 'produttore', value: info.vendor || NON_DISPONIBILE },
                    { voce: 'architettura', value: info.architecture || NON_DISPONIBILE },
                    { voce: 'descrizione', value: info.description || info.device || m('valore.nascostaDalBrowser') },
                    { voce: 'funzioni', value: String(adapter.features.size) },
                    { voce: 'improntaWebgpu', value: hash(limiti.join(',')) }
                );
            } else {
                items.push({ voce: 'webgpu', value: m('valore.nessunaScheda') });
            }
        } else {
            items.push({ voce: 'webgpu', value: NON_DISPONIBILE });
        }

        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) {
            items.push({ voce: 'webglEsteso', value: NON_DISPONIBILE });
            return items;
        }
        const estensioni = gl.getSupportedExtensions() || [];
        const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
        const precisione = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
        const parametri = [
            gl.MAX_TEXTURE_SIZE, gl.MAX_RENDERBUFFER_SIZE, gl.MAX_VERTEX_ATTRIBS,
            gl.MAX_VERTEX_UNIFORM_VECTORS, gl.MAX_FRAGMENT_UNIFORM_VECTORS,
            gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS, gl.ALIASED_LINE_WIDTH_RANGE, gl.ALIASED_POINT_SIZE_RANGE
        ].map(p => String(gl.getParameter(p)));

        items.push(
            { voce: 'estensioni', value: String(estensioni.length) },
            { voce: 'texture', value: `${gl.getParameter(gl.MAX_TEXTURE_SIZE)} px` },
            { voce: 'viewport', value: viewport ? `${viewport[0]} x ${viewport[1]} px` : NON_DISPONIBILE },
            { voce: 'precisione', value: precisione ? `${precisione.precision} bit` : NON_DISPONIBILE },
            { voce: 'improntaWebgl', value: hash(parametri.concat(estensioni).join(',')) }
        );

        // Libera subito il contesto: il browser ne tiene aperti pochi per pagina
        const perdita = gl.getExtension('WEBGL_lose_context');
        if (perdita) {
            perdita.loseContext();
        }
        return items;
    }

    /**
     * Preferenze del sistema lette con le media query CSS: la pagina le vede tutte, anche
     * quelle di accessibilita', che restringono molto il gruppo di persone simili.
     */
    function preferenzeSistema() {
        const si = m('valore.si');
        const no = m('valore.no');
        // Primo valore che corrisponde, nell'ordine dato
        function query(caratteristica, valori) {
            const trovato = valori.find(([valore]) => window.matchMedia(`(${caratteristica}: ${valore})`).matches);
            return trovato ? trovato[1] : m('valore.nonRilevabile');
        }
        return [
            { voce: 'tema', value: query('prefers-color-scheme', [['dark', m('valore.scuro')], ['light', m('valore.chiaro')]]) },
            { voce: 'movimento', value: query('prefers-reduced-motion', [['reduce', si], ['no-preference', no]]) },
            { voce: 'contrasto', value: query('prefers-contrast', [['more', m('valore.alto')], ['less', m('valore.basso')], ['custom', m('valore.personalizzato')], ['no-preference', m('valore.normale')]]) },
            { voce: 'coloriForzati', value: query('forced-colors', [['active', m('valore.contrastoElevato')], ['none', no]]) },
            { voce: 'trasparenza', value: query('prefers-reduced-transparency', [['reduce', si], ['no-preference', no]]) },
            { voce: 'coloriInvertiti', value: query('inverted-colors', [['inverted', si], ['none', no]]) },
            { voce: 'gamma', value: query('color-gamut', [['rec2020', 'Rec. 2020'], ['p3', 'Display P3'], ['srgb', 'sRGB']]) },
            { voce: 'hdr', value: query('dynamic-range', [['high', si], ['standard', no]]) },
            { voce: 'puntatore', value: query('pointer', [['fine', m('valore.mouse')], ['coarse', m('valore.dito')], ['none', NESSUNO]]) },
            { voce: 'hover', value: query('hover', [['hover', si], ['none', no]]) }
        ];
    }

    function storageDisponibile(tipo) {
        try {
            window[tipo].setItem('__storage_test__', 'test');
            window[tipo].removeItem('__storage_test__');
            return m('valore.disponibile');
        } catch (e) {
            return NON_DISPONIBILE;
        }
    }

    /**
     * Quota di spazio concessa al sito: un tempo rivelava la dimensione del disco e
     * l'incognito, oggi Chrome risponde con lo stesso valore fisso (10 GB) in entrambi i modi,
     * e anche questo e' un dato del browser. Firefox in navigazione privata non espone i
     * service worker.
     */
    async function spazioBrowser() {
        let quota = null;
        if (navigator.storage && navigator.storage.estimate) {
            quota = (await navigator.storage.estimate()).quota;
        }
        const privata = /Firefox/.test(navigator.userAgent) && !('serviceWorker' in navigator)
            ? m('valore.privataProbabile')
            : m('valore.nonRilevata');
        return [
            { voce: 'quota', value: quota ? window.FingerprintUtils.formatBytes(quota) : NON_DISPONIBILE },
            { voce: 'privata', value: privata },
            { voce: 'localStorage', value: storageDisponibile('localStorage') },
            { voce: 'sessionStorage', value: storageDisponibile('sessionStorage') }
        ];
    }

    /**
     * Blocco della pubblicita': un banner finto e uno script finto, entrambi dal sito stesso,
     * con nomi che EasyList blocca su ogni sito (le esche classiche come adsbygoogle e
     * googleads.js non ci sono piu'). Li ferma solo un blocco nel browser; uno nella rete, come
     * Pi-hole, non li vede perche' non sono su domini pubblicitari.
     */
    async function bloccoPubblicita() {
        const banner = document.createElement('div');
        banner.className = 'AdSense AdSlot AdUnit esca-pubblicita';
        document.body.appendChild(banner);
        const script = document.createElement('script');
        const scriptBloccato = new Promise(resolve => {
            script.onload = () => resolve(false);
            script.onerror = () => resolve(true);
        });
        script.src = 'js/flyad.js';
        document.head.appendChild(script);

        // Il tempo per nascondere il banner, che il bloccatore cerca dopo l'inserimento
        await new Promise(resolve => setTimeout(resolve, 500));
        const bannerNascosto = banner.offsetHeight === 0 || getComputedStyle(banner).visibility === 'hidden';
        banner.remove();
        const bloccato = await scriptBloccato;
        script.remove();

        return [
            { voce: 'esito', value: m(bannerNascosto || bloccato ? 'valore.bloccoAttivo' : 'valore.bloccoAssente') },
            { voce: 'banner', value: m(bannerNascosto ? 'valore.nascosto' : 'valore.visibile') },
            { voce: 'script', value: m(bloccato ? 'valore.bloccato' : 'valore.caricato') }
        ];
    }

    /**
     * Estensioni installate, in due modi. Le tracce nella pagina: i portafogli di criptovalute
     * si annunciano a ogni pagina che lo chiede (standard EIP-6963), gli strumenti per
     * programmatori aggiungono un oggetto globale, Grammarly e Dark Reader segnano la pagina. E
     * i file interni che molte estensioni lasciano leggere a ogni pagina.
     */
    async function estensioni() {
        const portafogli = new Set();
        const annuncio = e => portafogli.add(e.detail.info.name);
        window.addEventListener('eip6963:announceProvider', annuncio);
        window.dispatchEvent(new Event('eip6963:requestProvider'));
        const trovateDaiFile = sondaFile();
        // Il tempo per annunciarsi e per segnare la pagina, cosa che le estensioni fanno dopo il
        // caricamento
        await new Promise(resolve => setTimeout(resolve, 1000));
        window.removeEventListener('eip6963:announceProvider', annuncio);

        // Portafogli che non si annunciano; quello di Brave c'e' in ogni Brave, quindi non dice niente
        const ethereum = window.ethereum;
        if (portafogli.size === 0 && ethereum && !ethereum.isBraveWallet) {
            portafogli.add(ethereum.isMetaMask ? 'MetaMask' : ethereum.isCoinbaseWallet ? 'Coinbase Wallet'
                : m('valore.portafoglioIgnoto'));
        }
        if (window.phantom && window.phantom.solana) portafogli.add('Phantom');
        if (window.solflare) portafogli.add('Solflare');
        portafogli.delete('Brave Wallet');

        const sviluppo = [
            ['__REACT_DEVTOOLS_GLOBAL_HOOK__', 'React Developer Tools'],
            ['__VUE_DEVTOOLS_GLOBAL_HOOK__', 'Vue.js devtools'],
            ['__REDUX_DEVTOOLS_EXTENSION__', 'Redux DevTools']
        ].filter(([oggetto]) => oggetto in window).map(([, nome]) => nome);

        const segni = [];
        if (document.body.hasAttribute('data-gr-ext-installed') || document.body.hasAttribute('data-new-gr-c-s-check-loaded')) {
            segni.push('Grammarly');
        }
        if (document.querySelector('meta[name="darkreader"], style.darkreader')) {
            segni.push('Dark Reader');
        }

        const daiFile = await trovateDaiFile;
        return [
            { voce: 'portafogli', value: portafogli.size ? [...portafogli] : NESSUNO },
            { voce: 'sviluppo', value: sviluppo.length ? sviluppo : NESSUNO },
            { voce: 'segni', value: segni.length ? segni : NESSUNA },
            { voce: 'file', value: daiFile === null ? SOLO_CHROMIUM : daiFile.length ? daiFile
                : m('sezione.estensioni.nessunaFra', { n: window.EstensioniNote.length }) }
        ];
    }

    /**
     * Prova a leggere un file di ogni estensione dell'elenco: risponde solo se e' installata.
     * Solo Chrome, Edge e simili: Firefox cambia l'indirizzo dei file a ogni installazione
     *
     * @returns {Promise<string[]|null>} Nomi delle estensioni trovate, null se non si puo' cercare
     */
    async function sondaFile() {
        if (!window.chrome || /Firefox/.test(navigator.userAgent) || !window.EstensioniNote) {
            return null;
        }
        const esiti = await Promise.all(window.EstensioniNote.map(([id, file, nome]) =>
            fetch(`chrome-extension://${id}/${file}`).then(() => nome, () => null)));
        return esiti.filter(Boolean);
    }

    /**
     * Layout della tastiera (Chrome ed Edge) e formati regionali: insieme dicono il paese meglio
     * della lingua dichiarata, che spesso resta inglese.
     */
    async function tastieraFormati() {
        const items = [];

        if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
            const mappa = await navigator.keyboard.getLayoutMap();
            const q = mappa.get('KeyQ');
            const y = mappa.get('KeyY');
            const pv = mappa.get('Semicolon');
            let layout = m('tastiera.altro', { tasto: pv });
            if (q === 'a') {
                layout = m('tastiera.azerty');
            } else if (y === 'z') {
                layout = m('tastiera.qwertz');
            } else if (pv === 'ò') {
                layout = m('tastiera.italiana');
            } else if (pv === 'ñ') {
                layout = m('tastiera.spagnola');
            } else if (pv === 'ö') {
                layout = m('tastiera.nordica');
            } else if (pv === ';') {
                layout = m('tastiera.inglese');
            }
            const campione = ['KeyQ', 'KeyW', 'KeyY', 'KeyZ', 'Semicolon', 'BracketLeft', 'Quote', 'Backquote']
                .map(k => mappa.get(k) || '?').join(' ');
            items.push({ voce: 'layout', value: layout }, { voce: 'campione', value: campione });
        } else {
            items.push({ voce: 'layout', value: SOLO_CHROMIUM });
        }

        const opzioni = Intl.DateTimeFormat().resolvedOptions();
        const ciclo = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
        const coerente = opzioni.locale.split('-')[0] === navigator.language.split('-')[0];
        items.push(
            { voce: 'linguaFormati', value: opzioni.locale },
            { voce: 'coerente', value: coerente ? m('valore.si') : m('valore.formatiAltraLingua') },
            { voce: 'calendario', value: opzioni.calendar },
            { voce: 'numerazione', value: opzioni.numberingSystem },
            { voce: 'orologio', value: m(ciclo === 'h11' || ciclo === 'h12' ? 'valore.ore12' : 'valore.ore24') },
            // Formati del browser, non della lingua della pagina: sono il dato raccolto
            { voce: 'data', value: new Date(2025, 11, 31).toLocaleDateString() },
            { voce: 'numero', value: (1234567.89).toLocaleString() }
        );
        return items;
    }

    // Emoji introdotte in anni diversi, scritte come codici: le versioni del sistema operativo
    // aggiornano il font delle emoji, quindi l'ultima che si disegna data il sistema
    const EMOJI_VERSIONI = [
        ['11.0 (2018)', '\u{1F970}'], ['12.0 (2019)', '\u{1F971}'], ['13.0 (2020)', '\u{1F972}'],
        ['14.0 (2021)', '\u{1FAE0}'], ['15.0 (2022)', '\u{1FAE8}'],
        ['15.1 (2023)', '\u{1F426}\u{200D}\u{1F525}'], ['16.0 (2024)', '\u{1FAE9}']
    ];

    /**
     * Calcoli ed emoji: le funzioni matematiche danno risultati diversi nelle ultime cifre a
     * seconda del motore JavaScript e della libreria del sistema; le emoji rivelano la
     * versione del font di sistema.
     */
    function calcoliEmoji() {
        const valori = [
            Math.tan(-1e300), Math.acosh(1e308), Math.asinh(1), Math.atanh(0.5), Math.expm1(1),
            Math.cbrt(100), Math.cosh(10), Math.sinh(1), Math.tanh(0.5), Math.log1p(10),
            Math.exp(10), Math.pow(Math.PI, -100), Math.atan2(0.03, 2)
        ];

        const canvas = document.createElement('canvas');
        canvas.width = 40;
        canvas.height = 40;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.font = '32px sans-serif';
        ctx.textBaseline = 'top';
        const larghezzaRiferimento = ctx.measureText('\u{1F600}').width;

        // Un'emoji supportata si disegna a colori; una sconosciuta diventa un riquadro
        // monocromatico. Una sequenza unita (ZWJ) non supportata diventa due emoji affiancate,
        // quindi si controlla anche che resti larga quanto una sola.
        function supportata(emoji) {
            ctx.clearRect(0, 0, 40, 40);
            ctx.fillText(emoji, 0, 0);
            const pixel = ctx.getImageData(0, 0, 40, 40).data;
            let colorata = false;
            for (let i = 0; i < pixel.length && !colorata; i += 4) {
                colorata = pixel[i + 3] > 0 && (pixel[i] !== pixel[i + 1] || pixel[i + 1] !== pixel[i + 2]);
            }
            return colorata && ctx.measureText(emoji).width < larghezzaRiferimento * 1.5;
        }

        const supportate = EMOJI_VERSIONI.filter(([, emoji]) => supportata(emoji));
        const larghezze = EMOJI_VERSIONI.map(([, emoji]) => ctx.measureText(emoji).width);

        return [
            { voce: 'impronta', value: hash(valori.join(',')) },
            { voce: 'esempio', value: String(valori[0]) },
            { voce: 'emoji', value: supportate.length ? `Unicode ${supportate[supportate.length - 1][0]}` : m('valore.nessunaColori') },
            { voce: 'improntaEmoji', value: hash(larghezze.concat(larghezzaRiferimento).join(',')) }
        ];
    }

    /**
     * Schermi e finestra: la differenza fra schermo e area disponibile e' lo spazio delle barre
     * di sistema (dove sta la barra delle applicazioni e quanto e' alta); isExtended dice se
     * c'e' un secondo monitor, senza chiedere permessi.
     */
    function schermi() {
        const s = window.screen;
        return [
            { voce: 'piuMonitor', value: s.isExtended === undefined ? SOLO_CHROMIUM : siNo(s.isExtended) },
            { voce: 'barre', value: `${s.width - s.availWidth} x ${s.height - s.availHeight} px` },
            { voce: 'origine', value: s.availLeft === undefined ? NON_DISPONIBILE : `${s.availLeft}, ${s.availTop}` },
            { voce: 'posizione', value: `${window.screenX}, ${window.screenY}` },
            { voce: 'dimensione', value: `${window.outerWidth} x ${window.outerHeight} px` },
            { voce: 'orientamento', value: s.orientation ? s.orientation.type : NON_DISPONIBILE }
        ];
    }

    // Id della sezione (il data-sezione nella pagina) e raccolta che la riempie
    const RACCOLTE = [
        ['clientHints', clientHints],
        ['font', fontInstallati],
        ['voci', vociSintesi],
        ['schedaVideo', schedaVideo],
        ['preferenze', preferenzeSistema],
        ['spazio', spazioBrowser],
        ['pubblicita', bloccoPubblicita],
        ['estensioni', estensioni],
        ['tastiera', tastieraFormati],
        ['calcoli', calcoliEmoji],
        ['schermi', schermi]
    ];

    /**
     * Esegue tutte le raccolte in parallelo. Una raccolta che fallisce o supera il tetto di
     * tempo mostra l'esito al posto dei valori, senza bloccare le altre.
     * @returns {Promise<Object<string, Array>>} Righe per id di sezione
     */
    async function collect() {
        const sezioni = await Promise.all(RACCOLTE.map(async ([id, raccogli]) => {
            try {
                const items = await Promise.race([
                    Promise.resolve().then(raccogli),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), LIMITE_MS))
                ]);
                return [id, items];
            } catch (error) {
                window.logger.warn(`[fingerprint-extra] ${id}:`, error);
                return [id, [{ etichetta: 'voce.esito', value: m('valore.nonDisponibileMotivo', { motivo: error.message }) }]];
            }
        }));
        return Object.fromEntries(sezioni);
    }

    window.FingerprintExtra = { collect };
})();
