import {
    BookOpen,
    Flame,
    Lock,
    Medal,
    Star,
    Trophy
} from "lucide-react";


function AchievementsPage() {
    const achievements = [
        {
            title:
                "First Lesson",
            description:
                "Complete your first lesson",
            icon:
                BookOpen,
            unlocked:
                true
        },
        {
            title:
                "7 Day Streak",
            description:
                "Study for 7 days in a row",
            icon:
                Flame,
            unlocked:
                true
        },
        {
            title:
                "Math Explorer",
            description:
                "Complete 5 Mathematics lessons",
            icon:
                Star,
            unlocked:
                false,
            progress:
                "4 / 5"
        },
        {
            title:
                "Quiz Master",
            description:
                "Score 100% on a quiz",
            icon:
                Trophy,
            unlocked:
                false,
            progress:
                "0 / 1"
        },
        {
            title:
                "Level 10",
            description:
                "Reach student level 10",
            icon:
                Medal,
            unlocked:
                false,
            progress:
                "8 / 10"
        }
    ];


    return (
        <div className="space-y-6">

            <div>

                <h1 className="text-2xl font-bold text-gray-900">
                    Achievements
                </h1>

                <p className="text-sm text-gray-500 mt-1">
                    Complete learning goals to unlock badges.
                </p>

            </div>


            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">

                {achievements.map(
                    (
                        achievement,
                        index
                    ) => {
                        const Icon =
                            achievement.icon;

                        return (
                            <div
                                key={index}
                                className={`border rounded-2xl p-5 shadow-sm ${
                                    achievement.unlocked
                                        ? "bg-white border-gray-200"
                                        : "bg-gray-50 border-gray-200"
                                }`}
                            >

                                <div className="flex items-start justify-between">

                                    <div
                                        className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                            achievement.unlocked
                                                ? "bg-yellow-50 text-yellow-500"
                                                : "bg-gray-200 text-gray-400"
                                        }`}
                                    >

                                        <Icon
                                            size={24}
                                        />

                                    </div>


                                    {!achievement.unlocked && (

                                        <Lock
                                            size={18}
                                            className="text-gray-400"
                                        />

                                    )}

                                </div>


                                <h2 className="text-lg font-bold text-gray-900 mt-5">
                                    {
                                        achievement.title
                                    }
                                </h2>

                                <p className="text-sm text-gray-500 mt-1">
                                    {
                                        achievement.description
                                    }
                                </p>


                                {achievement.unlocked ? (

                                    <span className="inline-block mt-4 text-xs font-semibold px-3 py-1 rounded-full bg-green-50 text-green-600">
                                        Unlocked
                                    </span>

                                ) : (

                                    <p className="text-xs text-gray-500 mt-4">
                                        Progress: {
                                            achievement.progress
                                        }
                                    </p>

                                )}

                            </div>
                        );
                    }
                )}

            </div>

        </div>
    );
}


export default AchievementsPage;