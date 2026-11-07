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

    let language = 'it';
    let strings = {};

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

    /** Carica la lingua e aggiorna i testi statici marcati con data-i18n */
    async function setLanguage(code) {
        const response = await fetch(`i18n/${code}.json`);
        strings = await response.json();
        language = code;
        document.documentElement.lang = code;
        document.querySelectorAll('[data-i18n]').forEach(node => {
            node.textContent = t(node.dataset.i18n);
        });
    }

    window.I18n = {
        t, m, has, resolve,
        getLanguage: () => language,
        // Gli altri script aspettano questa promessa prima di scrivere testi
        ready: setLanguage(language)
    };
})();
