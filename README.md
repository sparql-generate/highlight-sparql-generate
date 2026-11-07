# highlight-sparql-generate

Syntax highlighting for [SPARQL-Generate](https://ci.mines-stetienne.fr/sparql-generate/)
(`.rqg`, media type `application/vnd.sparql-generate`): **one lexicon, one
backend per engine**, each tested against the SPARQL highlighting its engine
already ships.

## Quick start: what to install

| Engine | Name | Path in this repository | Install from a local clone |
|---|---|---|---|
| **Pygments** (MkDocs, Sphinx, ReadTheDocs, LaTeX `minted`, `pygmentize`) | Python package `pygments-sparql-generate`, lexer alias **`sparql-generate`** (also `rqg`), class `pygments_sparql_generate.SparqlGenerateLexer` | `pygments-sparql-generate/` | `pip install -e ../highlight-sparql-generate/pygments-sparql-generate` |
| **CodeMirror 6** (web editors, the playground) | ES module **`dist/codemirror.mjs`**, export `sparqlGenerate` (a `StreamParser`); CommonJS: `src/codemirror.js`, export `build` | `dist/codemirror.mjs` | `npm install ../highlight-sparql-generate`, then `import { sparqlGenerate } from 'highlight-sparql-generate/codemirror.mjs'` — or copy the single file next to your page |
| TextMate (VS Code, GitHub Linguist) | grammar `source.sparql-generate` | `dist/sparql-generate.tmLanguage.json` | vendored by [vscode-sparql-generate](https://github.com/sparql-generate/vscode-sparql-generate), which `npm run generate` updates when it sits next to this repository |
| highlight.js | language `sparql-generate` | `src/highlightjs.js` | `hljs.registerLanguage('sparql-generate', require('highlight-sparql-generate/highlightjs'))` |
| Prism | language `sparql-generate` (alias `rqg`) | `src/prism.js` | `require('highlight-sparql-generate/prism')(Prism)` |

### Pygments

```sh
pip install -e path/to/highlight-sparql-generate/pygments-sparql-generate
pygmentize -l sparql-generate -f html query.rqg
```

The package registers itself through the `pygments.lexers` entry point, so
every Pygments client finds it by name once it is installed in the same
environment:

- **MkDocs Material** (`pymdownx.highlight`): fence a block with
  ` ```sparql-generate `.
- **Sphinx**: `.. code-block:: sparql-generate`.
- **LaTeX minted**: `\begin{minted}{sparql-generate} … \end{minted}`
  (compile with `-shell-escape`, with the package installed in the Python
  that `pygmentize` runs from).

### CodeMirror 6

```js
import { StreamLanguage } from '@codemirror/language';
import { sparqlGenerate } from 'highlight-sparql-generate/codemirror.mjs';

const sparqlGenerateLanguage = StreamLanguage.define(sparqlGenerate);
// new EditorView({ extensions: [basicSetup, sparqlGenerateLanguage], … })
```

`dist/codemirror.mjs` is a single ES module: it imports only
`@codemirror/legacy-modes/mode/sparql` and `@lezer/highlight`, which any
CodeMirror 6 setup already has (through a bundler or an import map). The
interpolation braces get the tags `special(brace)` and `escape`
(`tok-punctuation tok-string2` with `classHighlighter`).

## What is highlighted

SPARQL-Generate is SPARQL 1.1 plus a closed set of additions, read from the
grammar of the Java engine (`spargl.jj`):

- the keywords of the new query forms and clauses: `GENERATE`, `TEMPLATE`,
  `PERFORM`, `FUNCTION`, `ITERATOR`, `SOURCE` … `ACCEPT`, `BOX`, `FORMAT`,
  `BEFORE`, `AFTER`, `LIST`, `EXPRESSIONS`, `PRAGMA`, and `GROUP` alone
  (a template group, `GROUP DISTINCT { … ; SEPARATOR = ", " }`);
- **expression nodes**: `?{ expr }` and `${ expr }` in node position;
- **embedded expressions** in IRIs, `<http://example.org/{?id}>`, and in
  string literals of all four quote styles, `"Hello {?name}"`,
  `"""… {?x} …"""`; `\{` and `\}` keep a literal brace. The expression inside
  is highlighted as SPARQL, recursively;
- the **function and iterator libraries**, by their conventional prefixes:
  `fun:CSSPath(…)`, `iter:JSONPath(…)`. The prefix is declared by the query
  like any other, so this is a convention, not a rule of the grammar.

## GitHub (Linguist)

`dist/sparql-generate.tmLanguage.json` is self-contained (no include of a
scope it does not define) and carries its licence, which is what GitHub
Linguist asks of a grammar. Linguist only adds a **new language** once it is
used in a couple of hundred repositories, so SPARQL-Generate is not
recognised on GitHub yet. Meanwhile, a repository can have its `.rqg` files
highlighted as SPARQL with one line of `.gitattributes`:

```gitattributes
*.rqg linguist-language=SPARQL
```

When the time comes, the submission is a pull request to
[github-linguist/linguist](https://github.com/github-linguist/linguist)
adding `SPARQL-Generate` (`.rqg`, `tm_scope: source.sparql-generate`) and this
repository as the grammar source.

## The principle

**Describe nothing twice.** `src/lexicon.js` holds the word lists, the
regular-expression atoms (in the subset common to JavaScript, Oniguruma and
Python `re`) and the role names. Each backend starts from the SPARQL
highlighting of its engine and adds only the lexicon:

| Engine | SPARQL base | What this repository adds |
|---|---|---|
| Pygments | `SparqlLexer` | rules in front of its own, `{` taught to its string states |
| CodeMirror 6 | `@codemirror/legacy-modes/mode/sparql` | a stream parser that delegates every SPARQL token to it |
| Prism | `Prism.languages.sparql` | tokens inserted before its own |
| TextMate | the SPARQL and Turtle grammars of `stardog-union.stardog-rdf-grammars` (Apache-2.0), vendored in `vendor/` | patterns in front, an interpolation rule injected into its string rules |
| highlight.js | none — highlight.js ships no SPARQL | the whole language, from the lexicon's SPARQL 1.1 vocabulary |

The Pygments lexer reads the lexicon from `_lexicon.py`, which
`npm run generate` writes from `src/lexicon.js`; the TextMate grammar and the
CodeMirror ES module are generated the same way, into `dist/`.

## What the tests guarantee

`npm test` (JavaScript engines) and `pytest` (Pygments), on the fixtures of
`test/fixtures/`:

1. **Parity with SPARQL.** A plain SPARQL 1.1 query (`test/fixtures/pure/`)
   gets *exactly* the tokens of the engine's own SPARQL highlighting,
   character for character — words such as `source`, `list` or `template`
   in variables and prefixed names included. The known divergences are named
   in the tests and must still be observed (see below).
2. **Golden** files per engine (`test/golden/`) for every fixture; the
   SPARQL-Generate fixtures cover every construct listed above.
3. **Roles.** On the SPARQL-Generate fixtures, every engine gives the same
   role (keyword, library function, interpolation brace) to the same
   characters.
4. **Syntax.** The fixtures are valid SPARQL-Generate for the Java engine
   (`-x` of the CLI; skipped when no JAR is found — `SPARQL_GENERATE_JAR=…`,
   `SPARQL_GENERATE_JAVA=…` to name a JAR and a Java ≥ 17 for 2.2).
5. **Drift.** Every generated file is the output of `npm run generate`, and
   every pattern of the lexicon compiles under V8 and Oniguruma (and Python
   `re`, through pytest).

```sh
npm ci && npm test
pip install -e 'pygments-sparql-generate[test]' && pytest
UPDATE_GOLDEN=1 npm test && UPDATE_GOLDEN=1 pytest   # after a deliberate change
```

### Known divergences

- **Strings containing `{`.** In SPARQL 1.1, `"a{2}"` is a plain string; in
  SPARQL-Generate, `{2}` is an embedded expression. The highlighting follows
  SPARQL-Generate: this is the one place where a valid SPARQL 1.1 query is
  *read differently* by SPARQL-Generate, and the parity fixtures avoid it.
- **Pygments, long strings.** `SparqlLexer` runs a `"""…"""` string to the
  next backslash or the end of the input; this lexer stops at the closing
  quotes.
- **CodeMirror, long strings.** The SPARQL mode reads `"""…"""` as a run of
  short strings; this parser reads it whole. Same tokens on a long string
  without inner quotes.

## Licence

Apache-2.0 (`LICENSE`). The vendored grammars keep their own licences
(`vendor/README.md`).

The design decisions are recorded in the SPARQL-Generate steering repository
under `editor/501` and `editor/502`.
