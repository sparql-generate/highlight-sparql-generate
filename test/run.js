#!/usr/bin/env node
/**
 * Tests of highlight-sparql-generate (`npm test`). The Pygments lexer has its
 * own suite, `pytest`, on the same fixtures.
 *
 * 1. DRIFT    — every generated file in the tree is the output of
 *               `npm run generate` (Python lexicon, TextMate grammar, ESM
 *               bundle).
 * 2. REGEX    — every pattern of src/lexicon.js compiles under V8 AND
 *               Oniguruma (TextMate); Python `re` is checked by pytest.
 * 3. PARITY   — a plain SPARQL 1.1 query (test/fixtures/pure/*.rq) gets
 *               exactly the tokens of the engine's own SPARQL highlighting,
 *               character for character, in every engine that has one.
 * 4. GOLDEN   — the tokens of every fixture, per engine, frozen in
 *               test/golden/ (UPDATE_GOLDEN=1 npm test regenerates them).
 * 5. ROLES    — on the SPARQL-Generate fixtures, every engine gives the
 *               SAME role (keyword, library function, interpolation brace,
 *               template string, template IRI) to the same characters.
 * 6. ESM      — dist/codemirror.mjs tokenises exactly like src/codemirror.js.
 * 7. SYNTAX   — the fixtures are valid SPARQL-Generate for the Java engine
 *               (skipped when no JAR is found; SPARQL_GENERATE_JAR=… to name
 *               one).
 */
'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');
const GOLDEN = path.join(__dirname, 'golden');
const L = require('../src/lexicon');

let failures = 0;
const fail = (m) => { failures++; console.error(`FAIL   ${m}`); };
const ok = (m) => console.log(`ok     ${m}`);
const skip = (m) => console.log(`skip   ${m}`);
const read = (rel) => fs.readFileSync(path.join(FIX, rel), 'utf8');

const CONSTRUCTS = fs.readdirSync(FIX).filter((f) => f.endsWith('.rqg')).sort();
const PURE = fs.readdirSync(path.join(FIX, 'pure')).filter((f) => f.endsWith('.rq'))
    .sort().map((f) => `pure/${f}`);

// ------------------------------------------------------------- engines
//
// Each engine: `chars(src)` → one class per character (null = none), with
// `base(src)` the engine's own SPARQL when it has one, and `role(cls)` the
// lexicon role of a class, or null when the class is not one of ours.

const engines = [];

{   // CodeMirror 6
    const { charTokens } = require('./lib/codemirror-tokens');
    const { sparql } = require('@codemirror/legacy-modes/mode/sparql');
    const { build, TOKEN } = require('../src/codemirror');
    const ours = build({ sparql });
    engines.push({
        name: 'CodeMirror',
        key: 'codemirror',
        chars: async (src) => charTokens(ours, src),
        base: async (src) => charTokens(sparql, src),
        // `keyword` and `builtin` are also the SPARQL mode's classes
        roleOf: (c) => roleTable(TOKEN)(c),
        exact: ['interp.punct'],
    });
}

{   // TextMate
    const tm = require('./lib/textmate');
    const last = (c) => (c ? c.split(' ').pop() : '');
    engines.push({
        name: 'TextMate',
        key: 'textmate',
        chars: (src) => tm.charScopes(src, 'source.sparql-generate'),
        base: (src) => tm.charScopes(src, 'source.sparql'),
        roleOf: (c) => {
            const s = last(c);
            if (/^punctuation\.section\.embedded\.(begin|end)\.sparql-generate$/.test(s)) return ['interp.punct'];
            if (s === 'keyword.control.sparql-generate') return ['keyword.generate'];
            if (s === 'support.function.builtin.sparql-generate') return ['builtin.generate'];
            if (s === 'support.function.library.sparql-generate') return ['function.library'];
            return [];
        },
        exact: ['interp.punct', 'keyword.generate', 'builtin.generate', 'function.library'],
    });
}

{   // Prism
    const Prism = require('prismjs');
    require('prismjs/components/prism-turtle');
    require('prismjs/components/prism-sparql');
    const registerPrism = require('../src/prism');
    registerPrism(Prism);
    const { charTypes } = require('./lib/prism-tokens');
    engines.push({
        name: 'Prism',
        key: 'prism',
        chars: async (src) => charTypes(Prism, Prism.languages['sparql-generate'], src),
        base: async (src) => charTypes(Prism, Prism.languages.sparql, src),
        roleOf: (c) => roleTable(Object.fromEntries(Object.entries(registerPrism.ALIAS)
            .map(([r, a]) => [r, [].concat(a).join(' ')])))(c),
        exact: ['interp.punct', 'function.library'],
    });
}

{   // highlight.js — no SPARQL of its own, so no parity
    const hljs = require('highlight.js/lib/core');
    const lang = require('../src/highlightjs');
    hljs.registerLanguage('sparql-generate', lang);
    const { charScopes } = require('./lib/hljs-tokens');
    engines.push({
        name: 'highlight.js',
        key: 'hljs',
        chars: async (src) => charScopes(hljs.highlight(src, { language: 'sparql-generate' }).value),
        roleOf: (c) => roleTable(lang.SCOPE)(c),
        exact: ['interp.punct'],
    });
}

