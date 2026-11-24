/**
 * File: mappa.js
 * Author: AlbGri
 * Copyright: (c) 2026 Alberto G. - Licensed under AGPL-3.0
 * Created: 2026-11-24
 * Description: Mappa del sito. Sotto la pagina corrente elenca i suoi titoli h2 con un id,
 *              cosi' fa da indice della pagina; sul telefono si apre dal pulsante in basso.
 *              Espone window.Mappa.aggiorna, che il viewer chiama dopo aver disegnato i gruppi
 */

(function() {
    'use strict';

    const mappa = document.getElementById('mappa');
    const pulsante = document.getElementById('apri-mappa');

    // Voci delle sezioni sotto la pagina corrente; un titolo lungo ha il nome breve nel dizionario,
    // alla chiave mappa.<id>, perche' nella colonna andrebbe a capo
    function aggiorna() {
        const voce = mappa.querySelector('a[aria-current]').parentElement;
        const titoli = document.querySelectorAll('main h2[id]');
        let elenco = voce.querySelector('ul');
        if (!elenco) {
            elenco = document.createElement('ul');
            voce.appendChild(elenco);
        }
        elenco.replaceChildren(...[...titoli].map(titolo => {
            const link = document.createElement('a');
            link.href = `#${titolo.id}`;
            const breve = `mappa.${titolo.id}`;
            link.textContent = window.I18n.has(breve) ? window.I18n.t(breve) : titolo.textContent;
            const riga = document.createElement('li');
            riga.appendChild(link);
            return riga;
        }));
        elenco.hidden = titoli.length === 0;
    }

    function aperta() {
        return document.body.classList.contains('mappa-aperta');
    }

    function scriviPulsante() {
        pulsante.textContent = window.I18n.t(aperta() ? 'mappa.chiudi' : 'mappa.titolo');
        pulsante.setAttribute('aria-expanded', aperta());
    }

    pulsante.addEventListener('click', () => {
        document.body.classList.toggle('mappa-aperta');
        scriviPulsante();
    });
    // Sul telefono una voce scelta chiude il foglio
    mappa.addEventListener('click', e => {
        if (e.target.closest('a') && aperta()) {
            document.body.classList.remove('mappa-aperta');
            scriviPulsante();
        }
    });

    window.I18n.ready.then(() => {
        scriviPulsante();
        aggiorna();
    });
    document.addEventListener('df:lingua', () => {
        scriviPulsante();
        aggiorna();
    });

    window.Mappa = { aggiorna };
})();
