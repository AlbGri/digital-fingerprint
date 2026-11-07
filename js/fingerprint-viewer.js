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
        apiIpwho: 'https://ipwho.is/?fields=success,message,city,region,country,connection.isp,timezone.id,timezone.offset',
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
            // Firefox e Safari non hanno l'API: il browser si legge gia' nello user agent
            logger.warn('[fingerprint-viewer] Network Information API non supportata');
            return null;
        }
        return {
            effectiveType: connection.effectiveType,
            downlink: connection.downlink,
            rtt: connection.rtt,
            saveData: connection.saveData,
            type: connection.type
        };
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
     * Luogo, fornitore e fuso dell'IP da ipwho.is, chiesti solo con i campi che servono. Il
     * servizio conta le richieste per sito (1000 al giorno): per questo l'IP resta a ipify.
     *
     * @returns {Promise<Object>} {posizione, fornitore, fuso, offsetMinuti} o {errore}
     */
    async function fetchIPLocation() {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        try {
            const response = await fetch(CONFIG.apiIpwho, { cache: 'no-cache', signal: controller.signal });
            if (response.status === 429) return { errore: 'Limite del servizio' };
            const data = await response.json();
            if (!data.success) throw new Error(data.message);
            return {
                posizione: [data.city, data.region, data.country].filter(Boolean).join(', '),
                fornitore: data.connection.isp,
                fuso: data.timezone.id,
                offsetMinuti: data.timezone.offset / 60
            };
        } catch (error) {
            logger.warn('[fingerprint-viewer] ipwho.is non disponibile:', error.message);
            return { errore: 'Non disponibile' };
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Indizio di VPN: il fuso del browser e quello dell'IP devono segnare la stessa ora adesso
     * (Roma e Berlino coincidono). UTC con un IP fuori da UTC e' il fuso falsato di Tor e di
     * Firefox con resistFingerprinting.
     */
    function indizioVPN(fusoBrowser, offsetBrowserMinuti, luogoIP) {
        if (luogoIP.errore) return luogoIP.errore;
        if (luogoIP.offsetMinuti === -offsetBrowserMinuti) return 'VPN nessun indizio';
        return ['UTC', 'Etc/UTC'].includes(fusoBrowser) ? 'Fuso falsato' : 'VPN probabile';
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

                    // L'indirizzo e' il quinto campo del candidato: cosi' vale per IPv4 e per
                    // IPv6 in ogni forma, anche abbreviata con "::"
                    const ip = candidate.split(' ')[4];

                    if (ip && !ip.endsWith('.local')) {
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
     * Impronta audio: un oscillatore passa da un compressore e si somma un tratto del risultato.
     * Calcolato offline e' sempre uguale sullo stesso dispositivo, e non serve un gesto
     * dell'utente; varia fra hardware, driver e browser.
     *
     * @returns {Promise<string>} Somma dei campioni, o un valore di errore
     */
    async function generateAudioFingerprint() {
        const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!OfflineContext) return 'Non disponibile';
        try {
            const context = new OfflineContext(1, 5000, 44100);
            const oscillator = context.createOscillator();
            oscillator.type = 'triangle';
            oscillator.frequency.value = 10000;
            const compressor = context.createDynamicsCompressor();
            compressor.threshold.value = -50;
            compressor.knee.value = 40;
            compressor.ratio.value = 12;
            compressor.attack.value = 0;
            compressor.release.value = 0.25;
            oscillator.connect(compressor);
            compressor.connect(context.destination);
            oscillator.start(0);
            const samples = (await context.startRendering()).getChannelData(0);
            let sum = 0;
            for (let i = 4500; i < 5000; i++) sum += Math.abs(samples[i]);
            return sum.toString();
        } catch (error) {
            logger.error('[fingerprint-viewer] Errore impronta audio:', error);
            return 'Errore';
        }
    }

    /**
     * Rumore sull'audio: un segnale costante a 0.5 deve tornare esatto in ogni campione. Brave,
     * Safari e Firefox con le protezioni lo alterano; Brave con un rumore fisso per sessione,
     * che ripetere lo stesso calcolo non svelerebbe.
     *
     * @returns {Promise<string>} 'Rumore presente', 'Rumore assente' o un valore di errore
     */
    async function detectAudioNoise() {
        const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!OfflineContext || !window.ConstantSourceNode) return 'Non disponibile';
        try {
            const context = new OfflineContext(1, 1000, 44100);
            const source = context.createConstantSource();
            source.offset.value = 0.5;
            source.connect(context.destination);
            source.start(0);
            const samples = (await context.startRendering()).getChannelData(0);
            return samples.every(sample => sample === 0.5) ? 'Rumore assente' : 'Rumore presente';
        } catch (error) {
            logger.error('[fingerprint-viewer] Errore rumore audio:', error);
            return 'Errore';
        }
    }

    /**
     * Tetto di tempo: se un browser non porta a termine un calcolo audio, la pagina non resta
     * ferma
     */
    function conTettoAudio(calcolo, nome) {
        let timer;
        return Promise.race([
            calcolo,
            new Promise(resolve => {
                timer = setTimeout(() => {
                    logger.warn(`[fingerprint-viewer] ${nome}: tempo scaduto`);
                    resolve('Timeout');
                }, CONFIG.audioTimeout);
            })
        ]).finally(() => clearTimeout(timer));
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

            if (cachedFingerprint) {
                cachedFingerprint.behavioralData = analyzeBehavioralData(behavioralData);
                refreshSection('comportamento');
            }
        }, CONFIG.behaviorTrackingDuration);
    }

    /**
     * Analizza dati comportamentali raccolti
     */
    function analyzeBehavioralData(data) {
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

        // Senza mouse (telefono, tastiera) clic, scorrimenti e tasti contano lo stesso
        return {
            mouseSpeed: data.mouseMovements.length === 0 ? 'Nessun movimento' : `${avgSpeed} px/s`,
            clickCount: data.clicks.length,
            scrollCount: data.scrolls.length,
            keystrokeCount: data.keystrokes.length
        };
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
     * Salva conteggio, prima visita e le ultime visite con browser e timestamp
     * @param {string} persistentID - ID univoco del dispositivo generato
     * @returns {Object} Statistiche tracking con visitCount, history, firstVisit
     */
    function getTrackingHistory(persistentID) {
        const historyKey = `${CONFIG.trackingHistoryPrefix}${persistentID}`;
        /* Data ISO, la si formatta nella lingua scelta quando si mostra */
        const currentVisit = {
            browser: detectBrowser(),
            timestamp: new Date().toISOString()
        };
        let tracking = { visitCount: 0, firstVisit: currentVisit.timestamp, history: [] };

        try {
            const stored = localStorage.getItem(historyKey);
            if (stored) {
                tracking = JSON.parse(stored);
            }
        } catch (e) {
            logger.error('[fingerprint-viewer] Errore lettura tracking history:', e);
        }

        tracking.visitCount += 1;
        /* Solo le ultime visite: conteggio e prima visita bastano per il resto */
        tracking.history = tracking.history.concat(currentVisit).slice(-CONFIG.maxHistoryEntries);

        try {
            localStorage.setItem(historyKey, JSON.stringify(tracking));
            logger.log('fingerprint-viewer Tracking history aggiornata:', tracking.visitCount, 'visite');
        } catch (e) {
            logger.warn('fingerprint-viewer Impossibile salvare tracking history:', e);
        }

        return tracking;
    }

    // I nove valori dell'ID, con i bit stimati per ciascuno e la riga che li mostra. L'ordine
    // conta: cambiarlo cambierebbe l'ID di tutti
    const COMPONENTI_ID = {
        canvasFingerprint: [16, 'sezione.canvas.canvas'],
        audioFingerprint: [14, 'sezione.canvas.audio'],
        webglRenderer: [10, 'sezione.canvas.webglRenderer'],
        webglVendor: [3, 'sezione.canvas.webglVendor'],
        webglVersion: [3, 'sezione.canvas.webglVersione'],
        hardwareConcurrency: [4, 'sezione.hardware.core'],
        colorDepth: [2, 'sezione.hardware.profondita'],
        pixelRatio: [3, 'sezione.hardware.pixelRatio'],
        platform: [2, 'sezione.browser.piattaforma']
    };

    /**
     * Genera l'ID del dispositivo dai nove valori di COMPONENTI_ID: valori che restano uguali
     * da una visita all'altra, quindi niente IP, fuso, batteria, risoluzione (cambia ruotando il
     * telefono) o user agent (cambia a ogni aggiornamento del browser).
     * L'hash e' a 32 bit: con circa 77 mila dispositivi due hanno lo stesso ID con probabilita'
     * del 50%, qualunque sia l'entropia dei valori di partenza.
     *
     * @param {Object} fingerprint - Oggetto contenente tutti i dati fingerprint
     * @returns {string} Hash esadecimale a 32 bit
     */
    function generatePersistentID(fingerprint) {
        const components = Object.keys(COMPONENTI_ID).map(nome => fingerprint[nome] || '');

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
     * - Valori generici (es. WebGL Vendor "Mozilla") non sono informativi
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
            '',
            null,
            undefined,
            '0',
            'non disponibile'
        ];
        
        // Primo controllo: valori generici sempre invalidi
        if (invalidGenericValues.includes(value) || !value) {
            logger.warn(`[fingerprint-viewer] Componente ${componentName} ha valore generico non valido: "${value}"`);
            return false;
        }
        
        // Validazioni specifiche per ogni tipo di componente
        switch(componentName) {
            case 'webglVendor':
                // Nomi generici: il browser non dice il produttore vero (estensione con i nomi
                // veri assente o bloccata, come in Firefox con resistFingerprinting), oppure il
                // disegno e' fatto dal processore senza scheda video. Non distinguono nessuno
                const genericVendors = ['Mozilla', 'WebKit', 'Google Inc.', 'Brian Paul'];
                if (genericVendors.includes(value)) {
                    logger.warn(`[fingerprint-viewer] WebGL Vendor generico: "${value}"`);
                    return false;
                }
                return true;

            case 'webglRenderer':
                // Stessa logica: nomi generici e disegno senza scheda video. Nessun elenco di
                // modelli ammessi: scarterebbe GPU vere (Apple, Intel HD e Arc, PowerVR, Xclipse)
                const genericRenderers = [
                    'Mozilla',
                    'WebKit',
                    'SwiftShader',
                    'llvmpipe',
                    'Microsoft Basic Render Driver'
                ];
                if (genericRenderers.some(generic => value.includes(generic))) {
                    logger.warn(`[fingerprint-viewer] WebGL Renderer generico: "${value}"`);
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
     * Somma i bit stimati dei valori dell'ID che risultano validi (isComponentValid).
     * La somma e' un limite massimo: i valori non sono indipendenti (scheda video, canvas e
     * WebGL vanno insieme), quindi l'unicita' vera e' piu' bassa. I bit di COMPONENTI_ID sono
     * stime dell'ordine di grandezza, non misure.
     *
     * @param {Object} fingerprint - Oggetto contenente tutti i dati fingerprint
     * @returns {{entropy: number, componentsPresent: number, componentsInvalid: Array}}
     */
    function calculateUniqueness(fingerprint) {
        let entropy = 0;
        let componentsPresent = 0;
        const componentsInvalid = [];

        for (const [componentName, [entropyBits]] of Object.entries(COMPONENTI_ID)) {
            const value = fingerprint[componentName];
            // Con il rumore l'impronta audio cambia a ogni sessione: non distingue nessuno
            const conRumore = componentName === 'audioFingerprint' && fingerprint.audioNoise === 'Rumore presente';
            if (isComponentValid(componentName, value) && !conRumore) {
                entropy += entropyBits;
                componentsPresent += 1;
            } else {
                componentsInvalid.push({ component: componentName, value: value });
            }
        }

        logger.log(`[fingerprint-viewer] Entropia al massimo: ${entropy} bit da ${componentsPresent}/9 componenti validi`);
        return { entropy, componentsPresent, componentsInvalid };
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
        const [publicIP, luogoIP, webrtcData, audioFingerprint, audioNoise, mediaDevices, extraSections] = await Promise.all([
            fetchPublicIP(),
            fetchIPLocation(),
            detectWebRTCLeak(),
            conTettoAudio(generateAudioFingerprint(), 'Impronta audio'),
            conTettoAudio(detectAudioNoise(), 'Rumore audio'),
            getMediaDevices(),
            // Tecniche aggiuntive di fingerprint-extra.js, solo mostrate: fuori dall'ID persistente
            window.FingerprintExtra.collect()
        ]);

        cachedFingerprint = {
            ...basicInfo,
            publicIP: publicIP,
            luogoIP: luogoIP,
            vpn: indizioVPN(basicInfo.timezone, basicInfo.timezoneOffset, luogoIP),
            canvasFingerprint: canvasFingerprint,
            webrtcLocalIPs: webrtcData.local,
            webrtcPublicIPs: webrtcData.public,
            webrtcCandidateTypes: webrtcData.advancedStats?.candidateTypes || 'Non disponibile',
            webrtcProtocols: webrtcData.advancedStats?.protocols || 'Non disponibile',
            webrtcCodecsCount: webrtcData.advancedStats?.codecsCount || 0,
            webrtcCodecsSample: webrtcData.advancedStats?.codecsSample || 'Non disponibile',
            audioFingerprint: audioFingerprint,
            audioNoise: audioNoise,
            webglVendor: webglData.vendor,
            webglRenderer: webglData.renderer,
            webglVersion: webglData.version,
            webglShadingLanguageVersion: webglData.shadingLanguageVersion,
            network: getNetworkInformation(),
            batteryLevel: 'Raccolta in corso...',
            batteryCharging: 'Raccolta in corso...',
            batteryChargingTime: 'Raccolta in corso...',
            batteryDischargingTime: 'Raccolta in corso...',
            batteryFirstVisitLevel: null,
            batteryFirstVisitCharging: null,
            mediaDevicesVideoInput: mediaDevices.videoInputCount,
            mediaDevicesAudioInput: mediaDevices.audioInputCount,
            mediaDevicesAudioOutput: mediaDevices.audioOutputCount,
            mediaDevicesLabels: mediaDevices.hasDetailedLabels,
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

                refreshSection('batteria');
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

                refreshSection('batteria');
                logger.warn('[fingerprint-viewer] Errore o timeout batteria', error);
            }
            }, CONFIG.batteryDelay);

        logger.log('[fingerprint-viewer] Fingerprint completo:', cachedFingerprint);
        return cachedFingerprint;
    }

    // Gruppi e sezioni nell'ordine della pagina, dal piu' sorprendente al piu' tecnico. L'id
    // della sezione e' il suo data-sezione e il prefisso delle sue chiavi nei dizionari
    const GRUPPI = [
        ['riconosce', ['visite', 'unicita']],
        ['rete', ['ip', 'fuso', 'tastiera', 'reteDichiarata', 'reteMisurata']],
        ['dispositivo', ['browser', 'clientHints', 'hardware', 'schermi', 'schedaVideo', 'batteria',
            'multimedia', 'sensori']],
        ['impronte', ['canvas', 'font', 'voci', 'calcoli']],
        ['abitudini', ['preferenze', 'spazio', 'pubblicita', 'comportamento']]
    ];

    // Valori fissi scritti dalla raccolta: si traducono solo quando si mostrano, perche' alcuni
    // entrano nell'ID e tradurli alla raccolta lo farebbe cambiare con la lingua
    const VALORI_RACCOLTI = {
        'Non disponibile': 'valore.nonDisponibile',
        'non disponibile': 'valore.nonDisponibile',
        'non specificato': 'valore.nonSpecificato',
        'Disponibile': 'valore.disponibile',
        'Errore': 'valore.errore',
        'Errore raccolta': 'valore.errore',
        'Errore raccolta dati': 'valore.errore',
        'Errore rilevamento': 'valore.errore',
        'Timeout': 'valore.timeout',
        'Non rilevato': 'valore.nonRilevato',
        'In carica': 'valore.inCarica',
        'Scarica': 'valore.scarica',
        'Non in carica': 'valore.nonInCarica',
        'Raccolta in corso...': 'valore.inCorso',
        'Nessun movimento': 'valore.nessunMovimento',
        'Rumore assente': 'valore.rumoreAssente',
        'Rumore presente': 'valore.rumorePresente',
        'Altro': 'valore.altro',
        'Limite del servizio': 'valore.limiteServizio',
        'VPN nessun indizio': 'valore.vpnNessunIndizio',
        'VPN probabile': 'valore.vpnProbabile',
        'Fuso falsato': 'valore.fusoFalsato'
    };

    // Dispositivi oltre i quali due hanno lo stesso ID con probabilita' del 50% (ID a 32 bit)
    const ID_UGUALI_50 = Math.sqrt(2 * Math.pow(2, 32) * Math.LN2);

    let speedProgress = 0;

    function raccolto(valore) {
        return VALORI_RACCOLTI[valore] ? I18n.t(VALORI_RACCOLTI[valore]) : valore;
    }

    function siNo(valore) {
        return I18n.t(valore ? 'valore.si' : 'valore.no');
    }

    function numero(valore, decimali) {
        return valore.toLocaleString(I18n.getLanguage(), { maximumFractionDigits: decimali });
    }

    /** Numero grande in parole ("1,07 miliardi"), con le cifre significative indicate */
    function numeroGrande(valore, cifre) {
        const scale = [[1e15, 'numero.biliardi'], [1e12, 'numero.bilioni'], [1e9, 'numero.miliardi'],
            [1e6, 'numero.milioni'], [1e3, 'numero.mila']];
        const scala = scale.find(([soglia]) => valore >= soglia);
        if (!scala) {
            return numero(Math.round(valore), 0);
        }
        const cifra = (valore / scala[0]).toLocaleString(I18n.getLanguage(), { maximumSignificantDigits: cifre });
        return I18n.t(scala[1], { n: cifra });
    }

    function dataOra(timestamp) {
        const data = new Date(timestamp);
        // Le visite salvate prima delle date ISO sono testo gia' formattato: si mostrano come sono
        return isNaN(data) ? timestamp : data.toLocaleString(I18n.getLanguage(), {
            timeZone: Clock.getTimeZone(),
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });
    }

    /**
     * Righe di ogni sezione nella lingua scelta: si ricalcolano dai dati raccolti a ogni resa
     * @param {Object} data - Fingerprint raccolto
     * @returns {Object<string, Array<{voce: string, value: *}>>} Righe per id di sezione
     */
    function formatFingerprintData(data) {
        const t = I18n.t;
        const uniqueness = calculateUniqueness(data);
        const storia = data.trackingHistory;
        const rete = data.network;
        const velocita = data.speed;
        const comportamento = data.behavioralData;
        const inCorso = t('valore.inCorso');
        const nonDisponibile = t('valore.nonDisponibile');

        const ipLocali = (() => {
            const validi = (data.webrtcLocalIPs || []).filter(ip => ip && ip !== 'mDNS' && !ip.startsWith('e:'));
            if (validi.length > 0) {
                return validi.join(', ');
            }
            const mdns = (data.webrtcCandidateTypes && data.webrtcCandidateTypes.includes('host'))
                || (data.webrtcLocalIPs && data.webrtcLocalIPs.includes('mDNS'));
            return t(mdns ? 'valore.mdns' : 'valore.webrtcBloccato');
        })();
        const ipPubblici = (data.webrtcPublicIPs || []).filter(ip => ip && !ip.startsWith('e:'));
        const luogo = data.luogoIP;

        // Senza permesso il browser elenca al massimo un dispositivo per tipo e senza nome: il
        // numero conta solo se il sito ha gia' avuto il permesso
        const dispositivo = (quanti, puoNonElencare) => {
            if (typeof quanti !== 'number') {
                return raccolto(quanti);
            }
            if (data.mediaDevicesLabels) {
                return String(quanti);
            }
            return t(quanti > 0 ? 'valore.presente' : puoNonElencare ? 'valore.nonElencato' : 'valore.assente');
        };

        const extra = id => data.extraSections[id];

        return {
            visite: [
                { voce: 'id', value: data.persistentID },
                { voce: 'numero', value: storia.visitCount },
                { voce: 'cronologia', value: storia.history.map(v => `(${raccolto(v.browser)}, ${dataOra(v.timestamp)})`).join('; ') },
                { voce: 'prima', value: dataOra(storia.firstVisit) },
                { voce: 'browserUsati', value: [...new Set(storia.history.map(v => raccolto(v.browser)))].join(', ') }
            ],
            unicita: [
                { voce: 'validi', value: t('sezione.unicita.validiValore', { n: uniqueness.componentsPresent }) },
                { voce: 'entropia', value: t('sezione.unicita.entropiaValore', { n: uniqueness.entropy }) },
                { voce: 'teorica', value: t('sezione.unicita.teoricaValore', { n: numeroGrande(Math.pow(2, uniqueness.entropy), 3) }) },
                { voce: 'idUguali', value: t('sezione.unicita.idUgualiValore', { n: numeroGrande(ID_UGUALI_50, 2) }) }
            ],
            ip: [
                { voce: 'pubblico', value: raccolto(data.publicIP) },
                { voce: 'posizione', value: raccolto(luogo.errore || luogo.posizione) },
                { voce: 'fornitore', value: raccolto(luogo.errore || luogo.fornitore) },
                { voce: 'localiWebrtc', value: ipLocali },
                { voce: 'pubbliciWebrtc', value: ipPubblici.length ? ipPubblici.join(', ') : raccolto('Non rilevato') },
                { voce: 'candidati', value: raccolto(data.webrtcCandidateTypes) },
                { voce: 'protocolli', value: raccolto(data.webrtcProtocols) },
                { voce: 'codec', value: `${data.webrtcCodecsCount} (${raccolto(data.webrtcCodecsSample)})` },
                { voce: 'stato', value: t(data.online ? 'valore.online' : 'valore.offline') },
                { voce: 'tipoRete', value: raccolto(data.connectionType) }
            ],
            fuso: [
                { voce: 'fuso', value: data.timezone },
                { voce: 'offset', value: t('sezione.fuso.offsetValore', { n: data.timezoneOffset }) },
                { voce: 'fusoIp', value: raccolto(luogo.errore || luogo.fuso) },
                { voce: 'vpn', value: raccolto(data.vpn) }
            ],
            tastiera: extra('tastiera'),
            reteDichiarata: rete ? [
                { voce: 'tipo', value: rete.effectiveType || nonDisponibile },
                { voce: 'downlink', value: rete.downlink !== undefined ? `${numero(rete.downlink, 2)} Mbps` : nonDisponibile },
                { voce: 'rtt', value: rete.rtt !== undefined ? `${rete.rtt} ms` : nonDisponibile },
                { voce: 'risparmio', value: siNo(rete.saveData) },
                { voce: 'tipoRete', value: rete.type || nonDisponibile }
            ] : [
                { voce: 'api', value: t('valore.nonSupportato') }
            ],
            reteMisurata: [
                { voce: 'velocita', value: !velocita ? inCorso : velocita.errore ? t('valore.testFallito') : `${numero(velocita.mbps, velocita.mbps >= 100 ? 0 : 1)} Mbps` },
                { voce: 'dati', value: !velocita || velocita.errore ? '-' : t('sezione.reteMisurata.datiValore', { mb: numero(velocita.megabytes, 1), s: numero(velocita.seconds, 2) }) },
                { voce: 'primoByte', value: !velocita || velocita.errore ? '-' : `${Math.round(velocita.firstByteMs)} ms` }
            ],
            browser: [
                { voce: 'userAgent', value: data.userAgent },
                { voce: 'lingua', value: data.language },
                { voce: 'lingue', value: data.languages },
                { voce: 'piattaforma', value: raccolto(data.platform) },
                { voce: 'dnt', value: raccolto(data.doNotTrack) },
                { voce: 'cookie', value: siNo(data.cookiesEnabled) }
            ],
            clientHints: extra('clientHints'),
            hardware: [
                { voce: 'risoluzione', value: data.screenResolution },
                { voce: 'profondita', value: raccolto(data.colorDepth) },
                { voce: 'pixelRatio', value: data.pixelRatio },
                { voce: 'core', value: raccolto(data.hardwareConcurrency) },
                { voce: 'tocco', value: data.maxTouchPoints }
            ],
            schermi: extra('schermi'),
            schedaVideo: extra('schedaVideo'),
            batteria: [
                { voce: 'livello', value: raccolto(data.batteryLevel) },
                { voce: 'stato', value: raccolto(data.batteryCharging) },
                { voce: 'tempoRicarica', value: raccolto(data.batteryChargingTime) },
                { voce: 'autonomia', value: raccolto(data.batteryDischargingTime) },
                { voce: 'livelloPrima', value: raccolto(data.batteryFirstVisitLevel) || nonDisponibile },
                { voce: 'statoPrima', value: raccolto(data.batteryFirstVisitCharging) || nonDisponibile }
            ],
            multimedia: [
                { voce: 'telecamera', value: dispositivo(data.mediaDevicesVideoInput) },
                { voce: 'microfono', value: dispositivo(data.mediaDevicesAudioInput) },
                // Firefox e Safari non elencano gli altoparlanti prima del permesso
                { voce: 'altoparlante', value: dispositivo(data.mediaDevicesAudioOutput, true) }
            ],
            sensori: [
                { voce: 'motion', value: raccolto(data.sensorDeviceMotion) },
                { voce: 'orientation', value: raccolto(data.sensorDeviceOrientation) },
                { voce: 'accelerometro', value: raccolto(data.sensorAccelerometer) },
                { voce: 'giroscopio', value: raccolto(data.sensorGyroscope) },
                { voce: 'luce', value: raccolto(data.sensorAmbientLight) }
            ],
            canvas: [
                { voce: 'canvas', value: raccolto(data.canvasFingerprint) },
                { voce: 'audio', value: raccolto(data.audioFingerprint) },
                { voce: 'rumore', value: raccolto(data.audioNoise) },
                { voce: 'webglVendor', value: raccolto(data.webglVendor) },
                { voce: 'webglRenderer', value: raccolto(data.webglRenderer) },
                { voce: 'webglVersione', value: raccolto(data.webglVersion) },
                { voce: 'webglShading', value: raccolto(data.webglShadingLanguageVersion) }
            ],
            font: extra('font'),
            voci: extra('voci'),
            calcoli: extra('calcoli'),
            preferenze: extra('preferenze'),
            spazio: extra('spazio'),
            pubblicita: extra('pubblicita'),
            comportamento: [
                { voce: 'mouse', value: comportamento ? raccolto(comportamento.mouseSpeed) : inCorso },
                { voce: 'clic', value: comportamento ? comportamento.clickCount : inCorso },
                { voce: 'scorrimenti', value: comportamento ? comportamento.scrollCount : inCorso },
                { voce: 'tasti', value: comportamento ? comportamento.keystrokeCount : inCorso }
            ]
        };
    }

    // Chiavi delle righe che entrano nell'ID: si segnano con (*)
    const CHIAVI_ID = new Set(Object.values(COMPONENTI_ID).map(([, chiave]) => chiave));

    /**
     * HTML di una sezione: titolo, spiegazione, riga dei permessi e righe dei valori
     * @param {string} id - Id della sezione
     * @param {Array<{voce: string, value: *, etichetta?: string}>} items - Righe
     * @returns {string} HTML della sezione
     */
    function renderSection(id, items) {
        const esc = FingerprintUtils.escapeHtml;
        const t = I18n.t;
        const tag = I18n.has(`sezione.${id}.tag`) ? t(`sezione.${id}.tag`) : t('tag.base');
        const righe = items.map(item => {
            const chiave = item.etichetta || `sezione.${id}.${item.voce}`;
            const etichetta = (CHIAVI_ID.has(chiave) ? '(*) ' : '') + t(chiave);
            return `
                    <div class="fp-data-item">
                        <dt class="fp-label">${esc(etichetta)}</dt>
                        <dd class="fp-value">${esc(I18n.resolve(item.value))}</dd>
                    </div>`;
        }).join('');
        const progresso = id === 'reteMisurata'
            ? '<div class="progress-container"><div class="progress-bar" id="speed-test-progress"></div></div>'
            : '';
        return `
                <div class="fp-section" data-sezione="${id}">
                    <h3 class="fp-section-title">${esc(t(`sezione.${id}.titolo`))}</h3>
                    <p class="fp-section-note">${esc(t(`sezione.${id}.nota`))}</p>
                    <p class="fp-section-tag">${esc(tag)}</p>
                    <dl class="fp-data-list">${righe}
                    </dl>
                    ${progresso}
                </div>`;
    }

    /**
     * Ridisegna una sola sezione dai dati raccolti: serve agli aggiornamenti che arrivano dopo
     * (batteria, comportamento, speed test)
     * @param {string} id - Id della sezione
     */
    function refreshSection(id) {
        const sezione = document.querySelector(`[data-sezione="${id}"]`);
        if (!sezione || !cachedFingerprint) {
            return;
        }
        sezione.outerHTML = renderSection(id, formatFingerprintData(cachedFingerprint)[id]);
        updateSpeedTestProgress(speedProgress);
    }

    /**
     * Visualizza fingerprint nella UI con avviso dei componenti esclusi
     */
    function displayFingerprint(data) {
        const container = document.getElementById('fp-content');
        if (!container) {
            logger.error('[fingerprint-viewer] Container fp-content non trovato');
            return;
        }
        const esc = FingerprintUtils.escapeHtml;
        const t = I18n.t;
        const uniqueness = calculateUniqueness(data);

        const warningHTML = `
            <div class="fp-warning">
                <strong>${esc(t('avviso.titolo'))}</strong>
                ${esc(t('avviso.testo'))}
            </div>
        `;

        let invalidWarningHTML = '';
        if (uniqueness.componentsInvalid.length > 0) {
            const invalidList = uniqueness.componentsInvalid.map(item =>
                `<li><strong>${esc(t(COMPONENTI_ID[item.component][1]))}</strong>: "${esc(raccolto(item.value))}"</li>`
            ).join('');
            invalidWarningHTML = `
                <div class="fp-warning">
                    <strong>${esc(t('esclusi.titolo'))}</strong>
                    ${esc(t('esclusi.testo'))}
                    <ul class="fp-invalid-list">
                        ${invalidList}
                    </ul>
                </div>
            `;
        }

        const sezioni = formatFingerprintData(data);
        const gruppiHTML = GRUPPI.map(([gruppo, ids]) => `
            <h2 class="fp-group-title">${esc(t(`gruppo.${gruppo}`))}</h2>
            ${ids.map(id => renderSection(id, sezioni[id])).join('')}
        `).join('');

        container.innerHTML = warningHTML + invalidWarningHTML + gruppiHTML;
        updateSpeedTestProgress(speedProgress);
        logger.log('[fingerprint-viewer] Fingerprint visualizzato');
    }

    /**
     * Esegue lo speed test e ridisegna la sua sezione con l'esito
     */
    async function runConnectionSpeedTestWithUIUpdate() {
        try {
            logger.log('[connection-speed] Avvio test velocita...');
            cachedFingerprint.speed = await measureConnectionSpeed();
            logger.log('[connection-speed] Test velocita completato:', cachedFingerprint.speed);
        } catch (error) {
            logger.error('[connection-speed] Errore test velocita:', error);
            cachedFingerprint.speed = { errore: true };
        }
        refreshSection('reteMisurata');
    }

    /**
     * Inizializzazione principale
     */
    async function init() {
        logger.log('[fingerprint-viewer] Inizializzazione');

        try {
            const [fingerprint] = await Promise.all([collectFingerprint(), I18n.ready]);
            displayFingerprint(fingerprint);
            trackBehavioralPatterns();
            await runConnectionSpeedTestWithUIUpdate();
        } catch (error) {
            logger.error('[fingerprint-viewer] Errore durante inizializzazione', error);
            const container = document.getElementById('fp-content');
            if (container) {
                container.innerHTML = `<div class="fp-error">${FingerprintUtils.escapeHtml(I18n.t('errore.raccolta'))}</div>`;
            }
        }
    }

    // Cambio di lingua o di fuso: si ridisegna dai dati gia' raccolti, senza rifare analisi e
    // speed test
    function ridisegna() {
        if (cachedFingerprint && document.querySelector('[data-sezione]')) {
            displayFingerprint(cachedFingerprint);
        }
    }
    document.addEventListener('df:lingua', ridisegna);
    document.addEventListener('df:fuso', ridisegna);

    // Toglie tutto cio' che la demo ha salvato nel browser, tranne lingua e fuso scelti
    document.getElementById('clear-demo-data').addEventListener('click', () => {
        const scelte = ['df.language', 'df.timezone'];
        try {
            Object.keys(localStorage).filter(key => !scelte.includes(key))
                .forEach(key => localStorage.removeItem(key));
        } catch (e) {
            logger.warn('[fingerprint-viewer] Impossibile cancellare i dati della demo:', e);
        }
        const esito = document.getElementById('clear-demo-data-result');
        esito.dataset.i18n = 'pagina.dati.fatto';
        esito.textContent = I18n.t('pagina.dati.fatto');
    });

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
     * @returns {Promise<Object>} mbps, megabytes, seconds, firstByteMs
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
            mbps: mbps,
            megabytes: totalBytes / 1024 / 1024,
            seconds: measuredMs / 1000,
            firstByteMs: firstByteMs
        };
    }

    /**
     * Aggiorna progress bar UI durante test; il valore resta per le rese successive
     * @param {number} percentage - Percentuale completamento (0-100)
     */
    function updateSpeedTestProgress(percentage) {
        speedProgress = percentage;
        const progressBar = document.getElementById('speed-test-progress');
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
            progressBar.textContent = `${Math.round(percentage)}%`;
        }
    }
})();
