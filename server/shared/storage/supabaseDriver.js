//Supabase Storage driver.
//
//Uses the official client with the service role key, so the bucket itself
//can stay private and RLS can be left on: every read is handed to the
//browser as a short-lived signed url, and the PDF bytes go straight from
//Supabase's CDN to the student.
//
//Configuration:
//   SUPABASE_URL                 https://<project-ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    service role key (server-side only)
//   SUPABASE_STORAGE_BUCKET      bucket name, default 'lesson-materials'

const DEFAULT_BUCKET = 'lesson-materials';

const DEFAULT_EXPIRES_IN = 600;

//the SDK is only needed when this driver is selected, so it is required
//lazily and a project on another driver never has to have it loaded
function loadSdk() {
    try {
        return require('@supabase/supabase-js');
    } catch {
        const error = new Error(
            'The supabase storage driver needs its dependency. Run: npm install @supabase/supabase-js'
        );

        error.status = 500;

        throw error;
    }
}

//read configuration lazily so a missing value is a request error instead
//of a crash while the module is being loaded
function configuration() {
    const url = process.env.SUPABASE_URL;

    const serviceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY;

    const bucket =
        process.env.SUPABASE_STORAGE_BUCKET ||
        DEFAULT_BUCKET;

    const missing = Object.entries({
        SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey
    })
        .filter(([, value]) => !value)
        .map(([name]) => name);

    if (missing.length > 0) {
        const error = new Error(
            `The supabase storage driver is missing configuration: ${missing.join(', ')}`
        );

        error.status = 500;

        throw error;
    }

    return { url, serviceRoleKey, bucket };
}

//turn an SDK error into something with an HTTP status attached. A missing
//object is a 404; anything else is an upstream failure.
function storageError(error, fallbackMessage) {
    const message =
        error?.message || fallbackMessage;

    const wrapped = new Error(message);

    wrapped.status = /not found|does not exist/i.test(
        message
    )
        ? 404
        : 502;

    return wrapped;
}

let cachedClient = null;

function client() {
    if (cachedClient) {
        return cachedClient;
    }

    const { createClient } = loadSdk();

    const { url, serviceRoleKey } =
        configuration();

    cachedClient = createClient(
        url,
        serviceRoleKey,
        {
            //this is a server: there is no session to keep
            auth: {
                persistSession: false,
                autoRefreshToken: false
            }
        }
    );

    return cachedClient;
}

async function putObject({ key, body, contentType }) {
    const { bucket } = configuration();

    //upsert is off on purpose: keys are uuid-prefixed, so a collision means
    //something is wrong and should surface rather than overwrite a file
    const { error } = await client()
        .storage.from(bucket)
        .upload(key, body, {
            contentType:
                contentType || 'application/pdf',
            upsert: false
        });

    if (error) {
        throw storageError(
            error,
            'Unable to upload that file'
        );
    }

    return {
        key,
        sizeBytes: body.length,
        contentType
    };
}

async function deleteObject({ key }) {
    const { bucket } = configuration();

    const { error } = await client()
        .storage.from(bucket)
        .remove([key]);

    //deleting an already-missing object is not a failure: that keeps
    //delete idempotent, which the controller relies on
    if (error && !/not found/i.test(error.message)) {
        throw storageError(
            error,
            'Unable to delete that file'
        );
    }
}

//Fallback path only. Signed urls are generated for normal viewing, so this
//is used just by the /file endpoint if it is ever pointed at this driver.
//The SDK has no Node stream for downloads, so the object is buffered -
//which is fine for the PDFs this feature stores, but not for huge files.
async function createReadStream({ key }) {
    const { bucket } = configuration();

    const { data, error } = await client()
        .storage.from(bucket)
        .download(key);

    if (error || !data) {
        throw storageError(
            error,
            'Unable to read that file'
        );
    }

    const { Readable } = require('node:stream');

    const buffer = Buffer.from(
        await data.arrayBuffer()
    );

    return {
        stream: Readable.from(buffer),
        sizeBytes: buffer.length
    };
}

async function createViewUrl({
    key,
    expiresIn = DEFAULT_EXPIRES_IN
}) {
    const { bucket } = configuration();

    //no `download` option, so Supabase serves the object inline and the
    //browser renders the PDF instead of saving it
    const { data, error } = await client()
        .storage.from(bucket)
        .createSignedUrl(key, expiresIn);

    if (error || !data?.signedUrl) {
        throw storageError(
            error,
            'Unable to create a link for that file'
        );
    }

    return {
        url: data.signedUrl,
        expiresIn,
        provider: 'supabase'
    };
}

function create() {
    return {
        provider: 'supabase',

        //exposed so the metadata row records which bucket holds the object.
        //A getter, so create() does not throw on missing config before the
        //request's own error handling is in place.
        get bucket() {
            return (
                process.env.SUPABASE_STORAGE_BUCKET ||
                DEFAULT_BUCKET
            );
        },

        putObject,
        deleteObject,
        createReadStream,
        createViewUrl
    };
}

module.exports = {
    create,
    DEFAULT_BUCKET
};
