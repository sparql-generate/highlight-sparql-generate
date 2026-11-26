# pygments-sparql-generate

A [Pygments](https://pygments.org/) lexer for
[SPARQL-Generate](https://ci.mines-stetienne.fr/sparql-generate/) (`.rqg`,
media type `application/vnd.sparql-generate`): Pygments' own `SparqlLexer`
with the SPARQL-Generate additions on top, so that a plain SPARQL 1.1 query
gets exactly the tokens `SparqlLexer` gives it.

```sh
pip install pygments-sparql-generate
pygmentize -l sparql-generate -f html query.rqg
```

Installed, the package registers the lexer with Pygments (alias
`sparql-generate`, also `rqg`; files `*.rqg`), so every Pygments client finds
it by name:

- MkDocs Material (`pymdownx.highlight`): a fenced block ` ```sparql-generate `;
- Sphinx: `.. code-block:: sparql-generate`;
- LaTeX minted: `\begin{minted}{sparql-generate} … \end{minted}`.

What is highlighted: the SPARQL-Generate keywords (`GENERATE`, `TEMPLATE`,
`ITERATOR`, `SOURCE` … `ACCEPT`, …), the built-in call `RAISE`, the
expression nodes `?{ … }` and `${ … }`, the expressions embedded in IRIs and
string literals (`<http://example.org/{?id}>`, `"Hello {?name}"`), and the
`fun:` and `iter:` library functions.

The lexer is part of
[highlight-sparql-generate](https://github.com/sparql-generate/highlight-sparql-generate),
which also gives the TextMate, highlight.js, Prism and CodeMirror 6 grammars
from the same lexicon. Apache-2.0.
