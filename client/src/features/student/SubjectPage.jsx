import { useNavigate } from "react-router-dom";
import {
    BookOpen,
    FileText,
    Loader2
} from "lucide-react";
import UnitLessonPdfs from "../materials/UnitLessonPdfs";
import useLessonMaterials from "../materials/useLessonMaterials";
import {
    gradeKeyForPageSubject,
    librarySubjectFor
} from "../materials/subjects";


//Only the wording is static now. Every figure on this page is read from
//the student's own record: the grade is their mark for the subject, and
//the level is derived from their XP.
const SUBJECT_DESCRIPTIONS = {
    Mathematics:
        "Build your skills with numbers, algebra and problem solving.",

    Science:
        "Explore biology, chemistry, physics and the natural world.",

    English:
        "Develop reading, grammar, writing and communication skills."
};


function SubjectPage({
    subject,
    student
}) {
    const description =
        SUBJECT_DESCRIPTIONS[subject] ||
        SUBJECT_DESCRIPTIONS.Mathematics;

    //The student's own mark for this subject, or "not graded" while a
    //teacher has not recorded one.
    const gradeKey =
        gradeKeyForPageSubject(subject);

    const grade = gradeKey
        ? student?.[gradeKey]
        : null;

    const isGraded = typeof grade === "number";

    //XP belongs to the account rather than to one subject, so this is the
    //student's overall level. The server derives it from XP (see
    //shared/xp.js), which is what keeps the two from disagreeing.
    const level =
        Number(student?.level) || 1;

    const xp = Number(student?.xp) || 0;

    //The lesson PDFs for this subject, grouped by unit and then by
    //lesson. The server scopes the list to the student's own grade, so
    //only the subject is named here. This page is called "Science" while
    //the library stores it as "Natural Sciences", hence the mapping.
    const librarySubject =
        librarySubjectFor(subject);

    const {
        units,
        totalPdfs,
        loading,
        error,
        reload
    } = useLessonMaterials(librarySubject);

    //Opening a lesson PDF now opens the lesson's own page, which carries
    //the PDF itself plus the AI assistant, flashcards and quiz built from
    //that lesson's text.
    const navigate = useNavigate();

    return (
        <div className="space-y-6">

            {/* Subject Header */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">

                    <div>

                        <p className="text-sm text-gray-500">
                            {
                                student?.name ||
                                "Student"
                            }
                        </p>

                        <h1 className="text-2xl font-bold text-gray-900 mt-1">
                            {subject}
                        </h1>

                        <p className="text-sm text-gray-500 mt-2 max-w-2xl">
                            {description}
                        </p>

                    </div>


                    <div className="min-w-52">

                        <div className="flex items-center justify-between text-sm mb-2">

                            <span className="text-gray-500">
                                Grade
                            </span>

                            <span className="font-semibold text-gray-800">
                                {isGraded
                                    ? `${grade} / 100`
                                    : "Not graded"}
                            </span>

                        </div>


                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">

                            <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{
                                    width: isGraded
                                        ? `${grade}%`
                                        : "0%"
                                }}
                            />

                        </div>


                        <div className="flex items-center justify-between gap-3 text-xs mt-2">

                            <span className="text-blue-600 font-medium">
                                Level {level}
                            </span>

                            <span className="text-gray-500">
                                {xp.toLocaleString()} XP
                            </span>

                        </div>

                    </div>

                </div>

            </div>


            {/* Loading and failure are reported once, above the units */}
            {loading && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 flex items-center gap-3 text-sm text-gray-500">

                    <Loader2
                        size={18}
                        className="animate-spin"
                    />

                    Loading lesson PDFs...

                </div>
            )}


            {error && (
                <div className="bg-white border border-red-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">

                    <p className="text-sm text-red-600">
                        {error}
                    </p>

                    <button
                        type="button"
                        onClick={reload}
                        className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold cursor-pointer transition-colors"
                    >
                        Try again
                    </button>

                </div>
            )}


            {/* Nothing uploaded for this subject and grade yet */}
            {!loading && !error && units.length === 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm py-14 text-center">

                    <FileText
                        size={42}
                        className="mx-auto text-gray-300 mb-4"
                    />

                    <p className="text-gray-500">
                        No {librarySubject} lesson PDFs for{" "}
                        Grade {student?.classroom} yet.
                    </p>

                    <p className="text-sm text-gray-400 mt-2">
                        Lessons are published one grade at a time, so a PDF uploaded for another grade will not appear here.
                        A unit appears here once a PDF is uploaded for Grade {student?.classroom}.
                    </p>

                </div>
            )}


            {/* One card per uploaded unit, holding that unit's lessons */}
            {units.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                    {units.map((unit) => (
                        <div
                            key={unit.unit}
                            className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm"
                        >

                            <div className="flex items-center justify-between">

                                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600">

                                    <BookOpen
                                        size={20}
                                    />

                                </div>


                                <span className="text-xs font-medium px-3 py-1 rounded-full bg-blue-50 text-blue-600">
                                    {unit.pdfCount}{" "}
                                    {unit.pdfCount === 1
                                        ? "PDF"
                                        : "PDFs"}
                                </span>

                            </div>


                            <h2 className="text-lg font-bold text-gray-900 mt-5">
                                Unit {unit.unit}
                            </h2>

                            <p className="text-sm text-gray-500 mt-1">
                                {unit.lessonCount}{" "}
                                {unit.lessonCount === 1
                                    ? "lesson"
                                    : "lessons"}
                            </p>


                            {/* This unit's lesson PDFs, one group per
                                lesson, so a lesson reads as
                                "Lesson 1 -> PDF 1". */}
                            <div className="mt-5 pt-4 border-t border-gray-100">

                                <div className="flex items-center gap-2 text-gray-500">

                                    <FileText
                                        size={15}
                                    />

                                    <p className="text-xs font-semibold uppercase tracking-wide">
                                        {librarySubject}{" "}
                                        Lesson PDFs
                                    </p>

                                </div>


                                <div className="mt-3">

                                    <UnitLessonPdfs
                                        lessons={
                                            unit.lessons
                                        }
                                        onOpen={(pdf) =>
                                            navigate(
                                                `/lessons/${pdf._id}`
                                            )
                                        }
                                    />

                                </div>

                            </div>

                        </div>
                    ))}

                </div>
            )}


            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">

                <div className="flex items-center gap-3">

                    <BookOpen
                        size={22}
                        className="text-blue-500"
                    />

                    <h2 className="text-lg font-bold text-gray-900">
                        About this subject
                    </h2>

                </div>

                <p className="text-sm text-gray-500 mt-3">
                    The units and lessons above are the{" "}
                    {librarySubject} lesson library for your
                    grade: each lesson lists the PDFs that
                    were uploaded for it, in order. That is
                    currently {totalPdfs}{" "}
                    {totalPdfs === 1 ? "PDF" : "PDFs"} across{" "}
                    {units.length}{" "}
                    {units.length === 1 ? "unit" : "units"}.
                </p>

            </div>


        </div>
    );
}


export default SubjectPage;