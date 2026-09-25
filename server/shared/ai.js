//Gemini-backed AI helpers used by the notes assistant.
//
//The project already talks to Gemini through the REST API (see
//controllers/aiController.js); this module reuses the same
//GEMINI_API_KEY / GEMINI_MODEL setup so there is only one AI
//provider to configure.

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

//How much of a document reaches the model. A lesson PDF can hold far more
//text than one request can usefully carry (and than is worth paying for),
//so the context is clipped here, in the single place every caller shares.
const MAX_CONTEXT_CHARS = 24000;

const GEMINI_URL = (model) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

//thrown when the model answered with no text at all. Exported so a
//caller can recognise that specific case by name instead of matching
//on the message.
const EMPTY_REPLY_MESSAGE =
    'Gemini returned an empty response';

//how long one request may take before it is abandoned
const REQUEST_TIMEOUT_MS = 20000;

//Gemini regularly answers a burst of traffic with "currently experiencing
//high demand" (a 503), which is worth trying again. Measurements against
//the live API show such a burst lasting well over half a minute, which no
//sane in-request budget can sit out, so the wait between attempts doubles
//(a short blip is ridden out here) and a longer outage is left to the
//re-read path instead -- see rereadMaterialText in the materials
//controller, which reads a lesson again from the stored PDF.
const MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 400;
const RETRY_MAX_DELAY_MS = 4000;

//how long to wait before attempt `attempt` again: 400ms, 800ms, 1.6s, ...
//up to the cap, with a little jitter so simultaneous requests do not
//retry in lockstep
function retryDelay(attempt) {
    const backoff = Math.min(
        RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
        RETRY_MAX_DELAY_MS
    );

    return Math.round(backoff * (0.75 + Math.random() * 0.5));
}

//429 is "too many requests" and 5xx is the provider having a bad time.
//Anything else (a bad request, an invalid key, a safety block) will fail
//the same way every time, so it is not retried.
const isTransientStatus = (status) =>
    status === 429 ||
    (status >= 500 && status <= 504);

const wait = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

//Reading a page of handwriting takes the model far longer than answering
//a short question does, so the vision call gets its own budget.
const VISION_TIMEOUT_MS = 45000;

//the head of a document, trimmed, for use as model context
function clipContext(text) {
    const value = String(text ?? '').trim();

    return value.length > MAX_CONTEXT_CHARS
        ? value.slice(0, MAX_CONTEXT_CHARS)
        : value;
}

//read the key lazily so a missing key is a request error, not a
//crash while the module is being loaded
function getApiKey() {
    const key = process.env.GEMINI_API_KEY;

    if (!key) {
        const error = new Error(
            'GEMINI_API_KEY is missing from the .env file'
        );

        //a missing key is a server misconfiguration, not an
        //upstream failure
        error.status = 500;

        throw error;
    }

    return key;
}

