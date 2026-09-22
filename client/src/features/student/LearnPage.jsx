import {
    Activity,
    BookMarked,
    CheckCircle2,
    Play,
    Star,
    Zap
} from "lucide-react";


function LearnPage({
    onOpenSubject
}) {
    const subjects = [
        {
            name: "Mathematics",
            progress: 65,
            level: 4,
            color: "bg-blue-500",
            light: "bg-blue-50",
            text: "text-blue-600",
            icon: "%"
        },
        {
            name: "Science",
            progress: 45,
            level: 3,
            color: "bg-green-500",
            light: "bg-green-50",
            text: "text-green-600",
            icon: "✦"
        },
        {
            name: "English",
            progress: 30,
            level: 2,
            color: "bg-purple-500",
            light: "bg-purple-50",
            text: "text-purple-600",
            icon: "▣"
        }
    ];


    const completedLessons = [
        {
            title: "Introduction to Numbers",
            xp: 15
        },
        {
            title: "Basic Operations",
            xp: 15
        },
        {
            title: "Number Practice",
            xp: 10
        }
    ];


    const recentActivities = [
        {
            text: "+20 XP Reward",
            bg: "bg-blue-50",
            textColor: "text-blue-600"
        },
        {
            text: "Lesson Complete!",
            bg: "bg-green-50",
            textColor: "text-green-600"
        },
        {
            text: "New Level Unlocked",
            bg: "bg-purple-50",
            textColor: "text-purple-600"
        }
    ];


    return (
        <div className="grid grid-cols-12 gap-6">

            {/* Left / Center */}
            <div className="col-span-12 xl:col-span-9 space-y-6">

                {/* Subject Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

                    {subjects.map(
                        (
                            subject,
                            index
                        ) => (
                            <button
                                type="button"
                                key={index}
                                onClick={() =>
                                    onOpenSubject?.(
                                        subject.name
                                    )
                                }
                                className="min-w-0 bg-white rounded-2xl border border-gray-200 p-4 shadow-sm text-left hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                            >

                                <div className="flex items-start justify-between mb-4">

                                    <div
                                        className={`w-10 h-10 rounded-xl ${subject.light} ${subject.text} flex items-center justify-center font-bold`}
                                    >
                                        {
                                            subject.icon
                                        }
                                    </div>

                                    <span
                                        className={`text-xs px-3 py-1 rounded-full ${subject.light} ${subject.text} font-medium`}
                                    >
                                        Level {
                                            subject.level
                                        }
                                    </span>

                                </div>


                                <h3 className="font-bold text-lg text-gray-800 truncate">
                                    {
                                        subject.name
                                    }
                                </h3>

                                <p className="text-xs text-gray-500 mt-1">
                                    {
                                        subject.progress
                                    }% Complete
                                </p>


                                <div className="mt-4 w-full h-2 bg-gray-200 rounded-full overflow-hidden">

                                    <div
                                        className={`h-full ${subject.color} rounded-full`}
                                        style={{
                                            width:
                                                `${subject.progress}%`
                                        }}
                                    />

                                </div>

                            </button>
                        )
                    )}


                    {/* Progress Card */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">

                        <h3 className="font-bold text-lg text-gray-800 mb-4">
                            Your Progress
                        </h3>


                        <div className="space-y-3 text-xs text-gray-600">

                            <div className="flex justify-between gap-3">
                                <span>
                                    Lessons Completed
                                </span>

                                <span className="font-semibold text-gray-800">
                                    24/40
                                </span>
                            </div>


                            <div className="flex justify-between gap-3">
                                <span>
                                    Achievements
                                </span>

                                <span className="font-semibold text-gray-800">
                                    6/15
                                </span>
                            </div>


                            <div className="flex justify-between gap-3">
                                <span>
                                    Overall Completion
                                </span>

                                <span className="font-semibold text-blue-600">
                                    60%
                                </span>
                            </div>


                            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">

                                <div
                                    className="h-full bg-blue-500 rounded-full"
                                    style={{
                                        width:
                                            "60%"
                                    }}
                                />

                            </div>

                        </div>

                    </div>

                </div>


                {/* Learning Path */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">

                    {/* Unit 1 */}
                    <div className="mb-8">

                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

                            <div>
                                <h3 className="text-xl font-bold text-gray-800">
                                    Unit 1 – Number Fundamentals
                                </h3>

                                <p className="text-green-500 text-sm font-medium mt-2">
                                    6 / 6 Completed ✓
                                </p>
                            </div>


                            <div className="w-full md:w-56 h-2 bg-gray-200 rounded-full overflow-hidden">

                                <div
                                    className="h-full bg-green-500 rounded-full"
                                    style={{
                                        width:
                                            "100%"
                                    }}
                                />

                            </div>

                        </div>

                    </div>


                    <hr className="border-gray-200 mb-8" />


                    {/* Unit 2 */}
                    <div>

                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">

                            <div>
                                <h3 className="text-xl font-bold text-gray-800">
                                    Unit 2 – Algebra Basics
                                </h3>

                                <p className="text-sm text-gray-500 mt-2">
                                    3 of 6 lessons completed • 50%
                                </p>
                            </div>


                            <div className="w-full md:w-56 h-2 bg-gray-200 rounded-full overflow-hidden">

                                <div
                                    className="h-full bg-blue-500 rounded-full"
                                    style={{
                                        width:
                                            "50%"
                                    }}
                                />

                            </div>

                        </div>


                        <div className="space-y-8">

                            {completedLessons.map(
                                (
                                    lesson,
                                    index
                                ) => (
                                    <div
                                        key={index}
                                        className="flex items-start gap-5"
                                    >

                                        <div className="flex flex-col items-center">

                                            <div className="w-11 h-11 rounded-full bg-green-500 flex items-center justify-center text-white shadow">

                                                <CheckCircle2
                                                    size={22}
                                                />

                                            </div>


                                            {index !==
                                                completedLessons.length -
                                                    1 && (
                                                    <div className="w-1 h-14 bg-green-500 mt-2 rounded-full" />
                                                )}

                                        </div>


                                        <div className="pt-1">

                                            <h4 className="font-semibold text-sm text-gray-800">
                                                {
                                                    lesson.title
                                                }
                                            </h4>

                                            <p className="text-green-500 text-xs font-medium mt-1">
                                                +{
                                                    lesson.xp
                                                } XP
                                            </p>

                                        </div>

                                    </div>
                                )
                            )}


                            {/* Current Lesson */}
                            <div className="flex flex-col lg:flex-row lg:items-center gap-6 pt-2">

                                <div className="flex items-center gap-5 flex-1">

                                    <div className="w-14 h-14 shrink-0 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-lg">

                                        <Play
                                            size={22}
                                            fill="white"
                                        />

                                    </div>


                                    <div>

                                        <h4 className="font-bold text-sm text-blue-500">
                                            Introduction to Algebra
                                        </h4>

                                        <p className="text-gray-500 text-xs mt-1">
                                            +20 XP

                                            <span className="ml-3 text-[10px] px-2 py-1 rounded-full bg-blue-50 text-blue-500 font-medium">
                                                CURRENT LESSON
                                            </span>
                                        </p>

                                    </div>

                                </div>


                                <div className="w-full lg:w-[360px] rounded-2xl bg-blue-50 border border-blue-200 p-5">

                                    <h4 className="font-bold text-base text-gray-800">
                                        Introduction to Algebra
                                    </h4>

                                    <p className="text-gray-500 text-xs mt-1">
                                        Progress: 60%
                                    </p>


                                    <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden mt-4">

                                        <div
                                            className="h-full bg-blue-500 rounded-full"
                                            style={{
                                                width:
                                                    "60%"
                                            }}
                                        />

                                    </div>


                                    <div className="flex items-center justify-between mt-4 text-xs text-gray-500">

                                        <span className="flex items-center gap-2">

                                            <Zap
                                                size={15}
                                                className="text-blue-500"
                                            />

                                            +20 XP Reward

                                        </span>

                                        <span>
                                            10 mins
                                        </span>

                                    </div>


                                    <button
                                        type="button"
                                        className="mt-4 w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition-colors cursor-pointer"
                                    >
                                        Continue Lesson
                                    </button>

                                </div>

                            </div>


                            {/* Unit Quiz */}
                            <div className="flex items-center gap-5 pt-4">

                                <div className="w-11 h-11 rounded-full border-2 border-gray-300 flex items-center justify-center text-gray-400">

                                    <BookMarked
                                        size={18}
                                    />

                                </div>

                                <h4 className="font-semibold text-sm text-gray-700">
                                    Unit Quiz
                                </h4>

                            </div>

                        </div>

                    </div>

                </div>

            </div>


            {/* Right Side */}
            <div className="col-span-12 xl:col-span-3 space-y-6">

                {/* Next Achievement */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">

                    <h3 className="text-lg font-bold text-gray-800 mb-4">
                        Next Achievement
                    </h3>


                    <div className="flex items-start gap-4">

                        <div className="w-12 h-12 shrink-0 rounded-xl bg-yellow-50 flex items-center justify-center text-yellow-500">

                            <Star
                                size={22}
                            />

                        </div>


                        <div>

                            <p className="font-bold text-sm text-gray-800">
                                Math Explorer
                            </p>

                            <p className="text-xs text-gray-500 mt-1">
                                Complete 5 Math lessons
                            </p>

                        </div>

                    </div>


                    <div className="mt-5">

                        <div className="flex justify-between text-xs mb-2">

                            <span className="text-gray-500">
                                Progress
                            </span>

                            <span className="font-semibold text-gray-800">
                                4/5
                            </span>

                        </div>


                        <div className="w-full h-2 bg-yellow-100 rounded-full overflow-hidden">

                            <div
                                className="h-full bg-yellow-500 rounded-full"
                                style={{
                                    width:
                                        "80%"
                                }}
                            />

                        </div>

                    </div>

                </div>


                {/* Recent Activity */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">

                    <h3 className="text-lg font-bold text-gray-800 mb-4">
                        Recent Activity
                    </h3>


                    <div className="space-y-3">

                        {recentActivities.map(
                            (
                                activity,
                                index
                            ) => (
                                <div
                                    key={index}
                                    className={`px-4 py-3 rounded-xl text-xs font-medium ${activity.bg} ${activity.textColor} flex items-center gap-2`}
                                >

                                    <Activity
                                        size={16}
                                    />

                                    {
                                        activity.text
                                    }

                                </div>
                            )
                        )}

                    </div>

                </div>

            </div>

        </div>
    );
}


export default LearnPage;