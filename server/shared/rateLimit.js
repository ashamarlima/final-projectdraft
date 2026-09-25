//Request throttling.
//
//Two budgets here are worth defending:
//
//  * the login route, which is otherwise free to attack with a password
//    list. The bcrypt compare is deliberately slow, so an unthrottled
//    route is also a cheap way to keep the CPU busy; and
//
//  * the AI routes, where one request is one paid Gemini call. A single
//    account in a loop can otherwise spend the whole quota for everyone.
//
//Both counters live in memory, which is enough for the single process this
//app runs as. Behind several instances each would count its own share, and
//a shared store (or an edge gateway) is what would make the limit global.
//
//The limits are read at load time so a deployment can tune them without a
//code change. Set RATE_LIMIT_DISABLED=true to switch throttling off
//entirely, which is handy while driving the API by hand.

const { rateLimit } = require('express-rate-limit');

const WINDOW_MS = 15 * 60 * 1000;

function positiveFromEnv(name, fallback) {
    const value = Number(process.env[name]);

    return Number.isFinite(value) && value > 0
        ? value
        : fallback;
}

//a password guess every 90 seconds is not a useful attack; a staff member
//mistyping a few times is not affected
const LOGIN_LIMIT = positiveFromEnv('LOGIN_RATE_LIMIT', 10);

//a student reading through a lesson asks a handful of questions, so this
//is far above normal use and only catches a loop
const AI_LIMIT = positiveFromEnv('AI_RATE_LIMIT', 60);

function isDisabled() {
    return (
        String(process.env.RATE_LIMIT_DISABLED || '')
            .toLowerCase() === 'true'
    );
}

//Build one throttle.
//
//The switch is checked per request rather than at load time, so a test (or
//a debugging session) can turn throttling on and off without restarting.
function createLimiter({ limit, keyGenerator }) {
    const limiter = rateLimit({
        windowMs: WINDOW_MS,
        limit,

        //RateLimit-* headers, without the older X-RateLimit-* aliases
        standardHeaders: 'draft-7',
        legacyHeaders: false,

        //omitted entirely when not given, so the library keeps its own
        //client-address key rather than seeing an explicit undefined
        ...(keyGenerator ? { keyGenerator } : {}),

        //the API answers JSON everywhere, so a throttled request has to
        //as well
        message: {
            message:
                'Too many requests. Please wait a few minutes and try again.'
        }
    });

    return (req, res, next) =>
        isDisabled() ? next() : limiter(req, res, next);
}

//Login is counted per client address: there is no user to key on yet, and
//the point is to slow one attacker down. This is why TRUST_PROXY matters
//in front of a reverse proxy (see app.js): without it every request looks
//like it came from the proxy, and one attacker would lock everyone out.
const loginLimiter = createLimiter({
    limit: LOGIN_LIMIT
});

//The AI routes are mounted after protect(), so the user is always known by
//the time this runs. Counting per student rather than per address keeps a
//whole computer room behind one NAT from sharing a single budget.
const aiLimiter = createLimiter({
    limit: AI_LIMIT,

    //protect() guarantees req.user, so the fallback is unreachable; it is
    //here only so a mis-ordered route cannot throw
    keyGenerator: (req) =>
        String(req.user?._id || req.user?.id || 'unknown')
});

module.exports = {
    loginLimiter,
    aiLimiter
};
