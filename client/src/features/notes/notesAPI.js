//Notes study assistant API.
//Uses the shared Axios client (see apiClient.js) for auth and error
//handling.

import apiClient from "../../shared/api/apiClient";

//list the logged-in student's notes
export const getNotes = async () => {
  const { data } = await apiClient.get("/notes");

  return data.notes || [];
};

//single note, used by the /notes/:id page
export const getNote = async (id) => {
  const { data } = await apiClient.get(
    `/notes/${id}`
  );

  return data.note;
};

//upload a PDF or text file
export const uploadNote = async (file, title = "") => {
  const formData = new FormData();

  formData.append("file", file);

  if (title.trim()) {
    formData.append("title", title.trim());
  }

  //no explicit Content-Type: Axios lets the browser set the
  //multipart boundary
  const { data } = await apiClient.post(
    "/notes/upload",
    formData
  );

  return data.note;
};

//generate a bullet-point summary
export const generateSummary = async (noteId) => {
  const { data } = await apiClient.post(
    "/notes-ai/summary",
    { noteId }
  );

  return data.summary;
};

//ask a question, optionally grounded in a note
export const askQuestion = async (
  question,
  noteId
) => {
  const { data } = await apiClient.post(
    "/notes-ai/ask",
    {
      question,
      ...(noteId ? { noteId } : {})
    }
  );

  return data.answer;
};

//generate flashcards: [{ question, answer }]
export const generateFlashcards = async (
  noteId
) => {
  const { data } = await apiClient.post(
    "/notes-ai/flashcards",
    { noteId }
  );

  return data.flashcards || [];
};

//quiz generation and grading live in ../quizzes/quizzesAPI, because the
//server stores and marks each attempt so that it can award XP

export const deleteNote = async (noteId) => {
  const { data } = await apiClient.delete(
    `/notes/${noteId}`
  );

  return data;
};
