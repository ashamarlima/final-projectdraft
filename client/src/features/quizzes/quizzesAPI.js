//Quiz attempt API.
//Uses the shared Axios client (see apiClient.js) for auth and error
//handling.
//
//Nothing here sends a score. The server stores each generated quiz with
//its answers and grades the submission itself, so the browser can only
//choose answers, never claim a result.

import apiClient from "../../shared/api/apiClient";

//generate a quiz from one of the student's own notes. The returned
//questions deliberately carry no correct answers.
export const createQuizAttempt = async (noteId) => {
  const { data } = await apiClient.post("/quizzes", {
    noteId
  });

  return data.attempt;
};

//generate a quiz from a lesson PDF instead of a note. The lesson has to be
//one the student may see; the server checks that, and reads the text it
//stored for that lesson.
export const createMaterialQuizAttempt = async (
  materialId
) => {
  const { data } = await apiClient.post("/quizzes", {
    materialId
  });

  return data.attempt;
};

//answer a generated quiz. Resolves to the graded result:
//{ correct, total, xpAwarded, results: [{ correct, given, correctAnswer }] }
export const submitQuizAttempt = async (id, answers) => {
  const { data } = await apiClient.post(
    `/quizzes/${id}/submit`,
    { answers }
  );

  return data;
};

//the student's past results, newest first
export const getQuizAttempts = async () => {
  const { data } = await apiClient.get("/quizzes");

  return data.attempts || [];
};
