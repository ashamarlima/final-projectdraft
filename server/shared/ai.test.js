//Unit tests for shared/ai.js: the request it builds, and how it copes with
//a provider that is briefly unavailable.
//
//Gemini is stubbed at the fetch boundary, so there is no key and no
//network involved. Run with: npm test

const {
    test,
    beforeEach,
    after
} = require('node:test');

const assert =
    require('node:assert/strict');

process.env.GEMINI_API_KEY =
    process.env.GEMINI_API_KEY || 'ai-test-key';

process.env.GEMINI_MODEL =
    process.env.GEMINI_MODEL || 'test-model';

const ai = require('./ai');

const originalFetch = globalThis.fetch;

let responses = [];
let requests = [];

//a Gemini answer carrying some text
const answered = (text) => ({
    ok: true,
    status: 200,
    body: {
        candidates: [
            {
                content: {
                    parts: [{ text }]
                }
            }
        ]
    }
});

const failed = (status, message) => ({
    ok: false,
    status,
    body: {
        error: { message }
    }
});

async function stubFetch(url, options) {
    requests.push({ url, options });

    const next = responses.length
        ? responses.shift()
        : answered('fallback');

    return {
        ok: next.ok,
        status: next.status,
        json: async () => next.body
    };
}

beforeEach(() => {
    responses = [];
    requests = [];

    globalThis.fetch = stubFetch;
});

after(() => {
    globalThis.fetch = originalFetch;
});

//------------------------------------------------------------
//retrying a struggling provider
//------------------------------------------------------------

test('a 503 is retried until the answer comes through', async () => {
    responses = [
        failed(503, 'currently experiencing high demand'),
        failed(503, 'currently experiencing high demand'),
        answered('Photosynthesis happens in the chloroplasts.')
    ];

    const summary = await ai.generateSummary('notes');

    assert.equal(
        summary,
        'Photosynthesis happens in the chloroplasts.'
    );

    //two failures, then the success
    assert.equal(requests.length, 3);
});

test('a 429 is retried too', async () => {
    responses = [
        failed(429, 'quota exceeded'),
        answered('answered on the second try')
    ];

    assert.equal(
        await ai.askQuestion('', 'a question'),
        'answered on the second try'
    );

    assert.equal(requests.length, 2);
});

test('a request the provider will never accept is not retried', async () => {
    responses = [failed(400, 'API key not valid')];

    await assert.rejects(
        () => ai.generateSummary('notes'),
        /API key not valid/
    );

    //one attempt: retrying a 400 would only waste the caller's time
    assert.equal(requests.length, 1);
});

test('a provider that stays down is reported after the budget', async () => {
    responses = [
        failed(503, 'high demand'),
        failed(503, 'high demand'),
        failed(503, 'high demand'),
        failed(503, 'high demand'),
        answered('never reached')
    ];

    await assert.rejects(
        () => ai.generateSummary('notes'),
        (error) => {
            //the caller can still see what the provider said
            assert.equal(error.upstreamStatus, 503);

            return true;
        }
    );

    assert.equal(requests.length, 4);
});

//A 503 burst from the provider lasts far longer than a moment, so the wait
//between attempts has to grow rather than staying flat. A flat 400ms
//window (which is what this used to be) spends the whole budget inside the
//first second and gives up while the burst is still running.
test('the wait between attempts grows rather than staying flat', async () => {
    responses = [
        failed(503, 'high demand'),
        failed(503, 'high demand'),
        failed(503, 'high demand'),
        failed(503, 'high demand')
    ];

    const started = Date.now();

    await assert.rejects(
        () => ai.generateSummary('notes'),
        (error) => error.upstreamStatus === 503
    );

    const elapsed = Date.now() - started;

    //three gaps of at least 300ms, 600ms and 1.2s, even with the jitter
    //at its lowest
    assert.ok(
        elapsed >= 1500,
        `expected the retries to span at least 1.5s, took ${elapsed}ms`
    );
});

