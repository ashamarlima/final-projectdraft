//Storage entry point.
//
//Everything that stores files goes through getStorageDriver() so the rest
//of the app never learns which provider is in use. The driver is chosen by
//the STORAGE_DRIVER environment variable:
//
//   local          the filesystem (default, no account needed)
//   supabase       Supabase Storage (chosen for this project)
//
//A driver must provide:
//   putObject({ key, body, contentType })   -> { key, sizeBytes }
//   deleteObject({ key })
//   createReadStream({ key })               -> { stream, sizeBytes }
//   createViewUrl({ key, expiresIn, ... })  -> { url, expiresIn, provider }

const localDriver = require('./localDriver');
const supabaseDriver = require('./supabaseDriver');

const DRIVERS = {
    local: localDriver,
    supabase: supabaseDriver
};

function getStorageDriver(
    name = process.env.STORAGE_DRIVER || 'local'
) {
    const driver = DRIVERS[String(name).toLowerCase()];

    if (!driver) {
        const error = new Error(
            `Unknown STORAGE_DRIVER "${name}". Use one of: ${Object.keys(
                DRIVERS
            ).join(', ')}`
        );

        error.status = 500;

        throw error;
    }

    return driver.create();
}

//Collect one stored object into a single buffer.
//
//Deliberately not part of the driver interface: a driver streams (which is
//what serving a file to a browser wants), while the callers that need the
//whole object -- re-reading a lesson the AI never managed to read, and the
//backfill script that does the same in bulk -- share this instead.
//
//The driver is a parameter rather than looked up inside, so a caller that
//has one (or a test that stands one in) is honoured.
async function readObjectBuffer(
    key,
    driver = getStorageDriver()
) {
    const { stream } = await driver.createReadStream({
        key
    });

    const chunks = [];

    for await (const chunk of stream) {
        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
}

module.exports = {
    getStorageDriver,
    readObjectBuffer
};
