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
     * Data e ora di Roma a pezzi, con il giorno della settimana a parte: sul telefono l'orologio
     * in testata lo nasconde. Inglese britannico, giorno prima del mese
     * @param {Date} istante - Istante da mostrare
     * @returns {{giorno: string, data: string, ora: string}} Es. "martedì ", "24 novembre 2026", "14:05"
     */
    function parti(istante) {
        const lingua = window.I18n.getLanguage() === 'en' ? 'en-GB' : 'it';
        const pezzi = new Intl.DateTimeFormat(lingua, {
            timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        }).formatToParts(istante);
        // Il giorno della settimana finisce dove comincia il numero del giorno, separatore compreso
        const inizioData = pezzi.findIndex(pezzo => pezzo.type === 'day');
        const unisci = lista => lista.map(pezzo => pezzo.value).join('');
        // 24 ore anche in inglese: e' l'ora di Roma
        const ora = istante.toLocaleTimeString(lingua, {
            timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        });
        return { giorno: unisci(pezzi.slice(0, inizioData)), data: unisci(pezzi.slice(inizioData)), ora };
    }

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
        const { giorno, data, ora } = parti(istante);
        const testo = `${giorno}${data}, ${ora}`;
        return conRoma ? `${testo} (${window.I18n.t('ora.roma')})` : testo;
    }

    const orologio = document.getElementById('clock');

    function aggiorna() {
        const { giorno, data, ora } = parti(new Date());
        const giornoVisibile = document.createElement('span');
        giornoVisibile.className = 'clock-giorno';
        giornoVisibile.textContent = giorno.charAt(0).toUpperCase() + giorno.slice(1);
        orologio.replaceChildren(giornoVisibile, `${data}, ${ora} (${window.I18n.t('ora.roma')})`);
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
