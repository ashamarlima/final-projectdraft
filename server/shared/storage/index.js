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

module.exports = {
    DRIVERS,
    getStorageDriver
};
