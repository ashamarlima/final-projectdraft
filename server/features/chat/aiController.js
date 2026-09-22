const User = require("../users/userModels");

const {
    callGemini,
    EMPTY_REPLY_MESSAGE
} = require("../../shared/ai");

const MAX_VIDEOS_PER_SUBJECT = 2;

//search YouTube for real, embeddable videos about the topic
async function fetchYouTubeVideos(searchQuery) {
    const searchUrl =
        "https://www.googleapis.com/youtube/v3/search?part=snippet" +
        "&type=video&videoEmbeddable=true" +
        `&maxResults=${MAX_VIDEOS_PER_SUBJECT}` +
        `&q=${encodeURIComponent(searchQuery)}` +
        `&key=${encodeURIComponent(process.env.YOUTUBE_API_KEY)}`;

    const response = await fetch(searchUrl, {
        signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
        throw new Error(
            `YouTube API request failed with status ${response.status}`
        );
    }

    const data = await response.json();

    return (data.items || [])
        .map((item) => ({
            videoId:
                item.id?.videoId,

            title:
                item.snippet?.title,

            channelTitle:
                item.snippet?.channelTitle,

            thumbnail:
                item.snippet?.thumbnails
                    ?.medium?.url ||
                item.snippet?.thumbnails
                    ?.default?.url ||
                ""
        }))
        .filter((video) =>
            Boolean(video.videoId)
        );
}

//fallback recommendations that link to a YouTube search results
//page (used when no YouTube API key is set or the API is down)
function buildSearchFallback(
    weakSubjects,
    classSearchText,
    subjectSearchTopics
) {
    return weakSubjects.map(
        ([subject, score]) => {
            const searchQuery =
                subjectSearchTopics[
                subject
                ];

            const videoId =
                `search-${subject.toLowerCase()}-${classSearchText
                    .toLowerCase()
                    .replace(/\s+/g, "-")}`;

            return {
                source: "search",
                subject,
                score,

                videoId,

                title:
                    `${subject} lessons for ${classSearchText}`,

                url:
                    `https://www.youtube.com/results?search_query=${encodeURIComponent(
                        searchQuery
                    )}`
            };
        }
    );
}

//student AI chat

exports.studentChat = async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({
                message:
                    "GEMINI_API_KEY is missing from the .env file"
            });
        }

        const userId =
            req.user?._id ||
            req.user?.id;

        if (!userId) {
            return res.status(401).json({
                message:
                    "User authentication failed"
            });
        }

        const student = await User.findById(
            userId
        ).select(
            "name classroom role Math Literature Science"
        );

        if (!student) {
            return res.status(404).json({
                message:
                    "Student not found"
            });
        }

        if (student.role !== "student") {
            return res.status(403).json({
                message:
                    "This AI assistant is only available to students"
            });
        }

        const message =
            req.body.message?.trim() ||
            "Analyze my grades and give me study advice.";

        if (message.length > 1000) {
            return res.status(400).json({
                message:
                    "Your message must be less than 1000 characters"
            });
        }

        const grades = {
            Math:
                student.Math ?? null,

            Literature:
                student.Literature ?? null,

            Science:
                student.Science ?? null
        };

        const availableGrades =
            Object.entries(grades).filter(
                ([, score]) =>
                    typeof score === "number"
            );

        //find the two lowest subjects

        const weakSubjects = [
            ...availableGrades
        ]
            .sort(
                (
                    [, firstScore],
                    [, secondScore]
                ) =>
                    firstScore -
                    secondScore
            )
            .slice(0, 2);

        const classroom =
            String(student.classroom || "").trim();

        const classSearchText =
            classroom
                ? `class ${classroom}`
                : "students";

        const subjectSearchTopics = {
            Math:
                `math lessons for ${classSearchText}`,

            Literature:
                `literature lessons for ${classSearchText}`,

            Science:
                `science lessons for ${classSearchText}`
        };

        //recommend real, playable videos from the YouTube API when
        //a key is configured; otherwise fall back to search links

        let videoRecommendations =
            buildSearchFallback(
                weakSubjects,
                classSearchText,
                subjectSearchTopics
            );

        if (process.env.YOUTUBE_API_KEY) {
            try {
                const groupedResults =
                    await Promise.all(
                        weakSubjects.map(
                            async (
                                [subject, score]
                            ) => {
                                try {
                                    const videos =
                                        await fetchYouTubeVideos(
                                            subjectSearchTopics[
                                            subject
                                            ]
                                        );

                                    return videos
                                        .slice(
                                            0,
                                            MAX_VIDEOS_PER_SUBJECT
                                        )
                                        .map((video) => ({
                                            source:
                                                "youtube",

                                            subject,
                                            score,

                                            videoId:
                                                video.videoId,

                                            title:
                                                video.title ||
                                                `${subject} lessons for ${classSearchText}`,

                                            channelTitle:
                                                video.channelTitle ||
                                                "",

                                            thumbnail:
                                                video.thumbnail,

                                            url:
                                                `https://www.youtube.com/watch?v=${video.videoId}`
                                        }));

                                } catch (error) {
                                    console.error(
                                        `YouTube search failed for ${subject}:`,
                                        error
                                    );

                                    return [];
                                }
                            }
                        )
                    );

                const realVideos =
                    groupedResults.flat();

                //only keep the fallback when no real video was found
                if (realVideos.length > 0) {
                    videoRecommendations =
                        realVideos;
                }

            } catch (error) {
                console.error(
                    "YouTube API error:",
                    error
                );
            }
        }

        const firstName =
            student.name
                ?.trim()
                .split(" ")[0] ||
            "Student";

        const systemInstruction = `
You are a supportive academic study assistant.

Rules:
- Use only the student information provided.
- Never invent or change grades.
- Clearly explain when a subject has not been graded.
- Explain the student's strongest and weakest subjects.
- Give practical and encouraging study advice.
- Do not insult or shame the student.
- Keep the response below 350 words.
- Address the student using their first name.
        `;

        const prompt = `
Student information:

First name: ${firstName}
Classroom: ${student.classroom}

Grades:
Math: ${grades.Math ?? "Not graded"}
Literature: ${grades.Literature ?? "Not graded"}
Science: ${grades.Science ?? "Not graded"}

Student question:
${message}
        `;

        //The model choice, the API key, the request/response shape and
        //the request timeout all live in shared/ai.js, the same helper
        //the notes and lesson assistants use, so there is only one
        //place that talks to Gemini.
        const reply = await callGemini({
            systemInstruction,
            prompt,
            temperature: 0.4,
            maxOutputTokens: 700
        });

        return res.status(200).json({
            message:
                "AI response generated",

            student: {
                name:
                    student.name,

                classroom:
                    student.classroom,

                grades
            },

            reply,

            videoRecommendations
        });

    } catch (error) {
        console.error(
            "Student AI error:",
            error
        );

        //Gemini's own status is passed through when the provider
        //turned the request down (a 429 quota error, say), so the
        //client can tell that apart from a failure on our side. An
        //empty reply is reported by name because it needs no
        //explanation; anything else gets the generic message, since
        //the raw one names our internals.
        const upstreamStatus =
            error.upstreamStatus;

        return res
            .status(upstreamStatus || 500)
            .json({
                message:
                    !upstreamStatus &&
                    error.message ===
                        EMPTY_REPLY_MESSAGE
                        ? error.message
                        : "Failed to generate AI advice",

                error: error.message
            });
    }
};