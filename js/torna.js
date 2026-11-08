/**
 * File: torna.js
 * Author: AlbGri
 * Copyright: (c) 2026 Alberto G. - Licensed under AGPL-3.0
 * Created: 2026-11-08
 * Description: "Torna alla tua impronta" come il tasto Indietro del browser, se c'e' una pagina
 *              prima: ricaricare la demo conterebbe una visita in piu' e rifarebbe lo speed test.
 *              Aperta da sola, la pagina segue il link.
 */

(function() {
    'use strict';

    document.querySelector('[data-torna]').addEventListener('click', e => {
        if (history.length > 1) {
            e.preventDefault();
            history.back();
        }
    });
})();
