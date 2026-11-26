# Changelog

The npm package `highlight-sparql-generate` and the PyPI package
`pygments-sparql-generate` share their version.

## 0.2.0

Released on 2026-11-26. For SPARQL-Generate 2.6.0.

- `RAISE(message, value, ...)`, the built-in call of SPARQL-Generate 2.6.0
  that stops the execution with an error, is highlighted in every engine, in
  any case (`RAISE`, `raise`, `Raise`), as the engine's SPARQL highlights
  `COALESCE`: `support.function` (TextMate), `builtin` (CodeMirror 6),
  `keyword` (Prism), `built_in` (highlight.js), `Name.Function` (Pygments).
  A variable `?raise` or a local name `ex:raise` is not. The lexicon has a
  new list, `GENERATE_BUILTINS`, a new pattern, `P.generateBuiltins`, and a
  new role, `builtin.generate`, checked across the engines.
- New fixture `raise.rqg`, valid for SPARQL-Generate 2.6.0.
- `pygments-sparql-generate` has a README, shown on PyPI.

The other changes of SPARQL-Generate since 2.4.0 add no keyword, function
or iterator: the command-line options `--graphs-to-files` and `--targets`
(2.6.0), the row position given by `iter:CSV` and the decompression of local
documents (2.5.0).

## 0.1.0

Released on 2026-11-22. One lexicon, five engines: TextMate, highlight.js,
Prism, CodeMirror 6 and Pygments.
