//Tests for the client-side mirror of the server's lesson-library contract.
//
//These names and numbers have to keep matching the server (the subject enum
//on LessonMaterial, and MAX_UNIT / MAX_LESSON in its controller). A test is
//the cheapest place to notice that the two have drifted apart.

import {
    describe,
    test,
    expect
} from "vitest";

import {
    LESSON_SUBJECTS,
    MAX_LESSON,
    MAX_UNIT,
    librarySubjectFor,
    gradeKeyForPageSubject
} from "./subjects";

describe("the lesson library subjects", () => {
    test("are the three the server stores", () => {
        expect(LESSON_SUBJECTS).toEqual([
            "English",
            "Math",
            "Natural Sciences"
        ]);
    });

    test("map each student page name onto its library subject", () => {
        expect(librarySubjectFor("English")).toBe("English");
        expect(librarySubjectFor("Mathematics")).toBe("Math");
        expect(librarySubjectFor("Science")).toBe(
            "Natural Sciences"
        );
    });

    test("pass an unknown page name through unchanged", () => {
        //a page the library has nothing for should ask for a subject that
        //holds no PDFs, rather than silently showing another subject's
        expect(librarySubjectFor("History")).toBe("History");
    });
});

describe("the student page names that are graded", () => {
    test("map onto the keys the server grades", () => {
        expect(gradeKeyForPageSubject("Mathematics")).toBe(
            "Math"
        );

        expect(gradeKeyForPageSubject("Science")).toBe(
            "Science"
        );

        //the one language subject this app grades is marked under
        //Literature
        expect(gradeKeyForPageSubject("English")).toBe(
            "Literature"
        );
    });

    test("are null when the page is not a graded subject", () => {
        //null reads as "not graded", so the page shows no mark rather than
        //borrowing another subject's
        expect(gradeKeyForPageSubject("History")).toBeNull();
    });
});

describe("the numbering limits", () => {
    test("are the values the server enforces", () => {
        expect(MAX_UNIT).toBe(99);
        expect(MAX_LESSON).toBe(99);
    });

    test("are usable as a form bound", () => {
        for (const limit of [MAX_UNIT, MAX_LESSON]) {
            expect(Number.isInteger(limit)).toBe(true);
            expect(limit).toBeGreaterThan(0);
        }
    });
});
