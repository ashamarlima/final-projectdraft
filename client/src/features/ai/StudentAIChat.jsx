import {
    Bot,
    Play,
    Send,
    Sparkles,
    Video
} from "lucide-react";
import {
    useCallback,
    useEffect,
    useRef,
    useState
} from "react";
import {
    sendStudentAIMessage,
    trackVideoInteraction,
    updateVideoDuration
} from "../users/userAPI";
import VideoPlayerModal
    from "./VideoPlayerModal";
 
function StudentAIChat({ student }) {
    const [messages, setMessages] =
        useState([]);

    //the question box is uncontrolled: its value is read when the form
    //is submitted, so typing does not re-render the whole chat
    const inputRef = useRef(null);

    const [
        videoRecommendations,
        setVideoRecommendations
    ] = useState([]);

    const [loading, setLoading] =
        useState(false);

    const [error, setError] =
        useState("");

    //real video currently playing in the embedded player
    //({ video, interactionId } | null)
    const [activeVideo, setActiveVideo] =
        useState(null);

    const messagesEndRef =
        useRef(null);

    //recommended videos opened in another tab that still need
    //their watched duration reported when the student returns
    //(interactionId -> { videoId, openedAt })
    const activeVideosRef =
        useRef(new Map());

    //scroll to newest message

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({
            behavior: "smooth"
        });
    }, [
        messages,
        loading,
        error
    ]);

    //report how long the student watched each opened video: the
    //links open in a new tab, so the watch time is approximated by
    //the time between the click and this window regaining focus
    const flushWatchedDurations =
        useCallback(() => {
            const activeVideos =
                activeVideosRef.current;

            if (activeVideos.size === 0) {
                return;
            }

            const now = Date.now();

            activeVideos.forEach(
                (
                    {
                        videoId,
                        openedAt
                    },
                    interactionId
                ) => {
                    activeVideos.delete(
                        interactionId
                    );

                    const durationSeconds =
                        Math.max(
                            0,
                            Math.round(
                                (now - openedAt) /
                                1000
                            )
                        );

                    if (durationSeconds === 0) {
                        return;
                    }

                    updateVideoDuration(
                        interactionId,
                        durationSeconds
                    ).catch((error) => {
                        console.error(
                            `Unable to update duration for video ${videoId}:`,
                            error
                        );
                    });
                }
            );
        }, []);

    //flush durations when the student comes back from the video tab

    useEffect(() => {
        const handleWindowFocus =
            () => {
                if (
                    document.visibilityState ===
                    "visible"
                ) {
                    flushWatchedDurations();
                }
            };

        window.addEventListener(
            "focus",
            handleWindowFocus
        );

        document.addEventListener(
            "visibilitychange",
            handleWindowFocus
        );

        return () => {
            window.removeEventListener(
                "focus",
                handleWindowFocus
            );

            document.removeEventListener(
                "visibilitychange",
                handleWindowFocus
            );

            //report any remaining durations on unmount
            flushWatchedDurations();
        };
    }, [
        flushWatchedDurations
    ]);

    //send message to AI

    const sendMessage = useCallback(async (
        messageText,
        showStudentMessage = true
    ) => {
        const cleanedMessage =
            messageText.trim();

        if (
            !cleanedMessage ||
            loading
        ) {
            return;
        }

        setError("");

        if (showStudentMessage) {
            setMessages(
                (currentMessages) => [
                    ...currentMessages,
                    {
                        role: "student",
                        content:
                            cleanedMessage
                    }
                ]
            );
        }

        setLoading(true);

        try {
            const data =
                await sendStudentAIMessage(
                    cleanedMessage
                );

            setMessages(
                (currentMessages) => [
                    ...currentMessages,
                    {
                        role: "assistant",
                        content:
                            data.reply
                    }
                ]
            );

            setVideoRecommendations(
                data.videoRecommendations ||
                []
            );

        } catch (error) {
            console.error(
                "Student AI error:",
                error
            );

            setError(
                error.message ||
                "The AI assistant is currently unavailable"
            );

        } finally {
            setLoading(false);
        }
    }, [loading]);

    //automatically analyze grades after login

    useEffect(() => {
        if (!student?._id) {
            return;
        }

        //The token lives in an httpOnly cookie now, so there is no
        //login identifier to read here: the welcome analysis is made
        //once per tab session instead of once per login.
        const storageKey =
            `student-ai-welcome-${student._id}`;

        const alreadyGenerated =
            sessionStorage.getItem(
                storageKey
            );

        if (alreadyGenerated) {
            return;
        }

        sessionStorage.setItem(
            storageKey,
            "true"
        );

        //defer until after paint so the effect body performs no
        //synchronous state updates; the sessionStorage flag above
        //also stops StrictMode's double-invocation from sending the
        //welcome message twice
        setTimeout(() => {
            sendMessage(
                `
Analyze all of my grades.

Tell me:
1. My strongest subject
2. My weakest subject
3. Which subject I should study first
4. A simple study plan
5. Encouraging advice
                `,
                false
            );
        }, 0);

    }, [student?._id, sendMessage]);

    //submit student message

    const handleSubmit = async (e) => {
        e.preventDefault();

        const currentMessage = (
            inputRef.current?.value || ""
        ).trim();

        if (
            !currentMessage ||
            loading
        ) {
            return;
        }

        //clear the box as soon as the message has been taken
        inputRef.current.value = "";

        await sendMessage(
            currentMessage
        );
    };

    //retry automatic analysis

    const handleRetry = async () => {
        await sendMessage(
            "Analyze my grades and give me a simple study plan.",
            false
        );
    };

    //record a click on a recommended video. Real videos open in
    //the embedded player (playback time is tracked there); search
    //links open in a new tab and use the focus-based approximation
    const handleVideoClick = async (
        video,
        openedAt
    ) => {
        try {
            const data =
                await trackVideoInteraction({
                    studentId: student._id,
                    eventType: "click",
                    videoTitle: video.title,
                    videoUrl: video.url,
                    videoId: video.videoId,
                    subject: video.subject,
                    score: video.score
                });

            const interactionId =
                data.interaction?._id;

            if (!interactionId) {
                return;
            }

            if (video.source === "youtube") {
                setActiveVideo({
                    video,
                    interactionId
                });

            } else {
                activeVideosRef.current.set(
                    interactionId,
                    {
                        videoId:
                            video.videoId,
                        openedAt
                    }
                );
            }

        } catch (error) {
            console.error(
                "Unable to record click:",
                error
            );
        }
    };

    return (
        <>
        <section className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">

            {/* AI Header */}
            <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">

                <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500 rounded-lg">
                        <Bot
                            size={24}
                            className="text-gray-950"
                        />
                    </div>

                    <div>
                        <h2 className="text-lg font-bold text-white">
                            AI Study Assistant
                        </h2>

                        <p className="text-xs text-gray-400">
                            Personalized advice based on your grades
                        </p>
                    </div>
                </div>

                <div className="hidden sm:flex items-center gap-2 text-xs text-green-400">
                    <Sparkles size={16} />

                    Powered by Gemini
                </div>

            </div>

            {/* Messages */}
            <div className="min-h-80 max-h-[500px] overflow-y-auto px-6 py-6 space-y-4">

                {messages.length === 0 &&
                    !loading &&
                    !error && (
                        <div className="flex flex-col items-center justify-center py-16 text-center">

                            <Bot
                                size={42}
                                className="text-gray-600 mb-4"
                            />

                            <p className="text-gray-300">
                                Ask the AI assistant about your grades.
                            </p>

                            <p className="text-sm text-gray-500 mt-2">
                                You can ask for study advice,
                                explanations, or a study plan.
                            </p>

                        </div>
                    )}

                {messages.map(
                    (
                        chatMessage,
                        index
                    ) => (
                        <div
                            key={index}
                            className={
                                chatMessage.role ===
                                "student"
                                    ? "flex justify-end"
                                    : "flex justify-start"
                            }
                        >
                            <div
                                className={
                                    chatMessage.role ===
                                    "student"
                                        ? "max-w-2xl bg-green-500 text-gray-950 rounded-2xl rounded-br-sm px-4 py-3"
                                        : "max-w-2xl bg-gray-800 text-gray-200 rounded-2xl rounded-bl-sm px-4 py-3"
                                }
                            >
                                <p className="text-sm leading-6 whitespace-pre-line">
                                    {
                                        chatMessage.content
                                    }
                                </p>
                            </div>
                        </div>
                    )
                )}

                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-gray-800 text-gray-400 rounded-2xl rounded-bl-sm px-4 py-3">

                            <div className="flex items-center gap-2">

                                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" />

                                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" />

                                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" />

                                <span className="ml-2 text-sm">
                                    Reviewing your grades...
                                </span>

                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="bg-red-950 border border-red-900 text-red-300 rounded-lg px-4 py-3">

                        <p className="text-sm">
                            {error}
                        </p>

                        <button
                            type="button"
                            onClick={handleRetry}
                            disabled={loading}
                            className="text-sm font-medium text-red-200 underline mt-2 cursor-pointer disabled:opacity-50"
                        >
                            Try again
                        </button>

                    </div>
                )}

                <div
                    ref={messagesEndRef}
                />

            </div>

            {/* YouTube Recommendations */}
            {videoRecommendations.length >
                0 && (
                    <div className="px-6 py-5 border-t border-gray-800">

                        <div className="flex items-center gap-2 mb-4">

                            <Video
                                size={20}
                                className="text-red-500"
                            />

                            <h3 className="text-sm font-semibold text-white">
                                {videoRecommendations.some(
                                    (video) =>
                                        video.source ===
                                        "youtube"
                                )
                                    ? "Recommended Videos"
                                    : "Recommended Video Searches"}
                            </h3>

                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                            {videoRecommendations.map(
                                (video) =>
                                    video.source ===
                                    "youtube" ? (
                                        <button
                                            key={
                                                video.videoId
                                            }
                                            type="button"
                                            onClick={() =>
                                                handleVideoClick(
                                                    video,
                                                    Date.now()
                                                )
                                            }
                                            className="bg-gray-800 border border-gray-700 hover:border-red-500 rounded-lg overflow-hidden text-left transition-colors cursor-pointer"
                                        >
                                            <div className="relative aspect-video bg-black">

                                                {video.thumbnail ? (
                                                    <img
                                                        src={
                                                            video.thumbnail
                                                        }
                                                        alt={
                                                            video.title
                                                        }
                                                        loading="lazy"
                                                        className="h-full w-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="h-full w-full flex items-center justify-center">
                                                        <Video
                                                            size={28}
                                                            className="text-red-500"
                                                        />
                                                    </div>
                                                )}

                                                <span className="absolute inset-0 flex items-center justify-center">
                                                    <span className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                                                        <Play
                                                            size={22}
                                                            className="text-white ml-0.5"
                                                            fill="white"
                                                        />
                                                    </span>
                                                </span>

                                            </div>

                                            <div className="px-4 py-3">
                                                <p className="text-sm font-medium text-white line-clamp-2">
                                                    {
                                                        video.title
                                                    }
                                                </p>

                                                <p className="text-xs text-gray-400 mt-1">
                                                    {
                                                        video.channelTitle
                                                    }
                                                    {video.channelTitle
                                                        ? " · "
                                                        : ""}
                                                    {
                                                        video.subject
                                                    }{" "}
                                                    grade:{" "}
                                                    {
                                                        video.score
                                                    }{" "}
                                                    · Watch in app
                                                </p>
                                            </div>
                                        </button>

                                    ) : (
                                        <a
                                            key={
                                                video.videoId
                                            }
                                            href={
                                                video.url
                                            }
                                            target="_blank"
                                            rel="noreferrer"
                                            onClick={() =>
                                                handleVideoClick(
                                                    video,
                                                    Date.now()
                                                )
                                            }
                                            className="flex items-center justify-between gap-4 bg-gray-800 border border-gray-700 hover:border-red-500 rounded-lg px-4 py-4 transition-colors"
                                        >
                                            <div>
                                                <p className="text-sm font-medium text-white">
                                                    {
                                                        video.title
                                                    }
                                                </p>

                                                <p className="text-xs text-gray-400 mt-1">
                                                    {
                                                        video.subject
                                                    }{" "}
                                                    grade:{" "}
                                                    {
                                                        video.score
                                                    }
                                                </p>
                                            </div>

                                            <Video
                                                size={24}
                                                className="text-red-500 flex-shrink-0"
                                            />
                                        </a>
                                    )
                            )}

                        </div>
                    </div>
                )}

            {/* Chat Input */}
            <form
                onSubmit={handleSubmit}
                className="p-4 border-t border-gray-800 flex gap-3"
            >
                <input
                    ref={inputRef}
                    type="text"
                    defaultValue=""
                    placeholder="Ask about your grades or study plan..."
                    maxLength={1000}
                    disabled={loading}
                    required
                    className="flex-1 bg-gray-950 border border-gray-700 text-white rounded-lg px-4 py-3 outline-none focus:border-green-500 disabled:opacity-60"
                />

                <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 px-5 py-3 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-medium rounded-lg cursor-pointer transition-colors"
                >
                    <Send size={18} />

                    <span className="hidden sm:inline">
                        Send
                    </span>
                </button>
            </form>

        </section>

        {activeVideo && (
            <VideoPlayerModal
                video={activeVideo.video}
                interactionId={
                    activeVideo.interactionId
                }
                onClose={() =>
                    setActiveVideo(null)
                }
            />
        )}
        </>
    );
}

export default StudentAIChat;