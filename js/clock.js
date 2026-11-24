/**
 * File: clock.js
 * Author: AlbGri
 * Copyright: (c) 2026 Alberto G. - Licensed under AGPL-3.0
 * Created: 2026-11-07
 * Description: Orologio nell'ora di Roma, testo semplice in testata, e formato unico delle ore
 *              mostrate dalla pagina. Il fuso del browser, che la demo mostra, e' un dato
 *              raccolto e non c'entra con questo. Espone window.Clock
 */

(function() {
    'use strict';

    const FUSO = 'Europe/Rome';

    /**
     * Data, ore e minuti nell'ora di Roma, nella lingua scelta
     * @param {string|number|Date} timestamp - Istante da mostrare
     * @param {boolean} [conRoma=true] - Aggiunge "(Roma)" dopo l'ora
     * @returns {string} Es. "martedì 24 novembre 2026, 14:05 (Roma)"
     */
    function dataOra(timestamp, conRoma = true) {
        const istante = new Date(timestamp);
        // Le visite salvate prima delle date ISO sono testo gia' formattato: si mostrano come sono
        if (isNaN(istante)) {
            return timestamp;
        }
        const lingua = window.I18n.getLanguage();
        const data = istante.toLocaleDateString(lingua, {
            timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
        // 24 ore anche in inglese: e' l'ora di Roma
        const ora = istante.toLocaleTimeString(lingua, {
            timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        });
        const testo = `${data}, ${ora}`;
        return conRoma ? `${testo} (${window.I18n.t('ora.roma')})` : testo;
    }

    const orologio = document.getElementById('clock');

    function aggiorna() {
        const testo = dataOra(Date.now());
        orologio.textContent = testo.charAt(0).toUpperCase() + testo.slice(1);
    }

    // Allo scattare di ogni minuto: Roma ha uno scarto di ore intere da UTC
    function aggiornaAlMinuto() {
        aggiorna();
        setTimeout(aggiornaAlMinuto, 60000 - Date.now() % 60000);
    }

    document.addEventListener('df:lingua', aggiorna);
    window.I18n.ready.then(aggiornaAlMinuto);

    window.Clock = { dataOra };
})();
