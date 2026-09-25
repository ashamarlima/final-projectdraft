import { RefreshCw } from "lucide-react";

//The grade, unit and lesson dropdowns, and the refresh button, that sit in
//the library panel's header.
//
//The dropdowns are populated from what the library actually holds, not from
//a fixed range, so a unit or lesson number only appears once an admin has
//put a PDF in it.
//
//Every change is reported as the raw field value. Narrowing one filter
//clears the ones below it, but that belongs to the page: a unit or lesson
//number only means something inside its grade, and the page is what owns
//that rule.

function LibraryFilters({
    grades,
    gradeFilter,
    unitFilter,
    lessonFilter,
    unitOptions,
    lessonOptions,
    loading,
    onGradeChange,
    onUnitChange,
    onLessonChange,
    onRefresh
}) {
    return (
        <div className="flex flex-wrap items-center gap-3">

            <select
                value={gradeFilter}
                onChange={(event) =>
                    onGradeChange(event.target.value)
                }
                className="px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none cursor-pointer"
            >
                <option value="">All grades</option>

                {grades.map((grade) => (
                    <option key={grade} value={grade}>
                        Grade {grade}
                    </option>
                ))}
            </select>


            <select
                value={unitFilter}
                onChange={(event) =>
                    onUnitChange(event.target.value)
                }
                className="px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none cursor-pointer"
            >
                <option value="">All units</option>

                {unitOptions.map((unit) => (
                    <option key={unit} value={String(unit)}>
                        Unit {unit}
                    </option>
                ))}
            </select>


            <select
                value={lessonFilter}
                onChange={(event) =>
                    onLessonChange(event.target.value)
                }
                className="px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none cursor-pointer"
            >
                <option value="">All lessons</option>

                {lessonOptions.map((lesson) => (
                    <option
                        key={lesson}
                        value={String(lesson)}
                    >
                        Lesson {lesson}
                    </option>
                ))}
            </select>


            <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 disabled:opacity-50 cursor-pointer transition-colors"
            >
                <RefreshCw size={15} />
                Refresh
            </button>

        </div>
    );
}

export default LibraryFilters;
