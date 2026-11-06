'use strict';
/**
 * highlight-sparql-generate — syntax highlighting for SPARQL-Generate: one
 * lexicon (src/lexicon.js), one backend per engine. The Pygments lexer is a
 * Python package of its own, in pygments-sparql-generate/.
 */
module.exports = {
    /** THE lexicon: word lists, patterns, roles. */
    lexicon: require('./lexicon'),
    /** CodeMirror 6: `StreamLanguage.define(codemirror.build({ tags }))`. */
    codemirror: require('./codemirror'),
};
