'use strict';
/** TextMate tokenisation outside VS Code: vscode-textmate + Oniguruma, on the
 *  vendored base grammars and the grammar generated here. */
const fs = require('fs');
const path = require('path');
const vsctm = require('vscode-textmate');
const oniguruma = require('vscode-oniguruma');
const { build } = require('../../src/textmate');

const VENDOR = path.join(__dirname, '..', '..', 'vendor');
let registry = null;

function getRegistry() {
    if (registry) return registry;
    const wasm = fs.readFileSync(path.join(require.resolve('vscode-oniguruma'), '..', 'onig.wasm')).buffer;
    const onigLib = oniguruma.loadWASM(wasm).then(() => ({
        createOnigScanner: (s) => new oniguruma.OnigScanner(s),
        createOnigString: (s) => new oniguruma.OnigString(s),
    }));
    const grammars = {
        'source.sparql': () => fs.readFileSync(path.join(VENDOR, 'sparql.tmLanguage.json'), 'utf8'),
        'source.turtle': () => fs.readFileSync(path.join(VENDOR, 'turtle.tmLanguage.json'), 'utf8'),
        'source.sparql-generate': () => JSON.stringify(build()),
    };
    registry = new vsctm.Registry({
        onigLib,
        loadGrammar: async (scope) => (grammars[scope]
            ? vsctm.parseRawGrammar(grammars[scope](), `${scope}.json`)
            : null),
    });
    return registry;
}

/** The scopes of each character (root scope dropped, joined by spaces). */
async function charScopes(text, scope = 'source.sparql-generate') {
    const grammar = await getRegistry().loadGrammar(scope);
    let stack = vsctm.INITIAL;
    const out = [];
    const lines = text.split('\n');
    lines.forEach((line, n) => {
        const r = grammar.tokenizeLine(line, stack);
        stack = r.ruleStack;
        const per = [];
        for (const t of r.tokens) {
            for (let c = t.startIndex; c < t.endIndex; c++) per[c] = t.scopes.slice(1).join(' ');
        }
        for (let c = 0; c < line.length; c++) out.push(per[c] || null);
        if (n < lines.length - 1) out.push(null);
    });
    return out;
}

module.exports = { charScopes };
