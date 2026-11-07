/**
 * File: fingerprint-extra.js
 * Author: AlbGri
 * Copyright: (c) 2025 Alberto G. - Licensed under AGPL-3.0
 * Created: 2026-11-06
 * Description: Tecniche di fingerprinting aggiuntive, senza permessi e senza server.
 *              Ogni raccolta restituisce una sezione {title, items} che fingerprint-viewer.js
 *              mostra insieme alle altre. Nessuna entra nell'ID persistente: cambierebbe
 *              l'ID di tutti e la cronologia delle visite ripartirebbe da zero.
 */

(function() {
    'use strict';

    const NON_DISPONIBILE = 'Non disponibile';
    // Tetto per ogni raccolta: una API che non risponde non deve fermare la pagina
    const LIMITE_MS = 2000;

    function hash(valore) {
        return window.FingerprintUtils.simpleHash(String(valore));
    }

    function siNo(valore) {
        return valore ? 'Sì' : 'No';
    }

    /**
     * Client Hints ad alta entropia: Chrome ed Edge li danno a qualsiasi pagina che li chiede,
     * e dicono molto piu' dello user agent, che da anni e' congelato su valori generici.
     */
    async function clientHints() {
        const uaData = navigator.userAgentData;
        if (!uaData || !uaData.getHighEntropyValues) {
            return [{ label: 'Client Hints', value: NON_DISPONIBILE + ' (solo Chrome ed Edge)' }];
        }
        const h = await uaData.getHighEntropyValues([
            'architecture', 'bitness', 'model', 'platformVersion', 'fullVersionList', 'formFactors'
        ]);

        // Windows 10 e 11 hanno lo stesso user agent; la versione della piattaforma no:
        // da 13 in su e' Windows 11
        let sistema = `${h.platform} ${h.platformVersion}`;
        if (h.platform === 'Windows') {
            const major = parseInt(h.platformVersion, 10);
            sistema += major >= 13 ? ' (Windows 11)' : major > 0 ? ' (Windows 10)' : ' (Windows 7 o 8)';
        }

        // I marchi finti come "Not A(Brand" servono solo a confondere i parser: si tolgono
        const versioni = (h.fullVersionList || [])
            .filter(b => !/not.?a.?brand/i.test(b.brand))
            .map(b => `${b.brand} ${b.version}`)
            .join(', ');

        return [
            { label: 'Sistema Operativo Esatto', value: sistema },
            { label: 'Modello Dispositivo', value: h.model || 'Non dichiarato (computer)' },
            { label: 'Architettura CPU', value: h.architecture ? `${h.architecture} ${h.bitness} bit` : NON_DISPONIBILE },
            { label: 'Versione Esatta Browser', value: versioni || NON_DISPONIBILE },
            { label: 'Tipo Dispositivo', value: (h.formFactors || []).join(', ') || NON_DISPONIBILE }
        ];
    }

    // Font da cercare, con l'indizio che danno se presenti. La scelta privilegia quelli
    // legati a un sistema operativo o a un programma: sono loro a distinguere le persone.
    const FONT_CANDIDATI = [
        ['Segoe UI', 'Windows'], ['Segoe Fluent Icons', 'Windows 11'],
        ['Bahnschrift', 'Windows 10 o successivo'], ['Cascadia Code', 'Windows 11 o Windows Terminal'],
        ['Calibri', 'Microsoft Office o Windows'], ['Aptos', 'Microsoft 365 recente'],
        ['Century Gothic', 'Microsoft Office'], ['Garamond', 'Microsoft Office'],
        ['Book Antiqua', 'Microsoft Office'], ['Cambria', ''], ['Consolas', ''], ['Candara', ''],
        ['Gabriola', ''], ['Malgun Gothic', ''], ['Yu Gothic', ''],
        ['Helvetica Neue', 'macOS o iOS'], ['Menlo', 'macOS'], ['Monaco', 'macOS'],
        ['Avenir', 'macOS o iOS'], ['Futura', 'macOS o iOS'], ['Gill Sans', 'macOS o iOS'],
        ['PingFang SC', 'macOS o iOS'],
        ['DejaVu Sans', 'Linux'], ['Liberation Sans', 'Linux o LibreOffice'], ['Ubuntu', 'Ubuntu'],
        ['Cantarell', 'Linux con GNOME'], ['Noto Sans', 'Linux o Android'],
        ['Roboto', 'Android o ChromeOS'], ['Droid Sans', 'Android'],
        ['Linux Libertine G', 'LibreOffice'], ['Carlito', 'LibreOffice'], ['Caladea', 'LibreOffice'],
        ['Myriad Pro', 'programmi Adobe'], ['Minion Pro', 'programmi Adobe'],
        ['Fira Code', 'strumenti da programmatore'], ['JetBrains Mono', 'programmi JetBrains'],
        ['Source Code Pro', 'strumenti da programmatore'],
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
            { label: 'Font Trovati', value: `${trovati.length} su ${FONT_CANDIDATI.length} cercati` },
            { label: 'Elenco', value: trovati.map(([nome]) => nome).join(', ') || 'Nessuno' },
            { label: 'Indizi Dedotti', value: indizi.join('; ') || 'Nessuno' },
            { label: 'Impronta Font', value: hash(trovati.map(([nome]) => nome).join(',')) }
        ];
    }

    /**
     * Voci di sintesi vocale: l'elenco dipende dal sistema operativo e dai pacchetti di lingua
     * installati. Chrome le carica in ritardo, quindi si aspetta l'evento voiceschanged.
     */
    async function vociSintesi() {
        const synth = window.speechSynthesis;
        if (!synth) {
            return [{ label: 'Sintesi Vocale', value: NON_DISPONIBILE }];
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
        let indizio = 'Nessuno';
        if (/Microsoft/.test(nomi)) {
            indizio = 'Windows';
        } else if (voci.some(v => /com\.apple/.test(v.voiceURI))) {
            indizio = 'macOS o iOS';
        } else if (/espeak/i.test(nomi)) {
            indizio = 'Linux';
        }

        return [
            { label: 'Voci Installate', value: `${locali.length} sul dispositivo, ${voci.length - locali.length} online` },
            { label: 'Voci del Sistema', value: locali.map(v => v.name).join(', ') || 'Nessuna' },
            { label: 'Lingue delle Voci', value: `${lingue.length}: ${lingue.slice(0, 12).join(', ')}${lingue.length > 12 ? '...' : ''}` },
            { label: 'Indizio sul Sistema', value: indizio },
            { label: 'Impronta Voci', value: voci.length ? hash(voci.map(v => v.voiceURI).join(',')) : NON_DISPONIBILE }
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
                    { label: 'Produttore GPU (WebGPU)', value: info.vendor || NON_DISPONIBILE },
                    { label: 'Architettura GPU (WebGPU)', value: info.architecture || NON_DISPONIBILE },
                    { label: 'Descrizione GPU (WebGPU)', value: info.description || info.device || 'Nascosta dal browser' },
                    { label: 'Funzioni GPU Supportate', value: String(adapter.features.size) },
                    { label: 'Impronta Limiti WebGPU', value: hash(limiti.join(',')) }
                );
            } else {
                items.push({ label: 'WebGPU', value: 'Nessuna scheda video disponibile' });
            }
        } else {
            items.push({ label: 'WebGPU', value: NON_DISPONIBILE });
        }

        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) {
            items.push({ label: 'WebGL Esteso', value: NON_DISPONIBILE });
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
            { label: 'Estensioni WebGL', value: String(estensioni.length) },
            { label: 'Texture Massima', value: `${gl.getParameter(gl.MAX_TEXTURE_SIZE)} px` },
            { label: 'Viewport Massimo', value: viewport ? `${viewport[0]} x ${viewport[1]} px` : NON_DISPONIBILE },
            { label: 'Precisione Shader', value: precisione ? `${precisione.precision} bit` : NON_DISPONIBILE },
            { label: 'Impronta Parametri WebGL', value: hash(parametri.concat(estensioni).join(',')) }
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
        // Primo valore che corrisponde, nell'ordine dato
        function query(caratteristica, valori) {
            const trovato = valori.find(([valore]) => window.matchMedia(`(${caratteristica}: ${valore})`).matches);
            return trovato ? trovato[1] : 'Non rilevabile';
        }
        return [
            { label: 'Tema del Sistema', value: query('prefers-color-scheme', [['dark', 'Scuro'], ['light', 'Chiaro']]) },
            { label: 'Movimento Ridotto', value: query('prefers-reduced-motion', [['reduce', 'Sì'], ['no-preference', 'No']]) },
            { label: 'Contrasto', value: query('prefers-contrast', [['more', 'Alto'], ['less', 'Basso'], ['custom', 'Personalizzato'], ['no-preference', 'Normale']]) },
            { label: 'Colori Forzati', value: query('forced-colors', [['active', 'Sì (contrasto elevato)'], ['none', 'No']]) },
            { label: 'Trasparenza Ridotta', value: query('prefers-reduced-transparency', [['reduce', 'Sì'], ['no-preference', 'No']]) },
            { label: 'Colori Invertiti', value: query('inverted-colors', [['inverted', 'Sì'], ['none', 'No']]) },
            { label: 'Gamma Colori Schermo', value: query('color-gamut', [['rec2020', 'Rec. 2020'], ['p3', 'Display P3'], ['srgb', 'sRGB']]) },
            { label: 'Schermo HDR', value: query('dynamic-range', [['high', 'Sì'], ['standard', 'No']]) },
            { label: 'Puntatore Principale', value: query('pointer', [['fine', 'Mouse o penna'], ['coarse', 'Dito'], ['none', 'Nessuno']]) },
            { label: 'Hover', value: query('hover', [['hover', 'Sì'], ['none', 'No']]) }
        ];
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
            ? 'Probabile (service worker assenti)'
            : 'Non rilevata';
        return [
            { label: 'Quota Concessa al Sito', value: quota ? window.FingerprintUtils.formatBytes(quota) : NON_DISPONIBILE },
            { label: 'Navigazione Privata', value: privata }
        ];
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
            let layout = `Altro (tasto ; = "${pv}")`;
            if (q === 'a') {
                layout = 'AZERTY (francese o belga)';
            } else if (y === 'z') {
                layout = 'QWERTZ (tedesca o dell\'Europa centrale)';
            } else if (pv === 'ò') {
                layout = 'QWERTY italiana';
            } else if (pv === 'ñ') {
                layout = 'QWERTY spagnola';
            } else if (pv === 'ö') {
                layout = 'QWERTY nordica';
            } else if (pv === ';') {
                layout = 'QWERTY inglese (USA o Regno Unito)';
            }
            const campione = ['KeyQ', 'KeyW', 'KeyY', 'KeyZ', 'Semicolon', 'BracketLeft', 'Quote', 'Backquote']
                .map(k => mappa.get(k) || '?').join(' ');
            items.push({ label: 'Layout Tastiera', value: layout }, { label: 'Tasti Campione', value: campione });
        } else {
            items.push({ label: 'Layout Tastiera', value: NON_DISPONIBILE + ' (solo Chrome ed Edge)' });
        }

        const opzioni = Intl.DateTimeFormat().resolvedOptions();
        const ciclo = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
        const coerente = opzioni.locale.split('-')[0] === navigator.language.split('-')[0];
        items.push(
            { label: 'Lingua dei Formati', value: opzioni.locale },
            { label: 'Coerente con la Lingua del Browser', value: coerente ? 'Sì' : 'No: i formati seguono un\'altra lingua' },
            { label: 'Calendario', value: opzioni.calendar },
            { label: 'Sistema Numerico', value: opzioni.numberingSystem },
            { label: 'Orologio', value: ciclo === 'h11' || ciclo === 'h12' ? '12 ore' : '24 ore' },
            { label: 'Data di Esempio', value: new Date(2025, 11, 31).toLocaleDateString() },
            { label: 'Numero di Esempio', value: (1234567.89).toLocaleString() }
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
            { label: 'Impronta Calcoli', value: hash(valori.join(',')) },
            { label: 'Esempio: tan(-1e300)', value: String(valori[0]) },
            { label: 'Emoji Più Recenti Disegnate', value: supportate.length ? `Unicode ${supportate[supportate.length - 1][0]}` : 'Nessuna a colori' },
            { label: 'Impronta Emoji', value: hash(larghezze.concat(larghezzaRiferimento).join(',')) }
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
            { label: 'Più Monitor', value: s.isExtended === undefined ? NON_DISPONIBILE + ' (solo Chrome ed Edge)' : siNo(s.isExtended) },
            { label: 'Spazio Barre di Sistema', value: `${s.width - s.availWidth} x ${s.height - s.availHeight} px` },
            { label: 'Origine Area Disponibile', value: s.availLeft === undefined ? NON_DISPONIBILE : `${s.availLeft}, ${s.availTop}` },
            { label: 'Posizione Finestra', value: `${window.screenX}, ${window.screenY}` },
            { label: 'Dimensione Finestra', value: `${window.outerWidth} x ${window.outerHeight} px` },
            { label: 'Orientamento', value: s.orientation ? s.orientation.type : NON_DISPONIBILE }
        ];
    }

    const RACCOLTE = [
        ['Sistema e Dispositivo (Client Hints)', clientHints],
        ['Font Installati', fontInstallati],
        ['Voci di Sintesi Vocale', vociSintesi],
        ['Scheda Video (WebGPU e WebGL)', schedaVideo],
        ['Preferenze del Sistema', preferenzeSistema],
        ['Spazio del Browser e Navigazione Privata', spazioBrowser],
        ['Tastiera e Formati Regionali', tastieraFormati],
        ['Calcoli ed Emoji', calcoliEmoji],
        ['Schermi e Finestra', schermi]
    ];

    /**
     * Esegue tutte le raccolte in parallelo. Una raccolta che fallisce o supera il tetto di
     * tempo mostra l'esito al posto dei valori, senza bloccare le altre.
     * @returns {Promise<Array<{title: string, items: Array}>>}
     */
    async function collect() {
        return Promise.all(RACCOLTE.map(async ([title, raccogli]) => {
            try {
                const items = await Promise.race([
                    Promise.resolve().then(raccogli),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('tempo scaduto')), LIMITE_MS))
                ]);
                return { title, items };
            } catch (error) {
                window.logger.warn(`[fingerprint-extra] ${title}:`, error);
                return { title, items: [{ label: 'Esito', value: `Non disponibile (${error.message})` }] };
            }
        }));
    }

    window.FingerprintExtra = { collect };
})();
