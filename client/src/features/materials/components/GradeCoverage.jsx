//How many PDFs the current subject holds in each grade.
//
//A student only ever sees the grade they are enrolled in, so a grade
//holding no PDFs is the usual reason their subject page looks empty.
//Reporting it here is what makes that visible from the admin side rather
//than only from the student's. Clicking a grade filters the library below
//to it.
//
//All of the state it shows is passed in: this is a view over the library
//the page has already loaded, and it fetches nothing itself.

function GradeCoverage({
    subject,
    grades,
    gradeCounts,
    gradeFilter,
    onGradeChange
}) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">

            <div className="flex flex-wrap items-start justify-between gap-3">

                <div>

                    <h2 className="text-lg font-bold text-white">
                        {subject} coverage by grade
                    </h2>

                    <p className="text-sm text-gray-400 mt-1">
                        A student only sees the grade they
                        are enrolled in, so a grade holding
                        no PDFs shows them nothing.
                    </p>

                </div>


                {gradeFilter && (
                    <button
                        type="button"
                        onClick={() => onGradeChange("")}
                        className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 text-sm cursor-pointer transition-colors"
                    >
                        Show all grades
                    </button>
                )}

            </div>


            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">

                {grades.map((grade) => {
                    const count =
                        gradeCounts.get(String(grade)) || 0;

                    const isActive =
                        gradeFilter === String(grade);

                    const isEmpty = count === 0;

                    return (
                        <button
                            key={grade}
                            type="button"
                            aria-pressed={isActive}
                            onClick={() =>
                                onGradeChange(
                                    isActive
                                        ? ""
                                        : String(grade)
                                )
                            }
                            className={`text-left px-4 py-3 rounded-lg border transition-colors cursor-pointer ${
                                isActive
                                    ? "bg-green-500 border-green-500 text-gray-950"
                                    : isEmpty
                                        ? "bg-gray-800/40 border-amber-500/40 text-amber-300 hover:bg-gray-800"
                                        : "bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                            }`}
                        >

                            <span className="block text-xs font-semibold uppercase tracking-wide opacity-80">
                                Grade {grade}
                            </span>

                            <span className="block text-2xl font-bold mt-1">
                                {count}
                            </span>

                            <span className="block text-xs opacity-70">
                                {count === 1 ? "PDF" : "PDFs"}
                            </span>

                        </button>
                    );
                })}

            </div>

        </div>
    );
}

export default GradeCoverage;