//single place that knows the Gemini request/response shape
async function callGemini({
    prompt,
    systemInstruction,

    //{ data: base64, mimeType } to send an image alongside the prompt,
    //which is how an upload that arrived as a photo is read
    image = null,

    temperature = 0.4,
    maxOutputTokens = 1024,
    timeoutMs = REQUEST_TIMEOUT_MS,
    json = false
}) {
    const model =
        process.env.GEMINI_MODEL || DEFAULT_MODEL;

    //built once, because a retry sends exactly the same request again
    const request = {
        method: 'POST',

        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': getApiKey()
        },

        body: JSON.stringify({
            systemInstruction: {
                parts: [
                    {
                        text: systemInstruction
                    }
                ]
            },

            contents: [
                {
                    role: 'user',
                    parts: [
                        //the image travels with the question, so the
                        //model can read it
                        ...(image
                            ? [
                                {
                                    inlineData: {
                                        mimeType:
                                            image.mimeType,
                                        data: image.data
                                    }
                                }
                            ]
                            : []),

                        {
                            text: prompt
                        }
                    ]
                }
            ],

            generationConfig: {
                temperature,
                maxOutputTokens,

                //ask Gemini for pure JSON on the structured calls
                ...(json
                    ? {
                        responseMimeType:
                            'application/json'
                    }
                    : {})
            }
        })
    };

    let response;
    let data;

    for (
        let attempt = 1;
        attempt <= MAX_ATTEMPTS;
        attempt++
    ) {
        response = await fetch(GEMINI_URL(model), {
            ...request,
            signal: AbortSignal.timeout(timeoutMs)
        });

        //a body that is not JSON (an error page, say) is not fatal here:
        //the status below is what decides
        data = await response
            .json()
            .catch(() => null);

        if (response.ok) {
            break;
        }

        const canRetry =
            isTransientStatus(response.status) &&
            attempt < MAX_ATTEMPTS;

        if (!canRetry) {
            //The provider's own status is kept on the error as
            //`upstreamStatus` so a caller that wants to can pass it
            //through (the student chat does, so a quota error stays a
            //429). `status` is left free for "our fault" errors, which
            //is what the other AI endpoints report as a 502.
            throw Object.assign(
                new Error(
                    data?.error?.message ||
                        `Gemini request failed with status ${response.status}`
                ),
                { upstreamStatus: response.status }
            );
        }

        console.warn(
            `Gemini answered ${response.status}; retrying (attempt ${attempt} of ${MAX_ATTEMPTS})`
        );

        await wait(retryDelay(attempt));
    }

    if (!response.ok) {
        //unreachable: the loop either breaks on success or throws
        throw new Error('Gemini request failed');
    }

    const text = (
        data?.candidates?.[0]?.content?.parts || []
    )
        .map((part) => part.text || '')
        .join('')
        .trim();

    if (!text) {
        throw new Error(EMPTY_REPLY_MESSAGE);
    }

    return text;
}

//models sometimes wrap JSON in ```json fences; strip them and
//fail loudly if the result still is not a JSON array
function parseJsonArray(text) {
    const cleaned = text
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/, '')
        .trim();

    let parsed;

    try {
        parsed = JSON.parse(cleaned);
    } catch {
        throw new Error('The AI returned invalid JSON');
    }

    if (!Array.isArray(parsed)) {
        throw new Error('The AI returned invalid JSON');
    }

    return parsed;
}

//summary -> 3-5 bullet points as plain text
async function generateSummary(text) {
    return callGemini({
        systemInstruction:
            'You summarise study notes for students. Be accurate and concise.',

        prompt:
            'Summarise the study notes below as 3 to 5 bullet points. ' +
            'Start every bullet with "- " and use no other markdown. ' +
            'Reply with the bullets only.\n\n' +
            `Notes:\n${clipContext(text)}`,

        temperature: 0.3,
        maxOutputTokens: 600
    });
}

//question -> answer, grounded in the note text when it is provided
async function askQuestion(context, question) {
    const hasContext =
        typeof context === 'string' &&
        context.trim().length > 0;

    const systemInstruction = hasContext
        ? 'You are a study assistant. Answer using the study notes provided. ' +
          'If the notes do not cover the answer, say so briefly, then answer ' +
          'from general knowledge.'
        : 'You are a study assistant. Answer the question clearly using ' +
          'general knowledge.';

    const prompt = hasContext
        ? `Study notes:\n${clipContext(
            context
        )}\n\nQuestion:\n${question}`
        : `Question:\n${question}`;

    return callGemini({
        systemInstruction,
        prompt,
        temperature: 0.4,
        maxOutputTokens: 700
    });
}

//flashcards -> [{ question, answer }]
async function generateFlashcards(text) {
    const raw = await callGemini({
        systemInstruction:
            'You turn study notes into flashcards for revision.',

        prompt:
            'Create 8 to 12 flashcards from the notes below. ' +
            'Return ONLY a JSON array where each item is ' +
            '{"question": "...", "answer": "..."}. ' +
            'Do not wrap the JSON in commentary.\n\n' +
            `Notes:\n${clipContext(text)}`,

        temperature: 0.4,
        maxOutputTokens: 1500,
        json: true
    });

    const cards = parseJsonArray(raw)
        .map((card) => ({
            question: String(card.question ?? '').trim(),
            answer: String(card.answer ?? '').trim()
        }))
        .filter(
            (card) => card.question && card.answer
        );

    if (cards.length === 0) {
        throw new Error(
            'The AI did not return any usable flashcards'
        );
    }

    return cards;
}

