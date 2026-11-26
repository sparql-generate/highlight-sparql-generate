'use strict';
/**
 * Prism language for SPARQL-Generate: `sparql-generate` (alias `rqg`).
 *
 * Built on Prism's own `sparql` (itself an extension of `turtle`): a copy of
 * it, with the tokens of src/lexicon.js inserted BEFORE its own, so that they
 * win where they apply and never apply to plain SPARQL (parity test).
 *
 * Prism matches each token with one regular expression, so an embedded
 * expression is matched flat (lexicon `interpFlat`: string literals skipped
 * whole, one level of nested braces); the expression inside is then
 * tokenised with this same grammar, recursively.
 *
 * usage:
 *     const Prism = require('prismjs');
 *     require('prismjs/components/prism-turtle');
 *     require('prismjs/components/prism-sparql');
 *     require('highlight-sparql-generate/prism')(Prism);
 *     Prism.highlight(code, Prism.languages['sparql-generate'], 'sparql-generate');
 */
const L = require('./lexicon');

const NAME = 'sparql-generate';

/** Token classes this grammar gives on its own (aliases), by role. */
const ALIAS = {
    'interp.punct': ['interpolation-punctuation', 'punctuation'],
    'keyword.generate': 'keyword',
    // Prism's SPARQL gives its built-in calls (COALESCE, IF) the class keyword
    'builtin.generate': 'keyword',
    'function.library': 'builtin',
    'string': 'string',
    'iri': 'url',
};

function register(Prism) {
    if (!Prism.languages.sparql) {
        throw new Error('highlight-sparql-generate/prism: load prism-turtle and prism-sparql first');
    }
    const INTERP = L.P.interpFlat;
    const SHORT = (q) => `${q}(?:[^${q}\\\\\\n{]|\\\\.)*${INTERP}(?:[^${q}\\\\\\n{]|\\\\.|${INTERP})*${q}`;
    const LONG = (q) => `${q}${q}${q}(?:[^${q}\\\\{]|${q}(?!${q}${q})|\\\\[\\s\\S]|${INTERP})*?` +
        `${INTERP}(?:[^${q}\\\\{]|${q}(?!${q}${q})|\\\\[\\s\\S]|${INTERP})*${q}${q}${q}`;
    const IRI = `<${L.P.iriChar}*${INTERP}(?:${L.P.iriChar}|${INTERP})*>`;

    Prism.languages[NAME] = Prism.languages.extend('sparql', {});
    const interpolation = {
        // not after a backslash: `\{` is an escaped brace (ECHAR)
        pattern: new RegExp('(?<!\\\\)' + INTERP),
        inside: {
            'interpolation-punctuation': { pattern: /^\{|\}$/, alias: ALIAS['interp.punct'] },
        },
    };
    const nodeInside = {
        'interpolation-punctuation': { pattern: /^[?$]\{|\}$/, alias: ALIAS['interp.punct'] },
    };
    const templated = (pattern, alias) => ({
        pattern: new RegExp(pattern),
        greedy: true,
        alias,
        inside: { interpolation },
    });

    Prism.languages.insertBefore(NAME, 'comment', {
        'expression-node': {
            pattern: new RegExp(`[?$]${INTERP}`),
            greedy: true,
            inside: nodeInside,
        },
        'template-string': [
            templated(LONG('"'), ALIAS.string),
            templated(LONG("'"), ALIAS.string),
            templated(SHORT('"'), ALIAS.string),
            templated(SHORT("'"), ALIAS.string),
        ],
        'template-iri': templated(IRI, ALIAS.iri),
    });
    Prism.languages.insertBefore(NAME, 'function', {
        'library-function': {
            pattern: new RegExp(L.P.libraryName),
            alias: ALIAS['function.library'],
        },
    });
    Prism.languages.insertBefore(NAME, 'keyword', {
        'generate-keyword': {
            pattern: new RegExp(L.P.generateKeywords, 'i'),
            alias: ALIAS['keyword.generate'],
        },
        'generate-builtin': {
            pattern: new RegExp(L.P.generateBuiltins, 'i'),
            alias: ALIAS['builtin.generate'],
        },
    });

    // The expression inside is this same grammar: set once it is final
    // (insertBefore builds a new object each time).
    const lang = Prism.languages[NAME];
    interpolation.inside.rest = lang;
    nodeInside.rest = lang;
    Prism.languages.rqg = lang;
    return lang;
}

module.exports = register;
module.exports.ALIAS = ALIAS;
module.exports.NAME = NAME;
