import {
    GraduationCap,
    Star,
    TrendingUp,
    Zap
} from "lucide-react";


//the subjects a student can be graded on, matching the API
const SUBJECTS = [
    {
        key: "Math",
        label: "Mathematics",
        barClass: "bg-blue-500"
    },
    {
        key: "Literature",
        label: "Literature",
        barClass: "bg-yellow-500"
    },
    {
        key: "Science",
        label: "Science",
        barClass: "bg-green-500"
    }
];


function DashboardPage({
    student
}) {
    const xp = student?.xp || 0;
    const level = student?.level || 1;

    //only graded subjects count towards the average and the summary
    const gradedSubjects = SUBJECTS
        .map((subject) => ({
            ...subject,
            grade: student?.[subject.key]
        }))
        .filter(
            (subject) =>
                typeof subject.grade === "number"
        );

    const average = gradedSubjects.length > 0
        ? (
            gradedSubjects.reduce(
                (total, subject) =>
                    total + subject.grade,
                0
            ) / gradedSubjects.length
        ).toFixed(1)
        : null;

    const strongest = gradedSubjects.length > 0
        ? gradedSubjects.reduce(
            (best, subject) =>
                subject.grade > best.grade
                    ? subject
                    : best
        )
        : null;

    const weakest = gradedSubjects.length > 0
        ? gradedSubjects.reduce(
            (lowest, subject) =>
                subject.grade < lowest.grade
                    ? subject
                    : lowest
        )
        : null;

    const cards = [
        {
            title: "Current Level",
            value: level,
            description: "Based on your XP",
            icon: TrendingUp,
            iconClass: "text-blue-600",
            bgClass: "bg-blue-50"
        },
        {
            title: "Total XP",
            value: xp.toLocaleString(),
            description: "Earned from grades and lessons",
            icon: Zap,
            iconClass: "text-indigo-600",
            bgClass: "bg-indigo-50"
        },
        {
            title: "Grade Average",
            value: average ?? "Not graded",
            description: "Across your graded subjects",
            icon: GraduationCap,
            iconClass: "text-green-600",
            bgClass: "bg-green-50"
        },
        {
            title: "Strongest Subject",
            value: strongest?.label || "Not graded",
            description: strongest
                ? `Scored ${strongest.grade} out of 100`
                : "No grades recorded yet",
            icon: Star,
            iconClass: "text-yellow-600",
            bgClass: "bg-yellow-50"
        }
    ];


    return (
        <div className="space-y-6">

            <div>

                <h1 className="text-2xl font-bold text-gray-900">
                    Welcome back, {
                        student?.name ||
                        "Student"
                    }
                </h1>

                <p className="text-sm text-gray-500 mt-1">
                    Here is a quick overview of your learning progress.
                </p>

            </div>


            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

                {cards.map(
                    (
                        card,
                        index
                    ) => {
                        const Icon =
                            card.icon;

                        return (
                            <div
                                key={index}
                                className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm"
                            >

                                <div className="flex items-start justify-between gap-4">

                                    <div className="min-w-0">

                                        <p className="text-sm text-gray-500">
                                            {
                                                card.title
                                            }
                                        </p>

                                        <p className="text-3xl font-bold text-gray-900 mt-2 truncate">
                                            {
                                                card.value
                                            }
                                        </p>

                                        <p className="text-xs text-gray-400 mt-1">
                                            {
                                                card.description
                                            }
                                        </p>

                                    </div>


                                    <div
                                        className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${card.bgClass}`}
                                    >

                                        <Icon
                                            size={22}
                                            className={
                                                card.iconClass
                                            }
                                        />

                                    </div>

                                </div>

                            </div>
                        );
                    }
                )}

            </div>


            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                <div className="xl:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">

                    <h2 className="text-lg font-bold text-gray-900">
                        Your Grades
                    </h2>

                    {gradedSubjects.length === 0 ? (
                        <p className="text-sm text-gray-500 mt-2">
                            Your teachers have not recorded any
                            grades for you yet.
                        </p>
                    ) : (
                        <>
                            <p className="text-sm text-gray-500 mt-2">
                                {strongest.label} is currently your
                                strongest subject.{" "}
                                {weakest.key === strongest.key
                                    ? "Keep up the steady work across all your subjects."
                                    : `${weakest.label} is the one to work on next.`}
                            </p>


                            <div className="mt-6 space-y-4">

                                {SUBJECTS.map((subject) => {
                                    const grade =
                                        student?.[
                                            subject.key
                                        ];

                                    const isGraded =
                                        typeof grade ===
                                        "number";

                                    return (
                                        <div
                                            key={subject.key}
                                        >

                                            <div className="flex justify-between text-sm mb-2">

                                                <span className="text-gray-600">
                                                    {
                                                        subject.label
                                                    }
                                                </span>

                                                <span className="font-medium text-gray-800">
                                                    {isGraded
                                                        ? `${grade} / 100`
                                                        : "Not graded"}
                                                </span>

                                            </div>


                                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">

                                                <div
                                                    className={`h-full ${subject.barClass} rounded-full`}
                                                    style={{
                                                        width: isGraded
                                                            ? `${grade}%`
                                                            : "0%"
                                                    }}
                                                />

                                            </div>

                                        </div>
                                    );
                                })}

                            </div>
                        </>
                    )}

                </div>


                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">

                    <h2 className="text-lg font-bold text-gray-900">
                        Focus Next
                    </h2>

                    {weakest ? (
                        <div className="mt-5 space-y-4">

                            <div className="p-4 rounded-xl bg-blue-50">

                                <p className="text-sm font-semibold text-blue-700">
                                    Study {weakest.label}
                                </p>

                                <p className="text-xs text-blue-500 mt-1">
                                    Your lowest grade right now is{" "}
                                    {weakest.grade} out of 100.
                                </p>

                            </div>


                            <div className="p-4 rounded-xl bg-green-50">

                                <p className="text-sm font-semibold text-green-700">
                                    Current average
                                </p>

                                <p className="text-xs text-green-600 mt-1">
                                    {average} across{" "}
                                    {gradedSubjects.length}{" "}
                                    {gradedSubjects.length === 1
                                        ? "subject"
                                        : "subjects"}
                                </p>

                            </div>

                        </div>
                    ) : (
                        <p className="text-sm text-gray-500 mt-2">
                            Once your grades are recorded, your
                            weakest subject will be highlighted
                            here.
                        </p>
                    )}

                </div>

            </div>

        </div>
    );
}


export default DashboardPage;
