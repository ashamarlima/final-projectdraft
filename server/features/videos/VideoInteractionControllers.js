const VideoInteraction =
    require('./VideoInteraction');

const User = require('../users/userModels');

const { watchedXp } =
    require('../../shared/xp');

//event types accepted by the VideoInteraction schema enum
const ALLOWED_EVENT_TYPES = [
    'click',
    'watch',
    'like',
    'dislike'
];

//---- watch-time guard -------------------------------------------------
//
//Watch time is reported by the browser, so the server decides how much of
//it to believe. XP is a pure function of the watch time stored on the
//interaction, and that stored total can only grow as fast as real time
//allows, so a request can neither invent watch time nor seed a starting
//total and cash it in.

//Playback may legitimately outrun the clock: the embedded YouTube player
//offers speeds up to 2x, which the client reports as real watch time.
const MAX_PLAYBACK_RATE = 2;

//Latency between the client's clock and ours, plus the rounding of a
//running total, is worth a few seconds either way.
const WATCH_TIME_GRACE_SECONDS = 15;

//One video cannot be watched forever, and this keeps a single interaction
//from accruing XP without bound.
const MAX_WATCHED_SECONDS_PER_INTERACTION =
    12 * 60 * 60;

//when the interaction was last reported on. A missing value answers
//"now", which is the strictest possible reading.
function lastReportedAtMs(interaction) {
    const value = interaction?.updatedAt;

    if (!value) {
        return Date.now();
    }

    const reportedAt = new Date(value).getTime();

    return Number.isFinite(reportedAt)
        ? reportedAt
        : Date.now();
}

//the watch time already stored, ignoring impossible values
function storedWatchSeconds(interaction) {
    const stored = Number(
        interaction?.durationSeconds
    );

    if (!Number.isFinite(stored) || stored < 0) {
        return 0;
    }

    return Math.min(
        stored,
        MAX_WATCHED_SECONDS_PER_INTERACTION
    );
}

//Clamp a reported running total to what the clock allows: watch time can
//only grow by the time that has actually passed since the last report
//(times the fastest legitimate playback rate) plus a small grace. A
//client that seeks ahead, or simply invents a number, cannot bank XP.
function capReportedWatchSeconds(
    interaction,
    reportedSeconds
) {
    const currentSeconds =
        storedWatchSeconds(interaction);

    //a total that went backwards is not a new claim
    if (reportedSeconds <= currentSeconds) {
        return currentSeconds;
    }

    const elapsedSeconds = Math.max(
        0,
        (Date.now() -
            lastReportedAtMs(interaction)) /
            1000
    );

    const maxIncrease =
        elapsedSeconds * MAX_PLAYBACK_RATE +
        WATCH_TIME_GRACE_SECONDS;

    const increase = Math.min(
        reportedSeconds - currentSeconds,
        maxIncrease
    );

    return Math.min(
        currentSeconds + increase,
        MAX_WATCHED_SECONDS_PER_INTERACTION
    );
}

//credit XP for time actually watched. The duration is already stored
//by the caller, so a failure here must not fail the request.
async function awardWatchedXp(
    studentId,
    amount
) {
    if (!studentId || amount <= 0) {
        return;
    }

    try {
        await User.findByIdAndUpdate(
            studentId,
            {
                $inc: { xp: amount }
            },
            {
                new: true
            }
        );

    } catch (error) {
        console.error(
            'Unable to award video XP:',
            error
        );
    }
}


exports.createVideoInteraction =
    async (req, res) => {
        try {
            const {
                eventType,
                videoTitle,
                videoUrl,
                videoId,
                subject,
                score,
                durationSeconds
            } = req.body;

            const studentId =
                req.user?._id ||
                req.user?.id;

            if (
                !studentId ||
                !videoTitle ||
                !videoUrl ||
                !videoId
            ) {
                return res.status(400).json({
                    message:
                        'Student, video title, video URL, and video ID are required'
                });
            }

            //the schema marks subject and score as required and only
            //accepts a fixed set of event types, so validate here to
            //return 400 instead of letting Mongoose throw a 500
            if (
                !subject ||
                score === undefined ||
                score === null ||
                score === ''
            ) {
                return res.status(400).json({
                    message:
                        'Video subject and score are required'
                });
            }

            const numericScore = Number(score);

            if (!Number.isFinite(numericScore)) {
                return res.status(400).json({
                    message:
                        'The video score must be a number'
                });
            }

            const resolvedEventType =
                eventType || 'click';

            if (
                !ALLOWED_EVENT_TYPES.includes(
                    resolvedEventType
                )
            ) {
                return res.status(400).json({
                    message:
                        `eventType must be one of: ${ALLOWED_EVENT_TYPES.join(', ')}`
                });
            }

            const interaction =
                await VideoInteraction.create({
                    studentId: studentId,

                    eventType:
                        resolvedEventType,

                    videoTitle: videoTitle,

                    VideoURL: videoUrl,

                    videoId: videoId,

                    subject: subject,

                    score: numericScore,

                    durationSeconds:
                        durationSeconds || 0
                });

            return res.status(201).json({
                message:
                    'Video interaction recorded',

                interaction
            });

        } catch (error) {
            console.error(
                'Create video interaction error:',
                error
            );

            return res.status(500).json({
                message:
                    'Unable to record video interaction',

                error:
                    error.message
            });
        }
    };
exports.updateVideoDuration =
    async (req, res) => {
        try {
            const {
                durationSeconds
            } = req.body;

            const studentId =
                req.user?._id ||
                req.user?.id;

            const duration =
                Number(durationSeconds);

            if (
                !Number.isFinite(duration) ||
                duration < 0
            ) {
                return res.status(400).json({
                    message:
                        'A valid duration is required'
                });
            }

            const interaction =
                await VideoInteraction.findOne({
                    _id: req.params.id,
                    studentId: studentId
                });

            if (!interaction) {
                return res.status(404).json({
                    message:
                        'Video interaction not found'
                });
            }

            const requestedSeconds =
                Math.round(duration);

            const currentSeconds =
                storedWatchSeconds(interaction);

            //what the clock allows this report to claim
            const acceptedSeconds = Math.round(
                capReportedWatchSeconds(
                    interaction,
                    requestedSeconds
                )
            );

            //XP is derived from the stored watch time, never from the
            //number in the request. Re-reporting the same total adds
            //nothing, and a total that was seeded by an earlier request
            //is worth nothing either, because it is read back here as
            //the XP already accounted for.
            const awarded = Math.max(
                0,
                watchedXp(acceptedSeconds) -
                    watchedXp(currentSeconds)
            );

            interaction.durationSeconds =
                acceptedSeconds;

            interaction.xpAwarded =
                watchedXp(acceptedSeconds);

            await interaction.save();

            await awardWatchedXp(
                studentId,
                awarded
            );

            return res.status(200).json({
                message:
                    'Video duration updated',

                xpAwarded: awarded,

                interaction
            });

        } catch (error) {
            console.error(
                'Update video duration error:',
                error
            );

            return res.status(500).json({
                message:
                    'Unable to update video duration',

                error:
                    error.message
            });
        }
    };