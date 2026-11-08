/**
 * File: i18n.js
 * Author: AlbGri
 * Copyright: (c) 2026 Alberto G. - Licensed under AGPL-3.0
 * Created: 2026-11-07
 * Description: Testi della pagina dai dizionari in i18n/. Script classico come gli altri:
 *              espone window.I18n
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'df.language';
    const LINGUE = ['it', 'en'];
    // I dizionari stanno accanto a js/: cosi' li trovano anche le pagine in una sottocartella
    const DIZIONARI = new URL('../i18n/', document.currentScript.src);

    let language = 'it';
    let strings = {};

    // Italiano se non c'e' una scelta salvata: la lingua del browser non conta
    function linguaSalvata() {
        try {
            const salvata = localStorage.getItem(STORAGE_KEY);
            return LINGUE.includes(salvata) ? salvata : 'it';
        } catch (e) {
            return 'it';
        }
    }

    /**
     * Messaggio da tradurre quando si mostra: chi raccoglie i dati non dipende dalla lingua
     * @param {string} key - Chiave del dizionario
     * @param {Object} [vars] - Valori dei segnaposto, anche messaggi a loro volta
     * @returns {{i18n: string, vars: Object}} Messaggio
     */
    function m(key, vars) {
        return { i18n: key, vars: vars };
    }

    /**
     * Testo da mostrare: traduce i messaggi, unisce gli elenchi, il resto diventa stringa
     * @param {*} value - Stringa, numero, messaggio o elenco
     * @returns {string} Testo
     */
    function resolve(value) {
        if (Array.isArray(value)) {
            return value.map(resolve).join(', ');
        }
        if (value && typeof value === 'object' && value.i18n) {
            return t(value.i18n, value.vars);
        }
        return value === null || value === undefined ? '' : String(value);
    }

    /**
     * Testo tradotto; i segnaposto {nome} vengono sostituiti con vars.nome
     * @param {string} key - Chiave del dizionario
     * @param {Object} [vars] - Valori dei segnaposto
     * @returns {string} Testo, o la chiave se manca
     */
    function t(key, vars = {}) {
        return (strings[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => resolve(vars[name]));
    }

    function has(key) {
        return key in strings;
    }

    /** Carica la lingua e aggiorna i testi statici marcati con data-i18n e il pulsante */
    async function setLanguage(code) {
        const response = await fetch(new URL(`${code}.json`, DIZIONARI));
        strings = await response.json();
        language = code;
        document.documentElement.lang = code;
        document.querySelectorAll('[data-i18n]').forEach(node => {
            node.textContent = t(node.dataset.i18n);
        });

        // Il pulsante mostra la lingua verso cui si passa
        const pulsante = document.getElementById('language-toggle');
        const prossima = code === 'it' ? 'en' : 'it';
        pulsante.textContent = prossima.toUpperCase();
        pulsante.dataset.flag = prossima;
        pulsante.title = t('lingua.passa');
        pulsante.setAttribute('aria-label', t('lingua.passa'));
    }

    // Al cambio gli altri script ridisegnano i loro testi con l'evento df:lingua
    document.getElementById('language-toggle').addEventListener('click', async () => {
        const prossima = language === 'it' ? 'en' : 'it';
        await setLanguage(prossima);
        try {
            localStorage.setItem(STORAGE_KEY, prossima);
        } catch (e) {
            // Senza localStorage la scelta vale fino al ricaricamento
        }
        document.dispatchEvent(new Event('df:lingua'));
    });

    window.I18n = {
        t, m, has, resolve,
        getLanguage: () => language,
        // Gli altri script aspettano questa promessa prima di scrivere testi
        ready: setLanguage(linguaSalvata())
    };
})();
