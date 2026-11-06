'use strict';
/**
 * THE lexicon of SPARQL-Generate, written once.
 *
 * SPARQL-Generate (grammar `spargl.jj` of the Java engine) is SPARQL 1.1 plus
 * a closed set of additions. Every backend of this package starts from the
 * SPARQL highlighting its engine already ships, when it ships one, and adds
 * only what this module describes:
 *
 *   - the keywords of the new query forms and clauses (`GENERATE`, `TEMPLATE`,
 *     `ITERATOR`, `SOURCE … ACCEPT`, `BOX`, `FORMAT`, …);
 *   - the expression nodes: `?{ expr }` / `${ expr }` in node position, and
 *     `{ expr }` embedded in IRIs (`<http://ex/{?id}>`) and in string
 *     literals (`"Hello {?name}!"`, all four quote styles);
 *   - the function and iterator libraries, by their conventional prefixes
 *     `fun:` and `iter:`.
 *
 * The engines that have no SPARQL of their own (highlight.js) also take the
 * SPARQL 1.1 vocabulary from here, so that it is not described twice.
 *
 * What is shared: word lists, regular-expression atoms, role names. What is
 * not: the shape of the rules (begin/end stack of TextMate, mode tree of
 * highlight.js, ordered table of Prism, state machine of CodeMirror, states
 * of Pygments). Translating one model into another would cost more than the
 * unification brings; the guarantee is carried by the tests instead.
 *
 * The regular expressions are written in the subset common to JavaScript
 * (RegExp), Oniguruma (TextMate) and Python `re` (Pygments): no inline flag
 * groups (each backend adds case-insensitivity its own way), lookbehinds of
 * fixed width only, ASCII classes plus `\w`.
 *
 * `npm run generate` copies this module into the Python package
 * (`pygments/pygments_sparql_generate/_lexicon.py`); `npm test` and `pytest`
 * both fail if the copy has drifted.
 */

// ------------------------------------------------------------- vocabulary

/** SPARQL 1.1 keywords (case-insensitive), as `spargl.jj` tokenises them.
 *  Used by the engines that have no SPARQL highlighting of their own. */
const SPARQL_KEYWORDS = [
    'base', 'prefix', 'select', 'distinct', 'reduced', 'construct',
    'describe', 'ask', 'from', 'named', 'where', 'order', 'by', 'asc', 'desc',
    'limit', 'offset', 'values', 'undef', 'graph', 'optional', 'union',
    'minus', 'bind', 'service', 'silent', 'filter', 'exists', 'not', 'in',
    'as', 'group', 'having', 'separator', 'load', 'clear', 'drop', 'create',
    'add', 'move', 'copy', 'insert', 'delete', 'data', 'with', 'using',
    'into', 'to', 'default', 'all',
];

/** SPARQL 1.1 built-in functions and aggregates (case-insensitive). */
const SPARQL_BUILTINS = [
    'str', 'lang', 'langmatches', 'datatype', 'bound', 'iri', 'uri', 'bnode',
    'rand', 'abs', 'ceil', 'floor', 'round', 'concat', 'strlen', 'ucase',
    'lcase', 'encode_for_uri', 'contains', 'strstarts', 'strends',
    'strbefore', 'strafter', 'year', 'month', 'day', 'hours', 'minutes',
    'seconds', 'timezone', 'tz', 'now', 'uuid', 'struuid', 'md5', 'sha1',
    'sha224', 'sha256', 'sha384', 'sha512', 'coalesce', 'if', 'strlang',
    'strdt', 'sameterm', 'isiri', 'isuri', 'isblank', 'isliteral',
    'isnumeric', 'regex', 'substr', 'replace', 'count', 'sum', 'min', 'max',
    'avg', 'sample', 'group_concat',
];

/** The keywords SPARQL-Generate adds to SPARQL 1.1 — `spargl.jj`, the
 *  `TOKEN [IGNORE_CASE]` block from `GENERATE` to `PERFORM`. Never a keyword
 *  in a SPARQL 1.1 query: a bare word there is always one of the SPARQL
 *  keywords, so highlighting these cannot change a pure SPARQL query. */
const GENERATE_KEYWORDS = [
    'generate', 'template', 'perform', 'function',
    'iterator', 'source', 'accept',
    'box', 'format', 'before', 'after',
    'list', 'expressions', 'pragma',
];

