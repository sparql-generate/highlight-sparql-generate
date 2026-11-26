"""Tests of the Pygments lexer for SPARQL-Generate (``pytest``).

1. DRIFT   — ``_lexicon.py`` is the output of ``npm run generate`` (skipped
   when Node.js is not installed).
2. PARITY  — a plain SPARQL 1.1 query gets exactly the tokens of Pygments'
   own ``SparqlLexer``, character for character, apart from the named
   divergences below, each of which must still be observed.
3. GOLDEN  — the tokens of every SPARQL-Generate fixture, frozen
   (``UPDATE_GOLDEN=1 pytest`` regenerates them).
4. NO ERROR TOKEN on any fixture: every construct is recognised.
5. REGISTRATION — ``sparql-generate`` and ``*.rqg`` reach the lexer through
   the Pygments plugin entry point (needs the package installed).
6. PATTERNS — every pattern of the lexicon compiles under Python `re`.
"""

import os
import pathlib
import re
import shutil
import subprocess

import pytest
from pygments.lexers import SparqlLexer
from pygments.token import Error

from pygments_sparql_generate import SparqlGenerateLexer

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent
FIX = REPO / "test" / "fixtures"
GOLDEN = REPO / "test" / "golden"
PURE = sorted((FIX / "pure").glob("*.rq"))
CONSTRUCTS = sorted(FIX.glob("*.rqg"))

# Known divergences from SparqlLexer on plain SPARQL, by fixture: a regular
# expression whose first match starts the exempt region (to the end of the
# file). Each must be OBSERVED — if SparqlLexer is fixed, the test says so,
# so that the exemption is removed.
DIVERGENCES = {
    # SparqlLexer's triple-quoted strings use `[^\\]+` as content rule: the
    # first long string runs to the next backslash or to the end of the
    # input, closing quotes included. This lexer stops at the closing quotes.
    "long-strings.rq": r'"""|\'\'\'',
}


def char_types(lexer, text):
    out = []
    for ttype, value in lexer.get_tokens(text):
        out.extend([ttype] * len(value))
    return out


def read(path):
    # Pygments appends a final newline when the input lacks one; the
    # fixtures all end with one, so offsets match the file.
    text = path.read_text(encoding="utf-8")
    assert text.endswith("\n"), f"{path.name} must end with a newline"
    return text


def golden_text(name, text, types):
    lines = [f"# {name}"]
    prev = None
    for i, (ch, t) in enumerate(zip(text, types)):
        label = str(t).replace("Token.", "") if t is not None else "-"
        if label != prev:
            lines.append(f"{i} {_json_char(ch)} {label}")
            prev = label
    return "\n".join(lines) + "\n"


def golden_name(path):
    """`pure/select.rq` -> `pure.select.rq`: the same name as in test/run.js."""
    return ".".join(path.relative_to(FIX).parts)


def _json_char(ch):
    # The same quoting as JSON.stringify in the JavaScript goldens.
    import json
    return json.dumps(ch, ensure_ascii=False)


# ------------------------------------------------------------------ 1. drift

def test_lexicon_is_generated():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node.js not found: cannot regenerate _lexicon.py")
    script = ("process.stdout.write(require('./src/python-lexicon')"
              ".pythonLexicon())")
    fresh = subprocess.run([node, "-e", script], cwd=REPO, check=True,
                           capture_output=True, text=True).stdout
    current = (REPO / "pygments-sparql-generate" / "pygments_sparql_generate"
               / "_lexicon.py").read_text(encoding="utf-8")
    assert current == fresh, "_lexicon.py is stale: run `npm run generate`"


# ----------------------------------------------------------------- 2. parity

@pytest.mark.parametrize("path", PURE, ids=lambda p: p.name)
def test_parity_with_sparql_lexer(path):
    text = read(path)
    base = char_types(SparqlLexer(), text)
    ours = char_types(SparqlGenerateLexer(), text)
    assert len(base) == len(ours) == len(text)
    limit = len(text)
    if path.name in DIVERGENCES:
        m = re.search(DIVERGENCES[path.name], text)
        assert m, f"{path.name}: the divergence pattern no longer matches"
        limit = m.start()
        assert base[limit:] != ours[limit:], (
            f"{path.name}: SparqlLexer no longer diverges here — "
            "remove the exemption from DIVERGENCES")
    for i in range(limit):
        if base[i] != ours[i]:
            line = text.count("\n", 0, i) + 1
            pytest.fail(f"{path.name}, line {line}: {text[i:i + 16]!r} "
                        f"sparql={base[i]} sparql-generate={ours[i]}")


# ----------------------------------------------------------------- 3. golden

@pytest.mark.parametrize("path", CONSTRUCTS + PURE, ids=lambda p: p.name)
def test_golden(path):
    text = read(path)
    fresh = golden_text("Pygments", text, char_types(SparqlGenerateLexer(), text))
    golden = GOLDEN / (golden_name(path) + ".pygments.txt")
    if os.environ.get("UPDATE_GOLDEN"):
        golden.write_text(fresh, encoding="utf-8")
        return
    assert golden.exists(), f"{golden.name} missing: UPDATE_GOLDEN=1 pytest"
    old = golden.read_text(encoding="utf-8")
    if old != fresh:
        a, b = old.split("\n"), fresh.split("\n")
        i = next(n for n in range(min(len(a), len(b))) if a[n] != b[n])
        pytest.fail(f"golden {golden.name}, first difference:\n"
                    f"  expected: {a[i]}\n  got:      {b[i]}")


# ---------------------------------------------------------- 4. no Error token

@pytest.mark.parametrize("path", CONSTRUCTS + PURE, ids=lambda p: p.name)
def test_no_error_token(path):
    text = read(path)
    for ttype, value in SparqlGenerateLexer().get_tokens(text):
        assert ttype is not Error and ttype not in Error, (
            f"{path.name}: Error token {value!r}")


# ----------------------------------------------------------- 5. registration

def test_registered_with_pygments():
    from pygments.lexers import get_lexer_by_name, get_lexer_for_filename
    from pygments.util import ClassNotFound
    try:
        by_name = get_lexer_by_name("sparql-generate")
    except ClassNotFound:
        pytest.skip("package not installed (pip install -e pygments-sparql-generate)")
    assert isinstance(by_name, SparqlGenerateLexer)
    assert isinstance(get_lexer_for_filename("query.rqg"), SparqlGenerateLexer)


def test_guess_prefers_sparql_generate():
    from pygments.lexers import guess_lexer
    text = read(FIX / "generate.rqg")
    assert isinstance(guess_lexer(text), SparqlGenerateLexer)


def test_patterns_compile_under_python_re():
    from pygments_sparql_generate import _lexicon as L
    for name, source in L.P.items():
        re.compile(source)
        re.compile("(?i)" + source)


# ------------------------------------------------------- 7. built-in calls

@pytest.mark.parametrize("word", ["RAISE", "raise", "Raise"])
def test_raise_is_a_builtin_in_any_case(word):
    """RAISE (SPARQL-Generate 2.6.0) is tokenised as SparqlLexer tokenises
    COALESCE, whatever its case; a variable or a local name stays one."""
    from pygments.token import Name
    text = f'BIND(COALESCE(?x, {word}("no x", ?raise, ex:raise)) AS ?y)\n'
    tokens = list(SparqlGenerateLexer().get_tokens(text))
    assert (Name.Function, word) in tokens
    assert (Name.Function, "COALESCE") in tokens
    assert (Name.Variable, "?raise") in tokens
    assert not any(t is Name.Function and v.lower() == "raise" and v != word
                   for t, v in tokens)
