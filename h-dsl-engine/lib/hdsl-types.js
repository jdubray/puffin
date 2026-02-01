/**
 * @module hdsl-types
 * Re-exports h-M3 v2 definitions from the shared @puffin/hdsl-types package.
 *
 * The canonical definitions live in shared/hdsl-types/index.js.
 * This file exists so that existing require('./hdsl-types') paths
 * continue to work without changing every import site.
 */

'use strict';

module.exports = require('@puffin/hdsl-types');
