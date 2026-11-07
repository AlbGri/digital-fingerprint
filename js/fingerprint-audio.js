/**
 * File: fingerprint-audio.js
 * Author: AlbGri
 * Copyright: (c) 2025 Alberto G. - Licensed under AGPL-3.0
 * Created: 2025-10-27
 * Description: AudioWorkletProcessor per generazione audio fingerprint
 *              Esegue in thread separato per migliori performance
 *              Sostituisce ScriptProcessorNode deprecato
 */

/**
 * Processore audio per fingerprinting
 * Raccoglie sample audio e li invia al main thread
 * Esegue in Audio Worklet Thread (non blocca UI)
 */
class FingerprintAudio extends AudioWorkletProcessor {
    /**
     * Costruttore del processore
     * Inizializza buffer per raccolta sample
     */
    constructor() {
        super();
        
        // Buffer per raccogliere sample audio
        this.sampleBuffer = [];
        
        // Numero massimo di sample da raccogliere
        this.maxSamples = 4096;
        
        // Flag per indicare se abbiamo raccolto abbastanza dati
        this.collected = false;
        
        // Log inizializzazione
        console.log('[fingerprint-audio] Worklet inizializzato');
    }
    
    /**
     * Metodo principale chiamato per ogni frame audio
     * Esegue nel Audio Worklet Thread
     * 
     * @param {Float32Array[][]} inputs - Array di input audio channels
     * @param {Float32Array[][]} outputs - Array di output audio channels
     * @param {Object} parameters - Parametri audio automation
     * @returns {boolean} True per continuare processing, false per terminare
     */
    process(inputs, outputs, parameters) {
        // Se abbiamo gia raccolto abbastanza dati, termina
        if (this.collected) {
            return false;
        }
        
        // Ottieni primo input channel
        const input = inputs[0];
        
        // Verifica che ci sia input audio
        if (!input || input.length === 0) {
            return true;
        }
        
        // Ottieni primo canale (mono)
        const channel = input[0];
        
        // Aggiungi sample al buffer
        for (let i = 0; i < channel.length; i++) {
            this.sampleBuffer.push(channel[i]);
            
            // Se abbiamo raggiunto numero target di sample
            if (this.sampleBuffer.length >= this.maxSamples) {
                this.collected = true;
                
                // Invia sample al main thread tramite message port
                this.port.postMessage({
                    type: 'samples',
                    data: this.sampleBuffer
                });
                
                console.log('[fingerprint-audio] Sample raccolti:', this.sampleBuffer.length);
                
                // Termina processing
                return false;
            }
        }
        
        // Continua processing
        return true;
    }
}

/**
 * Registra il processore con nome univoco
 * Nome usato da AudioWorkletNode nel main thread
 */
registerProcessor('fingerprint-audio', FingerprintAudio);
