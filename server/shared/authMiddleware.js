const jwt = require('jsonwebtoken');
const User = require('../features/users/userModels');

//The login token is transported in an httpOnly cookie, so JavaScript in
//the browser can never read it and an XSS bug cannot steal it. Every
//piece of that transport lives in this module.
const TOKEN_COOKIE = 'token';

const DEFAULT_TOKEN_TTL = '1d';

//milliseconds in a jsonwebtoken duration such as '1d', '12h' or '900'
//(seconds). Returns null when the value is not understood.
function durationToMs(value) {
    const match = /^(\d+)\s*([smhd])?$/i.exec(
        String(value ?? '').trim()
    );

    if (!match) {
        return null;
    }

    const scales = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    };

    return (
        Number(match[1]) *
        scales[(match[2] || 's').toLowerCase()]
    );
}

function tokenTtl() {
    return process.env.JWT_EXPIRES_IN || DEFAULT_TOKEN_TTL;
}

//How far the cookie may travel. A client and API on different sites
//(app.example.com -> api.other-host.com) need SameSite=None, which
//browsers only accept together with Secure. A deployment that keeps both
//on one site should set COOKIE_SAME_SITE=lax, so the browser never
//attaches the session cookie to a request started by another site.
function sameSitePolicy(isProduction) {
    const configured = String(
        process.env.COOKIE_SAME_SITE || ''
    ).toLowerCase();

    if (
        ['lax', 'strict', 'none'].includes(
            configured
        )
    ) {
        return configured;
    }

    return isProduction ? 'none' : 'lax';
}

//the attributes every login cookie is written with, and that clearing
//it has to repeat
function cookieOptions() {
    const isProduction =
        process.env.NODE_ENV === 'production';

    const maxAge = durationToMs(tokenTtl());

    const sameSite =
        sameSitePolicy(isProduction);

    return {
        httpOnly: true,

        sameSite,

        //SameSite=None is rejected by browsers unless the cookie is also
        //Secure; local http is the one exception browsers make for
        //localhost
        secure:
            isProduction || sameSite === 'none',

        path: '/',

        //keeps the cookie alive for exactly as long as the token in it
        ...(maxAge ? { maxAge } : {})
    };
}

//hand the browser a fresh login token
function setAuthCookie(res, token) {
    res.cookie(TOKEN_COOKIE, token, cookieOptions());
}

//end the session. The attributes must match the ones the cookie was set
//with, otherwise the browser keeps the old one.
function clearAuthCookie(res) {
    const {
        httpOnly,
        sameSite,
        secure,
        path
    } = cookieOptions();

    res.clearCookie(TOKEN_COOKIE, {
        httpOnly,
        sameSite,
        secure,
        path
    });
}

//the token to authenticate this request with: the login cookie first,
//then an Authorization header. The header fallback exists for the
//endpoint tests and for non-browser clients (curl, Postman, scripts).
function readToken(req) {
    const cookieToken =
        req.cookies?.[TOKEN_COOKIE];

    if (cookieToken) {
        return String(cookieToken);
    }

    const authorization =
        req.headers.authorization;

    if (
        authorization &&
        authorization.startsWith('Bearer ')
    ) {
        //Bearer TOKEN_VALUE
        return authorization.split(' ')[1];
    }

    return null;
}

//check whether the user is logged in
exports.protect = async (req, res, next) => {
    try {
        const token = readToken(req);

        //no cookie and no Authorization header
        if (!token) {
            return res.status(401).json({
                message: "Authentication token is required"
            });
        }

        //verify token and read its payload
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        //find the user whose ID was stored in the token
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({
                message: "User no longer exists"
            });
        }

        if (user.status !== "active") {
            return res.status(403).json({
                message: "Your account is inactive"
            });
        }

        //make the logged-in user available to later middleware/controllers
        req.user = user;

        next();

    } catch (error) {
        return res.status(401).json({
            message: "Invalid or expired token"
        });
    }
};


//check whether the logged-in user has an allowed role
exports.allowRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                message: `Role '${req.user.role}' is not allowed to perform this action`
            });
        }

        next();
    };
};


//the cookie transport, used by the login/logout controllers
exports.TOKEN_COOKIE = TOKEN_COOKIE;
exports.setAuthCookie = setAuthCookie;
exports.clearAuthCookie = clearAuthCookie;