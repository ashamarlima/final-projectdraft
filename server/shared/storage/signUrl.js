//HMAC signing for storage view URLs.
//
//Object stores hand out short-lived presigned URLs. The local driver has
//no such mechanism, so it signs a URL to our own /file endpoint the same
//way: possession of a valid, unexpired signature is what grants access.
//That is why /file needs no Bearer token -- an <iframe> cannot send
//headers, so the credential has to travel in the URL.

const crypto = require('node:crypto');

function signingSecret() {
    const secret =
        process.env.STORAGE_SIGNING_SECRET ||
        process.env.JWT_SECRET;

    if (!secret) {
        const error = new Error(
            'STORAGE_SIGNING_SECRET (or JWT_SECRET) is required to sign storage URLs'
        );

        //server misconfiguration, not a client error
        error.status = 500;

        throw error;
    }

    return secret;
}

//the newline keeps key/expiry pairs from being ambiguous
function createSignature(key, expires) {
    return crypto
        .createHmac('sha256', signingSecret())
        .update(`${key}\n${expires}`)
        .digest('hex');
}

function verifySignature({ key, expires, signature }) {
    if (!key || !expires || !signature) {
        return false;
    }

    const expected = createSignature(key, expires);
    const provided = String(signature);

    //timingSafeEqual throws on a length mismatch, so guard first
    if (provided.length !== expected.length) {
        return false;
    }

    return crypto.timingSafeEqual(
        Buffer.from(provided),
        Buffer.from(expected)
    );
}

module.exports = {
    createSignature,
    verifySignature
};
