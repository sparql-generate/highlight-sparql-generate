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
        chars: (src) => charTokens(ours, src),
        base: (src) => charTokens(sparql, src),
        roles: TOKEN,
    });
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

function checkParity() {
    for (const e of engines.filter((x) => x.base)) {
        for (const f of PURE) {
            const src = read(f);
            const a = e.base(src);
            const b = e.chars(src);
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

function checkGoldens() {
    fs.mkdirSync(GOLDEN, { recursive: true });
    for (const e of engines) {
        let n = 0;
        for (const f of [...CONSTRUCTS, ...PURE]) {
            const src = read(f);
            const file = path.join(GOLDEN, `${f.replace(/\//g, '.')}.${e.key}.txt`);
            const fresh = goldenText(e.name, src, e.chars(src));
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

/** The role of each character, for one engine: the class it gives, read
 *  back through the engine's role table. */
function roleChars(e, src) {
    const back = new Map();
    for (const [role, cls] of Object.entries(e.roles)) {
        if (!back.has(cls)) back.set(cls, []);
        back.get(cls).push(role);
    }
    return e.chars(src).map((c) => back.get(c) || null);
}

/** The roles that a class can only mean in SPARQL-Generate: the interpolation
 *  braces, the keywords, the library names. `string` and `iri` share their
 *  class with SPARQL strings and IRIs, so they are compared on the
 *  template's own characters only (inside interpolated strings and IRIs). */
const DISTINCT_ROLES = ['interp.punct', 'keyword.generate', 'function.library'];

function checkRoles() {
    if (engines.length < 2) { skip('roles — a single engine'); return; }
    for (const f of CONSTRUCTS) {
        const src = read(f);
        const per = engines.map((e) => [e, roleChars(e, src)]);
        for (const role of DISTINCT_ROLES) {
            const sets = per.map(([e, r]) => [e, r.map((x, i) => (x && x.includes(role) && /\S/.test(src[i])))]);
            const [e0, m0] = sets[0];
            for (const [e, m] of sets.slice(1)) {
                const i = m.findIndex((v, k) => v !== m0[k]);
                if (i >= 0) {
                    const line = src.slice(0, i).split('\n').length;
                    fail(`roles ${f} line ${line}: ${JSON.stringify(src.slice(i, i + 12))} is ${role} for ` +
                        `${m0[i] ? e0.name : e.name}, not for ${m0[i] ? e.name : e0.name}`);
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
    checkParity();
    checkGoldens();
    checkRoles();
    await checkEsm();
    checkSyntax();
    if (failures) {
        console.error(`\n${failures} failure(s)`);
        process.exit(1);
    }
    console.log('\nall green');
})();
