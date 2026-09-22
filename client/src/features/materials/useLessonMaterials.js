//Loads one subject's lesson PDFs and groups them by unit and then by
//lesson, so a page can render each unit's own files instead of one flat
//list.
//
//The structure comes entirely from the uploads: a unit only appears once
//an admin has put a PDF in it, so the student page can never show a unit
//or a lesson that holds nothing.
//
//The server pins a student to their own grade, so the caller only names
//the subject. It has to be a library subject (English / Math / Natural
//Sciences): a student page whose own name differs should pass it through
//librarySubjectFor() from ./subjects first.

import {
    useCallback,
    useEffect,
    useMemo,
    useState
} from "react";

import { getMaterials } from "./materialsAPI";

//a row written before units existed has no unit; it belongs to the first
const unitOf = (material) =>
    Number(material.unit) > 0
        ? Number(material.unit)
        : 1;

function useLessonMaterials(subject) {
    const [materials, setMaterials] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadMaterials = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            setMaterials(
                await getMaterials({ subject })
            );
        } catch (err) {
            setError(
                err.message ||
                    "Unable to load the lesson PDFs"
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

    //[{ unit, lessons: [{ lesson, pdfs }], lessonCount, pdfCount }], in
    //ascending unit and lesson order. The API sorts by unit, then lesson,
    //then the admin-arranged position, so the array order inside a lesson
    //is already the order students should see.
    const units = useMemo(() => {
        const byUnit = new Map();

        for (const material of materials) {
            const unit = unitOf(material);
            const lesson = Number(material.lesson);

            if (!byUnit.has(unit)) {
                byUnit.set(unit, new Map());
            }

            const byLesson = byUnit.get(unit);

            if (!byLesson.has(lesson)) {
                byLesson.set(lesson, []);
            }

            byLesson.get(lesson).push(material);
        }

        return [...byUnit.entries()]
            .sort(
                ([first], [second]) => first - second
            )
            .map(([unit, byLesson]) => {
                const lessons = [...byLesson.entries()]
                    .sort(
                        ([first], [second]) =>
                            first - second
                    )
                    .map(([lesson, pdfs]) => ({
                        lesson,
                        pdfs
                    }));

                return {
                    unit,
                    lessons,
                    lessonCount: lessons.length,

                    pdfCount: lessons.reduce(
                        (total, entry) =>
                            total + entry.pdfs.length,
                        0
                    )
                };
            });
    }, [materials]);

    const totalPdfs = units.reduce(
        (total, unit) => total + unit.pdfCount,
        0
    );

    return {
        units,
        totalPdfs,
        loading,
        error,
        reload: loadMaterials
    };
}

export default useLessonMaterials;
