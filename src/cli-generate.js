#!/usr/bin/env node
/**
 * Writes every generated artefact of the repository from src/:
 *
 *   pygments-sparql-generate/pygments_sparql_generate/_lexicon.py
 *   dist/codemirror.mjs                       (CodeMirror 6, one ESM file)
 *
 * usage: node src/cli-generate.js [--check]
 *   --check  write nothing; exit 1 if a file in the tree is not the output
 *            of the generators (what `npm test` runs).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** [path relative to ROOT, () => text] */
function artefacts() {
    const out = [
        ['pygments-sparql-generate/pygments_sparql_generate/_lexicon.py',
            () => require('./python-lexicon').pythonLexicon()],
        ['dist/codemirror.mjs',
            () => require('./codemirror-esm').esmText()],
    ];
    return out;
}

function main() {
    const check = process.argv.includes('--check');
    let stale = 0;
    for (const [rel, make] of artefacts()) {
        const file = path.join(ROOT, rel);
        const text = make();
        if (check) {
            const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
            if (old !== text) {
                stale++;
                console.error(`stale  ${rel} — run \`npm run generate\``);
            }
            continue;
        }
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
        console.log(`wrote  ${rel}`);
    }
    if (stale) process.exit(1);
}

if (require.main === module) main();
module.exports = { artefacts };
