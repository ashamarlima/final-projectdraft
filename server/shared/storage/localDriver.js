//Local filesystem storage driver.
//
//Used for development and for deployments that mount a volume. Objects are
//written under STORAGE_LOCAL_DIR (default: server/storage) and are handed
//out through our own signed /file endpoint rather than a bucket URL.

const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');

const { createSignature } = require('./signUrl');

const DEFAULT_ROOT = path.join(
    __dirname,
    '..',
    '..',
    'storage'
);

//where the signed URLs point; empty means "same origin as the site",
//which is what the Vite dev proxy and a production reverse proxy want
const SIGNED_URL_PATH = '/api/v1/materials/file';

const DEFAULT_EXPIRES_IN = 600;

const rootDirectory = () =>
    path.resolve(
        process.env.STORAGE_LOCAL_DIR || DEFAULT_ROOT
    );

//Resolve a storage key to an absolute path, refusing anything that would
//escape the storage root. Keys come from the database, but they are also
//echoed back by the client in signed URLs, so this is a real guard and
//not just defence in depth.
function resolveKey(key) {
    if (typeof key !== 'string' || key.length === 0) {
        const error = new Error('A storage key is required');
        error.status = 400;

        throw error;
    }

    const root = rootDirectory();
    const target = path.resolve(root, key);
    const relative = path.relative(root, target);

    if (
        relative.startsWith('..') ||
        path.isAbsolute(relative)
    ) {
        const error = new Error(
            'That storage key is not valid'
        );

        error.status = 400;

        throw error;
    }

    return target;
}

async function putObject({ key, body, contentType }) {
    const target = resolveKey(key);

    await fsPromises.mkdir(path.dirname(target), {
        recursive: true
    });

    await fsPromises.writeFile(target, body);

    return {
        key,
        sizeBytes: body.length,
        contentType
    };
}

async function deleteObject({ key }) {
    //force: a key that is already gone is not an error, so deleting is
    //idempotent and a retry cannot fail the request
    await fsPromises.rm(resolveKey(key), { force: true });
}

async function createReadStream({ key }) {
    const target = resolveKey(key);

    const stats = await fsPromises.stat(target);

    return {
        stream: fs.createReadStream(target),
        sizeBytes: stats.size
    };
}

async function createViewUrl({ key, expiresIn = DEFAULT_EXPIRES_IN }) {
    //resolveKey also validates, so a bad key fails here rather than at
    //download time
    resolveKey(key);

    const expires =
        Math.floor(Date.now() / 1000) + expiresIn;

    const query = new URLSearchParams({
        key,
        expires: String(expires),
        signature: createSignature(key, expires)
    });

    const base = (
        process.env.PUBLIC_API_URL || ''
    ).replace(/\/$/, '');

    return {
        url: `${base}${SIGNED_URL_PATH}?${query}`,
        expiresIn,
        provider: 'local'
    };
}

function create() {
    return {
        provider: 'local',

        //the filesystem has no bucket, so the metadata column stays empty
        bucket: '',

        putObject,
        deleteObject,
        createReadStream,
        createViewUrl
    };
}

module.exports = { create, rootDirectory };
