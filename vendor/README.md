# Vendored grammars

`sparql.tmLanguage.json` and `turtle.tmLanguage.json` are EXACT copies of the
grammars of the VS Code extension `stardog-union.stardog-rdf-grammars` 0.2.1
(Visual Studio Marketplace; licence Apache-2.0, text in
`LICENSE-stardog-rdf-grammars.txt`), the SPARQL grammar most VS Code users
have. Copied on 2026-11-07 from an installation of the extension
(`~/.vscode/extensions/stardog-union.stardog-rdf-grammars-0.2.1/syntaxes/`).

They are the BASE of the TextMate backend: `src/textmate.js` inlines them
into the repository of `source.sparql-generate` (keys prefixed `sparql-` and
`turtle-`) and adds the SPARQL-Generate patterns in front. They are also the
REFERENCE of the parity test: a plain SPARQL query gets the same scopes in
`source.sparql-generate` as in `source.sparql`.

To refresh: copy the two files from a newer release of the extension, update
the version above, then `npm run generate && npm test`.
