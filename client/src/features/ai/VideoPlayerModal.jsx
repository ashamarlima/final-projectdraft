import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { updateVideoDuration } from "../users/userAPI";

//single shared promise for the YouTube IFrame Player API
let youtubeApiPromise = null;

function loadYouTubeApi() {
    if (youtubeApiPromise) {
        return youtubeApiPromise;
    }

    if (window.YT?.Player) {
        youtubeApiPromise =
            Promise.resolve(window.YT);

        return youtubeApiPromise;
    }

    youtubeApiPromise = new Promise(
        (resolve) => {
            window.onYouTubeIframeAPIReady =
                () => resolve(window.YT);

            const tag =
                document.createElement(
                    "script"
                );

            tag.src =
                "https://www.youtube.com/iframe_api";

            tag.async = true;

            document.head.appendChild(tag);
        }
    );

    return youtubeApiPromise;
}

//embeds a recommended video and reports the time actually spent
//watching it (playback seconds, not wall-clock tab time)
function VideoPlayerModal({
    video,
    interactionId,
    onClose
}) {
    const containerRef =
        useRef(null);

    useEffect(() => {
        let player = null;
        let disposed = false;
        let lastPosition = 0;
        let watchedSeconds = 0;
        let lastReported = 0;

        const reportWatchTime =
            () => {
                //only send when there is new watch time
                if (
                    watchedSeconds -
                    lastReported <
                    1
                ) {
                    return;
                }

                lastReported =
                    watchedSeconds;

                updateVideoDuration(
                    interactionId,
                    Math.round(
                        watchedSeconds
                    )
                ).catch((error) => {
                    console.error(
                        "Unable to update watch time:",
                        error
                    );
                });
            };

        loadYouTubeApi()
            .then((YT) => {
                if (
                    disposed ||
                    !containerRef.current ||
                    !YT?.Player
                ) {
                    return;
                }

                player = new YT.Player(
                    containerRef.current,
                    {
                        videoId:
                            video.videoId,

                        playerVars: {
                            autoplay: 1,
                            rel: 0
                        },

                        events: {
                            onReady:
                                (event) => {
                                    const iframe =
                                        event
                                            ?.target
                                            ?.getIframe?.();

                                    if (iframe) {
                                        iframe.style.width =
                                            "100%";

                                        iframe.style.height =
                                            "100%";
                                    }
                                },

                            onStateChange:
                                () => {
                                    if (
                                        !player
                                    ) {
                                        return;
                                    }

                                    const state =
                                        player.getPlayerState
                                            ? player.getPlayerState()
                                            : -1;

                                    const time =
                                        player.getCurrentTime
                                            ? player.getCurrentTime()
                                            : 0;

                                    if (
                                        state ===
                                        YT.PlayerState
                                            .PLAYING &&
                                        time >
                                        lastPosition
                                    ) {
                                        watchedSeconds +=
                                            time -
                                            lastPosition;
                                    }

                                    lastPosition =
                                        time;

                                    //send as soon as playback ends
                                    if (
                                        state ===
                                        YT.PlayerState
                                            .ENDED
                                    ) {
                                        reportWatchTime();
                                    }
                                }
                        }
                    }
                );
            })
            .catch((error) => {
                console.error(
                    "Failed to load the YouTube player:",
                    error
                );
            });

        //accumulate real playback time while the modal is open
        const tick = setInterval(
            () => {
                if (
                    disposed ||
                    !player
                ) {
                    return;
                }

                const state =
                    player.getPlayerState
                        ? player.getPlayerState()
                        : -1;

                const time =
                    player.getCurrentTime
                        ? player.getCurrentTime()
                        : 0;

                if (
                    state === 1 &&
                    time > lastPosition
                ) {
                    watchedSeconds +=
                        time - lastPosition;
                }

                lastPosition = time;

                //report every ~5 seconds of watching so little is
                //lost if the tab or browser is closed
                if (
                    watchedSeconds -
                    lastReported >=
                    5
                ) {
                    reportWatchTime();
                }
            },
            2000
        );

        return () => {
            disposed = true;

            clearInterval(tick);

            try {
                player?.destroy();
            } catch {
                //player never started
            }

            //send whatever was watched on close
            reportWatchTime();
        };
    }, [video.videoId, interactionId]);

    return (
        <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-3xl bg-gray-900 rounded-xl overflow-hidden border border-gray-700 shadow-2xl"
                onClick={(event) =>
                    event.stopPropagation()
                }
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-800">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-white line-clamp-2">
                            {video.title}
                        </p>

                        <p className="text-xs text-gray-400 mt-1">
                            {video.subject}{" "}
                            grade:{" "}
                            {video.score}
                            {video.channelTitle
                                ? ` · ${video.channelTitle}`
                                : ""}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 p-1 rounded-full text-gray-400 hover:text-white hover:bg-gray-800 transition-all cursor-pointer"
                        aria-label="Close video"
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* Player */}
                <div
                    className="relative w-full bg-black"
                    style={{
                        aspectRatio: "16 / 9"
                    }}
                >
                    <div
                        ref={containerRef}
                        className="absolute inset-0"
                    />
                </div>

                <p className="px-5 py-3 text-xs text-gray-500 border-t border-gray-800">
                    Your watch time is measured while the
                    video is playing.
                </p>
            </div>
        </div>
    );
}

export default VideoPlayerModal;