/** SPARQL words that SPARQL-Generate uses BARE where SPARQL never does:
 *  `GROUP` alone opens a template group (`GROUP DISTINCT { … }`), where
 *  SPARQL only knows `GROUP BY`. An engine whose SPARQL recognises the word
 *  only in its SPARQL context (Pygments: `group\s+by`) learns it bare.
 *  `DISTINCT` and `SEPARATOR` are not listed: SPARQL 1.1 already uses them
 *  bare (`COUNT(DISTINCT ?x)`, `GROUP_CONCAT(?x; SEPARATOR=",")`), so each
 *  engine keeps the class its SPARQL gives them. */
const REUSED_KEYWORDS = ['group'];

/** Conventional prefixes of the SPARQL-Generate libraries:
 *  `fun:` = <http://w3id.org/sparql-generate/fn/>,
 *  `iter:` = <http://w3id.org/sparql-generate/iter/>. A prefixed name with
 *  one of them is a library function or iterator. The prefix is declared by
 *  the query, like any other, so this is a convention, not a rule of the
 *  grammar — documented as such in the README. */
const LIBRARY_PREFIXES = ['fun', 'iter'];

// ------------------------------------------------------------------ atoms

const BT = '`';

const R = {
    /** a word of `words`, as a whole word: not part of a variable (`?list`),
     *  a prefixed name (`ex:source`, `source:x`, `ex:a.box`) or a blank node
     *  label. Case-insensitivity is added by each backend. */
    word: (words) => String.raw`(?<![\w?$:.\-])(?:` + words.join('|') + String.raw`)(?![\w\-:])`,

    /** opening of an expression node in node position: `?{` or `${`. */
    xexprOpen: String.raw`[?$]\{`,

    /** a character of an IRIREF body (SPARQL 1.1 `IRIREF`, minus `{`/`}`). */
    iriChar: String.raw`[^<>"{}|^` + BT + String.raw`\\\x00-\x20]`,

    /** start of an IRI with embedded expressions (`XIRIref_START` of
     *  `spargl.jj`): `<`, IRI characters, then `{`. An IRI without `{` is a
     *  plain SPARQL IRIREF and stays with the base highlighting. */
    get xiriStart() { return '<(?=' + this.iriChar + String.raw`*\{)`; },

    /** ECHAR of `spargl.jj`: SPARQL escapes plus `\{` and `\}`, which keep a
     *  literal brace in a template string. */
    echar: String.raw`\\[tbnrf"'\\{}]`,

    /** a library function or iterator name: `fun:CSSPath`, `iter:JSONPath`. */
    libraryName: '(?<![\\w?$:.\\-])(?:' + LIBRARY_PREFIXES.join('|') +
        String.raw`):[A-Za-z_](?:[\w.\-]*[\w\-])?`,

    /** the body of an embedded expression, FLAT: no nested braces, string
     *  literals skipped whole. For the engines that match a whole token with
     *  one regular expression (Prism); the others keep a real stack. */
    get interpFlat() {
        return String.raw`\{(?:[^{}"'\n]|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')*\}`;
    },
};

// ------------------------------------------------------------------ roles
//
// What a character IS, independently of any engine. Each backend maps a role
// to its native class (Pygments token type, TextMate scope, CodeMirror token
// name, Prism token, highlight.js scope), choosing for `string` and `iri` the
// class its SPARQL highlighting already gives to a string or an IRI, so that
// the parts of a template look like what they are.

const ROLES = {
    'keyword.generate': 'a SPARQL-Generate keyword',
    'function.library': 'a fun: or iter: function name',
    'interp.punct': 'the braces of an embedded expression, and ?{ / ${',
    'string': 'the literal part of a string with embedded expressions',
    'iri': 'the literal part of an IRI with embedded expressions',
};

// ------------------------------------------------------- final patterns
//
// The patterns the backends use, assembled once. Plain strings: this is what
// `npm run generate` copies into the Python package.

const P = {
    generateKeywords: R.word(GENERATE_KEYWORDS),
    reusedKeywords: R.word(REUSED_KEYWORDS),
    libraryName: R.libraryName,
    xexprOpen: R.xexprOpen,
    iriChar: R.iriChar,
    xiriStart: R.xiriStart,
    echar: R.echar,
    interpFlat: R.interpFlat,
};

module.exports = {
    SPARQL_KEYWORDS,
    SPARQL_BUILTINS,
    GENERATE_KEYWORDS,
    REUSED_KEYWORDS,
    LIBRARY_PREFIXES,
    R,
    P,
    ROLES,
};
