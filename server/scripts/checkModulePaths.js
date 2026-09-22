#!/usr/bin/env node

//Checks that every relative require()/import in a source tree points at a
//file that actually exists.
//
//Why this is a script rather than just a test: the server is CommonJS, so
//a wrong require() path throws only when that module is loaded. The
//endpoint suites replace the models they need with stubs in require.cache
//(see stubModule in any *.test.js), so the real module is never loaded and
//a broken path *inside* a stubbed module is invisible to `npm test`. This
//walk reads the paths statically instead.
//
//It is wired up as a pretest step, so it runs before the test suite.
//
//Usage:
//   node scripts/checkModulePaths.js [dir ...]
//
//Directories default to the current directory. Exits 1 when anything is
//unresolved.

const fs = require('node:fs');
const path = require('node:path');

//never descend into these
const IGNORED_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage'
]);

//extensions Node will try for a path with no extension
const EXTENSIONS = [
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.json',
    '.node'
];

//only these files are parsed for specifiers
const SOURCE_EXTENSIONS = new Set([
    '.js',
    '.jsx',
    '.mjs',
    '.cjs'
]);

//the code immediately before a string tells us whether that string is a
//module specifier. The lookbehind keeps `foo.require('x')` and
//`namespace.import('x')` from being mistaken for real module lookups.
const SPECIFIER_CONTEXTS = [
    /(?<![\w$.])require\(\s*$/,
    /(?<![\w$.])import\(\s*$/,
    /(?<![\w$.])(?:from|import)\s*$/
];

//keep this much trailing code, which is plenty for a multi-line import
const CODE_LOOKBEHIND = 60;

const isFile = (target) => {
    try {
        return fs.statSync(target).isFile();
    } catch {
        return false;
    }
};

const isDirectory = (target) => {
    try {
        return fs.statSync(target).isDirectory();
    } catch {
        return false;
    }
};

//Walk the source once, tracking whether we are inside a comment or a
//string. Doing this properly is what keeps a path mentioned in a comment
//(this codebase is comment-heavy) from being reported as a failure.
function collectSpecifiers(source) {
    const specifiers = [];

    let code = '';
    let line = 1;
    let index = 0;

    const rememberCode = (chunk) => {
        code = (code + chunk).slice(-CODE_LOOKBEHIND);
    };

    const isSpecifierContext = () =>
        SPECIFIER_CONTEXTS.some((pattern) =>
            pattern.test(code)
        );

    while (index < source.length) {
        const character = source[index];
        const next = source[index + 1];

        //line comment
        if (character === '/' && next === '/') {
            while (
                index < source.length &&
                source[index] !== '\n'
            ) {
                index++;
            }

            continue;
        }

        //block comment
        if (character === '/' && next === '*') {
            index += 2;

            while (
                index < source.length &&
                !(
                    source[index] === '*' &&
                    source[index + 1] === '/'
                )
            ) {
                if (source[index] === '\n') {
                    line++;
                }

                index++;
            }

            index += 2;

            continue;
        }

        //string or template literal
        if (
            character === '"' ||
            character === "'" ||
            character === '`'
        ) {
            const quote = character;
            const startLine = line;

            let value = '';
            let closed = false;

            //a template literal with ${...} cannot be resolved statically
            let interpolated = false;

            index++;

            while (index < source.length) {
                const inner = source[index];

                if (inner === '\\') {
                    value += source[index + 1] ?? '';
                    index += 2;

                    continue;
                }

                if (inner === '\n') {
                    line++;
                }

                if (inner === quote) {
                    closed = true;
                    index++;

                    break;
                }

                if (
                    quote === '`' &&
                    inner === '$' &&
                    source[index + 1] === '{'
                ) {
                    interpolated = true;
                }

                value += inner;
                index++;
            }

            if (
                closed &&
                !interpolated &&
                isSpecifierContext()
            ) {
                specifiers.push({
                    value,
                    line: startLine
                });
            }

            //the literal itself is not code
            rememberCode(' ');

            continue;
        }

        if (character === '\n') {
            line++;
        }

        rememberCode(character);
        index++;
    }

    return specifiers;
}

//resolve a path the way Node does: exact file, then file + extension
function resolveAsFile(target) {
    if (isFile(target)) {
        return target;
    }

    for (const extension of EXTENSIONS) {
        if (isFile(target + extension)) {
            return target + extension;
        }
    }

    return null;
}

//...then as a directory with a package.json "main" or an index file
function resolveAsDirectory(target) {
    if (!isDirectory(target)) {
        return null;
    }

    const packageFile = path.join(target, 'package.json');

    if (isFile(packageFile)) {
        try {
            const { main } = JSON.parse(
                fs.readFileSync(packageFile, 'utf8')
            );

            if (main) {
                const mainTarget = path.join(target, main);

                const resolved =
                    resolveAsFile(mainTarget) ||
                    resolveAsDirectory(mainTarget);

                if (resolved) {
                    return resolved;
                }
            }
        } catch {
            //a malformed package.json is not this script's problem
        }
    }

    for (const extension of EXTENSIONS) {
        const indexFile = path.join(
            target,
            'index' + extension
        );

        if (isFile(indexFile)) {
            return indexFile;
        }
    }

    return null;
}

//bare specifiers (built-ins, node_modules) are not ours to check
function resolveSpecifier(fromDirectory, specifier) {
    if (
        typeof specifier !== 'string' ||
        !specifier.startsWith('.')
    ) {
        return null;
    }

    const target = path.resolve(fromDirectory, specifier);

    return (
        resolveAsFile(target) ||
        resolveAsDirectory(target)
    );
}

function walk(directory, onFile) {
    for (const entry of fs.readdirSync(directory, {
        withFileTypes: true
    })) {
        if (entry.isDirectory()) {
            if (IGNORED_DIRS.has(entry.name)) {
                continue;
            }

            walk(path.join(directory, entry.name), onFile);

            continue;
        }

        if (
            entry.isFile() &&
            SOURCE_EXTENSIONS.has(
                path.extname(entry.name)
            )
        ) {
            onFile(path.join(directory, entry.name));
        }
    }
}

function main() {
    const roots =
        process.argv.slice(2).length > 0
            ? process.argv.slice(2)
            : ['.'];

    const failures = [];

    let fileCount = 0;
    let relativeCount = 0;

    for (const root of roots) {
        const absoluteRoot = path.resolve(
            process.cwd(),
            root
        );

        if (!isDirectory(absoluteRoot)) {
            console.error(
                `checkModulePaths: not a directory: ${root}`
            );

            process.exitCode = 1;

            return;
        }

        walk(absoluteRoot, (file) => {
            fileCount++;

            const source = fs.readFileSync(
                file,
                'utf8'
            );

            for (const {
                value,
                line
            } of collectSpecifiers(source)) {
                //bare specifiers live in node_modules or are built-ins
                if (!value.startsWith('.')) {
                    continue;
                }

                relativeCount++;

                if (
                    resolveSpecifier(
                        path.dirname(file),
                        value
                    )
                ) {
                    continue;
                }

                failures.push({
                    file: path.relative(
                        process.cwd(),
                        file
                    ),
                    line,
                    specifier: value
                });
            }
        });
    }

    if (failures.length > 0) {
        console.error(
            `\ncheckModulePaths: ${failures.length} unresolved relative path(s):\n`
        );

        for (const failure of failures) {
            console.error(
                `  ${failure.file}:${failure.line}  ${failure.specifier}`
            );
        }

        console.error('');

        process.exitCode = 1;

        return;
    }

    console.log(
        `checkModulePaths: ${relativeCount} relative path(s) resolved across ${fileCount} file(s)`
    );
}

main();
