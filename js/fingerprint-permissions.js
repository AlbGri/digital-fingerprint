/**
 * File: fingerprint-permissions.js
 * Author: AlbGri
 * Copyright: (c) 2025 Alberto G. - Licensed under AGPL-3.0
 * Created: 2025-10-27
 * Description: Gestione feature avanzate che richiedono permessi utente
 *              - Geolocation con mappa
 *              - Media Devices dettagliati
 *              - Motion/Orientation live
 *              - Screen Capture demo
 */

(function() {
    'use strict';

    const t = window.I18n.t;
    const esc = FingerprintUtils.escapeHtml;

    // La chiave resta in data-i18n: dopo un cambio di lingua il pulsante dice lo stato attuale
    function etichetta(button, chiave) {
        button.dataset.i18n = chiave;
        button.textContent = t(chiave);
    }

    function erroreHtml(messaggio) {
        return `<p class="error">${esc(t('permessi.errore', { messaggio: messaggio }))}</p>`;
    }

    const PermissionsManager = {
        
        /**
         * Inizializza gestione permessi e event listeners
         */
        init: function() {
            logger.log('[fingerprint-permissions] Inizializzazione');
            
            this.setupEventListeners();
            this.checkExistingPermissions();
        },

        /**
         * Setup event listeners per pulsanti permessi
         */
        setupEventListeners: function() {
            const toggleButton = document.getElementById('advanced-permissions-toggle');
            if (toggleButton) {
                toggleButton.addEventListener('click', () => PermissionsManager.toggleAdvancedSection());
            }

            document.addEventListener('click', (e) => {
                if (e.target.matches('[data-permission-action]')) {
                    const action = e.target.dataset.permissionAction;
                    this.handlePermissionAction(action, e.target);
                }
            });
        },

        /**
         * Mostra o nasconde sezione analisi avanzata
         * Usa classList per manipolare visibilita rispettando CSP
         * La classe 'visible' e definita in styles.css
         * Aggiorna anche attributo aria-expanded per accessibilita
         */
        toggleAdvancedSection: function() {
            const section = document.getElementById('advanced-permissions-section');
            const button = document.getElementById('advanced-permissions-toggle');
            
            // Verifica esistenza elemento nel DOM
            if (!section) {
                logger.warn('[fingerprint-permissions] Elemento #advanced-permissions-section non trovato');
                return;
            }

            // Determina stato corrente prima del toggle
            // Se NON ha classe 'visible' significa che e nascosto
            const isCurrentlyHidden = !section.classList.contains('visible');
            
            // Toggle classe CSS invece di manipolare style.display
            // Rispetta CSP evitando inline styles
            section.classList.toggle('visible');
            
            // Aggiorna attributo ARIA per screen reader e accessibilita
            if (button) {
                button.setAttribute('aria-expanded', isCurrentlyHidden);
            }

            logger.log('[fingerprint-permissions] Sezione avanzata toggled. Ora visibile:', isCurrentlyHidden);
        },

        /**
         * Gestisce click su pulsanti azione permessi
         */
        handlePermissionAction: function(action, button) {
            logger.log('[fingerprint-permissions] Azione richiesta:', action);

            switch(action) {
                case 'geolocation':
                    this.requestGeolocation(button);
                    break;
                case 'media-devices':
                    this.requestDetailedMediaDevices(button);
                    break;
                case 'motion-sensors':
                    this.requestMotionSensors(button);
                    break;
                case 'screen-capture':
                    this.requestScreenCapture(button);
                    break;
                case 'clipboard-read':
                    this.requestClipboard(button);
                    break;
                default:
                    logger.warn('[fingerprint-permissions] Azione non riconosciuta:', action);
            }
        },

        /**
         * Verifica permessi gia concessi
         */
        checkExistingPermissions: function() {
            if ('permissions' in navigator) {
                const permissionsToCheck = ['geolocation'];
                
                permissionsToCheck.forEach(async (perm) => {
                    try {
                        const result = await navigator.permissions.query({ name: perm });
                        logger.log(`[fingerprint-permissions] Permesso ${perm}:`, result.state);
                    } catch (error) {
                        logger.warn(`[fingerprint-permissions] Impossibile verificare permesso ${perm}`);
                    }
                });
            }
        },

        /**
         * Feature 1: Geolocation con mappa interattiva e reverse geocoding
         */
        requestGeolocation: async function(button) {
            const resultContainer = button.closest('.permission-card').querySelector('.permission-result');
            if (!resultContainer) return;

            try {
                button.disabled = true;
                etichetta(button, 'permessi.stato.richiesta');
                resultContainer.innerHTML = `<p>${esc(t('permessi.geo.attesa'))}</p>`;

                if (!FingerprintUtils.isAPISupported('geolocation')) {
                    throw new Error(t('permessi.nonSupportata'));
                }

                // Opzioni ottimizzate per massima precisione
                navigator.geolocation.getCurrentPosition(
                    (position) => PermissionsManager.handleGeolocationSuccess(position, resultContainer, button),
                    (error) => PermissionsManager.handleGeolocationError(error, resultContainer, button),
                    {
                        enableHighAccuracy: true,    // Usa GPS invece di WiFi/IP quando possibile
                        timeout: 15000,              // Aumentato a 15s per dare tempo al GPS
                        maximumAge: 0                // Non usa cache, forza lettura fresca
                    }
                );

            } catch (error) {
                logger.error('[fingerprint-permissions] Errore geolocation:', error);
                resultContainer.innerHTML = erroreHtml(error.message);
                button.disabled = false;
                etichetta(button, 'permessi.geo.pulsante');
            }
        },

        /**
         * Gestisce successo geolocation con reverse geocoding
         * Converte coordinate in indirizzo leggibile usando Nominatim (OpenStreetMap)
         */
        handleGeolocationSuccess: async function(position, container, button) {
            const { latitude, longitude, accuracy, altitude, altitudeAccuracy } = position.coords;

            // Mostra immediatamente i dati tecnici
            container.innerHTML = `
                <h4>${esc(t('permessi.geo.rilevata'))}</h4>
                <dl>
                    <dt>${esc(t('permessi.geo.coordinate'))}</dt>
                    <dd>${esc(FingerprintUtils.formatCoordinates(latitude, longitude))}</dd>
                    <dt>${esc(t('permessi.geo.accuratezza'))}</dt>
                    <dd>${esc(t('permessi.geo.metri', { n: accuracy.toFixed(0) }))} ${esc(PermissionsManager.getAccuracyQuality(accuracy))}</dd>
                    <dt>${esc(t('permessi.geo.altitudine'))}</dt>
                    <dd>${altitude ? `${altitude.toFixed(1)} m` : esc(t('valore.nonDisponibile'))}</dd>
                    <dt>${esc(t('permessi.geo.ora'))}</dt>
                    <dd>${esc(FingerprintUtils.formatTimestamp(new Date(position.timestamp)))}</dd>
                </dl>
                <p class="geo-attesa"><em>${esc(t('permessi.geo.recupero'))}</em></p>
            `;
            const attesa = container.querySelector('.geo-attesa');

            // Reverse geocoding per ottenere indirizzo
            try {
                const address = await PermissionsManager.reverseGeocode(latitude, longitude);
                const cityName = address.city || address.town || address.village;
                const righe = [
                    ['via', address.road],
                    ['cap', address.postcode],
                    ['citta', cityName],
                    ['comune', address.municipality !== (address.city || address.town) ? address.municipality : null],
                    ['provincia', address.county],
                    ['regione', address.state],
                    ['nazione', address.country]
                ].filter(([, valore]) => valore);

                attesa.outerHTML = `<h4>${esc(t('permessi.geo.indirizzo'))}</h4><dl>`
                    + righe.map(([voce, valore]) => `<dt>${esc(t(`permessi.geo.${voce}`))}</dt><dd>${esc(valore)}</dd>`).join('')
                    + '</dl>';
            } catch (geocodeError) {
                logger.warn('[fingerprint-permissions] Reverse geocoding fallito:', geocodeError);
                attesa.innerHTML = `<em>${esc(t('permessi.geo.indirizzoNonDisponibile'))}</em>`;
            }

            etichetta(button, 'permessi.geo.ottenuta');
            button.classList.add('success');

            logger.log('[fingerprint-permissions] Geolocation successo:', { 
                latitude, 
                longitude, 
                accuracy 
            });
        },

        /**
         * Reverse geocoding usando Nominatim (OpenStreetMap)
         * Converte coordinate GPS in indirizzo leggibile
         * API gratuita, no key richiesta, rate limit: 1 req/sec
         * 
         * @param {number} lat - Latitudine
         * @param {number} lon - Longitudine
         * @returns {Promise<Object>} Oggetto indirizzo con componenti
         */
        reverseGeocode: async function(lat, lon) {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
            
            // La policy di Nominatim chiede che l'applicazione si identifichi. Da una pagina lo fa
            // il Referer: il browser ignora un User-Agent impostato nella fetch, e il meta
            // no-referrer della pagina lo toglierebbe. Per questa sola richiesta si manda
            // almeno l'origine (https://df.albgri.com/), altrimenti Nominatim puo' rispondere 403.
            const response = await fetch(url, { referrerPolicy: 'strict-origin' });
            
            if (!response.ok) {
                throw new Error(`Geocoding HTTP error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.address) {
                throw new Error('Nessun indirizzo trovato per queste coordinate');
            }
            
            return data.address;
        },

        /**
         * Helper: Restituisce indicatore qualità accuratezza
         * 
         * @param {number} accuracy - Accuratezza in metri
         * @returns {string} Emoji indicatore qualità
         */
        getAccuracyQuality: function(accuracy) {
            if (accuracy < 50) return `🟢 (${t('permessi.geo.qualitaGps')})`;
            if (accuracy < 500) return `🟡 (${t('permessi.geo.qualitaWifi')})`;
            if (accuracy < 5000) return `🟠 (${t('permessi.geo.qualitaCelle')})`;
            return `🔴 (${t('permessi.geo.qualitaIp')})`;
        },

        /**
         * Gestisce errore geolocation
         */
        handleGeolocationError: function(error, container, button) {
            const errorMessages = {
                1: 'permessi.negato',
                2: 'permessi.geo.nonDisponibile',
                3: 'permessi.geo.tempoScaduto'
            };

            container.innerHTML = erroreHtml(t(errorMessages[error.code] || 'permessi.erroreSconosciuto'));

            button.disabled = false;
            etichetta(button, 'permessi.stato.riprova');

            logger.warn('[fingerprint-permissions] Geolocation error:', error);
        },

        /**
         * Feature 2: Media Devices dettagliati con nomi
         */
        requestDetailedMediaDevices: async function(button) {
            const resultContainer = button.closest('.permission-card').querySelector('.permission-result');
            if (!resultContainer) return;

            try {
                button.disabled = true;
                etichetta(button, 'permessi.stato.richiesta');
                resultContainer.innerHTML = `<p>${esc(t('permessi.media.attesa'))}</p>`;

                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: true, 
                    audio: true 
                });

                // Enumera dispositivi prima di fermare lo stream
                const devices = await navigator.mediaDevices.enumerateDevices();
                PermissionsManager.displayDetailedDevices(devices, resultContainer, button);

                // Ferma lo stream principale
                stream.getTracks().forEach(track => track.stop());

                // Cattura snapshot fotocamera frontale se stream video era presente
                if (stream.getVideoTracks().length > 0) {
                    PermissionsManager.captureFrontCameraSnapshot(resultContainer);
                }

            } catch (error) {
                logger.warn('[fingerprint-permissions] Media devices non disponibili:', error.name);
                
                if (error.name === 'NotFoundError') {
                    resultContainer.innerHTML = `
                        <div class="fp-warning">
                            <strong>${esc(t('permessi.media.nessuno'))}</strong>
                            <p>${esc(t('permessi.media.nessunoTesto'))}</p>
                        </div>
                    `;
                } else {
                    resultContainer.innerHTML = erroreHtml(error.message);
                }

                button.disabled = false;
                etichetta(button, 'permessi.stato.riprova');
            }
        },

        /**
         * Visualizza dispositivi multimediali dettagliati
         */
        displayDetailedDevices: function(devices, container, button) {
            const videoInputs = devices.filter(d => d.kind === 'videoinput');
            const audioInputs = devices.filter(d => d.kind === 'audioinput');
            const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

            let html = `<h4>${esc(t('permessi.media.rilevati'))}</h4>`;

            // Gruppo con titolo e un nome di riserva numerato per i dispositivi senza nome
            [[videoInputs, 'telecamere', 'telecamera'], [audioInputs, 'microfoni', 'microfono'],
                [audioOutputs, 'altoparlanti', 'altoparlante']].forEach(([elenco, gruppo, singolo]) => {
                if (elenco.length > 0) {
                    html += `<h5>${esc(t(`permessi.media.${gruppo}`))}</h5><ul>`
                        + elenco.map((device, i) => `<li>${esc(device.label || t(`permessi.media.${singolo}`, { n: i + 1 }))}</li>`).join('')
                        + '</ul>';
                }
            });

            container.innerHTML = html;
            etichetta(button, 'permessi.media.ottenuti');
            button.classList.add('success');

            logger.log('[fingerprint-permissions] Media devices dettagliati mostrati');
        },

        /**
         * Cattura una foto dalla fotocamera frontale dopo 3 secondi
         * Utilizzata per dimostrare capacita di accesso alla fotocamera
         * La miniatura viene visualizzata nella card anche quando collassata
         * 
         * @param {HTMLElement} container - Contenitore permission-result
         */
        captureFrontCameraSnapshot: function(container) {
            // Verifica supporto getUserMedia
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                logger.warn('[fingerprint-permissions] getUserMedia non supportato per snapshot');
                return;
            }

            logger.log('[fingerprint-permissions] Avvio cattura snapshot fotocamera frontale tra 3 secondi');

            // Attende 3 secondi prima di scattare la foto
            setTimeout(async () => {
                try {
                    // Richiede accesso alla fotocamera frontale con vincoli specifici
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            facingMode: 'user',
                            width: { ideal: 640 },
                            height: { ideal: 480 }
                        },
                        audio: false
                    });

                    // Crea elemento video temporaneo nascosto per elaborazione frame
                    const video = document.createElement('video');
                    video.srcObject = stream;
                    video.autoplay = true;
                    video.muted = true;
                    video.playsInline = true;

                    // Attende caricamento metadata video per ottenere dimensioni corrette
                    video.addEventListener('loadedmetadata', () => {
                        // Attende un frame valido prima di catturare
                        setTimeout(() => {
                            // Recupera canvas dedicato per la miniatura
                            const canvas = container.closest('.permission-card').querySelector('#camera-snapshot-canvas');
                            const snapshotContainer = container.closest('.permission-card').querySelector('.camera-snapshot-container');

                            if (!canvas || !snapshotContainer) {
                                logger.error('[fingerprint-permissions] Canvas o container snapshot non trovato');
                                stream.getTracks().forEach(track => track.stop());
                                return;
                            }

                            // Configura canvas con dimensioni ridotte per miniatura
                            const context = canvas.getContext('2d');
                            canvas.width = 320;
                            canvas.height = 240;

                            // Disegna frame corrente video sul canvas
                            context.drawImage(video, 0, 0, canvas.width, canvas.height);

                            // Cleanup: ferma stream fotocamera per liberare risorse
                            stream.getTracks().forEach(track => track.stop());

                            // Mostra contenitore miniatura rimuovendo classe hidden
                            snapshotContainer.classList.remove('hidden');

                            logger.log('[fingerprint-permissions] Snapshot fotocamera frontale catturato e visualizzato');
                        }, 500);
                    });

                } catch (error) {
                    logger.error('[fingerprint-permissions] Errore cattura snapshot fotocamera:', error);
                    
                    // Notifica utente in caso di errore usando classe CSS
                    const errorMsg = document.createElement('p');
                    errorMsg.textContent = t('permessi.media.fotoErrore', { messaggio: error.message });
                    errorMsg.className = 'error';
                    container.appendChild(errorMsg);
                }
            }, 1000);
        },

        /**
         * Lettura degli appunti: con un solo permesso la pagina legge l'ultimo testo copiato,
         * da qualsiasi programma. Il testo resta nella pagina, come tutto il resto.
         */
        requestClipboard: async function(button) {
            const resultContainer = button.closest('.permission-card').querySelector('.permission-result');
            if (!resultContainer) {
                return;
            }
            if (!navigator.clipboard || !navigator.clipboard.readText) {
                resultContainer.innerHTML = `<p class="error">${esc(t('permessi.nonSupportata'))}</p>`;
                return;
            }

            try {
                button.disabled = true;
                etichetta(button, 'permessi.appunti.lettura');
                const testo = await navigator.clipboard.readText();
                resultContainer.innerHTML = testo
                    ? `<h4>${esc(t('permessi.appunti.testoLetto'))}</h4><pre class="clipboard-text">${esc(testo)}</pre>`
                    : `<p>${esc(t('permessi.appunti.vuoti'))}</p>`;
                etichetta(button, 'permessi.appunti.ancora');
                button.classList.add('success');
            } catch (error) {
                logger.warn('[fingerprint-permissions] Lettura appunti fallita:', error.name);
                resultContainer.innerHTML = erroreHtml(error.name === 'NotAllowedError' ? t('permessi.negato') : error.message);
                etichetta(button, 'permessi.stato.riprova');
            } finally {
                button.disabled = false;
            }
        },

        /**
         * Feature 3: Motion/Orientation sensors live
         */
        requestMotionSensors: async function(button) {
            const resultContainer = button.closest('.permission-card').querySelector('.permission-result');
            if (!resultContainer) return;

            try {
                button.disabled = true;
                etichetta(button, 'permessi.sensori.attivazione');

                if (typeof DeviceMotionEvent.requestPermission === 'function') {
                    const permission = await DeviceMotionEvent.requestPermission();
                    if (permission !== 'granted') {
                        throw new Error(t('permessi.negato'));
                    }
                }

                PermissionsManager.startMotionTracking(resultContainer, button);

            } catch (error) {
                logger.error('[fingerprint-permissions] Errore motion sensors:', error);
                resultContainer.innerHTML = erroreHtml(error.message);
                button.disabled = false;
                etichetta(button, 'permessi.stato.riprova');
            }
        },

        /**
         * Avvia tracking movimento in tempo reale
         */
        startMotionTracking: function(container, button) {
            const attesa = esc(t('permessi.sensori.attesa'));
            const riga = (voce, id) => `<dt>${esc(t(`permessi.sensori.${voce}`))}</dt><dd id="${id}">${attesa}</dd>`;
            container.innerHTML = `
                <h4>${esc(t('permessi.sensori.attivi'))}</h4>
                <dl>
                    ${riga('alpha', 'motion-alpha')}
                    ${riga('beta', 'motion-beta')}
                    ${riga('gamma', 'motion-gamma')}
                    ${riga('accelX', 'motion-accel-x')}
                    ${riga('accelY', 'motion-accel-y')}
                    ${riga('accelZ', 'motion-accel-z')}
                </dl>
                <button type="button" id="stop-motion-tracking">${esc(t('permessi.sensori.interrompi'))}</button>
            `;

            const orientationHandler = (event) => {
                document.getElementById('motion-alpha').textContent = `${event.alpha?.toFixed(2) || 'N/A'}°`;
                document.getElementById('motion-beta').textContent = `${event.beta?.toFixed(2) || 'N/A'}°`;
                document.getElementById('motion-gamma').textContent = `${event.gamma?.toFixed(2) || 'N/A'}°`;
            };

            const motionHandler = (event) => {
                if (event.acceleration) {
                    document.getElementById('motion-accel-x').textContent = `${event.acceleration.x?.toFixed(2) || 'N/A'} m/s²`;
                    document.getElementById('motion-accel-y').textContent = `${event.acceleration.y?.toFixed(2) || 'N/A'} m/s²`;
                    document.getElementById('motion-accel-z').textContent = `${event.acceleration.z?.toFixed(2) || 'N/A'} m/s²`;
                }
            };

            window.addEventListener('deviceorientation', orientationHandler);
            window.addEventListener('devicemotion', motionHandler);

            const stopButton = document.getElementById('stop-motion-tracking');
            stopButton.addEventListener('click', () => {
                window.removeEventListener('deviceorientation', orientationHandler);
                window.removeEventListener('devicemotion', motionHandler);
                container.innerHTML = `<p>${esc(t('permessi.sensori.interrotto'))}</p>`;
                button.disabled = false;
                etichetta(button, 'permessi.sensori.riattiva');
            });

            etichetta(button, 'permessi.sensori.attivi');
            button.classList.add('success');

            logger.log('[fingerprint-permissions] Motion tracking avviato');
        },

        /**
         * Feature 4: Screen Capture demo
         */
        requestScreenCapture: async function(button) {
            const resultContainer = button.closest('.permission-card').querySelector('.permission-result');
            if (!resultContainer) return;

            try {
                button.disabled = true;
                etichetta(button, 'permessi.stato.richiesta');

                // Verifica supporto API (non disponibile su mobile)
                if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
                    throw new Error(t('permessi.schermo.soloComputer'));
                }

                const stream = await navigator.mediaDevices.getDisplayMedia({ 
                    video: { cursor: 'always' },
                    audio: false
                });

                PermissionsManager.displayScreenCapture(stream, resultContainer, button);

            } catch (error) {
                logger.error('[fingerprint-permissions] Errore screen capture:', error);
                
                resultContainer.innerHTML = erroreHtml(error.name === 'NotAllowedError' ? t('permessi.schermo.annullata') : error.message);
                button.disabled = false;
                etichetta(button, 'permessi.stato.riprova');
            }
        },

        /**
         * Visualizza stream screen capture
         */
        displayScreenCapture: function(stream, container, button) {
            const video = document.createElement('video');
            video.srcObject = stream;
            video.autoplay = true;
            video.style.maxWidth = '100%';
            video.style.border = '2px solid var(--color-error)';

            const stopButton = document.createElement('button');
            stopButton.textContent = t('permessi.schermo.interrompi');
            stopButton.type = 'button';
            stopButton.style.marginTop = '10px';

            stopButton.addEventListener('click', () => {
                stream.getTracks().forEach(track => track.stop());
                container.innerHTML = `<p>${esc(t('permessi.schermo.interrotta'))}</p>`;
                button.disabled = false;
                etichetta(button, 'permessi.schermo.riavvia');
            });

            container.innerHTML = `<h4>${esc(t('permessi.schermo.anteprima'))}</h4>`
                + `<div class="fp-warning"><strong>${esc(t('permessi.schermo.attenzione'))}</strong> ${esc(t('permessi.schermo.avviso'))}</div>`;
            container.appendChild(video);
            container.appendChild(stopButton);

            etichetta(button, 'permessi.schermo.attiva');
            button.classList.add('success');

            logger.log('[fingerprint-permissions] Screen capture avviato');
        }
    };


    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => PermissionsManager.init());
    } else {
        PermissionsManager.init();
    }

})();