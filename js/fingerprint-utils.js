/**
 * File: fingerprint-utils.js
 * Author: AlbGri
 * Copyright: (c) 2025 Alberto G. - Licensed under AGPL-3.0
 * Created: 2025-10-27
 * Description: Utility functions condivise per fingerprint viewer e permissions
 */

(function() {
    'use strict';

    const FingerprintUtils = {
        
        /**
         * Verifica se un IP e locale o privato
         * @param {string} ip - Indirizzo IP da verificare
         * @returns {boolean} True se IP e locale/privato
         */
        isLocalIP: function(ip) {
            if (!ip || typeof ip !== 'string') return false;
            if (ip === '0.0.0.0' || ip === 'localhost') return true;

            const privatePatterns = [
                /^10\./,
                /^127\./,
                /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
                /^192\.168\./,
                /^169\.254\./,
                // 100.64.0.0/10: indirizzi condivisi degli operatori (CGNAT), comuni sul mobile
                /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./,
                /^::1$/,
                /^fe[89ab][0-9a-f]:/i,
                // fc00::/7: tutti gli indirizzi IPv6 privati, non solo fc00: e fd00:
                /^f[cd][0-9a-f]{2}:/i
            ];

            return privatePatterns.some(pattern => pattern.test(ip));
        },

        /**
         * Escape HTML per prevenire XSS
         * @param {string} text - Testo da sanitizzare
         * @returns {string} Testo sanitizzato
         */
        escapeHtml: function(text) {
            if (text === null || text === undefined) {
                return '';
            }

            text = String(text);

            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;',
                '/': '&#x2F;'
            };

            return text.replace(/[&<>"'\/]/g, m => map[m]);
        },

        /**
         * Formatta timestamp in formato leggibile
         * @param {string|Date} timestamp - Timestamp da formattare
         * @returns {string} Timestamp formattato
         */
        formatTimestamp: function(timestamp) {
            try {
                const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
                return date.toLocaleString(window.I18n.getLanguage(), { timeZone: window.Clock.getTimeZone() });
            } catch (error) {
                return 'Data non valida';
            }
        },

        /**
         * Calcola hash semplice di una stringa
         * @param {string} str - Stringa da hashare
         * @returns {string} Hash esadecimale
         */
        simpleHash: function(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return hash.toString(16);
        },

        /**
         * Valida formato coordinate GPS
         * @param {number} lat - Latitudine
         * @param {number} lon - Longitudine
         * @returns {boolean} True se coordinate valide
         */
        validateCoordinates: function(lat, lon) {
            return (
                typeof lat === 'number' && 
                typeof lon === 'number' &&
                lat >= -90 && lat <= 90 &&
                lon >= -180 && lon <= 180
            );
        },

        /**
         * Formatta coordinate GPS per visualizzazione
         * @param {number} lat - Latitudine
         * @param {number} lon - Longitudine
         * @returns {string} Coordinate formattate
         */
        formatCoordinates: function(lat, lon) {
            if (!this.validateCoordinates(lat, lon)) {
                return window.I18n.t('permessi.geo.coordinateNonValide');
            }
            
            const latDir = lat >= 0 ? 'N' : 'S';
            const lonDir = lon >= 0 ? 'E' : window.I18n.t('permessi.geo.ovest');
            
            return `${Math.abs(lat).toFixed(6)}${latDir}, ${Math.abs(lon).toFixed(6)}${lonDir}`;
        },

        /**
         * Debounce per ottimizzare eventi frequenti
         * @param {Function} func - Funzione da eseguire
         * @param {number} wait - Tempo di attesa in ms
         * @returns {Function} Funzione debounced
         */
        debounce: function(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },

        /**
         * Throttle per limitare frequenza esecuzione
         * @param {Function} func - Funzione da eseguire
         * @param {number} limit - Limite temporale in ms
         * @returns {Function} Funzione throttled
         */
        throttle: function(func, limit) {
            let inThrottle;
            return function(...args) {
                if (!inThrottle) {
                    func.apply(this, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },

        /**
         * Verifica supporto API nel browser
         * @param {string} apiName - Nome dell'API da verificare
         * @returns {boolean} True se API supportata
         */
        isAPISupported: function(apiName) {
            const apiMap = {
                'geolocation': 'geolocation' in navigator,
                'battery': 'getBattery' in navigator,
                'mediaDevices': 'mediaDevices' in navigator,
                'deviceOrientation': 'DeviceOrientationEvent' in window,
                'deviceMotion': 'DeviceMotionEvent' in window,
                'webrtc': 'RTCPeerConnection' in window,
                'webgl': (() => {
                    try {
                        const canvas = document.createElement('canvas');
                        return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
                    } catch(e) {
                        return false;
                    }
                })(),
                'audioContext': 'AudioContext' in window || 'webkitAudioContext' in window
            };

            return apiMap[apiName] || false;
        },

        /**
         * Genera UUID v4
         * @returns {string} UUID generato
         */
        generateUUID: function() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },

        /**
         * Salva dati in localStorage con gestione errori
         * @param {string} key - Chiave storage
         * @param {*} value - Valore da salvare
         * @returns {boolean} True se salvataggio riuscito
         */
        saveToStorage: function(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                logger.warn('[fingerprint-utils] Errore salvataggio localStorage:', error);
                return false;
            }
        },

        /**
         * Recupera dati da localStorage con gestione errori
         * @param {string} key - Chiave storage
         * @returns {*} Valore recuperato o null
         */
        loadFromStorage: function(key) {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : null;
            } catch (error) {
                logger.warn('[fingerprint-utils] Errore lettura localStorage:', error);
                return null;
            }
        },

        /**
         * Calcola distanza euclidea tra due punti
         * @param {Object} p1 - Primo punto {x, y}
         * @param {Object} p2 - Secondo punto {x, y}
         * @returns {number} Distanza
         */
        calculateDistance: function(p1, p2) {
            return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        },

        /**
         * Formatta bytes in formato leggibile
         * @param {number} bytes - Numero di bytes
         * @returns {string} Dimensione formattata
         */
        formatBytes: function(bytes) {
            if (bytes === 0) return '0 Bytes';
            
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            
            return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
        }
    };

    window.FingerprintUtils = FingerprintUtils;

})();