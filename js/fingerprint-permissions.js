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

    /* Lista protocol handlers da testare (9 applicazioni) */
    const PROTOCOL_HANDLERS = [
        { name: 'Spotify', protocol: 'spotify://' },
        { name: 'Zoom', protocol: 'zoom://' },
        { name: 'Discord', protocol: 'discord://' },
        { name: 'Steam', protocol: 'steam://' },
        { name: 'Slack', protocol: 'slack://' },
        { name: 'Skype', protocol: 'skype://' },
        { name: 'Microsoft Teams', protocol: 'msteams://' },
        { name: 'Telegram', protocol: 'tg://' },
        { name: 'WhatsApp Desktop', protocol: 'whatsapp://' }
    ];

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
        handlePermissionAction: async function(action, button) {
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
                case 'protocol-handlers':
                    await this.requestProtocolHandlers();
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
                button.textContent = 'Richiesta in corso...';
                resultContainer.innerHTML = '<p>Richiesta permesso geolocalizzazione ad alta precisione...</p>';

                if (!FingerprintUtils.isAPISupported('geolocation')) {
                    throw new Error('Geolocation API non supportata');
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
                resultContainer.innerHTML = `<p class="error">Errore: ${FingerprintUtils.escapeHtml(error.message)}</p>`;
                button.disabled = false;
                button.textContent = 'Richiedi Posizione GPS';
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
                <h4>Posizione Rilevata</h4>
                <dl>
                    <dt>Coordinate:</dt>
                    <dd>${FingerprintUtils.formatCoordinates(latitude, longitude)}</dd>
                    <dt>Accuratezza:</dt>
                    <dd>${accuracy.toFixed(0)} metri ${PermissionsManager.getAccuracyQuality(accuracy)}</dd>
                    <dt>Altitudine:</dt>
                    <dd>${altitude ? `${altitude.toFixed(1)} m` : 'Non disponibile'}</dd>
                    <dt>Timestamp:</dt>
                    <dd>${FingerprintUtils.formatTimestamp(new Date(position.timestamp))}</dd>
                </dl>
                <p><em>Recupero indirizzo...</em></p>
            `;

            // Reverse geocoding per ottenere indirizzo
            try {
                const address = await PermissionsManager.reverseGeocode(latitude, longitude);
                
                // Aggiorna con indirizzo completo
                let addressHtml = '<h4>Indirizzo Stimato</h4><dl>';
                
                if (address.road) {
                    addressHtml += `<dt>Via:</dt><dd>${FingerprintUtils.escapeHtml(address.road)}</dd>`;
                }
                
                if (address.postcode) {
                    addressHtml += `<dt>CAP:</dt><dd>${FingerprintUtils.escapeHtml(address.postcode)}</dd>`;
                }
                
                if (address.city || address.town || address.village) {
                    const cityName = address.city || address.town || address.village;
                    addressHtml += `<dt>Città:</dt><dd>${FingerprintUtils.escapeHtml(cityName)}</dd>`;
                }
                
                if (address.municipality && address.municipality !== (address.city || address.town)) {
                    addressHtml += `<dt>Comune:</dt><dd>${FingerprintUtils.escapeHtml(address.municipality)}</dd>`;
                }
                
                if (address.county) {
                    addressHtml += `<dt>Provincia:</dt><dd>${FingerprintUtils.escapeHtml(address.county)}</dd>`;
                }
                
                if (address.state) {
                    addressHtml += `<dt>Regione:</dt><dd>${FingerprintUtils.escapeHtml(address.state)}</dd>`;
                }
                
                if (address.country) {
                    addressHtml += `<dt>Nazione:</dt><dd>${FingerprintUtils.escapeHtml(address.country)}</dd>`;
                }
                
                addressHtml += '</dl>';
                
                // Aggiungi indirizzo dopo le coordinate
                const currentContent = container.innerHTML.replace('<p><em>Recupero indirizzo...</em></p>', '');
                container.innerHTML = currentContent + addressHtml;
                
            } catch (geocodeError) {
                logger.warn('[fingerprint-permissions] Reverse geocoding fallito:', geocodeError);
                const currentContent = container.innerHTML.replace('<p><em>Recupero indirizzo...</em></p>', 
                    '<p><em>Impossibile recuperare indirizzo (servizio temporaneamente non disponibile)</em></p>');
                container.innerHTML = currentContent;
            }

            button.textContent = 'Posizione Ottenuta';
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
            if (accuracy < 50) return '🟢 (Ottima - GPS)';
            if (accuracy < 500) return '🟡 (Buona - WiFi)';
            if (accuracy < 5000) return '🟠 (Media - Triangolazione)';
            return '🔴 (Bassa - IP/Rete)';
        },

        /**
         * Gestisce errore geolocation
         */
        handleGeolocationError: function(error, container, button) {
            const errorMessages = {
                1: 'Permesso negato dall\'utente',
                2: 'Posizione non disponibile',
                3: 'Timeout richiesta posizione'
            };

            const message = errorMessages[error.code] || 'Errore sconosciuto';
            container.innerHTML = `<p class="error">Errore: ${FingerprintUtils.escapeHtml(message)}</p>`;
            
            button.disabled = false;
            button.textContent = 'Riprova';

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
                button.textContent = 'Richiesta in corso...';
                resultContainer.innerHTML = '<p>Richiesta permessi camera e microfono...</p>';

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
                            <strong>Nessun Dispositivo Trovato</strong>
                            <p>Il sistema non ha rilevato telecamere o microfoni.</p>
                        </div>
                    `;
                } else {
                    resultContainer.innerHTML = `<p class="error">Errore: ${FingerprintUtils.escapeHtml(error.message)}</p>`;
                }
                
                button.disabled = false;
                button.textContent = 'Riprova';
            }
        },

        /**
         * Visualizza dispositivi multimediali dettagliati
         */
        displayDetailedDevices: function(devices, container, button) {
            const videoInputs = devices.filter(d => d.kind === 'videoinput');
            const audioInputs = devices.filter(d => d.kind === 'audioinput');
            const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

            let html = '<h4>Dispositivi Rilevati</h4>';

            if (videoInputs.length > 0) {
                html += '<h5>Telecamere</h5><ul>';
                videoInputs.forEach((device, i) => {
                    html += `<li>${FingerprintUtils.escapeHtml(device.label || `Telecamera ${i + 1}`)}</li>`;
                });
                html += '</ul>';
            }

            if (audioInputs.length > 0) {
                html += '<h5>Microfoni</h5><ul>';
                audioInputs.forEach((device, i) => {
                    html += `<li>${FingerprintUtils.escapeHtml(device.label || `Microfono ${i + 1}`)}</li>`;
                });
                html += '</ul>';
            }

            if (audioOutputs.length > 0) {
                html += '<h5>Altoparlanti</h5><ul>';
                audioOutputs.forEach((device, i) => {
                    html += `<li>${FingerprintUtils.escapeHtml(device.label || `Altoparlante ${i + 1}`)}</li>`;
                });
                html += '</ul>';
            }

            container.innerHTML = html;
            button.textContent = 'Dispositivi Ottenuti';
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
                    errorMsg.textContent = 'Impossibile catturare snapshot: ' + error.message;
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
                resultContainer.innerHTML = '<p class="error">Lettura degli appunti non supportata da questo browser</p>';
                return;
            }

            try {
                button.disabled = true;
                button.textContent = 'Lettura in corso...';
                const testo = await navigator.clipboard.readText();
                resultContainer.innerHTML = testo
                    ? `<h4>Testo negli Appunti</h4><pre class="clipboard-text">${FingerprintUtils.escapeHtml(testo)}</pre>`
                    : '<p>Gli appunti sono vuoti o contengono solo un\'immagine.</p>';
                button.textContent = 'Leggi di Nuovo';
                button.classList.add('success');
            } catch (error) {
                logger.warn('[fingerprint-permissions] Lettura appunti fallita:', error.name);
                const messaggio = error.name === 'NotAllowedError' ? 'Permesso negato' : error.message;
                resultContainer.innerHTML = `<p class="error">Errore: ${FingerprintUtils.escapeHtml(messaggio)}</p>`;
                button.textContent = 'Riprova';
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
                button.textContent = 'Attivazione sensori...';

                if (typeof DeviceMotionEvent.requestPermission === 'function') {
                    const permission = await DeviceMotionEvent.requestPermission();
                    if (permission !== 'granted') {
                        throw new Error('Permesso sensori negato');
                    }
                }

                PermissionsManager.startMotionTracking(resultContainer, button);

            } catch (error) {
                logger.error('[fingerprint-permissions] Errore motion sensors:', error);
                resultContainer.innerHTML = `<p class="error">Errore: ${FingerprintUtils.escapeHtml(error.message)}</p>`;
                button.disabled = false;
                button.textContent = 'Riprova';
            }
        },

        /**
         * Avvia tracking movimento in tempo reale
         */
        startMotionTracking: function(container, button) {
            container.innerHTML = `
                <h4>Sensori Attivi</h4>
                <dl>
                    <dt>Orientamento Alpha:</dt>
                    <dd id="motion-alpha">In attesa...</dd>
                    <dt>Orientamento Beta:</dt>
                    <dd id="motion-beta">In attesa...</dd>
                    <dt>Orientamento Gamma:</dt>
                    <dd id="motion-gamma">In attesa...</dd>
                    <dt>Accelerazione X:</dt>
                    <dd id="motion-accel-x">In attesa...</dd>
                    <dt>Accelerazione Y:</dt>
                    <dd id="motion-accel-y">In attesa...</dd>
                    <dt>Accelerazione Z:</dt>
                    <dd id="motion-accel-z">In attesa...</dd>
                </dl>
                <button type="button" id="stop-motion-tracking">Interrompi Tracking</button>
                <p><strong>Nota:</strong> Visualizzazione 3D con Three.js in sviluppo</p>
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
                container.innerHTML = '<p>Tracking interrotto</p>';
                button.disabled = false;
                button.textContent = 'Riattiva Sensori';
            });

            button.textContent = 'Sensori Attivi';
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
                button.textContent = 'Richiesta in corso...';

                // Verifica supporto API (non disponibile su mobile)
                if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
                    throw new Error('Screen Capture non supportata su questo dispositivo (solo desktop)');
                }

                const stream = await navigator.mediaDevices.getDisplayMedia({ 
                    video: { cursor: 'always' },
                    audio: false
                });

                PermissionsManager.displayScreenCapture(stream, resultContainer, button);

            } catch (error) {
                logger.error('[fingerprint-permissions] Errore screen capture:', error);
                
                let errorMessage = error.message;
                if (error.name === 'NotAllowedError') {
                    errorMessage = 'Permesso negato o condivisione annullata';
                }
                
                resultContainer.innerHTML = `<p class="error">Errore: ${FingerprintUtils.escapeHtml(errorMessage)}</p>`;
                button.disabled = false;
                button.textContent = 'Riprova';
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
            stopButton.textContent = 'Interrompi Condivisione';
            stopButton.type = 'button';
            stopButton.style.marginTop = '10px';

            stopButton.addEventListener('click', () => {
                stream.getTracks().forEach(track => track.stop());
                container.innerHTML = '<p>Condivisione schermo interrotta</p>';
                button.disabled = false;
                button.textContent = 'Riavvia Condivisione';
            });

            container.innerHTML = '<h4>Anteprima Screen Capture</h4><div class="fp-warning"><strong>Attenzione:</strong> Stai condividendo il tuo schermo. Tutto ciò che è visibile può essere registrato.</div>';
            container.appendChild(video);
            container.appendChild(stopButton);

            button.textContent = 'Condivisione Attiva';
            button.classList.add('success');

            logger.log('[fingerprint-permissions] Screen capture avviato');
        },

        /**
         * Testa singolo protocol handler tramite tecnica blur detection
         * Crea un link invisibile e verifica se il browser perde focus (app trovata)
         * o se scade il timeout (app non installata/non rilevabile)
         * @param {string} protocol - URI scheme da testare (es. 'spotify://')
         * @param {number} timeout - Timeout in ms prima di dichiarare non trovato
         * @returns {Promise<boolean>} True se l'app risponde al protocollo
         */
        testProtocolHandler: async function(protocol, timeout = 2000) {
            return new Promise((resolve) => {
                let resolved = false;
                let timer;
                
                const blurHandler = () => {
                    if (!resolved) {
                        resolved = true;
                        window.removeEventListener('blur', blurHandler);
                        clearTimeout(timer);
                        resolve(true);
                    }
                };
                
                timer = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        window.removeEventListener('blur', blurHandler);
                        resolve(false);
                    }
                }, timeout);
                
                window.addEventListener('blur', blurHandler);
                
                try {
                    const link = document.createElement('a');
                    link.href = protocol;
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                } catch (error) {
                    logger.log('fingerprint-permissions Errore test protocol:', protocol, error);
                    if (!resolved) {
                        resolved = true;
                        window.removeEventListener('blur', blurHandler);
                        clearTimeout(timer);
                        resolve(false);
                    }
                }
            });
        },

        /**
         * Testa tutti i protocol handlers sequenzialmente
         * Intervallo di 500ms tra un test e l'altro per evitare conflitti di blur detection
         */
        requestProtocolHandlers: async function() {
            const resultContainer = document.getElementById('protocol-handlers-result');
            const button = document.querySelector('[data-permission-action="protocol-handlers"]');
            
            if (!resultContainer) return;
            
            if (button) {
                button.disabled = true;
                button.textContent = 'Test in corso...';
            }
            
            logger.log('[fingerprint-permissions] Avvio Protocol Handlers Detection...');
            
            resultContainer.innerHTML = `
                <p><strong>Avviso:</strong> Questa tecnica genererà popup di conferma per ogni app testata.</p>
                <p>Test in corso su ${PROTOCOL_HANDLERS.length} applicazioni...</p>
            `;
            
            const results = [];
            
            for (const handler of PROTOCOL_HANDLERS) {
                logger.log(`[fingerprint-permissions] Test ${handler.name} (${handler.protocol})...`);
                
                const isInstalled = await PermissionsManager.testProtocolHandler(handler.protocol);
                
                results.push({
                    name: handler.name,
                    protocol: handler.protocol,
                    installed: isInstalled
                });
                
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            const installedCount = results.filter(r => r.installed).length;
            
            let html = `<h4>Risultati Protocol Handlers (${installedCount}/${PROTOCOL_HANDLERS.length} rilevate)</h4><ul>`;
            
            for (const result of results) {
                const icon = result.installed ? '✓' : '✗';
                const status = result.installed ? 'Installata' : 'Non rilevata';
                html += `<li>${icon} <strong>${result.name}</strong> (${result.protocol}): ${status}</li>`;
            }
            
            html += `</ul>`;
            
            if (installedCount === 0) {
                html += `<p class="fp-info"><strong>Nota:</strong> Nessuna app rilevata. Questo può significare che non sono installate o che il browser blocca la tecnica per privacy.</p>`;
            }
            
            resultContainer.innerHTML = html;
            
            if (button) {
                button.disabled = false;
                button.textContent = 'Riprova Test';
                button.classList.add('success');
            }
            
            logger.log('[fingerprint-permissions] Protocol Handlers Detection completata:', results);
        }



    };


    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => PermissionsManager.init());
    } else {
        PermissionsManager.init();
    }

})();