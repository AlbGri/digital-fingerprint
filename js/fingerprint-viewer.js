/**
 * File: fingerprint-viewer.js
 * Author: AlbGri
 * Copyright: (c) 2025 Alberto G. - Licensed under AGPL-3.0
 * Created: 2025-10-26
 * Description: Raccolta e visualizzazione impronta digitale del browser
 */

(function() {
    'use strict';

    const CONFIG = {
        storageKey: 'fingerprint-data',
        batteryStorageKey: 'first-battery-reading',
        apiIpify: 'https://api64.ipify.org?format=json',
        cacheExpiration: 3600000,
        stunServers: [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302'
        ],
        webrtcTimeout: 5000,
        audioTimeout: 1000,
        behaviorTrackingDuration: 10000,
        behaviorSampleLimit: 100,
        batteryDelay: 3000,
        trackingHistoryPrefix: 'tracking-history-',
        maxHistoryEntries: 10
    };

    let cachedFingerprint = null;

    /**
     * Raccoglie informazioni base del browser
     */
    function collectBasicInfo() {
        return {
            userAgent: navigator.userAgent,
            language: navigator.language,
            languages: navigator.languages ? navigator.languages.join(', ') : navigator.language,
            platform: navigator.platform,
            screenResolution: `${screen.width}x${screen.height}`,
            colorDepth: `${screen.colorDepth}-bit`,
            pixelRatio: window.devicePixelRatio || 1,
            doNotTrack: navigator.doNotTrack || 'non specificato',
            cookiesEnabled: navigator.cookieEnabled,
            hardwareConcurrency: navigator.hardwareConcurrency || 'non disponibile',
            maxTouchPoints: navigator.maxTouchPoints || 0,
            online: navigator.onLine,
            connectionType: getConnectionType(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            timezoneOffset: new Date().getTimezoneOffset(),
            localStorage: checkStorageAvailable('localStorage'),
            sessionStorage: checkStorageAvailable('sessionStorage'),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Ottiene tipo di connessione se disponibile
     */
    function getConnectionType() {
        if (navigator.connection) {
            return navigator.connection.effectiveType || 'non disponibile';
        }
        return 'non disponibile';
    }

    /**
     * Raccoglie informazioni dettagliate Network Information API
     * @returns {Object} Dati di rete o fallback
     */
    function getNetworkInformation() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        
    if (!connection) {
        // Rileva browser specifico per messaggio accurato
        const ua = navigator.userAgent;
        let reason = 'Non supportato';
        
        // Rileva iOS (qualsiasi browser)
        if (/iPhone|iPad|iPod/i.test(ua)) {
        reason = 'Non supportato (iOS)';
        }
        // Rileva Firefox (Desktop e Mobile)
        else if (/Firefox/i.test(ua)) {
        reason = 'Non supportato (Firefox)';
        }
        // Rileva Safari Desktop (non iOS)
        else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
        reason = 'Non supportato (Safari)';
        }
        // Rileva Edge Legacy (pre-Chromium)
        else if (/Edge\//i.test(ua)) {
        reason = 'Non supportato (Edge Legacy)';
        }
        // Rileva Opera Mini
        else if (/Opera Mini/i.test(ua)) {
        reason = 'Non supportato (Opera Mini)';
        }
        // Rileva IE11
        else if (/Trident/i.test(ua)) {
        reason = 'Non supportato (IE11)';
        }
        // Fallback generico (browser sconosciuti)
        else {
        reason = 'Non supportato (Browser)';
        }
        
        logger.warn('network-info] Network Information API non supportata: ${reason}');
        return {
            effectiveType: reason,
            downlink: reason,
            rtt: reason,
            saveData: reason,
            type: reason,
            supported: false
        };
    }
    
    return {
        effectiveType: connection.effectiveType || 'Non disponibile',
        downlink: connection.downlink !== undefined ? `${connection.downlink} Mbps` : 'Non disponibile',
        rtt: connection.rtt !== undefined ? `${connection.rtt} ms` : 'Non disponibile',
        saveData: connection.saveData ? 'Sì' : 'No',
        type: connection.type || 'Non disponibile',
        supported: true
    };
    }

    /**
     * Verifica disponibilita storage
     */
    function checkStorageAvailable(type) {
        try {
            const storage = window[type];
            const testKey = '__storage_test__';
            storage.setItem(testKey, 'test');
            storage.removeItem(testKey);
            return true;
        } catch(e) {
            return false;
        }
    }

    /**
     * Genera canvas fingerprint base
     */
    function generateCanvasFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 50;
            const ctx = canvas.getContext('2d');

            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('Canvas fingerprint test', 2, 15);
            ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
            ctx.fillText('Canvas fingerprint test', 4, 17);

            const dataURL = canvas.toDataURL();
            return simpleHash(dataURL);
        } catch(e) {
            logger.error('[fingerprint-viewer] Canvas fingerprinting non supportato', e);
            return 'non disponibile';
        }
    }

    /**
     * Hash semplice per canvas fingerprint
     */
    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }

    /**
     * Recupera IP pubblico tramite API esterne
     * I servizi partono insieme e vince il primo che risponde: in sequenza, con 5 s di attesa
     * ciascuno, si poteva aspettare 10 s. L'AbortController interrompe davvero la richiesta
     * scaduta, cosa che un Promise.race da solo non fa.
     *
     * @returns {Promise<string>} IP pubblico o 'Non disponibile' se tutti i servizi falliscono
     */
    async function fetchPublicIP() {
        const ipServices = [
            'https://api64.ipify.org?format=json',
            'https://api.ipify.org?format=json'
        ];

        const richiesta = async (serviceUrl) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 4000);
            try {
                const response = await fetch(serviceUrl, {
                    cache: 'no-cache',
                    headers: { 'Accept': 'application/json' },
                    signal: controller.signal
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                if (!data.ip) {
                    throw new Error('Risposta API senza campo IP');
                }
                return data.ip;
            } catch (error) {
                logger.warn('[fingerprint-viewer] Servizio fallito:', serviceUrl, error.message);
                throw error;
            } finally {
                clearTimeout(timer);
            }
        };

        try {
            const ip = await Promise.any(ipServices.map(richiesta));
            logger.log('[fingerprint-viewer] IP pubblico ricevuto:', ip);
            return ip;
        } catch {
            logger.error('[fingerprint-viewer] Errore: tutti i servizi IP pubblico non disponibili');
            return 'Non disponibile';
        }
    }

    /**
     * Rileva potenziali leak WebRTC con statistiche avanzate
     */
    async function detectWebRTCLeak() {
        return new Promise((resolve) => {
            const ips = {
                local: [],
                public: [],
                advancedStats: null
            };

            if (!window.RTCPeerConnection) {
                logger.warn('[fingerprint-viewer] WebRTC non supportato');
                resolve(ips);
                return;
            }

            let resolved = false;
            let pc = null;  // Dichiarazione anticipata

            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    logger.log('[fingerprint-viewer] WebRTC timeout raggiunto');
                    if (pc) {  // Verifica esistenza
                        pc.close();
                    }
                    resolve(ips);
                }
            }, CONFIG.webrtcTimeout);

            try {
                pc = new RTCPeerConnection({  // Assegnazione invece di dichiarazione
                    iceServers: CONFIG.stunServers.map(url => ({ urls: url }))
                });

                pc.createDataChannel('');

                pc.onicecandidate = (event) => {
                    if (!event || !event.candidate || !event.candidate.candidate) {
                        return;
                    }

                    const candidate = event.candidate.candidate;
                    logger.log('[fingerprint-viewer] ICE Candidate:', candidate);

                    // **AGGIUNTO: Rileva mDNS esplicitamente**
                    const mdnsMatch = /([0-9a-f-]+\.local)/gi.exec(candidate);
                    if (mdnsMatch) {
                        logger.warn('[fingerprint-viewer] mDNS rilevato:', mdnsMatch[1]);
                        if (!ips.local.includes('mDNS')) {
                            ips.local.push('mDNS'); // Aggiungi marker speciale
                        }
                    }

                    // Regex per IPv4 e IPv6 (codice esistente)
                    const ipMatch = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7})/gi.exec(candidate);

                    if (ipMatch && ipMatch[1]) {
                        const ip = ipMatch[1];
                        
                        if (FingerprintUtils.isLocalIP(ip)) {
                            if (!ips.local.includes(ip)) {
                                ips.local.push(ip);
                            }
                        } else {
                            if (!ips.public.includes(ip)) {
                                ips.public.push(ip);
                            }
                        }
                    }
                };

                pc.onicegatheringstatechange = async () => {
                    logger.log('[fingerprint-viewer] ICE Gathering State:', pc.iceGatheringState);
                    
                    if (pc.iceGatheringState === 'complete') {
                        await new Promise(r => setTimeout(r, 500));
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeout);
                            
                            try {
                                const stats = await pc.getStats();
                                const webrtcStats = extractWebRTCStats(stats);
                                ips.advancedStats = webrtcStats;
                                logger.log('[fingerprint-viewer] WebRTC advanced stats raccolte:', webrtcStats);
                            } catch (statsError) {
                                logger.warn('[fingerprint-viewer] Impossibile raccogliere WebRTC stats:', statsError);
                                ips.advancedStats = null;
                            }
                            
                            logger.log('[fingerprint-viewer] WebRTC detection completato. IP trovati:', ips);
                            pc.close();
                            resolve(ips);
                        }
                    }
                };

                pc.createOffer()
                    .then(offer => pc.setLocalDescription(offer))
                    .catch(error => {
                        logger.error('[fingerprint-viewer] Errore createOffer', error);
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeout);
                            pc.close();
                            resolve(ips);
                        }
                    });

            } catch (error) {
                logger.error('[fingerprint-viewer] Errore WebRTC detection', error);
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve(ips);
                }
            }
        });
    }

    /**
     * Estrae statistiche avanzate da oggetto RTCStatsReport
     */
    function extractWebRTCStats(statsReport) {
        const extractedStats = {
            candidateTypes: [],
            protocols: [],
            codecsSupported: [],
            networkType: 'Non disponibile',
            transportProtocol: 'Non disponibile'
        };
        
        try {
            statsReport.forEach((report) => {
                if (report.type === 'candidate-pair') {
                    if (report.state === 'succeeded' || report.nominated) {
                        if (report.transportId && !extractedStats.protocols.includes(report.transportId)) {
                            extractedStats.protocols.push(report.transportId);
                        }
                    }
                }
                
                if (report.type === 'local-candidate') {
                    if (report.candidateType && !extractedStats.candidateTypes.includes(report.candidateType)) {
                        extractedStats.candidateTypes.push(report.candidateType);
                    }
                    
                    if (report.protocol && !extractedStats.protocols.includes(report.protocol)) {
                        extractedStats.protocols.push(report.protocol);
                    }
                    
                    if (report.networkType) {
                        extractedStats.networkType = report.networkType;
                    }
                }
                
                if (report.type === 'codec') {
                    if (report.mimeType) {
                        const codecInfo = `${report.mimeType}`;
                        if (!extractedStats.codecsSupported.includes(codecInfo)) {
                            extractedStats.codecsSupported.push(codecInfo);
                        }
                    }
                }
                
                if (report.type === 'transport') {
                    if (report.selectedCandidatePairId) {
                        extractedStats.transportProtocol = 'Connessione stabilita';
                    }
                }
            });
            
            return {
                candidateTypes: extractedStats.candidateTypes.length > 0 
                    ? extractedStats.candidateTypes.join(', ') 
                    : 'Non rilevato',
                protocols: extractedStats.protocols.length > 0 
                    ? extractedStats.protocols.join(', ').toUpperCase() 
                    : 'Non rilevato',
                codecsCount: extractedStats.codecsSupported.length,
                codecsSample: extractedStats.codecsSupported.slice(0, 3).join(', ') || 'Non rilevato',
                networkType: extractedStats.networkType,
                hasStats: true
            };
            
        } catch (error) {
            logger.error('[fingerprint-viewer] Errore elaborazione WebRTC stats', error);
            return {
                candidateTypes: 'Errore raccolta',
                protocols: 'Errore raccolta',
                codecsCount: 0,
                codecsSample: 'Errore raccolta',
                networkType: 'Errore raccolta',
                hasStats: false
            };
        }
    }

    /**
     * Genera Audio Fingerprint con strategia di caching persistente
     * 
     * Strategia:
     * 1. Controlla cache localStorage (24h validità) per evitare rigenerazioni
     * 2. Se cache valida, restituisce valore salvato (evita loop al refresh)
     * 3. Se non cached, tenta generazione con AudioContext
     * 4. Gestisce autoplay policy con fallback a hash offline
     * 5. Salva risultato in localStorage per utilizzi futuri
     * 
     * @returns {Promise<string>} Hash audio fingerprint o valore fallback
     */
    async function generateAudioFingerprint() {
        // Configurazione cache localStorage
        const STORAGE_KEY = 'fp_audio_cache';
        const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 ore di validità
        
        // Fase 1: Verifica cache esistente in localStorage
        // Questa è la chiave per risolvere il loop al refresh
        try {
            const cached = localStorage.getItem(STORAGE_KEY);
            if (cached) {
                const data = JSON.parse(cached);
                const now = Date.now();
                
                // Verifica se cache ancora valida (< 24 ore)
                if (data.timestamp && (now - data.timestamp) < CACHE_DURATION) {
                    logger.log('[fingerprint-viewer] Uso audio fingerprint da cache localStorage:', data.hash);
                    return data.hash;
                } else {
                    logger.log('[fingerprint-viewer] Cache audio scaduta, rigenero');
                }
            }
        } catch (e) {
            logger.warn('[fingerprint-viewer] Errore lettura cache audio localStorage:', e);
        }
        
        // Fase 2: Cache non disponibile o scaduta, procedi con generazione
        return new Promise(async (resolve) => {
            let resolved = false;
            let context = null;
            
            try {
                // Verifica supporto Web Audio API
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) {
                    logger.warn('[fingerprint-viewer] Web Audio API non supportata');
                    resolve('Non disponibile');
                    return;
                }

                // Crea nuovo AudioContext
                // NOTA: I browser moderni possono bloccare la creazione se non c'è stata
                // interazione utente recente (autoplay policy)
                context = new AudioContext();

                // Gestione Autoplay Policy
                // Resume AudioContext se sospeso per policy di sicurezza del browser
                // Non richiede permessi espliciti, ma necessita interazione utente
                if (context.state === 'suspended') {
                    logger.log('[fingerprint-viewer] AudioContext suspended, tento resume');
                    
                    try {
                        // Tenta resume del context
                        await context.resume();
                        
                        // Attesa breve per permettere al context di cambiare stato
                        await new Promise(r => setTimeout(r, 50));
                        
                        // Verifica se resume ha avuto successo controllando stato effettivo
                        if (context.state === 'suspended') {
                            // Resume fallito: context ancora bloccato (nessuna interazione utente)
                            logger.warn('[fingerprint-viewer] AudioContext rimane suspended dopo resume, uso offline hash');
                            
                            // Genera hash alternativo da proprietà statiche
                            const offlineHash = generateOfflineAudioHash(context);
                            
                            // Salva hash offline in cache per evitare rigenerazioni future
                            try {
                                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                                    hash: offlineHash,
                                    timestamp: Date.now(),
                                    type: 'offline'
                                }));
                                logger.log('[fingerprint-viewer] Hash offline salvato in cache');
                            } catch (e) {
                                logger.warn('[fingerprint-viewer] Impossibile salvare cache:', e);
                            }
                            
                            // Cleanup: chiudi context inutilizzato
                            context.close().catch(() => {});
                            
                            resolve(offlineHash);
                            return;
                        }
                        
                        logger.log('[fingerprint-viewer] AudioContext resumed con successo');
                        
                    } catch (resumeError) {
                        // Resume ha sollevato eccezione (policy restrittiva)
                        logger.warn('[fingerprint-viewer] Impossibile resume AudioContext:', resumeError);
                        
                        // Fallback a hash offline
                        const offlineHash = generateOfflineAudioHash(context);
                        
                        // Salva in cache
                        try {
                            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                                hash: offlineHash,
                                timestamp: Date.now(),
                                type: 'offline'
                            }));
                        } catch (e) {}
                        
                        // Cleanup context
                        context.close().catch(() => {});
                        
                        resolve(offlineHash);
                        return;
                    }
                }

                // AudioContext running: procedi con generazione normale
                
                // Verifica supporto AudioWorklet (API moderna)
                const supportsAudioWorklet = context.audioWorklet !== undefined;

                if (supportsAudioWorklet) {
                    // Usa AudioWorklet (moderno, migliori performance)
                    // Processing eseguito in thread separato, non blocca UI
                    logger.log('[fingerprint-viewer] Usando AudioWorklet per audio fingerprint');
                    
                    await generateWithAudioWorklet(context, (hash) => {
                        if (!resolved) {
                            resolved = true;
                            
                            // Salva hash generato con successo in cache
                            try {
                                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                                    hash: hash,
                                    timestamp: Date.now(),
                                    type: 'worklet'
                                }));
                                logger.log('[fingerprint-viewer] Hash AudioWorklet salvato in cache');
                            } catch (e) {
                                logger.warn('[fingerprint-viewer] Impossibile salvare cache:', e);
                            }
                            
                            resolve(hash);
                        }
                    }, resolved);
                    
                } else {
                    // Fallback a ScriptProcessorNode (deprecato ma compatibile con browser legacy)
                    logger.warn('[fingerprint-viewer] AudioWorklet non supportato, uso ScriptProcessorNode');
                    
                    await generateWithScriptProcessor(context, (hash) => {
                        if (!resolved) {
                            resolved = true;
                            
                            // Salva hash in cache
                            try {
                                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                                    hash: hash,
                                    timestamp: Date.now(),
                                    type: 'scriptprocessor'
                                }));
                                logger.log('[fingerprint-viewer] Hash ScriptProcessor salvato in cache');
                            } catch (e) {
                                logger.warn('[fingerprint-viewer] Impossibile salvare cache:', e);
                            }
                            
                            resolve(hash);
                        }
                    }, resolved);
                }

            } catch (error) {
                // Gestione errori generici durante audio fingerprinting
                if (!resolved) {
                    resolved = true;
                    logger.error('[fingerprint-viewer] Errore critico Audio fingerprinting:', error);
                    
                    // Cleanup finale: chiudi context se ancora aperto
                    try {
                        if (context && context.state !== 'closed') {
                            context.close();
                        }
                    } catch(e) {
                        logger.error('[fingerprint-viewer] Errore chiusura context:', e);
                    }
                    
                    resolve('Non disponibile');
                }
            }
        });
    }

    /**
     * Genera hash audio offline da proprietà statiche AudioContext
     * Usato quando AudioContext è bloccato da autoplay policy
     * Non richiede processing audio, solo lettura proprietà
     * 
     * @param {AudioContext} context - Contesto audio (anche se suspended)
     * @returns {string} Hash basato su configurazione audio hardware
     */
    function generateOfflineAudioHash(context) {
        try {
            // Raccoglie proprietà audio disponibili senza processing
            // Queste proprietà identificano configurazione hardware/browser
            const components = [
                context.sampleRate.toString(),                          // Frequenza campionamento (es. 48000 Hz)
                context.baseLatency ? context.baseLatency.toString() : 'none',  // Latenza base sistema
                context.destination.maxChannelCount.toString(),         // Canali audio massimi
                context.destination.channelCount.toString(),            // Canali audio correnti
                navigator.hardwareConcurrency ? navigator.hardwareConcurrency.toString() : 'unknown',  // CPU cores
                screen.width + 'x' + screen.height                      // Risoluzione schermo (fingerprint aggiuntivo)
            ];
            
            // Combina componenti e genera hash
            const hash = simpleHash(components.join('|'));
            logger.log('[fingerprint-viewer] Offline audio hash generato:', hash);
            return hash;
            
        } catch (error) {
            logger.error('[fingerprint-viewer] Errore generazione offline hash:', error);
            return 'offline-fallback';
        }
    }

    /**
     * Utility: Pulisce cache audio fingerprint da localStorage
     * Utile per debugging o reset completo fingerprint
     * 
     * @returns {boolean} True se cancellazione riuscita
     */
    function clearAudioFingerprintCache() {
        try {
            localStorage.removeItem('fp_audio_cache');
            logger.log('[fingerprint-viewer] Cache audio fingerprint cancellata');
            return true;
        } catch (e) {
            logger.error('[fingerprint-viewer] Errore cancellazione cache audio:', e);
            return false;
        }
    }

    /**
     * Genera fingerprint usando AudioWorklet (approccio moderno)
     * Processing eseguito in thread separato
     * 
     * @param {AudioContext} context - Contesto audio
     * @param {Function} resolve - Promise resolve callback
     * @param {boolean} resolved - Flag per prevenire risoluzioni multiple
     */
    async function generateWithAudioWorklet(context, resolve, resolved) {
        try {
            // Carica modulo AudioWorklet
            await context.audioWorklet.addModule('js/fingerprint-audio.js');
            
            // Crea nodi audio
            const oscillator = context.createOscillator();
            const analyser = context.createAnalyser();
            const workletNode = new AudioWorkletNode(context, 'fingerprint-audio');
            const gainNode = context.createGain();
            
            // Configura gain a 0 per non produrre suono
            gainNode.gain.value = 0;
            
            // Configura oscillatore
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(440, context.currentTime);
            
            // Collega nodi
            oscillator.connect(analyser);
            analyser.connect(workletNode);
            workletNode.connect(gainNode);
            gainNode.connect(context.destination);
            
            // Gestisci messaggi dal worklet
            workletNode.port.onmessage = (event) => {
                if (resolved) return;
                
                if (event.data.type === 'samples') {
                    resolved = true;
                    
                    // Calcola hash dai sample ricevuti
                    const samples = event.data.data;
                    const hash = simpleHash(samples.join(''));
                    
                    // Cleanup
                    cleanupAudioNodes(oscillator, workletNode, gainNode, context);
                    
                    logger.log('[fingerprint-viewer] Audio fingerprint generato (AudioWorklet):', hash);
                    resolve(hash);
                }
            };
            
            // Avvia oscillatore
            oscillator.start(0);
            
            // Timeout come fallback
            setTimeout(() => {
                if (resolved) return;
                resolved = true;
                
                cleanupAudioNodes(oscillator, workletNode, gainNode, context);
                logger.warn('[fingerprint-viewer] Audio fingerprint timeout (AudioWorklet)');
                resolve('Timeout');
            }, CONFIG.audioTimeout);
            
        } catch (error) {
            logger.error('[fingerprint-viewer] Errore AudioWorklet:', error);
            resolve('Errore AudioWorklet');
        }
    }

    /**
     * Genera fingerprint usando ScriptProcessorNode (fallback per browser vecchi)
     * Processing eseguito sul main thread (deprecato ma compatibile)
     * 
     * @param {AudioContext} context - Contesto audio
     * @param {Function} resolve - Promise resolve callback
     * @param {boolean} resolved - Flag per prevenire risoluzioni multiple
     */
    async function generateWithScriptProcessor(context, resolve, resolved) {
        try {
            const oscillator = context.createOscillator();
            const analyser = context.createAnalyser();
            const gainNode = context.createGain();
            const scriptProcessor = context.createScriptProcessor(4096, 1, 1);

            gainNode.gain.value = 0;
            oscillator.type = 'triangle';
            oscillator.connect(analyser);
            analyser.connect(scriptProcessor);
            scriptProcessor.connect(gainNode);
            gainNode.connect(context.destination);

            scriptProcessor.onaudioprocess = function(event) {
                if (resolved) return;
                resolved = true;
                
                const output = event.outputBuffer.getChannelData(0);
                const hash = simpleHash(Array.from(output).join(''));
                
                cleanupAudioNodes(oscillator, scriptProcessor, gainNode, context);
                
                logger.log('[fingerprint-viewer] Audio fingerprint generato (ScriptProcessor):', hash);
                resolve(hash);
            };

            oscillator.start(0);

            setTimeout(() => {
                if (resolved) return;
                resolved = true;
                
                cleanupAudioNodes(oscillator, scriptProcessor, gainNode, context);
                logger.warn('[fingerprint-viewer] Audio fingerprint timeout (ScriptProcessor)');
                resolve('Timeout');
            }, CONFIG.audioTimeout);
            
        } catch (error) {
            logger.error('[fingerprint-viewer] Errore ScriptProcessor:', error);
            resolve('Errore ScriptProcessor');
        }
    }

    /**
     * Cleanup sicuro di nodi audio e context
     * Previene errori InvalidStateError
     * 
     * @param {OscillatorNode} oscillator - Oscillatore da fermare
     * @param {AudioNode} processor - Nodo processore da disconnettere
     * @param {GainNode} gainNode - Nodo gain da disconnettere
     * @param {AudioContext} context - Context da chiudere
     */
    function cleanupAudioNodes(oscillator, processor, gainNode, context) {
        // Stop oscillatore
        try {
            if (oscillator) {
                oscillator.stop();
            }
        } catch(e) {
            logger.warn('[fingerprint-viewer] Oscillatore gia fermato');
        }
        
        // Disconnect processore
        try {
            if (processor) {
                processor.disconnect();
            }
        } catch(e) {
            logger.warn('[fingerprint-viewer] Processore gia disconnesso');
        }
        
        // Disconnect gain
        try {
            if (gainNode) {
                gainNode.disconnect();
            }
        } catch(e) {
            logger.warn('[fingerprint-viewer] Gain gia disconnesso');
        }
        
        // Chiudi context
        try {
            if (context && context.state !== 'closed') {
                context.close();
            }
        } catch(e) {
            logger.warn('[fingerprint-viewer] Context gia chiuso');
        }
    }

    /**
     * Raccoglie informazioni WebGL per fingerprinting
     */
    function getWebGLFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

            if (!gl) {
                return {
                    vendor: 'Non disponibile',
                    renderer: 'Non disponibile',
                    version: 'Non disponibile',
                    shadingLanguageVersion: 'Non disponibile'
                };
            }

            let vendor, renderer;

            // Prova prima estensione deprecata per massimo dettaglio
            try {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
                    renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                }
            } catch (e) {
                // Estensione non disponibile
            }

            // Fallback a costanti standard se necessario
            if (!vendor) vendor = gl.getParameter(gl.VENDOR);
            if (!renderer) renderer = gl.getParameter(gl.RENDERER);
            
            return {
                vendor: vendor,
                renderer: renderer,
                version: gl.getParameter(gl.VERSION),
                shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
            };
        } catch (error) {
            logger.error('[fingerprint-viewer] Errore WebGL fingerprinting', error);
            return {
                vendor: 'Errore',
                renderer: 'Errore',
                version: 'Errore',
                shadingLanguageVersion: 'Errore'
            };
        }
    }

    /**
     * Raccoglie informazioni batteria con timing ritardato e tracking prima visita
     * Chiamata dopo delay per migliore compatibilita mobile
     */
    async function getBatteryInfo() {
        try {
            if (!navigator.getBattery) {
                logger.warn('[fingerprint-viewer] Battery API non supportata');
                return {
                    level: 'Non disponibile',
                    charging: 'Non disponibile',
                    chargingTime: 'Non disponibile',
                    dischargingTime: 'Non disponibile',
                    firstVisit: null
                };
            }
            
            const battery = await navigator.getBattery();
            
            const currentReading = {
                level: `${Math.round(battery.level * 100)}%`,
                charging: battery.charging ? 'In carica' : 'Scarica',
                chargingTime: battery.chargingTime === Infinity ? 'Non in carica' : formatTime(battery.chargingTime),
                dischargingTime: battery.dischargingTime === Infinity ? 'Non disponibile' : formatTime(battery.dischargingTime)
            };
            
            let firstVisit = null;
            try {
                const stored = localStorage.getItem(CONFIG.batteryStorageKey);
                if (stored) {
                    firstVisit = JSON.parse(stored);
                } else {
                    firstVisit = {
                        level: currentReading.level,
                        charging: currentReading.charging,
                        timestamp: new Date().toISOString()
                    };
                    localStorage.setItem(CONFIG.batteryStorageKey, JSON.stringify(firstVisit));
                    logger.log('[fingerprint-viewer] Prima lettura batteria salvata:', firstVisit);
                }
            } catch (storageError) {
                logger.warn('[fingerprint-viewer] Impossibile accedere a localStorage per batteria');
            }
            
            const batteryData = {
                ...currentReading,
                firstVisit: firstVisit
            };
            
            logger.log('[fingerprint-viewer] Battery info raccolte:', batteryData);
            return batteryData;
            
        } catch (error) {
            logger.error('[fingerprint-viewer] Errore raccolta battery info', error);
            return {
                level: 'Errore raccolta dati',
                charging: 'Errore raccolta dati',
                chargingTime: 'Errore raccolta dati',
                dischargingTime: 'Errore raccolta dati',
                firstVisit: null
            };
        }
    }

    /**
     * Formatta tempo in formato leggibile
     */
    function formatTime(seconds) {
        if (!seconds || seconds === Infinity || isNaN(seconds)) {
            return 'Non disponibile';
        }
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    /**
     * Enumera dispositivi multimediali disponibili
     */
    async function getMediaDevices() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
                logger.warn('[fingerprint-viewer] MediaDevices API non supportata');
                return {
                    supported: false,
                    videoInputCount: 'Non disponibile',
                    audioInputCount: 'Non disponibile',
                    audioOutputCount: 'Non disponibile',
                    totalDevices: 'Non disponibile'
                };
            }
            
            const devices = await navigator.mediaDevices.enumerateDevices();
            
            const videoInputDevices = devices.filter(device => device.kind === 'videoinput');
            const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
            const audioOutputDevices = devices.filter(device => device.kind === 'audiooutput');
            
            const videoInputCount = videoInputDevices.length;
            const audioInputCount = audioInputDevices.length;
            const audioOutputCount = audioOutputDevices.length;
            const totalDevices = devices.length;
            
            const hasDetailedLabels = devices.some(device => device.label && device.label.length > 0);
            
            const mediaDevicesData = {
                supported: true,
                videoInputCount: videoInputCount,
                audioInputCount: audioInputCount,
                audioOutputCount: audioOutputCount,
                totalDevices: totalDevices,
                hasDetailedLabels: hasDetailedLabels
            };
            
            logger.log('[fingerprint-viewer] Media devices raccolti:', mediaDevicesData);
            
            return mediaDevicesData;
            
        } catch (error) {
            logger.error('[fingerprint-viewer] Errore enumerazione media devices', error);
            return {
                supported: false,
                videoInputCount: 'Errore raccolta dati',
                audioInputCount: 'Errore raccolta dati',
                audioOutputCount: 'Errore raccolta dati',
                totalDevices: 'Errore raccolta dati'
            };
        }
    }

    /**
     * Rileva disponibilita sensori hardware del dispositivo
     */
    function detectDeviceSensors() {
        try {
            const hasDeviceMotion = 'DeviceMotionEvent' in window;
            const hasDeviceOrientation = 'DeviceOrientationEvent' in window;
            
            const hasAccelerometer = 'Accelerometer' in window;
            const hasGyroscope = 'Gyroscope' in window;
            const hasLinearAccelerationSensor = 'LinearAccelerationSensor' in window;
            const hasAbsoluteOrientationSensor = 'AbsoluteOrientationSensor' in window;
            const hasRelativeOrientationSensor = 'RelativeOrientationSensor' in window;
            const hasGravitySensor = 'GravitySensor' in window;
            
            const hasAmbientLightSensor = 'AmbientLightSensor' in window;
            const hasMagnetometer = 'Magnetometer' in window;
            
            const hasMotionSensors = hasDeviceMotion || hasDeviceOrientation || 
                                     hasAccelerometer || hasGyroscope;
            
            const hasEnvironmentalSensors = hasAmbientLightSensor || hasMagnetometer;
            
            const sensorsData = {
                deviceMotionEvent: hasDeviceMotion ? 'Disponibile' : 'Non disponibile',
                deviceOrientationEvent: hasDeviceOrientation ? 'Disponibile' : 'Non disponibile',
                accelerometer: hasAccelerometer ? 'Disponibile' : 'Non disponibile',
                gyroscope: hasGyroscope ? 'Disponibile' : 'Non disponibile',
                linearAcceleration: hasLinearAccelerationSensor ? 'Disponibile' : 'Non disponibile',
                absoluteOrientation: hasAbsoluteOrientationSensor ? 'Disponibile' : 'Non disponibile',
                relativeOrientation: hasRelativeOrientationSensor ? 'Disponibile' : 'Non disponibile',
                gravitySensor: hasGravitySensor ? 'Disponibile' : 'Non disponibile',
                ambientLight: hasAmbientLightSensor ? 'Disponibile' : 'Non disponibile',
                magnetometer: hasMagnetometer ? 'Disponibile' : 'Non disponibile',
                hasMotionSensors: hasMotionSensors,
                hasEnvironmentalSensors: hasEnvironmentalSensors
            };
            
            logger.log('[fingerprint-viewer] Device sensors rilevati:', sensorsData);
            
            return sensorsData;
            
        } catch (error) {
            logger.error('[fingerprint-viewer] Errore rilevamento device sensors', error);
            return {
                deviceMotionEvent: 'Errore rilevamento',
                deviceOrientationEvent: 'Errore rilevamento',
                accelerometer: 'Errore rilevamento',
                gyroscope: 'Errore rilevamento',
                linearAcceleration: 'Errore rilevamento',
                absoluteOrientation: 'Errore rilevamento',
                relativeOrientation: 'Errore rilevamento',
                gravitySensor: 'Errore rilevamento',
                ambientLight: 'Errore rilevamento',
                magnetometer: 'Errore rilevamento',
                hasMotionSensors: false,
                hasEnvironmentalSensors: false
            };
        }
    }

    /**
     * Calcola distanza euclidea tra due punti
     */
    function calculateDistance(p1, p2) {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }

    /**
     * Traccia pattern comportamentali utente
     */
    function trackBehavioralPatterns() {
        const behavioralData = {
            mouseMovements: [],
            clicks: [],
            scrolls: [],
            keystrokes: [],
            startTime: Date.now()
        };

        let sampleCount = 0;

        const mouseHandler = (e) => {
            if (sampleCount >= CONFIG.behaviorSampleLimit) return;
            behavioralData.mouseMovements.push({
                x: e.clientX,
                y: e.clientY,
                time: Date.now() - behavioralData.startTime
            });
            sampleCount++;
        };

        const clickHandler = (e) => {
            behavioralData.clicks.push({
                x: e.clientX,
                y: e.clientY,
                time: Date.now() - behavioralData.startTime,
                button: e.button
            });
        };

        const scrollHandler = () => {
            behavioralData.scrolls.push({
                x: window.scrollX,
                y: window.scrollY,
                time: Date.now() - behavioralData.startTime
            });
        };

        const keyHandler = (e) => {
            behavioralData.keystrokes.push({
                key: e.key.length === 1 ? 'char' : e.key,
                time: Date.now() - behavioralData.startTime
            });
        };

        document.addEventListener('mousemove', mouseHandler);
        document.addEventListener('click', clickHandler);
        window.addEventListener('scroll', scrollHandler);
        document.addEventListener('keydown', keyHandler);

        setTimeout(() => {
            document.removeEventListener('mousemove', mouseHandler);
            document.removeEventListener('click', clickHandler);
            window.removeEventListener('scroll', scrollHandler);
            document.removeEventListener('keydown', keyHandler);

            const analysis = analyzeBehavioralData(behavioralData);
            updateBehavioralDataInUI(analysis);
            
            if (cachedFingerprint) {
                cachedFingerprint.behavioralData = analysis;
            }
        }, CONFIG.behaviorTrackingDuration);
    }

    /**
     * Analizza dati comportamentali raccolti
     */
    function analyzeBehavioralData(data) {
        if (data.mouseMovements.length === 0) {
            return {
                mouseSpeed: 'Nessun movimento',
                clickCount: 0,
                scrollCount: 0,
                keystrokeCount: 0,
                avgMouseSpeed: 0
            };
        }

        let totalDistance = 0;
        let totalTime = 0;

        for (let i = 1; i < data.mouseMovements.length; i++) {
            const distance = calculateDistance(
                data.mouseMovements[i - 1],
                data.mouseMovements[i]
            );
            const timeDiff = data.mouseMovements[i].time - data.mouseMovements[i - 1].time;
            
            totalDistance += distance;
            totalTime += timeDiff;
        }

        const avgSpeed = totalTime > 0 ? (totalDistance / totalTime * 1000).toFixed(2) : 0;

        return {
            mouseSpeed: `${avgSpeed} px/s`,
            clickCount: data.clicks.length,
            scrollCount: data.scrolls.length,
            keystrokeCount: data.keystrokes.length,
            avgMouseSpeed: parseFloat(avgSpeed)
        };
    }

    /**
     * Aggiorna UI con dati comportamentali analizzati
     * Usa selettore robusto che cerca specificamente la sezione Pattern Comportamentali
     */
    function updateBehavioralDataInUI(analysis) {
        logger.log('[fingerprint-viewer] Tentativo aggiornamento UI comportamentale:', analysis);
        
        // Trova TUTTE le sezioni e cerca quella con titolo "Pattern Comportamentali"
        const allSections = document.querySelectorAll('.fp-section');
        let behavioralSection = null;
        
        allSections.forEach(section => {
            const titleEl = section.querySelector('.fp-section-title');
            if (titleEl && titleEl.textContent.includes('Pattern Comportamentali')) {
                behavioralSection = section;
            }
        });
        
        if (!behavioralSection) {
            logger.error('[fingerprint-viewer] Sezione Pattern Comportamentali NON trovata!');
            return;
        }
        
        const container = behavioralSection.querySelector('.fp-data-list');
        if (!container) {
            logger.error('[fingerprint-viewer] Container .fp-data-list NON trovato nella sezione!');
            return;
        }
        
        logger.log('[fingerprint-viewer] Container trovato, aggiornamento valori...');
        
        const items = container.querySelectorAll('.fp-data-item');
        let updatedCount = 0;
        
        items.forEach(item => {
            const label = item.querySelector('.fp-label')?.textContent;
            const valueEl = item.querySelector('.fp-value');
            
            if (!valueEl) return;

            switch(label) {
                case 'Velocita Media Mouse':
                    valueEl.textContent = analysis.mouseSpeed;
                    updatedCount++;
                    break;
                case 'Click Totali':
                    valueEl.textContent = analysis.clickCount;
                    updatedCount++;
                    break;
                case 'Eventi Scroll':
                    valueEl.textContent = analysis.scrollCount;
                    updatedCount++;
                    break;
                case 'Pressioni Tasti':
                    valueEl.textContent = analysis.keystrokeCount;
                    updatedCount++;
                    break;
            }
        });

        logger.log(`[fingerprint-viewer] UI aggiornata: ${updatedCount} valori modificati`);
    }

    /**
     * Rileva il browser corrente dal user agent
     * Usato per tracking cronologia visite cross-browser
     * @returns {string} Nome del browser rilevato
     */
    function detectBrowser() {
        const ua = navigator.userAgent;
        
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('Edg')) return 'Edge';
        if (ua.includes('Chrome')) return 'Chrome';
        if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
        if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
        
        return 'Altro';
    }

    /**
     * Gestisce tracking visite cross-sessione usando localStorage
     * Simula comportamento server-side per dimostrare tracking persistente
     * Salva cronologia visite con browser e timestamp per analisi pattern
     * @param {string} persistentID - ID univoco del dispositivo generato
     * @returns {Object} Statistiche tracking con visitCount, history, firstVisit, lastVisit
     */
    function getTrackingHistory(persistentID) {
        const historyKey = `${CONFIG.trackingHistoryPrefix}${persistentID}`;
        let history = [];
        
        try {
            const stored = localStorage.getItem(historyKey);
            if (stored) {
                history = JSON.parse(stored);
            }
        } catch (e) {
            logger.error('[fingerprint-viewer] Errore lettura tracking history:', e);
            history = [];
        }
        
        /* Aggiungi visita corrente */
        const currentVisit = {
            browser: detectBrowser(),
            timestamp: new Date().toLocaleString('it-IT', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            })
        };
        
        history.push(currentVisit);
        
        /* Tutta la history senza limite */
        try {
            localStorage.setItem(historyKey, JSON.stringify(history));
            logger.log('fingerprint-viewer Tracking history aggiornata:', history.length, 'visite');
        } catch (e) {
            logger.warn('fingerprint-viewer Impossibile salvare tracking history:', e);
        }
        
        /* Crea subset delle ultime 10 visite SOLO per cronologia display */
        const recentHistory = history.slice(-CONFIG.maxHistoryEntries);
        
        return {
            visitCount: history.length,
            history: recentHistory,
            firstVisit: history[0]?.timestamp || 'Oggi',
            lastVisit: history[history.length - 1]?.timestamp || 'Oggi'
        };
    }

    /**
     * Genera ID persistente cross-sessione combinando componenti hardware stabili
     * Questo ID rimane stabile anche dopo cancellazione cookie e cambiamenti minori
     * 
     * FILOSOFIA SELEZIONE COMPONENTI:
     * Usa SOLO componenti che:
     * 1. Sono estremamente stabili nel tempo (no batteria, IP, behavioral)
     * 2. Identificano hardware specifico (GPU, CPU, audio)
     * 3. Non cambiano con orientamento device (no screenResolution)
     * 4. Non cambiano con VPN o viaggi (no timezone)
     * 
     * COMPONENTI SCELTI (10 totali):
     * - Canvas/Audio fingerprint: Unici per combinazione HW+SW
     * - WebGL info completo: GPU model + vendor + version + shading
     * - Hardware specs stabili: CPU cores, color depth, pixel ratio
     * - Platform: OS base (raramente cambia)
     * 
     * COMPONENTI ESCLUSI E PERCHE:
     * - screenResolution: Cambia con orientamento mobile
     * - timezone: Cambia con VPN o viaggi
     * - userAgent: Troppo volatile (aggiornamenti browser frequenti)
     * - IP: Cambia con rete/VPN
     * - batteryLevel: Varia continuamente
     * - behavioralData: Diverso ogni sessione
     * 
     * ENTROPIA STIMATA: ~58 bits = 1 su 288 quadrilioni
     * Sufficiente per identificare univocamente ogni dispositivo sul pianeta
     * 
     * @param {Object} fingerprint - Oggetto contenente tutti i dati fingerprint
     * @returns {string} Hash persistente univoco del dispositivo (8 caratteri hex)
     */
    function generatePersistentID(fingerprint) {
        const components = [
            // Hash rendering grafico HTML5 Canvas (~16 bits entropy)
            // Varia tra GPU diverse per anti-aliasing e sub-pixel rendering
            // Cattura differenze hardware nella rasterizzazione grafica
            fingerprint.canvasFingerprint || '',
            
            // Hash elaborazione segnale audio hardware (~14 bits entropy)
            // Cattura differenze nei DSP e driver audio
            // Unico per ogni combinazione scheda audio + driver
            fingerprint.audioFingerprint || '',
            
            // Modello GPU esatto (~10 bits entropy)
            // Esempio: ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)
            // Uno dei componenti piu stabili e identificativi
            fingerprint.webglRenderer || '',
            
            // Produttore GPU (~3 bits entropy)
            // Esempio: Google Inc. (NVIDIA), Mozilla, WebKit
            // Complementa renderer per identificazione completa GPU
            fingerprint.webglVendor || '',
            
            // Versione WebGL supportata (~3 bits entropy)
            // Esempio: WebGL 1.0, WebGL 2.0
            // Identifica capacita rendering device
            fingerprint.webglVersion || '',
            
            // Numero core CPU logici (~4 bits entropy)
            // Valori comuni: 2, 4, 6, 8, 12, 16, 24, 32...
            // Stabile nel tempo, identifica classe/modello CPU
            fingerprint.hardwareConcurrency || '',
            
            // Profondita colore display (~2 bits entropy)
            // Valori comuni: 24-bit, 32-bit (raramente 16-bit, 48-bit)
            // Estremamente stabile, cambia solo con cambio monitor
            fingerprint.colorDepth || '',
            
            // Pixel ratio dello schermo (~3 bits entropy)
            // Valori comuni: 1, 1.25, 1.5, 2, 2.5, 3, 4
            // Fisso per device specifico (es: Retina = 2, mobile high-end = 3)
            fingerprint.pixelRatio || '',
            
            // Sistema operativo e architettura (~2 bits entropy)
            // Valori: Win32, MacIntel, Linux x86_64, Linux armv7l
            // Raramente cambia, identifica famiglia OS
            fingerprint.platform || ''
        ];

        // Join componenti con separatore pipe
        // Permette debug e analisi componenti individuali se necessario
        const combined = components.join('|');
        
        // Log per debug (solo se attivo in logger.js)
        logger.log('[fingerprint-viewer] Persistent ID components:', {
            count: components.filter(c => c !== '').length,
            sample: combined.substring(0, 100) + '...'
        });

        // Genera hash finale usando simpleHash
        // Produce stringa esadecimale 8 caratteri (32 bit)
        // Esempio output: 5a9f1b19
        return simpleHash(combined);
    }

    /**
     * Valida se un componente fingerprint contiene dati affidabili
     * Esclude valori spoofed, placeholder, errori o anomalie evidenti
     * 
     * Questa funzione e critica per il calcolo accurato dell'entropia:
     * - Valori spoofed (es. WebGL Vendor "Mozilla") non sono informativi
     * - Placeholder generici non contribuiscono all'unicita
     * - Errori di raccolta dati devono essere esclusi
     * 
     * @param {string} componentName - Nome del componente da validare
     * @param {*} value - Valore del componente da verificare
     * @returns {boolean} True se il componente contiene dati validi e informativi
     */
    function isComponentValid(componentName, value) {
        // Lista valori generici non validi applicabili a TUTTI i componenti
        const invalidGenericValues = [
            'Non disponibile',
            'Errore',
            'Errore raccolta dati',
            'Timeout',
            'Timeout - AudioContext bloccato',
            'Errore AudioWorklet',
            'Errore ScriptProcessor',
            '',
            null,
            undefined,
            '0',
            'non disponibile',
            'Raccolta in corso...'
        ];
        
        // Primo controllo: valori generici sempre invalidi
        if (invalidGenericValues.includes(value) || !value) {
            logger.warn(`[fingerprint-viewer] Componente ${componentName} ha valore generico non valido: "${value}"`);
            return false;
        }
        
        // Validazioni specifiche per ogni tipo di componente
        switch(componentName) {
            case 'webglVendor':
                // WebGL Vendor deve contenere informazioni hardware reali
                // Valori spoofed comuni da estensioni anti-fingerprinting e browser privacy-focused
                const spoofedVendors = [
                    'Mozilla',              // Privacy Badger, uBlock Origin, Brave strict mode
                    'WebKit',               // Safari privacy mode spoofing
                    'Google Inc.',          // Troppo generico senza specificare GPU
                    'Brian Paul',           // Mesa software renderer (non hardware)
                    ''                      // WebGL disabilitato o bloccato
                ];
                
                // Controlla se il valore e nella blacklist di vendor spoofed
                if (spoofedVendors.includes(value)) {
                    logger.warn(`[fingerprint-viewer] WebGL Vendor e un valore spoofed comune: "${value}"`);
                    return false;
                }
                
                // Vendor legittimi hanno pattern specifici che includono marca GPU
                // Questi pattern identificano hardware reale vs valori randomizzati
                const legitimateVendorPatterns = [
                    /Google Inc\. \(NVIDIA/i,     // Es: "Google Inc. (NVIDIA Corporation)"
                    /Google Inc\. \(AMD/i,        // Es: "Google Inc. (AMD)" 
                    /Google Inc\. \(Intel/i,      // Es: "Google Inc. (Intel Inc.)"
                    /Google Inc\. \(Qualcomm/i,   // Mobile: "Google Inc. (Qualcomm)"
                    /NVIDIA Corporation/i,        // NVIDIA diretto senza Google wrapper
                    /Intel Inc\./i,               // Intel diretto
                    /AMD/i,                       // AMD diretto
                    /Apple Inc\./i,               // Apple Silicon (M1, M2, etc.)
                    /Qualcomm/i,                  // ARM mobile processors
                    /Mali/i,                      // ARM Mali GPU (mobile)
                    /Adreno/i                     // Qualcomm Adreno GPU (mobile)
                ];
                
                // Verifica se il valore matcha almeno un pattern legittimo
                const hasLegitimatePattern = legitimateVendorPatterns.some(pattern => pattern.test(value));
                
                if (!hasLegitimatePattern) {
                    logger.warn(`[fingerprint-viewer] WebGL Vendor non matcha pattern hardware legittimi: "${value}"`);
                    return false;
                }
                
                return true;
                
            case 'webglRenderer':
                // WebGL Renderer deve identificare un modello GPU specifico
                // Renderer spoofed comuni da privacy tools
                const spoofedRenderers = [
                    'Mozilla',
                    'WebKit',
                    'SwiftShader',                      // Software renderer Google (no hardware)
                    'llvmpipe',                         // Mesa software renderer Linux
                    'Microsoft Basic Render Driver'     // Fallback generico Windows
                ];
                
                // Controlla se contiene valori spoofed noti
                if (spoofedRenderers.some(spoof => value.includes(spoof))) {
                    logger.warn(`[fingerprint-viewer] WebGL Renderer contiene valore spoofed: "${value}"`);
                    return false;
                }
                
                // Renderer legittimi devono contenere modello GPU identificabile
                // Pattern comuni: "GTX", "RTX", "Radeon", "Iris", "UHD", "Vega", "Mali", "Adreno"
                const hasGpuModel = /GTX|RTX|Radeon|Iris|UHD|Vega|Mali|Adreno|GeForce|Quadro|Tesla/i.test(value);
                
                if (!hasGpuModel) {
                    logger.warn(`[fingerprint-viewer] WebGL Renderer non contiene modello GPU identificabile: "${value}"`);
                    return false;
                }
                
                return true;
                
            case 'canvasFingerprint':
                // Canvas fingerprint randomizzati hanno valori tipici riconoscibili
                // Estensioni come Canvas Defender generano hash con pattern specifici
                const commonSpoofedCanvas = [
                    'ffffffff',     // Tutti bit a 1: randomizzazione semplice
                    '00000000',     // Tutti bit a 0: canvas vuoto o bloccato
                    '-6f7fb23e'     // Valore comune su Brave con randomizzazione attiva
                ];
                
                if (commonSpoofedCanvas.includes(value)) {
                    logger.warn(`[fingerprint-viewer] Canvas Fingerprint e un valore spoofed comune: "${value}"`);
                    return false;
                }
                
                return true;
                
            case 'audioFingerprint':
                // Audio fingerprint da cache offline non e affidabile
                // Indica che non e stato possibile generare hash da audio processing reale
                if (value.includes('offline') || value.includes('fallback')) {
                    logger.warn(`[fingerprint-viewer] Audio Fingerprint e un fallback non affidabile: "${value}"`);
                    return false;
                }
                
                return true;
                
            case 'hardwareConcurrency':
                // Hardware Concurrency deve essere un numero intero positivo realistico
                const cores = parseInt(value);
                
                // Valori invalidi: NaN, 0, negativi, o irragionevolmente alti (>128 cores)
                if (isNaN(cores) || cores <= 0 || cores > 128) {
                    logger.warn(`[fingerprint-viewer] Hardware Concurrency ha valore irrealistico: "${value}"`);
                    return false;
                }
                
                return true;
                
            case 'colorDepth':
                // Color depth ha solo valori standard ben definiti
                const validDepths = ['24-bit', '32-bit', '16-bit', '48-bit'];
                
                if (!validDepths.includes(value)) {
                    logger.warn(`[fingerprint-viewer] Color Depth ha valore non standard: "${value}"`);
                    return false;
                }
                
                return true;
                
            case 'pixelRatio':
                // Pixel ratio deve essere un numero positivo ragionevole
                const ratio = parseFloat(value);
                
                // Valori invalidi: NaN, 0, negativi, o troppo alti (>5 e irrealistico)
                if (isNaN(ratio) || ratio <= 0 || ratio > 5) {
                    logger.warn(`[fingerprint-viewer] Pixel Ratio ha valore irrealistico: "${value}"`);
                    return false;
                }
                
                return true;
                
            default:
                // Per altri componenti non specificati, accetta il valore
                // se non e un placeholder generico (gia filtrato sopra)
                return true;
        }
    }

    /**
     * Calcola unicita e entropia del fingerprint basandosi SOLO sui componenti
     * effettivamente validi e informativi (esclude valori spoofed o placeholder).
     * 
     * IMPORTANTE: Questa funzione ora usa isComponentValid() per filtrare
     * componenti con valori spoofed o non informativi prima di calcolare entropia.
     * 
     * METODOLOGIA CALCOLO ENTROPY:
     * - Valori entropy basati su studi EFF Panopticlick e ricerche accademiche
     * - Formula: Entropy totale (bits) = Somma entropy componenti VALIDI
     * - Combinazioni teoriche = 2^entropy
     * - Unicita = 1 / Combinazioni
     * 
     * @param {Object} fingerprint - Oggetto contenente tutti i dati fingerprint
     * @returns {Object} Metriche unicita e privacy con componenti validi
     */
    function calculateUniqueness(fingerprint) {
        // Mappa dei 9 componenti usati in generatePersistentID con entropy stimato
        const persistentComponents = {
            canvasFingerprint: 16,      // 65,536 varianti GPU rendering
            audioFingerprint: 14,       // 16,384 varianti audio processing
            webglRenderer: 10,          // 1,024 modelli GPU comuni
            webglVendor: 3,             // 8 vendor principali
            webglVersion: 3,            // 8 versioni WebGL
            hardwareConcurrency: 4,     // 16 configurazioni CPU
            colorDepth: 2,              // 4 profondita colore
            pixelRatio: 3,              // 8 pixel ratio comuni
            platform: 2                 // 4 OS principali
        };
        
        let totalEntropy = 0;
        let componentsPresent = 0;
        let componentsMissing = [];
        let componentsInvalid = [];  // NUOVO: traccia componenti invalidi con motivo
        
        // Calcola entropy sommando solo componenti effettivamente validi
        for (const [componentName, entropyBits] of Object.entries(persistentComponents)) {
            const value = fingerprint[componentName];
            
            // MODIFICA PRINCIPALE: usa la nuova funzione di validazione rigorosa
            const isValid = isComponentValid(componentName, value);
            
            if (isValid) {
                // Componente valido: contribuisce all'entropia totale
                totalEntropy += entropyBits;
                componentsPresent += 1;
                
                // Log dettagliato per componenti validi (utile per debug)
                logger.log(`[fingerprint-viewer] [VALIDO] ${componentName}: "${value}" -> +${entropyBits} bits`);
            } else {
                // Componente invalido: escluso dal calcolo entropia
                componentsMissing.push(componentName);
                componentsInvalid.push({
                    component: componentName,
                    value: value,
                    expectedEntropy: entropyBits
                });
                
                // Log warning per componenti esclusi (importante per utente)
                logger.warn(`[fingerprint-viewer] [ESCLUSO] ${componentName}: "${value}" - Non contribuisce all'entropia`);
            }
        }
        
        // Log riepilogo componenti per debug
        if (componentsMissing.length > 0) {
            logger.warn(`[fingerprint-viewer] Componenti esclusi dal calcolo entropia: ${componentsMissing.join(', ')}`);
        }
        
        // Calcola combinazioni teoriche totali: 2^entropy
        const totalCombinations = Math.pow(2, totalEntropy);
        
        // Calcola dispositivi necessari per 50% probabilita di collision (Birthday Paradox)
        const devicesFor50PercentCollision = Math.sqrt(2 * totalCombinations * Math.log(2));
        
        // Determina livello privacy basato su entropy totale REALE (non gonfiato)
        let privacyLevel = 'Basso';
        let privacyDescription = 'Facilmente tracciabile';
        let privacyColor = 'var(--color-error)';  // Rosso
        
        if (totalEntropy >= 33) {
            // 33+ bits: 1 su 8.5 miliardi (piu della popolazione mondiale)
            privacyLevel = 'Basso';
            privacyDescription = 'Praticamente unico - Altamente tracciabile';
            privacyColor = 'var(--color-error)';
        } else if (totalEntropy >= 20) {
            // 20-32 bits: 1 su 1 milione - 8.5 miliardi
            privacyLevel = 'Medio';
            privacyDescription = 'Identificativo - Moderatamente tracciabile';
            privacyColor = 'var(--color-warning)';  // Arancione
        } else {
            // <20 bits: Protezioni attive efficaci
            privacyLevel = 'Alto';
            privacyDescription = 'Difficilmente identificabile - Protezioni attive';
            privacyColor = 'var(--color-success)';  // Verde
        }
        
        // Formatta combinazioni per display leggibile
        let combinationsFormatted;
        if (totalCombinations >= 1e15) {
            combinationsFormatted = `${(totalCombinations / 1e15).toFixed(2)} quadrilioni`;
        } else if (totalCombinations >= 1e12) {
            combinationsFormatted = `${(totalCombinations / 1e12).toFixed(2)} trilioni`;
        } else if (totalCombinations >= 1e9) {
            combinationsFormatted = `${(totalCombinations / 1e9).toFixed(2)} miliardi`;
        } else if (totalCombinations >= 1e6) {
            combinationsFormatted = `${(totalCombinations / 1e6).toFixed(2)} milioni`;
        } else {
            combinationsFormatted = totalCombinations.toLocaleString('it-IT');
        }
        
        // Log metriche finali calcolate
        logger.log(`[fingerprint-viewer] Entropia totale calcolata: ${totalEntropy.toFixed(1)} bits da ${componentsPresent}/9 componenti validi`);
        logger.log(`[fingerprint-viewer] Livello privacy: ${privacyLevel} (${privacyDescription})`);
        
        // Ritorna oggetto con tutte le metriche
        return {
            // Metriche raw per eventuale processing ulteriore
            entropy: totalEntropy,
            combinations: totalCombinations,
            devicesFor50Collision: devicesFor50PercentCollision,
            componentsPresent: componentsPresent,
            componentsMissing: componentsMissing,
            componentsInvalid: componentsInvalid,  // NUOVO campo con dettagli componenti esclusi
            
            // Formattazione per UI display
            entropyFormatted: `${totalEntropy.toFixed(1)} bits`,
            combinationsFormatted: combinationsFormatted,
            uniquenessText: `1 su ${Math.round(totalCombinations).toLocaleString('it-IT')}`,
            devicesFor50Formatted: devicesFor50PercentCollision >= 1e6 
                ? `${(devicesFor50PercentCollision / 1e6).toFixed(1)} milioni`
                : devicesFor50PercentCollision >= 1e3
                    ? `${(devicesFor50PercentCollision / 1e3).toFixed(0)} mila`
                    : `${Math.round(devicesFor50PercentCollision)}`,
            componentsText: `${componentsPresent}/9 componenti validi`,
            
            // Privacy assessment
            privacyLevel: privacyLevel,
            privacyDescription: privacyDescription,
            privacyColor: privacyColor
        };
    }

    /**
     * Raccoglie tutti i dati del fingerprint
     */
    async function collectFingerprint() {
        if (cachedFingerprint) {
            logger.log('[fingerprint-viewer] Uso fingerprint cached');
            return cachedFingerprint;
        }

        logger.log('[fingerprint-viewer] Raccolta fingerprint iniziata');

        const basicInfo = collectBasicInfo();
        const canvasFingerprint = generateCanvasFingerprint();
        const webglData = getWebGLFingerprint();
        const deviceSensors = detectDeviceSensors();

        // Le raccolte che aspettano la rete o un'API lenta partono insieme: in sequenza
        // "Analisi in corso" durava fino a circa 15 secondi, cosi' dura quanto la piu' lenta (FP-07)
        const [publicIP, webrtcData, audioFingerprint, mediaDevices, extraSections] = await Promise.all([
            fetchPublicIP(),
            detectWebRTCLeak(),
            // Audio fingerprint con timeout: su Firefox mobile l'AudioContext puo' restare bloccato
            Promise.race([
                generateAudioFingerprint(),
                new Promise(resolve => setTimeout(() => {
                    logger.warn('[fingerprint-viewer] Audio fingerprint timeout su Firefox mobile');
                    resolve('Timeout - AudioContext bloccato');
                }, CONFIG.audioTimeout || 5000))
            ]),
            getMediaDevices(),
            // Tecniche aggiuntive di fingerprint-extra.js, solo mostrate: fuori dall'ID persistente
            window.FingerprintExtra.collect()
        ]);

        // Raccolta automatica dati Network Information API
        const networkData = getNetworkInformation();
        
        cachedFingerprint = {
            ...basicInfo,
            publicIP: publicIP,
            canvasFingerprint: canvasFingerprint,
            webrtcLocalIPs: webrtcData.local,
            webrtcPublicIPs: webrtcData.public,
            webrtcCandidateTypes: webrtcData.advancedStats?.candidateTypes || 'Non disponibile',
            webrtcProtocols: webrtcData.advancedStats?.protocols || 'Non disponibile',
            webrtcCodecsCount: webrtcData.advancedStats?.codecsCount || 0,
            webrtcCodecsSample: webrtcData.advancedStats?.codecsSample || 'Non disponibile',
            audioFingerprint: audioFingerprint,
            webglVendor: webglData.vendor,
            webglRenderer: webglData.renderer,
            webglVersion: webglData.version,
            webglShadingLanguageVersion: webglData.shadingLanguageVersion,
            networkEffectiveType: networkData.effectiveType,
            networkDownlink: networkData.downlink,
            networkRtt: networkData.rtt,
            networkSaveData: networkData.saveData,
            networkType: networkData.type,
            batteryLevel: 'Raccolta in corso...',
            batteryCharging: 'Raccolta in corso...',
            batteryChargingTime: 'Raccolta in corso...',
            batteryDischargingTime: 'Raccolta in corso...',
            batteryFirstVisitLevel: null,
            batteryFirstVisitCharging: null,
            mediaDevicesVideoInput: mediaDevices.videoInputCount,
            mediaDevicesAudioInput: mediaDevices.audioInputCount,
            mediaDevicesAudioOutput: mediaDevices.audioOutputCount,
            mediaDevicesTotalCount: mediaDevices.totalDevices,
            sensorDeviceMotion: deviceSensors.deviceMotionEvent,
            sensorDeviceOrientation: deviceSensors.deviceOrientationEvent,
            sensorAccelerometer: deviceSensors.accelerometer,
            sensorGyroscope: deviceSensors.gyroscope,
            sensorAmbientLight: deviceSensors.ambientLight,
            extraSections: extraSections,
            behavioralData: null
        };

        // Genera ID persistente univoco
        const persistentID = generatePersistentID(cachedFingerprint);
        cachedFingerprint.persistentID = persistentID;

        // Aggiungi tracking history basato su persistentID
        const trackingHistory = getTrackingHistory(persistentID);
        cachedFingerprint.trackingHistory = trackingHistory;

        logger.log('[fingerprint-viewer] Tracking aggiunto:', trackingHistory.visitCount, 'visite totali');

        setTimeout(async () => {
            try {
                const batteryInfo = await Promise.race([
                getBatteryInfo(),
                new Promise((resolve) =>
                    setTimeout(() => resolve({
                    level: "Non disponibile",
                    charging: "Non disponibile",
                    chargingTime: "Non disponibile",
                    dischargingTime: "Non disponibile",
                    firstVisit: null
                    }), 5000)
                )
                ]);

                cachedFingerprint.batteryLevel = batteryInfo.level;
                cachedFingerprint.batteryCharging = batteryInfo.charging;
                cachedFingerprint.batteryChargingTime = batteryInfo.chargingTime;
                cachedFingerprint.batteryDischargingTime = batteryInfo.dischargingTime;

                if (batteryInfo.firstVisit) {
                cachedFingerprint.batteryFirstVisitLevel = batteryInfo.firstVisit.level;
                cachedFingerprint.batteryFirstVisitCharging = batteryInfo.firstVisit.charging;
                }

                updateBatteryInUI(batteryInfo);
            } catch (error) {
                const fallback = {
                level: "Non disponibile",
                charging: "Non disponibile",
                chargingTime: "Non disponibile",
                dischargingTime: "Non disponibile",
                firstVisit: null
                };

                cachedFingerprint.batteryLevel = fallback.level;
                cachedFingerprint.batteryCharging = fallback.charging;
                cachedFingerprint.batteryChargingTime = fallback.chargingTime;
                cachedFingerprint.batteryDischargingTime = fallback.dischargingTime;

                updateBatteryInUI(fallback);
                logger.warn('[fingerprint-viewer] Errore o timeout batteria', error);
            }
            }, CONFIG.batteryDelay);

        logger.log('[fingerprint-viewer] Fingerprint completo:', cachedFingerprint);
        return cachedFingerprint;
    }

    /**
     * Aggiorna sezione batteria nella UI dopo raccolta ritardata
     * Cerca la sezione specifica "Batteria e Alimentazione" per evitare
     * conflitti con altre sezioni fp-section nella pagina
     * 
     * @param {Object} batteryInfo - Oggetto con dati batteria raccolti
     * @param {string} batteryInfo.level - Livello batteria corrente
     * @param {string} batteryInfo.charging - Stato ricarica corrente
     * @param {string} batteryInfo.chargingTime - Tempo fino a ricarica completa
     * @param {string} batteryInfo.dischargingTime - Autonomia residua
     * @param {Object|null} batteryInfo.firstVisit - Dati prima visita se disponibili
     */
    function updateBatteryInUI(batteryInfo) {
        logger.log('[fingerprint-viewer] updateBatteryInUI chiamata con:', batteryInfo);
        
        // Cerca TUTTE le sezioni .fp-section nella pagina
        const allSections = document.querySelectorAll('.fp-section');
        logger.log('[fingerprint-viewer] Sezioni .fp-section trovate:', allSections.length);
        
        // Trova la sezione "Batteria e Alimentazione" specifica iterando sui titoli
        let batterySection = null;
        allSections.forEach(section => {
            const titleElement = section.querySelector('.fp-section-title');
            if (titleElement) {
                const titleText = titleElement.textContent.trim();
                logger.log('[fingerprint-viewer] Processando sezione con titolo:', titleText);
                
                // Match parziale per robustezza (include sottostringhe)
                if (titleText.includes('Batteria')) {
                    batterySection = section;
                    logger.log('[fingerprint-viewer] Sezione batteria identificata');
                }
            }
        });
        
        // Verifica che la sezione batteria sia stata trovata
        if (!batterySection) {
            logger.error('[fingerprint-viewer] Sezione "Batteria e Alimentazione" NON TROVATA nel DOM');
            return;
        }
        
        // Trova tutti gli item .fp-data-item dentro la sezione batteria
        const items = batterySection.querySelectorAll('.fp-data-item');
        logger.log('[fingerprint-viewer] Elementi .fp-data-item nella sezione batteria:', items.length);
        
        // Verifica esistenza elementi da aggiornare
        if (items.length === 0) {
            logger.error('[fingerprint-viewer] Nessun .fp-data-item trovato nella sezione batteria');
            return;
        }

        // Contatore per tracciare numero aggiornamenti effettuati
        let aggiornamenti = 0;

        // Itera su ogni item e aggiorna il valore in base alla label
        items.forEach(item => {
            const labelElement = item.querySelector('.fp-label');
            const valueElement = item.querySelector('.fp-value');
            
            // Verifica esistenza elementi label e value
            if (!labelElement || !valueElement) {
                logger.warn('[fingerprint-viewer] Item senza label o value, skip');
                return;
            }
            
            const labelText = labelElement.textContent.trim();
            logger.log('[fingerprint-viewer] Processando item con label:', labelText);
            
            // Flag per tracciare se questo item è stato aggiornato
            let itemAggiornato = false;

            // Switch basato su label esatta per aggiornare valore corrispondente
            switch(labelText) {
                case 'Livello Batteria (Corrente)':
                    valueElement.textContent = batteryInfo.level;
                    itemAggiornato = true;
                    break;
                    
                case 'Stato (Corrente)':
                    valueElement.textContent = batteryInfo.charging;
                    itemAggiornato = true;
                    break;
                    
                case 'Tempo Ricarica':
                    valueElement.textContent = batteryInfo.chargingTime;
                    itemAggiornato = true;
                    break;
                    
                case 'Autonomia Residua':
                    valueElement.textContent = batteryInfo.dischargingTime;
                    itemAggiornato = true;
                    break;
                    
                case 'Livello Batteria (Prima Visita)':
                    // Aggiorna solo se dati prima visita disponibili
                    if (batteryInfo.firstVisit) {
                        valueElement.textContent = batteryInfo.firstVisit.level;
                        itemAggiornato = true;
                    }
                    break;
                    
                case 'Stato (Prima Visita)':
                    // Aggiorna solo se dati prima visita disponibili
                    if (batteryInfo.firstVisit) {
                        valueElement.textContent = batteryInfo.firstVisit.charging;
                        itemAggiornato = true;
                    }
                    break;
            }
            
            // Log di conferma per ogni item aggiornato con successo
            if (itemAggiornato) {
                aggiornamenti++;
                logger.log('[fingerprint-viewer] Aggiornato', labelText, 'con valore:', valueElement.textContent);
            }
        });

        // Log riepilogo finale con totale aggiornamenti effettuati
        logger.log('[fingerprint-viewer] UI batteria aggiornata. Totale aggiornamenti:', aggiornamenti);
    }


    function formatFingerprintData(data) {
        // Calcola unicita PRIMA di formattare dati
        // Usa stessi componenti di Persistent ID per coerenza
        const uniqueness = calculateUniqueness(data);
        
        return [
            {
                title: 'Analisi Unicità Fingerprint',
                items: [
                    { 
                        label: 'Componenti Stabili Usati', 
                        value: uniqueness.componentsText,
                        truncate: false 
                    },
                    { 
                        label: 'Entropia Totale', 
                        value: uniqueness.entropyFormatted,
                        truncate: false 
                    },
                    { 
                        label: 'Combinazioni Teoriche', 
                        value: uniqueness.combinationsFormatted,
                        truncate: false 
                    },
                    { 
                        label: 'Unicità Stimata', 
                        value: uniqueness.uniquenessText,
                        truncate: false 
                    },
                    { 
                        label: 'Dispositivi per 50% Collisione', 
                        value: uniqueness.devicesFor50Formatted,
                        truncate: false 
                    },
                    { 
                        label: 'Livello Privacy', 
                        value: `${uniqueness.privacyLevel} - ${uniqueness.privacyDescription}`,
                        truncate: false 
                    }
                ]
            },
            {
                title: 'Browser Tracking',
                items: [
                    { 
                        label: 'ID Persistente Univoco', 
                        value: data.persistentID || 'Non disponibile',
                        truncate: false
                    },
                    { 
                        label: 'Numero Visite Totali', 
                        value: data.trackingHistory ? data.trackingHistory.visitCount.toString() : '1',
                        truncate: false
                    },
                    {
                        label: 'Cronologia Visite',
                        value: data.trackingHistory?.history?.map(v => 
                            `(${v.browser}, ${v.timestamp})`
                        ).join('; ') || 'Nessuna cronologia',
                        truncate: false
                    },
                    { 
                        label: 'Prima Visita', 
                        value: data.trackingHistory?.firstVisit || 'Oggi',
                        truncate: false
                    },
                    {
                        label: 'Browser Usati',
                        value: data.trackingHistory 
                            ? [...new Set(data.trackingHistory.history.map(v => v.browser))].join(', ')
                            : detectBrowser(),
                        truncate: false
                    }
                ]
            },
            {
                title: 'Informazioni Browser',
                items: [
                    { label: 'User Agent', value: data.userAgent, truncate: false},
                    { label: 'Lingua', value: data.language },
                    { label: 'Lingue', value: data.languages },
                    { label: '(*) Piattaforma', value: data.platform },
                    { label: 'Do Not Track', value: data.doNotTrack },
                    { label: 'Cookie Abilitati', value: data.cookiesEnabled ? 'Si' : 'No' }
                ]
            },
            {
                title: 'Hardware e Display',
                items: [
                    { label: 'Risoluzione Schermo', value: data.screenResolution },
                    { label: '(*) Profondita Colore', value: data.colorDepth },
                    { label: '(*) Pixel Ratio', value: data.pixelRatio },
                    { label: '(*) Core CPU', value: data.hardwareConcurrency },
                    { label: 'Touch Points', value: data.maxTouchPoints }
                ]
            },
            {
                title: 'IP e Connessione',
                items: [
                    { label: 'IP Pubblico (Ipify)', value: data.publicIP },
                    { 
                        label: 'IP Locali (WebRTC)', 
                        value: (() => {
                            // Filtra IP validi ed errori
                            const validIPs = data.webrtcLocalIPs && data.webrtcLocalIPs.length > 0 
                                ? data.webrtcLocalIPs.filter(ip => ip && !ip.startsWith('e:'))
                                : [];
                            
                            // Se ci sono IP validi, mostrali
                            if (validIPs.length > 0) {
                                return validIPs.join(', ');
                            }
                            
                            // Altrimenti verifica se è mDNS o altro
                            // Controlla se nei candidati ICE c'è traccia di mDNS
                            const hasMdnsCandidate = (data.webrtcCandidateTypes && 
                                data.webrtcCandidateTypes.includes('host')) ||
                                (data.webrtcLocalIPs && data.webrtcLocalIPs.includes('mDNS'));
                            
                            if (hasMdnsCandidate) {
                                return 'Nascosto (mDNS obfuscation browser)';
                            }
                            
                            // Nessun candidato host = problema più serio
                            return 'Non disponibile (WebRTC bloccato o assente)';
                        })(),
                        truncate: false
                    },
                    { 
                        label: 'IP Pubblici (WebRTC)', 
                        value: data.webrtcPublicIPs && data.webrtcPublicIPs.length > 0 
                            ? data.webrtcPublicIPs.filter(ip => ip && !ip.startsWith('e:')).join(', ') 
                            : 'Non rilevato',
                        truncate: false
                    },
                    { label: 'Tipi Candidati ICE', value: data.webrtcCandidateTypes },
                    { label: 'Protocolli Rete', value: data.webrtcProtocols },
                    { label: 'Codec Supportati', value: `${data.webrtcCodecsCount} (${data.webrtcCodecsSample})` },
                    { label: 'Stato Connessione', value: data.online ? 'Online' : 'Offline' },
                    { label: 'Velocita Rete (4g >700Kbps)', value: data.connectionType }
                ]
            },
            {
                title: 'Fingerprinting Avanzato',
                items: [
                    { label: '(*) Canvas Fingerprint', value: data.canvasFingerprint },
                    { label: '(*) Audio Fingerprint', value: data.audioFingerprint },
                    { label: '(*) WebGL Vendor', value: data.webglVendor },
                    { label: '(*) WebGL Renderer', value: data.webglRenderer, truncate: false},
                    { label: '(*) WebGL Version', value: data.webglVersion },
                    { label: 'WebGL Shading Language', value: data.webglShadingLanguageVersion }
                ]
            },
            {
                title: 'Batteria e Alimentazione',
                items: [
                    { label: 'Livello Batteria (Corrente)', value: data.batteryLevel },
                    { label: 'Stato (Corrente)', value: data.batteryCharging },
                    { label: 'Tempo Ricarica', value: data.batteryChargingTime },
                    { label: 'Autonomia Residua', value: data.batteryDischargingTime },
                    { label: 'Livello Batteria (Prima Visita)', value: data.batteryFirstVisitLevel || 'Non disponibile' },
                    { label: 'Stato (Prima Visita)', value: data.batteryFirstVisitCharging || 'Non disponibile' }
                ]
            },
            {
                title: 'Dispositivi Multimediali (anche virtuali)',
                items: [
                    { label: 'Telecamere', value: data.mediaDevicesVideoInput },
                    { label: 'Microfoni', value: data.mediaDevicesAudioInput },
                    { label: 'Altoparlanti', value: data.mediaDevicesAudioOutput },
                    { label: 'Totale Dispositivi', value: data.mediaDevicesTotalCount }
                ]
            },
            {
                title: 'Sensori Hardware',
                items: [
                    { label: 'Device Motion', value: data.sensorDeviceMotion },
                    { label: 'Device Orientation', value: data.sensorDeviceOrientation },
                    { label: 'Accelerometro', value: data.sensorAccelerometer },
                    { label: 'Giroscopio', value: data.sensorGyroscope },
                    { label: 'Sensore Luminosita', value: data.sensorAmbientLight }
                ]
            },
            {
                title: 'Localizzazione e Fuso Orario',
                items: [
                    { label: 'Fuso Orario', value: data.timezone },
                    { label: 'Offset UTC', value: `${data.timezoneOffset} minuti` }
                ]
            },
            {
                title: 'Storage',
                items: [
                    { label: 'localStorage', value: data.localStorage ? 'Disponibile' : 'Non disponibile' },
                    { label: 'sessionStorage', value: data.sessionStorage ? 'Disponibile' : 'Non disponibile' }
                ]
            },
            {
                title: 'Pattern Comportamentali',
                items: [
                    { label: 'Velocita Media Mouse', value: data.behavioralData ? data.behavioralData.mouseSpeed : 'Raccolta in corso...' },
                    { label: 'Click Totali', value: data.behavioralData ? data.behavioralData.clickCount : 'Raccolta in corso...' },
                    { label: 'Eventi Scroll', value: data.behavioralData ? data.behavioralData.scrollCount : 'Raccolta in corso...' },
                    { label: 'Pressioni Tasti', value: data.behavioralData ? data.behavioralData.keystrokeCount : 'Raccolta in corso...' }
                ]
            },
            ...data.extraSections,
            {
                title: 'Network Information API (falsato dal browser)',
                items: [
                    { label: 'Tipo Connessione Efficace', value: data.networkEffectiveType || 'Non disponibile' },
                    { label: 'Downlink (Mbps)', value: data.networkDownlink || 'Non disponibile' },
                    { label: 'Latenza RTT (ms)', value: data.networkRtt || 'Non disponibile' },
                    { label: 'Risparmio Dati', value: data.networkSaveData || 'Non disponibile' },
                    { label: 'Tipo Rete', value: data.networkType || 'Non disponibile' }
                ]
            },
            {
                title: 'Test Velocita Connessione (calcolato effettivo)',
                items: [
                    { label: 'Velocita Download', value: 'Test in corso...' },
                    { label: 'Dati Scaricati', value: 'In attesa...' },
                    { label: 'Tempo al Primo Byte', value: 'In attesa...' }
                ]
            }
        ];
    }

    /**
     * Visualizza fingerprint nella UI con warning componenti invalidi
     */
    function displayFingerprint(data) {
        const container = document.getElementById('fp-content');
        if (!container) {
            logger.error('[fingerprint-viewer] Container fp-content non trovato');
            return;
        }

        // Calcola unicita per ottenere componenti invalidi
        const uniqueness = calculateUniqueness(data);

        // Warning privacy standard
        const warningHTML = `
            <div class="fp-warning" role="alert">
                <strong>Attenzione Privacy</strong>
                    Questi dati possono essere raccolti senza consenso. La loro combinazione crea un'impronta 
                    digitale unica per tracciare la tua attività online, anche senza cookie. <br>
                    L'ID Persistente deriva dalla combinazione dei KPI contrassegnati con (*).
            </div>
        `;

        // Warning componenti invalidi (solo se presenti)
        let invalidWarningHTML = '';
        if (uniqueness.componentsInvalid && uniqueness.componentsInvalid.length > 0) {
            const invalidList = uniqueness.componentsInvalid.map(item => 
                `<li><strong>${FingerprintUtils.escapeHtml(item.component)}</strong>: "${FingerprintUtils.escapeHtml(String(item.value))}"</li>`
            ).join('');
            
            invalidWarningHTML = `
                <div class="fp-warning" role="alert">
                    <strong>Componenti Esclusi dal Calcolo Entropia</strong>
                    I seguenti componenti contengono valori spoofed o non informativi e sono stati esclusi:
                    <ul class="fp-invalid-list">
                        ${invalidList}
                    </ul>
                </div>
            `;
        }

        const sections = formatFingerprintData(data);
        let sectionsHTML = '';

        sections.forEach(section => {
            sectionsHTML += `
                <div class="fp-section">
                    <h3 class="fp-section-title">${FingerprintUtils.escapeHtml(section.title)}</h3>
                    <dl class="fp-data-list">
            `;

            section.items.forEach(item => {
                const value = item.truncate && item.value.length > 50 
                    ? item.value.substring(0, 50) + '...' 
                    : item.value;
                
                sectionsHTML += `
                    <div class="fp-data-item">
                        <dt class="fp-label">${FingerprintUtils.escapeHtml(item.label)}</dt>
                        <dd class="fp-value">${FingerprintUtils.escapeHtml(String(value))}</dd>
                    </div>
                `;
            });

            sectionsHTML += `
                    </dl>
                </div>
            `;
        });

        container.innerHTML = warningHTML + invalidWarningHTML + sectionsHTML;
        
        // Aggiungi progress bar per speed test nel DOM
        const progressBarHTML = `
            <div class="fp-section">
                <h3 class="fp-section-title">Progress Test Velocita</h3>
                <div class="progress-container">
                    <div class="progress-bar" id="speed-test-progress">0%</div>
                </div>
            </div>
        `;

        // Inserisci la progress bar dopo l'ultima sezione
        const lastSection = container.querySelector('.fp-section:last-of-type');
        if (lastSection) {
            lastSection.insertAdjacentHTML('afterend', progressBarHTML);
        }

        trackBehavioralPatterns();
        
        logger.log('[fingerprint-viewer] Fingerprint visualizzato');
    }

    /**
     * Esegue test velocita connessione e aggiorna UI dinamicamente
     */
    async function runConnectionSpeedTestWithUIUpdate() {
        try {
            logger.log('[connection-speed] Avvio test velocita...');
            
            const speedData = await measureConnectionSpeed();
            
            // Aggiorna i valori nella sezione Speed Test
            updateSpeedDataInUI(speedData);
            
            logger.log('[connection-speed] Test velocita completato:', speedData);
        } catch (error) {
            logger.error('[connection-speed] Errore test velocita:', error);
            updateSpeedDataInUI({
                speedMbps: 'Errore',
                downloaded: 'Test fallito',
                firstByte: 'N/A'
            });
        }
    }

    /**
     * Aggiorna UI con dati speed test
     */
    function updateSpeedDataInUI(speedData) {
        // Trova tutte le sezioni e individua quella Speed Test
        const sections = document.querySelectorAll('.fp-section');
        let speedSection = null;
        
        sections.forEach(section => {
            const title = section.querySelector('.fp-section-title');
            if (title && title.textContent.includes('Test Velocita Connessione')) {
                speedSection = section;
            }
        });
        
        if (!speedSection) return;
        
        // Aggiorna i valori
        const items = speedSection.querySelectorAll('.fp-data-item');
        items.forEach(item => {
            const label = item.querySelector('.fp-label')?.textContent;
            const valueEl = item.querySelector('.fp-value');
            
            if (!valueEl) return;
            
            switch(label) {
                case 'Velocita Download':
                    valueEl.textContent = speedData.speedMbps || 'Non disponibile';
                    break;
                case 'Dati Scaricati':
                    valueEl.textContent = speedData.downloaded || 'Non disponibile';
                    break;
                case 'Tempo al Primo Byte':
                    valueEl.textContent = speedData.firstByte || 'Non disponibile';
                    break;
            }
        });
    }


    /**
     * Inizializzazione principale
     */
    async function init() {
        logger.log('[fingerprint-viewer] Inizializzazione');

        try {
            const fingerprint = await collectFingerprint();
            displayFingerprint(fingerprint);

            // Aspetta che il DOM sia completamente renderizzato
            await new Promise(resolve => setTimeout(resolve, 100));
            // Ora avvia speed test con progress bar funzionante
            await runConnectionSpeedTestWithUIUpdate();

        } catch (error) {
            logger.error('[fingerprint-viewer] Errore durante inizializzazione', error);
            const container = document.getElementById('fp-content');
            if (container) {
                container.innerHTML = `
                    <div class="fp-error">
                        Errore durante la raccolta dei dati del fingerprint.
                        Riprova ricaricando la pagina.
                    </div>
                `;
            }
        }
    }

    /**
     * Entry point applicazione - Esegue init() quando DOM è pronto
     * Controlla readyState per gestire sia caricamento sincrono che asincrono
     */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }


    // Speed test: file di dati casuali, quindi incomprimibile. I byte letti sono quelli passati
    // davvero sulla rete: con un file comprimibile il server lo spedisce compresso e la velocita'
    // risulta gonfiata. Il download si ripete finche' non scade il tempo o si arriva al massimo:
    // il test dura al piu' 3 secondi, e le connessioni lente scaricano meno dei 10 MB.
    const SPEED_TEST = {
        url: 'speedtest/random_2mb.bin',
        maxMs: 3000,
        maxDownloads: 5,
        fileBytes: 2 * 1024 * 1024
    };

    /**
     * Misura la velocita' di download contando i byte ricevuti in streaming
     * Il tempo parte dal primo blocco di ogni download, cosi' l'attesa della risposta (il tempo
     * al primo byte, mostrato a parte) non abbassa la velocita'. I byte del primo blocco sono
     * scaricati ma non misurati, perche' arrivano prima che il cronometro parta.
     * @returns {Promise<Object>} speedMbps, downloaded, firstByte gia' formattati
     */
    async function measureConnectionSpeed() {
        const deadline = performance.now() + SPEED_TEST.maxMs;
        const maxBytes = SPEED_TEST.maxDownloads * SPEED_TEST.fileBytes;
        let totalBytes = 0;
        let measuredBytes = 0;
        let measuredMs = 0;
        let firstByteMs = null;

        for (let i = 0; i < SPEED_TEST.maxDownloads && performance.now() < deadline; i++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), deadline - performance.now());
            const requestStart = performance.now();
            let dataStart = null;
            try {
                const response = await fetch(`${SPEED_TEST.url}?t=${Date.now()}`, {
                    cache: 'no-store',
                    signal: controller.signal
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const reader = response.body.getReader();
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) {
                        break;
                    }
                    totalBytes += value.length;
                    if (dataStart === null) {
                        dataStart = performance.now();
                        if (firstByteMs === null) {
                            firstByteMs = dataStart - requestStart;
                        }
                    } else {
                        measuredBytes += value.length;
                    }
                    const elapsed = SPEED_TEST.maxMs - (deadline - performance.now());
                    updateSpeedTestProgress(Math.min(100, Math.max(elapsed / SPEED_TEST.maxMs, totalBytes / maxBytes) * 100));
                }
            } catch (error) {
                // Il tempo scaduto non e' un errore: valgono i byte arrivati fin li'
                if (error.name !== 'AbortError') {
                    throw error;
                }
            } finally {
                clearTimeout(timer);
                if (dataStart !== null) {
                    measuredMs += performance.now() - dataStart;
                }
            }
        }

        updateSpeedTestProgress(100);
        if (measuredBytes === 0 || measuredMs <= 0) {
            throw new Error('Nessun dato misurabile ricevuto');
        }
        const mbps = (measuredBytes * 8) / (measuredMs / 1000) / 1e6;
        logger.log(`[connection-speed] ${totalBytes} byte, ${mbps.toFixed(2)} Mbps, primo byte ${firstByteMs.toFixed(0)} ms`);

        return {
            speedMbps: formatSpeedMbps(mbps),
            downloaded: `${(totalBytes / 1024 / 1024).toFixed(1)} MB in ${(measuredMs / 1000).toFixed(2)} s`,
            firstByte: `${Math.round(firstByteMs)} ms`
        };
    }

    /**
     * Aggiorna progress bar UI durante test
     * @param {number} percentage - Percentuale completamento (0-100)
     */
    function updateSpeedTestProgress(percentage) {
        const progressBar = document.getElementById('speed-test-progress');
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
            progressBar.textContent = `${Math.round(percentage)}%`;
        }
    }

    /**
     * Formatta velocità in Mbps con 1 decimale
     * @param {number} mbps - Velocità in Mbps
     * @returns {string} Velocità formattata
     */
    function formatSpeedMbps(mbps) {
    if (mbps === null || mbps === undefined || isNaN(mbps)) {
        return 'Errore';
    }
    
    if (mbps >= 100) {
        return `${Math.round(mbps)} Mbps`;
    }
    
    return `${mbps.toFixed(1)} Mbps`;
    }
})();