/** role -> class table, read backwards: class -> [roles]. */
function roleTable(table) {
    const back = new Map();
    for (const [role, cls] of Object.entries(table)) {
        if (!back.has(cls)) back.set(cls, []);
        back.get(cls).push(role);
    }
    return (c) => back.get(c) || [];
}

// ------------------------------------------------------------- 1. drift

function checkDrift() {
    try {
        cp.execFileSync(process.execPath, [path.join(ROOT, 'src', 'cli-generate.js'), '--check'],
            { stdio: 'pipe' });
        ok('generated files = output of the generators');
    } catch (e) {
        fail(`generated files are stale — npm run generate\n${String(e.stderr)}`);
    }
}

// ------------------------------------------------------------- 2. regex

async function checkRegexes() {
    let onig = null;
    try {
        onig = require('vscode-oniguruma');
        const wasm = fs.readFileSync(path.join(require.resolve('vscode-oniguruma'), '..', 'onig.wasm')).buffer;
        await onig.loadWASM(wasm).catch(() => { });
    } catch (e) { onig = null; }
    let bad = 0;
    for (const [name, source] of Object.entries(L.P)) {
        try { new RegExp(source, 'u'); new RegExp(source); } catch (e) {
            bad++; fail(`P.${name} does not compile under V8: ${e.message}`);
        }
        if (onig) {
            try { new onig.OnigScanner([source]); } catch (e) {
                bad++; fail(`P.${name} does not compile under Oniguruma: ${e.message}`);
            }
        }
    }
    if (!bad) ok(`the ${Object.keys(L.P).length} patterns of the lexicon compile (V8${onig ? ', Oniguruma' : ''})`);
}

// ------------------------------------------------------------ 3. parity

/** Divergences from an engine's own SPARQL on plain SPARQL, tolerated and
 *  NAMED. Each must be observed: if it disappears, the test says so. */
const DIVERGENCES = [];

async function checkParity() {
    for (const e of engines.filter((x) => x.base)) {
        for (const f of PURE) {
            const src = read(f);
            const a = await e.base(src);
            const b = await e.chars(src);
            const i = a.findIndex((t, n) => t !== b[n]);
            const known = DIVERGENCES.find((d) => d.engine === e.name && d.file === f);
            if (i < 0 && a.length === b.length) {
                if (known) fail(`parity ${e.name} ${f}: the known divergence "${known.why}" is gone — remove it`);
                else ok(`parity ${e.name}: ${f}`);
            } else if (known) {
                ok(`parity ${e.name}: ${f} (known divergence: ${known.why})`);
            } else {
                const line = src.slice(0, i).split('\n').length;
                fail(`parity ${e.name} ${f}, line ${line}: ${JSON.stringify(src.slice(i, i + 16))} ` +
                    `sparql=${a[i]} sparql-generate=${b[i]}`);
            }
        }
    }
}

// ------------------------------------------------------------ 4. golden

function goldenText(name, src, classes) {
    const out = [`# ${name}`];
    let prev;
    [...src].forEach((ch, i) => {
        const t = classes[i] || '-';
        if (t !== prev) { out.push(`${i} ${JSON.stringify(ch)} ${t}`); prev = t; }
    });
    return out.join('\n') + '\n';
}

async function checkGoldens() {
    fs.mkdirSync(GOLDEN, { recursive: true });
    for (const e of engines) {
        let n = 0;
        for (const f of [...CONSTRUCTS, ...PURE]) {
            const src = read(f);
            const file = path.join(GOLDEN, `${f.replace(/\//g, '.')}.${e.key}.txt`);
            const fresh = goldenText(e.name, src, await e.chars(src));
            if (process.env.UPDATE_GOLDEN) { fs.writeFileSync(file, fresh); n++; continue; }
            if (!fs.existsSync(file)) { fail(`golden ${path.basename(file)} missing — UPDATE_GOLDEN=1 npm test`); continue; }
            const old = fs.readFileSync(file, 'utf8');
            if (old === fresh) { n++; continue; }
            const a = old.split('\n'); const b = fresh.split('\n');
            const i = a.findIndex((l, k) => l !== b[k]);
            fail(`golden ${path.basename(file)}, first difference:\n       expected: ${a[i]}\n       got:      ${b[i]}`);
        }
        ok(`golden ${e.name}: ${n} file(s)${process.env.UPDATE_GOLDEN ? ' regenerated' : ''}`);
    }
}

// ------------------------------------------------------------- 5. roles
//
// For each role, the engines whose class for it is their OWN (`exact`) must
// mark exactly the same characters; an engine that shares the class with a
// SPARQL construct (CodeMirror gives `keyword` to every keyword) must mark at
// least those characters.

const ROLES_CHECKED = ['interp.punct', 'keyword.generate', 'builtin.generate', 'function.library'];

