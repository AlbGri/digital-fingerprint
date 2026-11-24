/**
 * File: tema.js
 * Author: AlbGri
 * Copyright: (c) 2026 Alberto G. - Licensed under AGPL-3.0
 * Created: 2026-11-24
 * Description: Tema chiaro e scuro dell'interfaccia. Segue il sistema finche' non si sceglie;
 *              la scelta resta nel browser come la lingua. Il tema del sistema che la demo
 *              mostra e' un dato raccolto e non c'entra con questo. Si carica nella <head>
 *              senza defer: applicato dopo, nello scuro lampeggerebbe il chiaro
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'digital-fingerprint/tema';
    const COLORE_BARRA = { chiaro: '#f4f6fa', scuro: '#232025' }; // stile:consentito: meta theme-color, uguale a --surface; il foglio qui non e' ancora caricato
    const radice = document.documentElement;
    const sistemaScuro = window.matchMedia('(prefers-color-scheme: dark)');

    try {
        const salvato = localStorage.getItem(STORAGE_KEY);
        if (salvato === 'scuro' || salvato === 'chiaro') {
            radice.dataset.tema = salvato;
        }
    } catch (e) {
        // Senza localStorage si segue il sistema
    }

    function scuro() {
        return radice.dataset.tema ? radice.dataset.tema === 'scuro' : sistemaScuro.matches;
    }

    // Il pulsante mostra il tema verso cui si passa
    function aggiornaPulsante() {
        const pulsante = document.getElementById('tema-toggle');
        pulsante.querySelector('.et').textContent = window.I18n.t(scuro() ? 'tema.chiaro' : 'tema.scuro');
        pulsante.setAttribute('aria-label', window.I18n.t(scuro() ? 'tema.passaChiaro' : 'tema.passaScuro'));
    }

    // Con un tema scelto entrambe le meta prendono il suo colore, se no vince quella del sistema
    function coloraBarra() {
        if (radice.dataset.tema) {
            document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
                meta.content = COLORE_BARRA[radice.dataset.tema];
            });
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        coloraBarra();
        document.getElementById('tema-toggle').addEventListener('click', () => {
            radice.dataset.tema = scuro() ? 'chiaro' : 'scuro';
            try {
                localStorage.setItem(STORAGE_KEY, radice.dataset.tema);
            } catch (e) {
                // Senza localStorage la scelta vale fino al ricaricamento
            }
            coloraBarra();
            aggiornaPulsante();
        });
        // I testi arrivano col dizionario: fino ad allora resta "Scuro" scritto nell'HTML
        window.I18n.ready.then(aggiornaPulsante);
        document.addEventListener('df:lingua', aggiornaPulsante);
        sistemaScuro.addEventListener('change', () => window.I18n.ready.then(aggiornaPulsante));
    });
})();
