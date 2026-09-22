import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";
import {
    Check,
    FileText,
    Loader2,
    Lock,
    RefreshCw,
    Upload,
    X
} from "lucide-react";
import LessonSection from "./LessonSection";
import {
    deleteMaterial,
    getMaterials,
    getMaterialViewUrl,
    reorderMaterials,
    updateMaterial,
    uploadMaterial
} from "./materialsAPI";
import { readFormValues } from "../../shared/form/readFormValues";
import { LESSON_SUBJECTS } from "./subjects";

const FALLBACK_GRADES = ["9", "10", "11", "12"];

const MAX_LESSON = 99;
const MAX_UNIT = 99;

//Uploading, reordering and deleting are admin-only on the server, so
//canManage gates that UI rather than letting a teacher fill in a form
//that would answer 403. It defaults to false: read-only is the safe side.
function MaterialManager({
    classrooms = [],
    canManage = false
}) {
    //the classroom enum arrives as 12, 11, 10, 9; a grade dropdown reads
    //naturally low to high
    const grades = [
        ...(classrooms.length > 0
            ? classrooms
            : FALLBACK_GRADES)
    ].sort(
        (first, second) =>
            Number(first) - Number(second)
    );

    //which library is open. Every request below is scoped to it, so the
    //upload form, the list and the reorder arrows all stay inside one
    //subject and cannot disturb another.
    const [subject, setSubject] = useState(
        LESSON_SUBJECTS[0]
    );

    const [materials, setMaterials] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    //grade, unit and lesson are all client-side filters over the
    //subject's whole library, so the coverage strip below can count
    //every grade at the same time
    const [gradeFilter, setGradeFilter] = useState("");
    const [unitFilter, setUnitFilter] = useState("");
    const [lessonFilter, setLessonFilter] =
        useState("");

    const [uploading, setUploading] = useState(false);

    //{ tone: "error" | "success", text } | null
    const [feedback, setFeedback] = useState(null);

    //the material being renamed, or null
    const [editing, setEditing] = useState(null);

    const [saving, setSaving] = useState(false);

    //the material currently being moved, so its buttons can be locked
    const [movingId, setMovingId] = useState(null);

    const fileInputRef = useRef(null);

    //Both forms are uncontrolled: their values are read when they are
    //submitted, so typing does not re-render the PDF list beside them.
    const uploadFormRef = useRef(null);
    const editFormRef = useRef(null);
    const titleInputRef = useRef(null);

    const loadMaterials = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            //The whole subject is loaded rather than one grade: the
            //coverage strip counts the PDFs in every grade, which is
            //what makes an upload that landed in the wrong grade
            //visible from here instead of only from the student's
            //side. Grade, unit and lesson are client-side filters.
            setMaterials(
                await getMaterials({ subject })
            );
        } catch (err) {
            setError(
                err.message ||
                    "Unable to load the PDF library"
            );
        } finally {
            setLoading(false);
        }
    }, [subject]);

    useEffect(() => {
        //defer so the effect body performs no synchronous
        //state updates (loadMaterials calls setLoading)
        const timeoutId = setTimeout(() => {
            loadMaterials();
        }, 0);

        return () => clearTimeout(timeoutId);
    }, [loadMaterials]);

    //How many PDFs this subject holds in each grade. A grade sitting
    //at 0 is the usual reason a student's subject page looks empty, so
    //the coverage strip reports it rather than leaving it to be
    //discovered from the student's side.
    const gradeCounts = useMemo(() => {
        const counts = new Map();

        for (const material of materials) {
            const key = String(material.grade);

            counts.set(
                key,
                (counts.get(key) || 0) + 1
            );
        }

        return counts;
    }, [materials]);

    //A unit or lesson number only means something inside its grade, so
    //the dropdowns are scoped to the selected grade (or to the whole
    //subject while no grade is selected).
    const gradeScopedMaterials = useMemo(
        () =>
            gradeFilter
                ? materials.filter(
                    (material) =>
                        String(material.grade) ===
                        gradeFilter
                )
                : materials,
        [materials, gradeFilter]
    );

    //units and lessons that actually exist, for the filter dropdowns
    const unitOptions = useMemo(
        () =>
            [
                ...new Set(
                    gradeScopedMaterials.map(
                        (material) => material.unit
                    )
                )
            ].sort((first, second) => first - second),
        [gradeScopedMaterials]
    );

    const lessonOptions = useMemo(
        () =>
            [
                ...new Set(
                    gradeScopedMaterials.map(
                        (material) => material.lesson
                    )
                )
            ].sort((first, second) => first - second),
        [gradeScopedMaterials]
    );

    //One section per grade + unit + lesson. The items keep the order the
    //server returned them in (unit, then lesson, then position), which is
    //the order students see and the scope a reorder works in.
    const lessonSections = useMemo(() => {
        const groups = new Map();

        for (const material of materials) {
            const key =
                `${material.grade}|${material.unit}|${material.lesson}`;

            if (!groups.has(key)) {
                groups.set(key, []);
            }

            groups.get(key).push(material);
        }

        //grades are strings, so compare them as numbers to get 9 before
        //10; a lesson number only means something inside its unit, so
        //unit comes first
        return [...groups.entries()]
            .map(([key, items]) => ({
                key,
                grade: items[0].grade,
                unit: items[0].unit,
                lesson: items[0].lesson,
                items
            }))
            .sort(
                (first, second) =>
                    Number(first.grade) -
                        Number(second.grade) ||
                    Number(first.unit) -
                        Number(second.unit) ||
                    Number(first.lesson) -
                        Number(second.lesson)
            );
    }, [materials]);

    //the grade, unit and lesson filters narrow the library to a single
    //section. All three are client-side, so the coverage strip keeps
    //reporting every grade while one of them is applied.
    const visibleSections = useMemo(
        () =>
            lessonSections.filter(
                (section) =>
                    (!gradeFilter ||
                        String(section.grade) ===
                            gradeFilter) &&
                    (!unitFilter ||
                        String(section.unit) ===
                            unitFilter) &&
                    (!lessonFilter ||
                        String(section.lesson) ===
                            lessonFilter)
            ),
        [
            lessonSections,
            gradeFilter,
            unitFilter,
            lessonFilter
        ]
    );

    const visibleCount = visibleSections.reduce(
        (total, section) =>
            total + section.items.length,
        0
    );

    const handleUpload = async (event) => {
        event.preventDefault();

        setFeedback(null);

        const file =
            fileInputRef.current?.files?.[0] ||
            null;

        if (!file) {
            setFeedback({
                tone: "error",
                text: "Choose a PDF or image file to upload"
            });

            return;
        }

        const {
            title,
            grade,
            unit: unitField,
            lesson: lessonField
        } = readFormValues(uploadFormRef.current);

        const unit = Number(unitField);
        const lesson = Number(lessonField);

        if (
            !Number.isInteger(unit) ||
            unit < 1 ||
            unit > MAX_UNIT
        ) {
            setFeedback({
                tone: "error",

                text: `Unit must be a whole number between 1 and ${MAX_UNIT}`
            });

            return;
        }

        if (
            !Number.isInteger(lesson) ||
            lesson < 1 ||
            lesson > MAX_LESSON
        ) {
            setFeedback({
                tone: "error",

                text: `Lesson must be a whole number between 1 and ${MAX_LESSON}`
            });

            return;
        }

        setUploading(true);

        try {
            await uploadMaterial({
                file,
                subject,
                grade,
                unit,
                lesson,
                title
            });

            //clear the title and the chosen file, but keep the grade and
            //lesson, so a run of uploads into one lesson is not reset
            if (titleInputRef.current) {
                titleInputRef.current.value = "";
            }

            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }

            setFeedback({
                tone: "success",
                text: "Uploaded successfully"
            });

            await loadMaterials();
        } catch (err) {
            setFeedback({
                tone: "error",

                text:
                    err.message ||
                    "Unable to upload that file"
            });
        } finally {
            setUploading(false);
        }
    };

    //open the blank tab first, so the browser does not treat the later
    //navigation as a popup and block it
    const handlePreview = async (material) => {
        const previewWindow = window.open("", "_blank");

        try {
            const { url } = await getMaterialViewUrl(
                material._id
            );

            if (previewWindow) {
                previewWindow.location.assign(url);
            } else {
                window.location.assign(url);
            }
        } catch (err) {
            previewWindow?.close();

            alert(
                err.message || "Unable to open that PDF"
            );
        }
    };

    //the modal prefills itself from `editing`, so only the material is
    //kept here
    const openEditor = (material) => {
        setEditing(material);
    };

    const handleSave = async (event) => {
        event.preventDefault();

        if (!editing) {
            return;
        }

        const {
            title,
            grade,
            unit: unitField,
            lesson: lessonField
        } = readFormValues(editFormRef.current);

        const unit = Number(unitField);
        const lesson = Number(lessonField);

        if (
            !Number.isInteger(unit) ||
            unit < 1 ||
            unit > MAX_UNIT
        ) {
            alert(
                `Unit must be a whole number between 1 and ${MAX_UNIT}`
            );

            return;
        }

        if (
            !Number.isInteger(lesson) ||
            lesson < 1 ||
            lesson > MAX_LESSON
        ) {
            alert(
                `Lesson must be a whole number between 1 and ${MAX_LESSON}`
            );

            return;
        }

        setSaving(true);

        try {
            await updateMaterial(editing._id, {
                title,
                grade,
                unit,
                lesson
            });

            setEditing(null);

            await loadMaterials();
        } catch (err) {
            alert(
                err.message ||
                    "Unable to update that PDF"
            );
        } finally {
            setSaving(false);
        }
    };

    //Move a PDF one place earlier or later within its own lesson. The
    //whole lesson is sent back, so the stored order stays a clean
    //sequence instead of drifting into duplicate positions.
    const handleMove = async (
        lessonItems,
        index,
        direction
    ) => {
        const target = index + direction;

        if (target < 0 || target >= lessonItems.length) {
            return;
        }

        const reordered = [...lessonItems];

        [reordered[index], reordered[target]] = [
            reordered[target],
            reordered[index]
        ];

        //every item in the lesson is in flight, so this only has to be
        //non-null to lock the arrows
        setMovingId(lessonItems[index]._id);

        try {
            await reorderMaterials({
                subject,
                grade: lessonItems[0].grade,
                unit: lessonItems[0].unit,
                lesson: lessonItems[0].lesson,
                order: reordered.map(
                    (item) => item._id
                )
            });

            await loadMaterials();
        } catch (err) {
            alert(
                err.message ||
                    "Unable to reorder that PDF"
            );
        } finally {
            setMovingId(null);
        }
    };

    const handleDelete = async (material) => {
        const confirmed = window.confirm(
            `Delete "${material.title}"? The stored file is removed too.`
        );

        if (!confirmed) {
            return;
        }

        try {
            await deleteMaterial(material._id);

            await loadMaterials();
        } catch (err) {
            alert(
                err.message ||
                    "Unable to delete that PDF"
            );
        }
    };

    //switching library drops the unit and lesson filters, because a
    //number that exists in one subject usually does not exist in the next
    const handleSubjectChange = (nextSubject) => {
        setSubject(nextSubject);
        setUnitFilter("");
        setLessonFilter("");
        setFeedback(null);
    };

    return (
        <div className="space-y-8">

            {/* Subject picker: chooses which library the page works in */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-2 flex flex-wrap gap-2">

                {LESSON_SUBJECTS.map(
                    (subjectOption) => {
                        const isActive =
                            subjectOption === subject;

                        return (
                            <button
                                key={subjectOption}
                                type="button"
                                onClick={() =>
                                    handleSubjectChange(
                                        subjectOption
                                    )
                                }
                                aria-pressed={isActive}
                                className={`flex-1 min-w-40 px-4 py-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                                    isActive
                                        ? "bg-green-500 text-gray-950"
                                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                                }`}
                            >
                                {subjectOption}
                            </button>
                        );
                    }
                )}

            </div>


            {/* Coverage by grade. A student only ever sees their own
                grade, so a grade sitting at 0 PDFs is why a student's
                subject page looks empty; this makes that visible from
                the admin side. Clicking a grade filters the library
                below to it. */}
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
                            onClick={() => {
                                setGradeFilter("");
                                setUnitFilter("");
                                setLessonFilter("");
                            }}
                            className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 text-sm cursor-pointer transition-colors"
                        >
                            Show all grades
                        </button>
                    )}

                </div>


                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">

                    {grades.map((grade) => {
                        const count =
                            gradeCounts.get(
                                String(grade)
                            ) || 0;

                        const isActive =
                            gradeFilter ===
                            String(grade);

                        const isEmpty = count === 0;

                        return (
                            <button
                                key={grade}
                                type="button"
                                aria-pressed={isActive}
                                onClick={() => {
                                    setGradeFilter(
                                        isActive
                                            ? ""
                                            : String(grade)
                                    );

                                    setUnitFilter("");
                                    setLessonFilter("");
                                }}
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
                                    {count === 1
                                        ? "PDF"
                                        : "PDFs"}
                                </span>

                            </button>
                        );
                    })}

                </div>

            </div>


            {/* Upload */}
            {canManage && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">

                <div className="p-6 border-b border-gray-800 flex items-center gap-3">

                    <div className="p-2 bg-green-500 rounded-lg">
                        <Upload
                            size={20}
                            className="text-gray-950"
                        />
                    </div>

                    <div>

                        <h2 className="text-xl font-bold text-white">
                            Upload a {subject} lesson PDF
                        </h2>

                        <p className="text-sm text-gray-400">
                            {subject} · PDF or image, up to 25MB
                        </p>

                    </div>

                </div>


                <form
                    ref={uploadFormRef}
                    onSubmit={handleUpload}
                    className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5 text-left"
                >

                    <div>
                        <label className="block text-gray-300 font-medium mb-2">
                            Title
                        </label>

                        <input
                            ref={titleInputRef}
                            name="title"
                            type="text"
                            defaultValue=""
                            placeholder="Defaults to the file name"
                            className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                        />
                    </div>


                    <div>
                        <label className="block text-gray-300 font-medium mb-2">
                            Grade *
                        </label>

                        <select
                            name="grade"
                            defaultValue="9"
                            className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none cursor-pointer"
                        >
                            {grades.map((grade) => (
                                <option
                                    key={grade}
                                    value={grade}
                                >
                                    Grade {grade}
                                </option>
                            ))}
                        </select>
                    </div>


                    <div>
                        <label className="block text-gray-300 font-medium mb-2">
                            Unit *
                        </label>

                        <input
                            name="unit"
                            type="number"
                            min="1"
                            max={MAX_UNIT}
                            defaultValue="1"
                            className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                        />
                    </div>


                    <div>
                        <label className="block text-gray-300 font-medium mb-2">
                            Lesson *
                        </label>

                        <input
                            name="lesson"
                            type="number"
                            min="1"
                            max={MAX_LESSON}
                            defaultValue="1"
                            className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                        />
                    </div>


                    <div>
                        <label className="block text-gray-300 font-medium mb-2">
                            PDF or image file *
                        </label>

                        {/* An image is turned into a PDF by the server,
                            so the picker offers both. image/* covers the
                            formats a phone or a scanner produces; the
                            extensions are there for the ones a system may
                            not have a registered type for (HEIC). */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="application/pdf,.pdf,image/*,.png,.jpg,.jpeg,.webp,.avif,.heic,.heif,.gif,.tif,.tiff,.bmp"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg file:mr-3 file:px-3 file:py-1 file:rounded-lg file:border-0 file:bg-green-500 file:text-gray-950 file:text-sm file:font-medium cursor-pointer"
                        />
                    </div>


                    <div className="md:col-span-2 xl:col-span-5 flex flex-wrap items-center gap-4">

                        <button
                            type="submit"
                            disabled={uploading}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-semibold rounded-lg transition-colors cursor-pointer"
                        >
                            {uploading ? (
                                <>
                                    <Loader2
                                        size={18}
                                        className="animate-spin"
                                    />
                                    Uploading...
                                </>
                            ) : (
                                <>
                                    <Upload size={18} />
                                    Upload file
                                </>
                            )}
                        </button>


                        {feedback && (
                            <p
                                className={`text-sm ${
                                    feedback.tone ===
                                    "success"
                                        ? "text-green-400"
                                        : "text-red-400"
                                }`}
                            >
                                {feedback.text}
                            </p>
                        )}

                    </div>

                </form>

            </div>
            )}


            {/* What a teacher sees in place of the upload form */}
            {!canManage && (
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 flex items-start gap-3 text-left">

                    <div className="p-2 bg-gray-800 rounded-lg shrink-0">
                        <Lock
                            size={18}
                            className="text-gray-400"
                        />
                    </div>


                    <div>
                        <h2 className="text-lg font-bold text-white">
                            Read-only library
                        </h2>

                        <p className="text-sm text-gray-400 mt-1">
                            Open or preview any PDF below. A photo you
                        upload is stored as a PDF.
                            Uploading, reordering and deleting
                            are limited to admins.
                        </p>
                    </div>

                </div>
            )}


            {/* Library */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">

                <div className="p-6 border-b border-gray-800 flex flex-wrap items-center justify-between gap-4">

                    <div>

                        <h2 className="text-xl font-bold text-white">
                            {subject} PDF library
                        </h2>

                        <p className="text-sm text-gray-400">
                            {visibleCount}{" "}
                            {visibleCount === 1
                                ? "file"
                                : "files"}
                            {" · "}
                            {visibleSections.length}{" "}
                            {visibleSections.length === 1
                                ? "lesson"
                                : "lessons"}
                        </p>

                    </div>


                    <div className="flex flex-wrap items-center gap-3">

                        <select
                            value={gradeFilter}
                            onChange={(event) => {
                                setGradeFilter(
                                    event.target.value
                                );

                                //units and lessons belong to a grade, so
                                //both filters are dropped with it
                                setUnitFilter("");
                                setLessonFilter("");
                            }}
                            className="px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none cursor-pointer"
                        >
                            <option value="">
                                All grades
                            </option>

                            {grades.map((grade) => (
                                <option
                                    key={grade}
                                    value={grade}
                                >
                                    Grade {grade}
                                </option>
                            ))}
                        </select>


                        <select
                            value={unitFilter}
                            onChange={(event) => {
                                setUnitFilter(
                                    event.target.value
                                );

                                //a lesson number only exists inside a
                                //unit, so it is dropped with the unit
                                setLessonFilter("");
                            }}
                            className="px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none cursor-pointer"
                        >
                            <option value="">
                                All units
                            </option>

                            {unitOptions.map((unit) => (
                                <option
                                    key={unit}
                                    value={String(unit)}
                                >
                                    Unit {unit}
                                </option>
                            ))}
                        </select>


                        <select
                            value={lessonFilter}
                            onChange={(event) =>
                                setLessonFilter(
                                    event.target.value
                                )
                            }
                            className="px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none cursor-pointer"
                        >
                            <option value="">
                                All lessons
                            </option>

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
                            onClick={loadMaterials}
                            disabled={loading}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 disabled:opacity-50 cursor-pointer transition-colors"
                        >
                            <RefreshCw size={15} />
                            Refresh
                        </button>

                    </div>

                </div>


                {loading ? (
                    <div className="py-16 text-center text-gray-400">

                        <Loader2
                            size={26}
                            className="mx-auto animate-spin mb-3"
                        />

                        Loading the library...
                    </div>

                ) : error ? (
                    <div className="p-6">

                        <p className="text-sm text-red-400">
                            {error}
                        </p>

                    </div>

                ) : visibleSections.length === 0 ? (
                    <div className="py-16 text-center">

                        <FileText
                            size={46}
                            className="mx-auto text-gray-600 mb-4"
                        />

                        <p className="text-gray-400">
                            {canManage
                                ? "No PDFs here yet. Upload one above."
                                : "No lesson PDFs have been added yet."}
                        </p>

                    </div>

                ) : (
                    <div className="p-6 space-y-6">

                        {visibleSections.map((section) => (
                            <LessonSection
                                key={section.key}
                                grade={section.grade}
                                unit={section.unit}
                                lesson={section.lesson}
                                materials={section.items}
                                canManage={canManage}
                                busy={movingId !== null}
                                onMove={handleMove}
                                onPreview={handlePreview}
                                onEdit={openEditor}
                                onDelete={handleDelete}
                            />
                        ))}

                    </div>
                )}

            </div>


            {/* Edit modal, keyed by material so the prefilled form is rebuilt per PDF */}
            {canManage && editing && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">

                    <div
                        key={editing._id}
                        className="bg-gray-900 rounded-lg shadow-2xl max-w-lg w-full border border-gray-800"
                    >

                        <div className="flex justify-between items-center p-6 border-b border-gray-800">

                            <h2 className="text-xl font-bold text-white">
                                Edit PDF
                            </h2>

                            <button
                                type="button"
                                onClick={() =>
                                    setEditing(null)
                                }
                                className="text-gray-400 hover:text-white hover:bg-gray-800 p-1 rounded-full transition-colors cursor-pointer"
                            >
                                <X size={22} />
                            </button>

                        </div>


                        <form
                            ref={editFormRef}
                            onSubmit={handleSave}
                            className="p-6 space-y-5 text-left"
                        >

                            <div>
                                <label className="block text-gray-300 font-medium mb-2">
                                    Title
                                </label>

                                <input
                                    name="title"
                                    type="text"
                                    defaultValue={editing.title}
                                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                                />
                            </div>


                            <div className="grid grid-cols-3 gap-5">

                                <div>
                                    <label className="block text-gray-300 font-medium mb-2">
                                        Grade
                                    </label>

                                    <select
                                        name="grade"
                                        defaultValue={
                                            editing.grade
                                        }
                                        className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none cursor-pointer"
                                    >
                                        {grades.map(
                                            (grade) => (
                                                <option
                                                    key={
                                                        grade
                                                    }
                                                    value={
                                                        grade
                                                    }
                                                >
                                                    Grade{" "}
                                                    {
                                                        grade
                                                    }
                                                </option>
                                            )
                                        )}
                                    </select>
                                </div>


                                <div>
                                    <label className="block text-gray-300 font-medium mb-2">
                                        Unit
                                    </label>

                                    <input
                                        name="unit"
                                        type="number"
                                        min="1"
                                        max={MAX_UNIT}
                                        defaultValue={
                                            editing.unit ?? 1
                                        }
                                        className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                                    />
                                </div>


                                <div>
                                    <label className="block text-gray-300 font-medium mb-2">
                                        Lesson
                                    </label>

                                    <input
                                        name="lesson"
                                        type="number"
                                        min="1"
                                        max={MAX_LESSON}
                                        defaultValue={
                                            editing.lesson
                                        }
                                        className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                                    />
                                </div>

                            </div>


                            <div className="flex gap-3 pt-2">

                                <button
                                    type="button"
                                    onClick={() =>
                                        setEditing(null)
                                    }
                                    className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 font-medium cursor-pointer transition-colors"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-gray-950 font-semibold rounded-lg cursor-pointer transition-colors"
                                >
                                    {saving ? (
                                        <Loader2
                                            size={18}
                                            className="animate-spin"
                                        />
                                    ) : (
                                        <Check size={18} />
                                    )}

                                    {saving
                                        ? "Saving..."
                                        : "Save changes"}
                                </button>

                            </div>

                        </form>

                    </div>

                </div>
            )}

        </div>
    );
}

export default MaterialManager;
