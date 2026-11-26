'use strict';
/**
 * highlight.js language for SPARQL-Generate: `sparql-generate` (alias `rqg`).
 *
 * highlight.js ships no SPARQL, so this backend is the whole language: the
 * SPARQL 1.1 vocabulary AND the SPARQL-Generate additions, both from
 * src/lexicon.js. There is no parity test for this engine (nothing to be in
 * parity with); its goldens freeze its output on the plain SPARQL fixtures
 * as well as on the SPARQL-Generate ones.
 *
 * Embedded expressions are real nested modes: an interpolation contains the
 * top-level modes of the language, so expressions nest to any depth.
 *
 * usage:
 *     const hljs = require('highlight.js/lib/core');
 *     hljs.registerLanguage('sparql-generate', require('highlight-sparql-generate/highlightjs'));
 *     hljs.highlight(code, { language: 'sparql-generate' });
 */
const L = require('./lexicon');

/** Scopes this language gives, by role (and to SPARQL constructs). */
const SCOPE = {
    'interp.punct': 'template-variable',
    'interp.body': 'subst',
    'keyword.generate': 'keyword',
    'builtin.generate': 'built_in',
    'function.library': 'built_in',
    'string': 'string',
    'iri': 'link',
};

function sparqlGenerate(hljs) {
    const re = (source, flags) => new RegExp(source, flags);

    const KEYWORDS = {
        $pattern: /[A-Za-z_]\w*/,
        keyword: L.SPARQL_KEYWORDS.concat(L.GENERATE_KEYWORDS, ['a']),
        built_in: L.SPARQL_BUILTINS.concat(L.GENERATE_BUILTINS),
        literal: ['true', 'false'],
    };

    // The modes an expression may contain: filled below, once they exist, so
    // that an interpolation can contain the whole language.
    const EXPRESSION = [];

    // Keywords are per mode in highlight.js: every mode that holds SPARQL
    // code names them.
    const GROUP = { begin: /\{/, end: /\}/, keywords: KEYWORDS, contains: EXPRESSION };
    const interpolation = (begin) => ({
        scope: SCOPE['interp.body'],
        begin,
        end: /\}/,
        beginScope: SCOPE['interp.punct'],
        endScope: SCOPE['interp.punct'],
        keywords: KEYWORDS,
        contains: EXPRESSION,
    });
    const INTERP = interpolation(/\{/);
    const ESCAPE = { scope: 'char.escape', begin: /\\[\s\S]/ };

    const string = (begin, end, multiline) => ({
        scope: SCOPE.string,
        begin,
        end,
        illegal: multiline ? undefined : /\n/,
        contains: [ESCAPE, INTERP],
    });

    const IRI_TEMPLATE = {
        scope: SCOPE.iri,
        begin: re(L.P.xiriStart),
        end: /(?:>|(?=[\s<"|^`\\]))/,
        contains: [INTERP],
    };
    const IRI = { scope: SCOPE.iri, begin: re(`<${L.P.iriChar}*>`) };

    const TOP = [
        hljs.COMMENT('#', '$'),
        interpolation(re(L.P.xexprOpen)),
        { scope: 'variable', begin: /[?$][A-Za-z0-9_\u00B7\u00C0-\uFFFD]+/ },
        IRI_TEMPLATE,
        IRI,
        string(/"""/, /"""/, true),
        string(/'''/, /'''/, true),
        string(/"/, /"/, false),
        string(/'/, /'/, false),
        { scope: 'meta', begin: /@[A-Za-z]+(?:-[A-Za-z0-9]+)*/, relevance: 0 },
        { scope: 'symbol', begin: /_:[\w.-]*\w/ },
        { scope: SCOPE['function.library'], begin: re(L.P.libraryName) },
        {   // a prefixed name: `ex:name`, `:name`, `ex:`
            scope: 'symbol',
            begin: /(?:[A-Za-z][\w.-]*)?:(?:(?:[\w:%-]|\\[\S])(?:[\w.:%-]|\\[\S])*(?:[\w:%-]|\\[\S]))?/,
            relevance: 0,
        },
        { scope: 'number', begin: /[+-]?(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/, relevance: 0 },
        { scope: 'operator', begin: /\^\^|\|\||&&|!=|<=|>=|[=<>!*/+\-|^]/, relevance: 0 },
    ];
    EXPRESSION.push(GROUP, ...TOP);

    return {
        name: 'SPARQL-Generate',
        aliases: ['rqg', 'sparqlgenerate'],
        case_insensitive: true,
        keywords: KEYWORDS,
        contains: TOP,
    };
}

module.exports = sparqlGenerate;
module.exports.SCOPE = SCOPE;