test('a response that is not JSON does not crash the retry', async () => {
    globalThis.fetch = async (url, options) => {
        requests.push({ url, options });

        return {
            ok: false,
            status: 503,
            json: async () => {
                throw new Error('not json');
            }
        };
    };

    await assert.rejects(
        () => ai.generateSummary('notes'),
        (error) => error.upstreamStatus === 503
    );

    assert.equal(requests.length, 4);
});

//------------------------------------------------------------
//reading an image
//------------------------------------------------------------

test('an image is sent as inline data beside the prompt', async () => {
    responses = [answered('transcribed')];

    const text = await ai.transcribeImage({
        data: 'YmFzZTY0',
        mimeType: 'image/jpeg'
    });

    assert.equal(text, 'transcribed');
    assert.equal(requests.length, 1);

    const body = JSON.parse(
        requests[0].options.body
    );

    const parts = body.contents[0].parts;

    assert.deepEqual(parts[0], {
        inlineData: {
            mimeType: 'image/jpeg',
            data: 'YmFzZTY0'
        }
    });

    //the instruction travels as the text part, after the image
    assert.ok(
        parts[1].text.includes('Transcribe this page')
    );

    //reading a page is not a creative task
    assert.equal(body.generationConfig.temperature, 0.1);
});

test('a text-only call sends no inline data at all', async () => {
    responses = [answered('a summary')];

    await ai.generateSummary('notes');

    const body = JSON.parse(
        requests[0].options.body
    );

    assert.equal(
        body.contents[0].parts.length,
        1
    );

    assert.ok(body.contents[0].parts[0].text);
});

test('a failed read is one clear sentence with a 502', async () => {
    responses = [
        failed(503, 'high demand'),
        failed(503, 'high demand'),
        failed(503, 'high demand'),
        failed(503, 'high demand')
    ];

    await assert.rejects(
        () =>
            ai.transcribeImage({
                data: 'YmFzZTY0',
                mimeType: 'image/jpeg'
            }),
        (error) => {
            assert.equal(error.status, 502);

            assert.equal(
                error.message,
                'The AI assistant could not read that image'
            );

            return true;
        }
    );
});

//------------------------------------------------------------
//reading a stored document
//------------------------------------------------------------

//A lesson whose photo could not be read at upload time is read again from
//the stored PDF, which Gemini accepts as inline data just like an image.
test('a stored PDF is sent as inline data, whole', async () => {
    responses = [answered('transcribed from the stored page')];

    const text = await ai.transcribeDocument({
        data: 'JVBERi0xLjc=',
        mimeType: 'application/pdf'
    });

    assert.equal(text, 'transcribed from the stored page');

    const parts = JSON.parse(
        requests[0].options.body
    ).contents[0].parts;

    assert.deepEqual(parts[0], {
        inlineData: {
            mimeType: 'application/pdf',
            data: 'JVBERi0xLjc='
        }
    });

    assert.ok(
        parts[1].text.includes('Transcribe this document')
    );
});

//the caller distinguishes "the picture was unreadable" from "the document
//was unreadable", so the two must not share one message
test('a failed document read says document, not image', async () => {
    responses = [
        failed(503, 'high demand'),
        failed(503, 'high demand'),
        failed(503, 'high demand'),
        failed(503, 'high demand')
    ];

    await assert.rejects(
        () =>
            ai.transcribeDocument({
                data: 'JVBERi0xLjc=',
                mimeType: 'application/pdf'
            }),
        (error) => {
            assert.equal(error.status, 502);

            assert.equal(
                error.message,
                'The AI assistant could not read that document'
            );

            return true;
        }
    );
});

test('a missing key is our misconfiguration, not a 502', async () => {
    const key = process.env.GEMINI_API_KEY;

    delete process.env.GEMINI_API_KEY;

    try {
        await assert.rejects(
            () =>
                ai.transcribeImage({
                    data: 'YmFzZTY0',
                    mimeType: 'image/jpeg'
                }),
            (error) => error.status === 500
        );
    } finally {
        process.env.GEMINI_API_KEY = key;
    }
});
