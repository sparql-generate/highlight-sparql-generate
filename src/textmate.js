'use strict';
/**
 * TextMate grammar for SPARQL-Generate: `source.sparql-generate`.
 *
 * The base is the SPARQL grammar of the `stardog-union.stardog-rdf-grammars`
 * extension (the SPARQL grammar of the VS Code Marketplace, Apache-2.0),
 * with the Turtle grammar it includes, both vendored unmodified in vendor/.
 * They are INLINED into the repository of this grammar (keys prefixed
 * `sparql-` and `turtle-`), so that the output is self-contained: no include
 * of a scope that VS Code or GitHub Linguist might not have. The one external
 * include of the base (`source.srs`, Stardog rules, inside a Stardog-only
 * `rule:content """…"""` construct) is dropped, which is what an unresolved
 * include does anyway.
 *
 * On top of the base, and only there, the lexicon of src/lexicon.js:
 *
 *   - patterns placed BEFORE the base ones at the root: expression nodes
 *     `?{ … }`, IRIs with embedded expressions, library names, keywords;
 *   - an interpolation rule injected at the head of the base's string rules,
 *     so a string with `{ … }` keeps the base's scopes for its literal part.
 *
 * A plain SPARQL query never triggers any of these (parity test), so it gets
 * exactly the scopes of `source.sparql`. Embedded expressions are scoped
 * `meta.embedded.line.sparql-generate`, which VS Code themes reset to the
 * default foreground: the expression is not coloured as a string or an IRI.
 */
const fs = require('fs');
const path = require('path');
const L = require('./lexicon');

const VENDOR = path.join(__dirname, '..', 'vendor');
const SCOPE = 'source.sparql-generate';

/** The base's string rules that receive the interpolation rule. */
const STRING_RULES = [
    'single-squote-string-literal', 'single-dquote-string-literal',
    'triple-squote-string-literal', 'triple-dquote-string-literal',
];

function vendored(name) {
    return JSON.parse(fs.readFileSync(path.join(VENDOR, `${name}.tmLanguage.json`), 'utf8'));
}

/** Deep copy of a vendored rule, its includes rewritten to the inlined keys. */
function inline(node, prefix) {
    if (Array.isArray(node)) {
        return node.map((n) => inline(n, prefix)).filter((n) => n !== undefined);
    }
    if (!node || typeof node !== 'object') return node;
    if (typeof node.include === 'string') {
        const inc = node.include;
        if (inc.startsWith('#')) return { include: `#${prefix}${inc.slice(1)}` };
        if (inc === 'source.turtle') return { include: '#turtle' };
        if (inc === 'source.sparql') return { include: '#sparql' };
        if (inc === '$self' || inc === '$base') return node;
        return undefined;   // an external scope: dropped (see header)
    }
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = inline(v, prefix);
    return out;
}

const punct = (side) => ({ 0: { name: `punctuation.section.embedded.${side}.sparql-generate` } });

function build() {
    const sparql = vendored('sparql');
    const turtle = vendored('turtle');
    const repository = {};

    // -------------------------------------------------- SPARQL-Generate
    repository['sg-expression-node'] = {
        comment: 'An expression node, ?{ expr } or ${ expr } (XExpr of spargl.jj).',
        name: 'meta.embedded.line.sparql-generate',
        begin: L.P.xexprOpen,
        beginCaptures: punct('begin'),
        end: '\\}',
        endCaptures: punct('end'),
        patterns: [{ include: '#sg-expression' }],
    };
    repository['sg-interpolation'] = {
        comment: 'An expression embedded in a string or an IRI: { expr }.',
        name: 'meta.embedded.line.sparql-generate',
        begin: '\\{',
        beginCaptures: punct('begin'),
        end: '\\}',
        endCaptures: punct('end'),
        patterns: [{ include: '#sg-expression' }],
    };
    repository['sg-expression'] = {
        comment: 'The body of an embedded expression: SPARQL, braces balanced.',
        patterns: [{ include: '#sg-group' }, { include: '$self' }],
    };
    repository['sg-group'] = {
        comment: 'A group inside an embedded expression: { IF(EXISTS { ?s ?p ?o }, 1, 0) }.',
        begin: '\\{',
        end: '\\}',
        patterns: [{ include: '#sg-expression' }],
    };
    repository['sg-iri'] = {
        comment: 'An IRI with embedded expressions: <http://ex/{?id}> (XIRIref of spargl.jj).',
        name: 'entity.name.type.iriref.sparql-generate',
        begin: L.P.xiriStart,
        end: '>|(?=[\\s<"|^`\\\\])',
        patterns: [{ include: '#sg-interpolation' }],
    };
    repository['sg-library'] = {
        comment: 'A function or iterator of the SPARQL-Generate libraries (fun:, iter:).',
        name: 'support.function.library.sparql-generate',
        match: L.P.libraryName,
    };
    repository['sg-keywords'] = {
        comment: 'The keywords SPARQL-Generate adds to SPARQL 1.1.',
        name: 'keyword.control.sparql-generate',
        match: '(?i)' + L.P.generateKeywords,
    };

    // ------------------------------------------------------ the base
    for (const [k, v] of Object.entries(turtle.repository)) {
        repository[`turtle-${k}`] = inline(v, 'turtle-');
    }
    repository.turtle = { patterns: inline(turtle.patterns, 'turtle-') };
    for (const [k, v] of Object.entries(sparql.repository)) {
        repository[`sparql-${k}`] = inline(v, 'sparql-');
    }
    repository.sparql = { patterns: inline(sparql.patterns, 'sparql-') };

    for (const k of STRING_RULES) {
        const rule = repository[`turtle-${k}`];
        if (!rule || !Array.isArray(rule.patterns)) {
            throw new Error(`textmate: the vendored Turtle grammar has no begin/end rule ${k}`);
        }
        rule.patterns.unshift({ include: '#sg-interpolation' });
    }

    return {
        $schema: 'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
        name: 'SPARQL-Generate',
        scopeName: SCOPE,
        fileTypes: ['rqg'],
        comment: 'GENERATED by `npm run generate` (highlight-sparql-generate, src/textmate.js) '
            + 'from src/lexicon.js and the vendored stardog-rdf-grammars SPARQL and Turtle '
            + 'grammars (Apache-2.0). Do not edit.',
        patterns: [
            { include: '#sg-expression-node' },
            { include: '#sg-iri' },
            { include: '#sg-library' },
            { include: '#sg-keywords' },
            { include: '#sparql' },
        ],
        repository,
    };
}

function grammarText() {
    return JSON.stringify(build(), null, 2) + '\n';
}

module.exports = { build, grammarText, SCOPE };