//Read an uploaded page with the model: transcribe the words in it and
//describe anything that is not text, so a lesson or a note that arrived as
//a photo still has something for the assistant to answer from.
//
//The same helper serves an image and a document, because Gemini takes both
//the same way -- inline data with a mime type -- and only the wording of
//the instruction differs.
async function transcribe(
    { data, mimeType },
    { source, instruction, prompt, failureMessage }
) {
    try {
        return await callGemini({
            systemInstruction: instruction,
            prompt,
            image: { data, mimeType },

            //Transcription is a reading task, so there is no room for
            //creative variation.
            temperature: 0.1,

            //a photographed page can hold a great deal of text
            maxOutputTokens: 4000,

            timeoutMs: VISION_TIMEOUT_MS
        });

    } catch (error) {
        console.error(
            `${source} transcription failed:`,
            error
        );

        //A caller has nothing useful to do with the provider's own
        //message (quota, timeout, a safety block), so it gets one clear
        //sentence instead; the detail is in the log above. A missing API
        //key keeps its 500, because that is our misconfiguration, while
        //anything else is the provider being unavailable -- the 502 the
        //other AI endpoints report.
        const failure = new Error(failureMessage);

        failure.status = error.status || 502;

        throw failure;
    }
}

const IMAGE_INSTRUCTION =
    'You transcribe study material from images for students. ' +
    'Reproduce every readable word exactly as it appears, keeping the reading order. ' +
    'Describe any diagram, graph, table or figure in words, and label each description clearly. ' +
    'Add nothing else: no advice, no summary of your own, no commentary.';

//a lesson or a note that arrived as a photo
async function transcribeImage(image) {
    return transcribe(image, {
        source: 'Image',

        instruction: IMAGE_INSTRUCTION,

        prompt:
            'Transcribe this page. Reply with the text and the descriptions only.',

        failureMessage:
            'The AI assistant could not read that image'
    });
}

//Read a stored document: how a lesson whose text was never read is picked
//up again, because the original photo is not kept and a PDF wrapped around
//one holds no text layer to parse. Gemini accepts a PDF directly, so the
//bytes from storage can be sent as they are.
async function transcribeDocument(document) {
    return transcribe(document, {
        source: 'Document',

        instruction:
            'You transcribe study material from documents for students. ' +
            'Reproduce every readable word exactly as it appears, keeping the reading order. ' +
            'Describe any diagram, graph, table or figure in words, and label each description clearly. ' +
            'Add nothing else: no advice, no summary of your own, no commentary.',

        prompt:
            'Transcribe this document. Reply with the text and the descriptions only.',

        failureMessage:
            'The AI assistant could not read that document'
    });
}

//quiz -> [{ question, options: [4], correctAnswer }]
async function generateQuiz(text) {
    const raw = await callGemini({
        systemInstruction:
            'You write multiple-choice quizzes from study notes.',

        prompt:
            'Create 5 multiple-choice questions from the notes below. ' +
            'Return ONLY a JSON array where each item is ' +
            '{"question": "...", "options": ["A", "B", "C", "D"], ' +
            '"correctAnswer": "..."}. Every item must have exactly four ' +
            'options and "correctAnswer" must repeat one of them.\n\n' +
            `Notes:\n${clipContext(text)}`,

        temperature: 0.4,
        maxOutputTokens: 1800,
        json: true
    });

    const questions = parseJsonArray(raw)
        .map((item) => ({
            question: String(item.question ?? '').trim(),

            options: Array.isArray(item.options)
                ? item.options.map((option) =>
                    String(option).trim()
                )
                : [],

            correctAnswer: String(
                item.correctAnswer ?? ''
            ).trim()
        }))
        .filter(
            (item) =>
                item.question &&
                item.options.length === 4 &&
                item.correctAnswer
        );

    if (questions.length === 0) {
        throw new Error(
            'The AI did not return any usable quiz questions'
        );
    }

    return questions;
}

module.exports = {
    EMPTY_REPLY_MESSAGE,
    callGemini,
    transcribeImage,
    transcribeDocument,
    generateSummary,
    askQuestion,
    generateFlashcards,
    generateQuiz
};