async function checkRoles() {
    for (const f of CONSTRUCTS) {
        const src = read(f);
        const masks = [];
        for (const e of engines) {
            const classes = await e.chars(src);
            masks.push([e, (role) => classes.map((c, i) => /\S/.test(src[i]) && e.roleOf(c).includes(role))]);
        }
        for (const role of ROLES_CHECKED) {
            const exact = masks.filter(([e]) => e.exact.includes(role));
            if (!exact.length) continue;
            const [e0, m0f] = exact[0];
            const ref = m0f(role);
            if (role === 'interp.punct' && /["'<][^"'\n>]*\{|[?$]\{/.test(src) && !ref.some(Boolean)) {
                fail(`roles ${f}: ${e0.name} marks no ${role} at all`);
            }
            const where = (i) => `line ${src.slice(0, i).split('\n').length} ${JSON.stringify(src.slice(i, i + 14))}`;
            for (const [e, mf] of masks.slice(0)) {
                if (e === e0) continue;
                const m = mf(role);
                const isExact = e.exact.includes(role);
                const i = ref.findIndex((v, k) => (isExact ? v !== m[k] : v && !m[k]));
                if (i >= 0) {
                    fail(`roles ${f} ${where(i)}: ${role} for ${ref[i] ? e0.name : e.name}, ` +
                        `not for ${ref[i] ? e.name : e0.name}`);
                }
            }
        }
    }
    ok(`roles: ${engines.map((e) => e.name).join(', ')} agree on ${CONSTRUCTS.length} fixtures`);
}

// --------------------------------------------------------------- 6. ESM

async function checkEsm() {
    const { charTokens } = require('./lib/codemirror-tokens');
    const cjs = require('../src/codemirror').build();
    const esm = await import(path.join(ROOT, 'dist', 'codemirror.mjs'));
    for (const f of [...CONSTRUCTS, ...PURE]) {
        const src = read(f);
        const a = charTokens(cjs, src); const b = charTokens(esm.sparqlGenerate, src);
        const i = a.findIndex((t, n) => t !== b[n]);
        if (i >= 0) { fail(`ESM ${f}: differs at ${i}`); return; }
    }
    if (!esm.sparqlGenerate.tokenTable || !esm.sparqlGenerate.tokenTable.sgInterpolation) {
        fail('ESM: sparqlGenerate has no tokenTable for sgInterpolation');
        return;
    }
    // Through CodeMirror itself: StreamLanguage + a real highlighter, as the
    // playground uses it. The interpolation braces must get a class.
    const { StreamLanguage } = await import('@codemirror/language');
    const { highlightTree, classHighlighter } = await import('@lezer/highlight');
    const text = 'GENERATE { <a/{?x}> ex:p "v {?y}" } WHERE { ?s ?p ?o }';
    const tree = StreamLanguage.define(esm.sparqlGenerate).parser.parse(text);
    const classes = new Map();
    highlightTree(tree, classHighlighter, (from, to, cls) => classes.set(from, cls));
    const brace = classes.get(text.indexOf('{?x'));
    if (!brace || !/tok-string2/.test(brace)) {
        fail(`ESM: the interpolation brace is highlighted ${JSON.stringify(brace)}, expected tok-string2`);
        return;
    }
    ok('dist/codemirror.mjs tokenises like src/codemirror.js, and highlights through StreamLanguage');
}

// ------------------------------------------------------------ 7. syntax

function findJar() {
    const candidates = [process.env.SPARQL_GENERATE_JAR,
        path.join(ROOT, '..', 'sparql-generate', 'sparql-generate-all', 'target', 'sparql-generate.jar')]
        .filter(Boolean);
    return candidates.find((p) => fs.existsSync(p));
}

function checkSyntax() {
    const jar = findJar();
    if (!jar) { skip('syntax — no SPARQL-Generate JAR (SPARQL_GENERATE_JAR=…)'); return; }
    const java = process.env.SPARQL_GENERATE_JAVA || 'java';
    for (const f of CONSTRUCTS) {
        let out;
        try {
            out = cp.execFileSync(java, ['-jar', jar, '-d', FIX, '-q', f, '-x', '-l', 'ERROR'],
                { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
        } catch (e) {
            const msg = String(e.stderr || e.message);
            if (/UnsupportedClassVersionError|LinkageError/.test(msg)) {
                skip(`syntax — ${jar} needs a newer Java (SPARQL_GENERATE_JAVA=…)`);
                return;
            }
            fail(`syntax ${f}: ${msg.split('\n')[0]}`);
            continue;
        }
        if (/Encountered|Exception|Lexical error/.test(out)) {
            fail(`syntax ${f}: ${out.split('\n').find((l) => /Encountered|Exception|Lexical/.test(l))}`);
        }
    }
    ok(`syntax: the ${CONSTRUCTS.length} fixtures parse (${path.basename(jar)})`);
}

// ---------------------------------------------------------------- main

(async () => {
    checkDrift();
    await checkRegexes();
    await checkParity();
    await checkGoldens();
    await checkRoles();
    await checkEsm();
    checkSyntax();
    if (failures) {
        console.error(`\n${failures} failure(s)`);
        process.exit(1);
    }
    console.log('\nall green');
})();
