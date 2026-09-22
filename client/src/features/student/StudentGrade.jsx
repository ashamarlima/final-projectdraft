import {
    BookOpen,
    Calculator,
    FlaskConical,
    GraduationCap
} from "lucide-react";

function StudentGrade({ student }) {
    //display grade or not graded
    const displayGrade = (grade) => {
        return (
            grade === null ||
            grade === undefined
        )
            ? "Not graded"
            : grade;
    };

    //calculate average from available grades
    const calculateAverage = () => {
        if (!student) {
            return "Not graded";
        }

        const grades = [
            student.Math,
            student.Literature,
            student.Science
        ].filter(
            (grade) =>
                grade !== null &&
                grade !== undefined
        );

        if (grades.length === 0) {
            return "Not graded";
        }

        const total = grades.reduce(
            (sum, grade) =>
                sum + grade,
            0
        );

        return (
            total / grades.length
        ).toFixed(1);
    };

    const subjects = [
        {
            key: "Math",
            label: "Math",
            icon: Calculator,
            iconClass: "text-blue-500",
            bgClass: "bg-blue-50"
        },
        {
            key: "Literature",
            label: "Literature",
            icon: BookOpen,
            iconClass: "text-yellow-500",
            bgClass: "bg-yellow-50"
        },
        {
            key: "Science",
            label: "Science",
            icon: FlaskConical,
            iconClass: "text-green-500",
            bgClass: "bg-green-50"
        }
    ];

    return (
        <div className="space-y-6">

            <div>
                <h1 className="text-2xl font-bold text-gray-900">
                    My Grades
                </h1>

                <p className="text-sm text-gray-500 mt-1">
                    View your academic results.
                </p>
            </div>

            {/* Grade Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {subjects.map((subject) => {
                    const Icon = subject.icon;

                    return (
                        <div
                            key={subject.key}
                            className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm"
                        >
                            <div className="flex justify-between items-start">

                                <div>
                                    <p className="text-gray-500 font-medium">
                                        {subject.label}
                                    </p>

                                    <p className="text-3xl font-bold text-gray-900 mt-3">
                                        {displayGrade(
                                            student?.[
                                                subject.key
                                            ]
                                        )}
                                    </p>

                                    <p className="text-sm text-gray-400 mt-2">
                                        Maximum grade: 100
                                    </p>
                                </div>

                                <div
                                    className={`p-3 rounded-xl ${subject.bgClass} ${subject.iconClass}`}
                                >
                                    <Icon size={24} />
                                </div>

                            </div>
                        </div>
                    );
                })}

            </div>

            {/* Average */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex justify-between items-center">

                <div>
                    <p className="text-gray-500 font-medium flex items-center gap-2">
                        <GraduationCap
                            size={18}
                            className="text-indigo-500"
                        />

                        Grade Average
                    </p>

                    <p className="text-sm text-gray-400 mt-1">
                        Average of all available grades
                    </p>
                </div>

                <p className="text-4xl font-bold text-green-600">
                    {calculateAverage()}
                </p>

            </div>

        </div>
    );
}

export default StudentGrade;
