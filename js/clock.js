/**
 * File: clock.js
 * Author: AlbGri
 * Copyright: (c) 2026 Alberto G. - Licensed under AGPL-3.0
 * Created: 2026-11-07
 * Description: Orologio con il fuso orario scelto, sempre in vista; al clic un elenco per
 *              cambiarlo. Il fuso del browser, che la demo mostra, e' un dato raccolto e non
 *              c'entra con questo. Espone window.Clock
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'df.timezone';
    const PREDEFINITO = 'Europe/Rome';
    const FUSI = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [PREDEFINITO];

    const pulsante = document.getElementById('clock');
    const elenco = document.getElementById('timezone-select');

    // Europe/Rome se non c'e' una scelta salvata: il fuso del browser non conta
    function fusoSalvato() {
        try {
            const salvato = localStorage.getItem(STORAGE_KEY);
            return FUSI.includes(salvato) ? salvato : PREDEFINITO;
        } catch (e) {
            return PREDEFINITO;
        }
    }

    let fuso = fusoSalvato();

    function aggiorna() {
        const ora = new Date().toLocaleTimeString(window.I18n.getLanguage(), {
            timeZone: fuso, hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        pulsante.textContent = `${ora} ${fuso}`;
        pulsante.title = window.I18n.t('orologio.cambia');
        elenco.setAttribute('aria-label', window.I18n.t('orologio.fuso'));
    }

    FUSI.forEach(nome => elenco.add(new Option(nome, nome)));
    elenco.value = fuso;
    mostraElenco(false);

    function mostraElenco(visibile) {
        elenco.hidden = !visibile;
        pulsante.setAttribute('aria-expanded', visibile);
    }

    pulsante.addEventListener('click', () => {
        mostraElenco(elenco.hidden);
        if (!elenco.hidden) {
            elenco.focus();
        }
    });

    elenco.addEventListener('change', () => {
        fuso = elenco.value;
        try {
            localStorage.setItem(STORAGE_KEY, fuso);
        } catch (e) {
            // Senza localStorage la scelta vale fino al ricaricamento
        }
        mostraElenco(false);
        aggiorna();
        // Le ore mostrate dalla pagina si ridisegnano nel fuso nuovo
        document.dispatchEvent(new Event('df:fuso'));
    });

    document.addEventListener('df:lingua', aggiorna);
    window.I18n.ready.then(aggiorna);
    aggiorna();
    setInterval(aggiorna, 1000);

    window.Clock = { getTimeZone: () => fuso };
})();
