import {
    useCallback,
    useEffect,
    useMemo,
    useState
} from "react";
import { FileText, Loader2, Lock } from "lucide-react";

import LessonSection from "./LessonSection";
import DeleteMaterialModal from "./components/DeleteMaterialModal";
import EditMaterialModal from "./components/EditMaterialModal";
import GradeCoverage from "./components/GradeCoverage";
import LibraryFilters from "./components/LibraryFilters";
import UploadForm from "./components/UploadForm";

import {
    deleteMaterial,
    getMaterials,
    getMaterialViewUrl,
    reorderMaterials,
    rereadMaterialText,
    updateMaterial,
    uploadMaterial
} from "./materialsAPI";

import {
    LESSON_SUBJECTS,
    MAX_LESSON,
    MAX_UNIT
} from "./subjects";

const FALLBACK_GRADES = ["9", "10", "11", "12"];

//The lesson PDF library: one subject's PDFs, grouped by grade, unit and
//lesson, with the admin actions on top.
//
//This component owns the data and every action. The pieces it renders --
//the coverage strip, the upload form, the filters and the two dialogs --
//are views over that state, which is why they take props rather than
//fetching anything themselves.
//
//Uploading, reordering and deleting are admin-only on the server, so
//canManage gates that UI rather than letting a teacher fill in a form that
//would answer 403. It defaults to false: read-only is the safe side.
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

    //grade, unit and lesson are all client-side filters over the subject's
    //whole library, so the coverage strip below can count every grade at
    //the same time
    const [gradeFilter, setGradeFilter] = useState("");
    const [unitFilter, setUnitFilter] = useState("");
    const [lessonFilter, setLessonFilter] = useState("");

    const [uploading, setUploading] = useState(false);

    //{ tone: "error" | "success", text } | null, for the upload form
    const [feedback, setFeedback] = useState(null);

    //Errors from working on the library itself -- moving, reading or
    //deleting a file -- are shown beside the list rather than in the upload
    //form above, which is usually scrolled out of view by then. Kept in its
    //own state so the two messages cannot overwrite each other.
    const [libraryFeedback, setLibraryFeedback] =
        useState(null);

    //the material being renamed, or null
    const [editing, setEditing] = useState(null);

    const [saving, setSaving] = useState(false);

    //the material awaiting delete confirmation, or null
    const [pendingDelete, setPendingDelete] = useState(null);

    const [deleting, setDeleting] = useState(false);

    //the material currently being moved, so its buttons can be locked
    const [movingId, setMovingId] = useState(null);

    //the material currently being read by the AI again, so its button can
    //show that something is happening
    const [readingId, setReadingId] = useState(null);

    const loadMaterials = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            //The whole subject is loaded rather than one grade: the
            //coverage strip counts the PDFs in every grade, which is what
            //makes an upload that landed in the wrong grade visible from
            //here instead of only from the student's side. Grade, unit and
            //lesson are client-side filters.
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
        //defer so the effect body performs no synchronous state updates
        //(loadMaterials calls setLoading)
        const timeoutId = setTimeout(() => {
            loadMaterials();
        }, 0);

        return () => clearTimeout(timeoutId);
    }, [loadMaterials]);

    //How many PDFs this subject holds in each grade.
    const gradeCounts = useMemo(() => {
        const counts = new Map();

        for (const material of materials) {
            const key = String(material.grade);

            counts.set(key, (counts.get(key) || 0) + 1);
        }

        return counts;
    }, [materials]);

    //A unit or lesson number only means something inside its grade, so the
    //dropdowns are scoped to the selected grade (or to the whole subject
    //while no grade is selected).
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

        //grades are strings, so compare them as numbers to get 9 before 10;
        //a lesson number only means something inside its unit, so unit
        //comes first
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

    //A unit or lesson number belongs to a grade, so narrowing the grade
    //drops the two filters under it.
    const handleGradeFilter = (value) => {
        setGradeFilter(value);
        setUnitFilter("");
        setLessonFilter("");
    };

    const handleUnitFilter = (value) => {
        setUnitFilter(value);

        //a lesson number only exists inside a unit, so it is dropped with
        //the unit
        setLessonFilter("");
    };

    //Store one upload. The form reads its own fields and hands them over as
    //strings; returns true only when the file was stored, which is the
    //form's signal that it may clear itself.
    const handleUpload = async ({
        file,
        title,
        grade,
        unit: unitField,
        lesson: lessonField
    }) => {
        setFeedback(null);

        if (!file) {
            setFeedback({
                tone: "error",
                text: "Choose a PDF or image file to upload"
            });

            return false;
        }

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

            return false;
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

            return false;
        }

        setUploading(true);

        try {
            const material = await uploadMaterial({
                file,
                subject,
                grade,
                unit,
                lesson,
                title
            });

            //hasText is false when the AI found nothing to read: either a
            //scanned PDF with no text layer, or a photo the vision model
            //could not make out. The upload still worked, but saying so now
            //is far more use than letting the admin discover the missing
            //assistant on the student's side.
            setFeedback({
                tone:
                    material?.hasText === false
                        ? "error"
                        : "success",

                text:
                    material?.hasText === false
                        ? "Uploaded, but the AI could not read any text in it, so the assistant, flashcards and quiz are off for this lesson. Upload a clearer copy if you need them."
                        : "Uploaded successfully"
            });

            await loadMaterials();

            return true;
        } catch (err) {
            setFeedback({
                tone: "error",

                text:
                    err.message ||
                    "Unable to upload that file"
            });

            return false;
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

            setLibraryFeedback({
                tone: "error",

                text:
                    err.message ||
                    "Unable to open that PDF"
            });
        }
    };

    //the dialog prefills itself from `editing`, so only the material is
    //kept here
    const openEditor = (material) => {
        setEditing(material);
    };

    //Rename or move one PDF. Returns the reason it was refused, or "" when
    //it worked, so the dialog can show the message in place.
    const handleSave = async (values) => {
        if (!editing) {
            return "";
        }

        const unit = Number(values.unit);
        const lesson = Number(values.lesson);

        if (
            !Number.isInteger(unit) ||
            unit < 1 ||
            unit > MAX_UNIT
        ) {
            return `Unit must be a whole number between 1 and ${MAX_UNIT}`;
        }

        if (
            !Number.isInteger(lesson) ||
            lesson < 1 ||
            lesson > MAX_LESSON
        ) {
            return `Lesson must be a whole number between 1 and ${MAX_LESSON}`;
        }

        setSaving(true);

        try {
            await updateMaterial(editing._id, {
                title: values.title,
                grade: values.grade,
                unit,
                lesson
            });

            setEditing(null);

            await loadMaterials();

            return "";
        } catch (err) {
            return (
                err.message || "Unable to update that PDF"
            );
        } finally {
            setSaving(false);
        }
    };

    //Move a PDF one place earlier or later within its own lesson. The whole
    //lesson is sent back, so the stored order stays a clean sequence
    //instead of drifting into duplicate positions.
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
                order: reordered.map((item) => item._id)
            });

            await loadMaterials();
        } catch (err) {
            setLibraryFeedback({
                tone: "error",

                text:
                    err.message ||
                    "Unable to reorder that PDF"
            });
        } finally {
            setMovingId(null);
        }
    };

    //Ask the AI to read the lesson again, for a file nothing could be read
    //from at upload time ("no AI text" in the list). The stored page is read
    //again, so a clearer copy is not needed.
    const handleReread = async (material) => {
        setReadingId(material._id);
        setLibraryFeedback(null);

        try {
            const updated = await rereadMaterialText(
                material._id
            );

            setLibraryFeedback({
                tone:
                    updated?.hasText === false
                        ? "error"
                        : "success",

                text:
                    updated?.hasText === false
                        ? "The AI still found no text in this file, so the assistant, flashcards and quiz stay off for this lesson."
                        : "The AI read this lesson, so the assistant, flashcards and quiz now work for it."
            });

            await loadMaterials();
        } catch (err) {
            setLibraryFeedback({
                tone: "error",

                text:
                    err.message ||
                    "Unable to read that lesson again"
            });
        } finally {
            setReadingId(null);
        }
    };

    //Deleting removes the stored file as well as the record, so it is the
    //one action here that cannot be undone. The dialog below asks first;
    //this only opens it.
    const handleDelete = (material) => {
        setLibraryFeedback(null);
        setPendingDelete(material);
    };

    const confirmDelete = async () => {
        if (!pendingDelete) {
            return;
        }

        const material = pendingDelete;

        setDeleting(true);

        try {
            await deleteMaterial(material._id);

            setPendingDelete(null);

            await loadMaterials();
        } catch (err) {
            setPendingDelete(null);

            setLibraryFeedback({
                tone: "error",

                text:
                    err.message ||
                    "Unable to delete that PDF"
            });
        } finally {
            setDeleting(false);
        }
    };

    //switching library drops the filters, because a number that exists in
    //one subject usually does not exist in the next
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

                {LESSON_SUBJECTS.map((subjectOption) => {
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
                })}

            </div>


            {/* Coverage by grade */}
            <GradeCoverage
                subject={subject}
                grades={grades}
                gradeCounts={gradeCounts}
                gradeFilter={gradeFilter}
                onGradeChange={handleGradeFilter}
            />


            {/* Upload */}
            {canManage && (
                <UploadForm
                    subject={subject}
                    grades={grades}
                    uploading={uploading}
                    feedback={feedback}
                    onSubmit={handleUpload}
                />
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
                            Open or preview any PDF below. A
                            photo you upload is stored as a PDF.
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


                    <LibraryFilters
                        grades={grades}
                        gradeFilter={gradeFilter}
                        unitFilter={unitFilter}
                        lessonFilter={lessonFilter}
                        unitOptions={unitOptions}
                        lessonOptions={lessonOptions}
                        loading={loading}
                        onGradeChange={handleGradeFilter}
                        onUnitChange={handleUnitFilter}
                        onLessonChange={setLessonFilter}
                        onRefresh={loadMaterials}
                    />

                </div>


                {libraryFeedback && (
                    <div
                        role="status"
                        className={`px-6 py-3 text-sm border-b border-gray-800 ${
                            libraryFeedback.tone === "success"
                                ? "text-green-400"
                                : "text-red-400"
                        }`}
                    >
                        {libraryFeedback.text}
                    </div>
                )}


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
                                readingId={readingId}
                                onMove={handleMove}
                                onPreview={handlePreview}
                                onEdit={openEditor}
                                onDelete={handleDelete}
                                onReread={handleReread}
                            />
                        ))}

                    </div>
                )}

            </div>


            {/* Delete confirmation */}
            {canManage && pendingDelete && (
                <DeleteMaterialModal
                    material={pendingDelete}
                    deleting={deleting}
                    onConfirm={confirmDelete}
                    onCancel={() => setPendingDelete(null)}
                />
            )}


            {/* Edit dialog, keyed by material so the prefilled form is
                rebuilt per PDF */}
            {canManage && editing && (
                <EditMaterialModal
                    key={editing._id}
                    material={editing}
                    grades={grades}
                    saving={saving}
                    onSubmit={handleSave}
                    onClose={() => setEditing(null)}
                />
            )}

        </div>
    );
}

export default MaterialManager;
