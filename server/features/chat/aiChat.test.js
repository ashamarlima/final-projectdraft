//Endpoint tests for the student AI chat route
//(POST /api/v1/ai/student-chat).
//
//The real Express routes and JWT auth middleware run against the
//stubbed User model, and the Gemini HTTP call is replaced by a stub
//fetch, so no API key or database is needed. Run with: npm test

const {
    test,
    before,
    after,
    beforeEach
} = require('node:test');

const assert =
    require('node:assert/strict');

const path =
    require('node:path');

const jwt =
    require('jsonwebtoken');

const express =
    require('express');

process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    'ai-chat-test-secret';

const SERVER_ROOT =
    path.join(__dirname, '..', '..');

function stubModule(
    relativeFile,
    value
) {
    const resolved =
        require.resolve(
            path.join(
                SERVER_ROOT,
                relativeFile
            )
        );

    require.cache[resolved] = {
        id: resolved,
        filename: resolved,
        loaded: true,
        exports: value
    };
}

const defaultStudent = () => ({
    _id: 'student-1',
    name: 'Anna Nguyen',
    email: 'anna@example.com',
    phone: '0000000000',
    status: 'active',
    classroom: '9',
    role: 'student',
    Math: 90,
    Literature: 55,
    Science: 70
});

const fakeUsers = {
    current: defaultStudent(),

    //mimic mongoose so both await User.findById(...) (protect)
    //and User.findById(...).select(...) (controller) work
    findById(id) {
        const user = this.current;

        const matches =
            user &&
            String(user._id) === String(id);

        const query = Promise.resolve(
            matches ? user : null
        );

        query.select = () => query;

        return query;
    }
};

stubModule(
    'features/users/userModels.js',
    fakeUsers
);

const router =
    require('./aiRoutes');

//external API stubs ------------------------------------------

//the real fetch, kept so test HTTP requests still reach the app
const originalFetch =
    globalThis.fetch;

let geminiFetchResponse;
let geminiRequest = null;

//YouTube Data API state: results per search query, or a failure
let youtubeOk = true;
let youtubeItemsByQuery = {};
let youtubeRequests = [];

async function stubFetch(url, options) {
    const urlString =
        String(url);

    //YouTube Data API search, used for real video recommendations
    if (
        urlString.includes(
            'googleapis.com/youtube'
        )
    ) {
        youtubeRequests.push({
            url,
            options
        });

        if (!youtubeOk) {
            return {
                ok: false,
                status: 403,
                json: async () => ({
                    error: {
                        message:
                            'forbidden'
                    }
                })
            };
        }

        const query = new URL(url)
            .searchParams.get('q');

        return {
            ok: true,
            status: 200,
            json: async () => ({
                items:
                    youtubeItemsByQuery[
                    query
                    ] ||
                    []
            })
        };
    }

    //Gemini generateContent call
    if (
        urlString.includes(
            'generativelanguage.googleapis.com'
        )
    ) {
        geminiRequest = {
            url,
            options
        };

        const response =
            geminiFetchResponse;

        return {
            ok: response.ok,
            status: response.status,
            json: async () =>
                response.jsonData
        };
    }

    //everything else (the tests' own requests) goes to the
    //real HTTP server
    return originalFetch(url, options);
}

const okResponse = (parts) => ({
    ok: true,
    status: 200,
    jsonData: {
        candidates: [
            {
                content: {
                    parts
                }
            }
        ]
    }
});

function buildApp() {
    const app = express();

    app.use(express.json());
    app.use(
        '/api/v1/ai',
        router
    );

    return app;
}

let server;
let baseUrl;

