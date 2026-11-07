/**
 * File: logger.js
 * Author: AlbGri
 * Copyright: (c) 2025 Alberto G. - Licensed under AGPL-3.0
 * Created: 2025-10-21
 * Description: Log in console solo in locale o con ?debug=true; gli errori sempre.
 */

(function() {
    'use strict';

    const DEBUG_MODE = (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.search.includes('debug=true')
    );

    window.logger = {
        log: function(...args) {
            if (DEBUG_MODE) console.log(...args);
        },

        warn: function(...args) {
            if (DEBUG_MODE) console.warn(...args);
        },

        error: function(...args) {
            console.error(...args);
        }
    };
})();