before(async () => {
    process.env.GEMINI_API_KEY =
        'test-gemini-key';

    process.env.GEMINI_MODEL =
        'test-model';

    globalThis.fetch = stubFetch;

    const app = buildApp();

    await new Promise(
        (resolve, reject) => {
            server = app.listen(0, resolve);
            server.on('error', reject);
        }
    );

    baseUrl =
        `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    globalThis.fetch = originalFetch;

    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;

    await new Promise((resolve) =>
        server.close(resolve)
    );
});

beforeEach(() => {
    fakeUsers.current =
        defaultStudent();

    //no YouTube key by default: recommendations use the
    //search-link fallback unless a test enables the key
    delete process.env.YOUTUBE_API_KEY;

    geminiRequest = null;

    youtubeOk = true;
    youtubeItemsByQuery = {};
    youtubeRequests = [];

    geminiFetchResponse =
        okResponse([
            {
                text: 'Hello '
            },
            {
                text: 'world'
            }
        ]);
});

const tokenFor = (id) =>
    jwt.sign(
        { id },
        process.env.JWT_SECRET
    );

const studentToken = () =>
    tokenFor('student-1');

function headers(token) {
    const result = {
        'Content-Type':
            'application/json'
    };

    if (token) {
        result.Authorization =
            `Bearer ${token}`;
    }

    return result;
}

async function postChat(
    body,
    token = studentToken()
) {
    const response = await fetch(
        `${baseUrl}/api/v1/ai/student-chat`,
        {
            method: 'POST',
            headers: headers(token),
            body:
                body === undefined
                    ? undefined
                    : JSON.stringify(body)
        }
    );

    const data =
        await response.json().catch(() =>
            null
        );

    return {
        status: response.status,
        data
    };
}

//the parsed body sent to Gemini (null when fetch was not called)
function geminiPayload() {
    if (!geminiRequest) {
        return null;
    }

    return JSON.parse(
        geminiRequest.options.body
    );
}

function geminiPrompt() {
    return (
        geminiPayload()?.contents?.[0]
            ?.parts?.[0]?.text
    );
}

//authorization and input guards -----------------------------

test(
    'rejects requests without an Authorization header',
    async () => {
        const result = await postChat(
            { message: 'help' },
            null
        );

        assert.equal(result.status, 401);
        assert.equal(
            result.data.message,
            'Authentication token is required'
        );

        assert.equal(geminiRequest, null);
    }
);

test(
    'rejects teachers',
    async () => {
        fakeUsers.current.role =
            'teacher';

        const result = await postChat({
            message: 'help'
        });

        assert.equal(result.status, 403);
        assert.equal(
            result.data.message,
            "Role 'teacher' is not allowed to perform this action"
        );
    }
);

test(
    'returns 500 when GEMINI_API_KEY is missing',
    async () => {
        const savedKey =
            process.env.GEMINI_API_KEY;

        delete process.env.GEMINI_API_KEY;

        try {
            const result = await postChat({
                message: 'help'
            });

            assert.equal(result.status, 500);
            assert.equal(
                result.data.message,
                'GEMINI_API_KEY is missing from the .env file'
            );

            assert.equal(geminiRequest, null);
        } finally {
            process.env.GEMINI_API_KEY =
                savedKey;
        }
    }
);

test(
    'rejects messages longer than 1000 characters',
    async () => {
        const result = await postChat({
            message: 'x'.repeat(1001)
        });

        assert.equal(result.status, 400);
        assert.equal(
            result.data.message,
            'Your message must be less than 1000 characters'
        );

        assert.equal(geminiRequest, null);
    }
);

//grade analysis and recommendations ------------------------

test(
    'analyzes grades and recommends the two weakest subjects',
    async () => {
        const result = await postChat({
            message: 'help me study'
        });

        assert.equal(result.status, 200);
        assert.equal(
            result.data.message,
            'AI response generated'
        );

        //grade analysis sent to Gemini
        const prompt = geminiPrompt();

        assert.ok(prompt.includes(
            'First name: Anna'
        ));

        assert.ok(prompt.includes(
            'Classroom: 9'
        ));

        assert.ok(prompt.includes(
            'Math: 90'
        ));

        assert.ok(prompt.includes(
            'Literature: 55'
        ));

        assert.ok(prompt.includes(
            'Science: 70'
        ));

        assert.ok(prompt.includes(
            'help me study'
        ));

        const systemInstruction =
            geminiPayload()
                .systemInstruction
                .parts[0].text;

        assert.ok(systemInstruction.includes(
            'You are a supportive academic study assistant.'
        ));

        //reply from Gemini is passed through
        assert.equal(
            result.data.reply,
            'Hello world'
        );

        assert.deepEqual(
            result.data.student.grades,
            {
                Math: 90,
                Literature: 55,
                Science: 70
            }
        );

        //the two lowest grades win: Literature then Science
        const recommendations =
            result.data.videoRecommendations;

        assert.equal(
            recommendations.length,
            2
        );

        assert.deepEqual(
            recommendations.map(
                (video) =>
                    video.subject
            ),
            [
                'Literature',
                'Science'
            ]
        );

        assert.equal(
            recommendations[0].score,
            55
        );

        assert.equal(
            recommendations[1].score,
            70
        );
    }
);

test(
    'builds search-style video recommendations per weak subject',
    async () => {
        const result = await postChat({
            message: 'help me study'
        });

        assert.equal(result.status, 200);

        const [literature] =
            result.data.videoRecommendations;

        assert.equal(
            literature.title,
            'Literature lessons for class 9'
        );

        assert.equal(
            literature.videoId,
            'search-literature-class-9'
        );

        assert.equal(
            literature.url,
            `https://www.youtube.com/results?search_query=${encodeURIComponent(
                'literature lessons for class 9'
            )}`
        );

        //request targets the configured model with the API key
        assert.equal(
            geminiRequest.url,
            'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent'
        );

        assert.equal(
            geminiRequest.options.headers[
                'x-goog-api-key'
            ],
            'test-gemini-key'
        );
    }
);

test(
    'marks ungraded subjects as Not graded and skips them',
    async () => {
        fakeUsers.current.Math = null;
        fakeUsers.current.Literature = 70;
        fakeUsers.current.Science = null;

        const result = await postChat({
            message: 'advice please'
        });

        assert.equal(result.status, 200);

        const prompt = geminiPrompt();

        assert.ok(prompt.includes(
            'Math: Not graded'
        ));

        assert.ok(prompt.includes(
            'Science: Not graded'
        ));

        assert.ok(prompt.includes(
            'Literature: 70'
        ));

        //only the single graded subject is recommended
        const recommendations =
            result.data.videoRecommendations;

        assert.equal(
            recommendations.length,
            1
        );

        assert.equal(
            recommendations[0].subject,
            'Literature'
        );
    }
);

test(
    'returns no video recommendations when nothing is graded',
    async () => {
        fakeUsers.current.Math = null;
        fakeUsers.current.Literature = null;
        fakeUsers.current.Science = null;

        const result = await postChat({
            message: 'no grades yet'
        });

        assert.equal(result.status, 200);
        assert.deepEqual(
            result.data.videoRecommendations,
            []
        );

        const prompt = geminiPrompt();

        assert.ok(prompt.includes(
            'Math: Not graded'
        ));

        assert.ok(prompt.includes(
            'Literature: Not graded'
        ));

        assert.ok(prompt.includes(
            'Science: Not graded'
        ));
    }
);

test(
    'uses the default question and generic wording without a classroom',
    async () => {
        fakeUsers.current.name = '';
        fakeUsers.current.classroom = '';
        fakeUsers.current.Math = 88;
        fakeUsers.current.Literature = null;
        fakeUsers.current.Science = null;

        const result = await postChat({});

        assert.equal(result.status, 200);

        const prompt = geminiPrompt();

        assert.ok(prompt.includes(
            'First name: Student'
        ));

        assert.ok(prompt.includes(
            'Analyze my grades and give me study advice.'
        ));

        const [math] =
            result.data.videoRecommendations;

        assert.equal(
            math.title,
            'Math lessons for students'
        );

        assert.equal(
            math.videoId,
            'search-math-students'
        );
    }
);

//real YouTube recommendations -------------------------------

test(
    'recommends real playable videos when a YouTube key is set',
    async () => {
        process.env.YOUTUBE_API_KEY =
            'test-youtube-key';

        youtubeItemsByQuery = {
            'literature lessons for class 9': [
                {
                    id: {
                        videoId: 'lit-vid-1'
                    },
                    snippet: {
                        title:
                            'Literature lesson one',
                        channelTitle:
                            'Edu Channel',
                        thumbnails: {
                            medium: {
                                url:
                                    'https://img.example.com/1.jpg'
                            }
                        }
                    }
                },
                {
                    id: {
                        videoId: 'lit-vid-2'
                    },
                    snippet: {
                        title:
                            'Literature lesson two',
                        channelTitle:
                            'Edu Channel',
                        thumbnails: {}
                    }
                }
            ],
            'science lessons for class 9': [
                {
                    id: {
                        videoId: 'sci-vid-1'
                    },
                    snippet: {
                        title:
                            'Science lesson one',
                        channelTitle:
                            'Science Channel',
                        thumbnails: {
                            default: {
                                url:
                                    'https://img.example.com/default.jpg'
                            }
                        }
                    }
                }
            ]
        };

        try {
            const result = await postChat({
                message: 'help me study'
            });

            assert.equal(result.status, 200);

            const recommendations =
                result.data.videoRecommendations;

            //two weak subjects: Literature (55) and Science (70)
            assert.deepEqual(
                recommendations.map(
                    (video) =>
                        video.subject
                ),
                [
                    'Literature',
                    'Literature',
                    'Science'
                ]
            );

            assert.deepEqual(
                recommendations.map(
                    (video) =>
                        video.source
                ),
                [
                    'youtube',
                    'youtube',
                    'youtube'
                ]
            );

            const [first, second, third] =
                recommendations;

            assert.equal(
                first.videoId,
                'lit-vid-1'
            );

            assert.equal(
                first.title,
                'Literature lesson one'
            );

            assert.equal(
                first.channelTitle,
                'Edu Channel'
            );

            assert.equal(
                first.thumbnail,
                'https://img.example.com/1.jpg'
            );

            assert.equal(
                first.url,
                'https://www.youtube.com/watch?v=lit-vid-1'
            );

            assert.equal(first.score, 55);

            //up to two videos per weak subject
            assert.equal(
                second.videoId,
                'lit-vid-2'
            );

            assert.equal(third.score, 70);

            //falls back to the default thumbnail when medium
            //is missing
            assert.equal(
                third.thumbnail,
                'https://img.example.com/default.jpg'
            );
        } finally {
            delete process.env.YOUTUBE_API_KEY;
        }
    }
);

test(
    'asks the YouTube API for embeddable videos for the subject',
    async () => {
        process.env.YOUTUBE_API_KEY =
            'test-youtube-key';

        youtubeItemsByQuery = {
            'literature lessons for class 9': [
                {
                    id: {
                        videoId: 'lit-vid-1'
                    },
                    snippet: {
                        title: 'A lesson',
                        channelTitle: 'Channel',
                        thumbnails: {}
                    }
                }
            ]
        };

        try {
            const result = await postChat({
                message: 'help me study'
            });

            assert.equal(result.status, 200);

            assert.equal(
                youtubeRequests.length,
                2 //one search per weak subject
            );

            const params = new URL(
                youtubeRequests[0].url
            ).searchParams;

            assert.equal(
                params.get('q'),
                'literature lessons for class 9'
            );

            assert.equal(
                params.get('type'),
                'video'
            );

            assert.equal(
                params.get('videoEmbeddable'),
                'true'
            );

            assert.equal(
                params.get('maxResults'),
                '2'
            );

            assert.equal(
                params.get('key'),
                'test-youtube-key'
            );
        } finally {
            delete process.env.YOUTUBE_API_KEY;
        }
    }
);

test(
    'falls back to search links when the YouTube API fails',
    async () => {
        process.env.YOUTUBE_API_KEY =
            'test-youtube-key';

        youtubeOk = false;

        try {
            const result = await postChat({
                message: 'help me study'
            });

            assert.equal(result.status, 200);

            const recommendations =
                result.data.videoRecommendations;

            assert.equal(
                youtubeRequests.length,
                2
            );

            //the API was attempted but the search-link fallback
            //is still returned so the feature keeps working
            assert.deepEqual(
                recommendations.map(
                    (video) =>
                        video.source
                ),
                [
                    'search',
                    'search'
                ]
            );

            assert.equal(
                recommendations[0].videoId,
                'search-literature-class-9'
            );

            assert.ok(
                recommendations[0].url.includes(
                    'youtube.com/results?search_query='
                )
            );
        } finally {
            delete process.env.YOUTUBE_API_KEY;
        }
    }
);

//Gemini failure handling ------------------------------------

test(
    'passes Gemini API errors through with their status',
    async () => {
        geminiFetchResponse = {
            ok: false,
            status: 429,
            jsonData: {
                error: {
                    message:
                        'quota exceeded'
                }
            }
        };

        const result = await postChat({
            message: 'help me study'
        });

        assert.equal(result.status, 429);
        assert.equal(
            result.data.message,
            'Failed to generate AI advice'
        );

        assert.equal(
            result.data.error,
            'quota exceeded'
        );
    }
);

test(
    'returns 500 when Gemini responds without text',
    async () => {
        geminiFetchResponse = {
            ok: true,
            status: 200,
            jsonData: {
                candidates: []
            }
        };

        const result = await postChat({
            message: 'help me study'
        });

        assert.equal(result.status, 500);
        assert.equal(
            result.data.message,
            'Gemini returned an empty response'
        );
    }
);
