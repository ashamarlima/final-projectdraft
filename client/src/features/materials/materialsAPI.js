//Lesson PDF materials API.
//Uses the shared Axios client, so the JWT and error messages are handled
//by interceptors (see shared/api/apiClient.js).

import apiClient from "../../shared/api/apiClient";

//list materials. A student is scoped to their own grade by the server, so
//only a subject (and optionally a grade/unit/lesson) needs to be sent.
export const getMaterials = async ({
  subject,
  grade,
  unit,
  lesson
} = {}) => {
  const params = {
    ...(subject ? { subject } : {}),
    ...(grade ? { grade } : {}),
    ...(unit ? { unit } : {}),
    ...(lesson ? { lesson } : {})
  };

  const { data } = await apiClient.get("/materials", {
    params
  });

  return data.materials || [];
};

//upload a PDF for a lesson (admin only). The subject, grade and unit
//decide which student subject page the PDF shows up on.
export const uploadMaterial = async ({
  file,
  subject,
  grade,
  unit,
  lesson,
  title
}) => {
  const formData = new FormData();

  formData.append("file", file);
  formData.append("subject", subject);
  formData.append("grade", grade);
  formData.append("unit", String(unit));
  formData.append("lesson", String(lesson));

  if (title && title.trim()) {
    formData.append("title", title.trim());
  }

  //no explicit Content-Type: Axios lets the browser set the
  //multipart boundary
  const { data } = await apiClient.post(
    "/materials",
    formData
  );

  return data.material;
};

//metadata update (admin only). Replacing the file itself is a delete and
//re-upload.
export const updateMaterial = async (id, fields) => {
  const { data } = await apiClient.put(
    `/materials/${id}`,
    fields
  );

  return data.material;
};

//set the "PDF 1, PDF 2" order inside one lesson (admin only). The whole
//lesson is sent, so the stored order stays a clean sequence. A lesson is
//identified by subject + grade + unit + lesson, so the unit travels here
//too.
export const reorderMaterials = async ({
  subject,
  grade,
  unit,
  lesson,
  order
}) => {
  const { data } = await apiClient.put(
    "/materials/reorder",
    { subject, grade, unit, lesson, order }
  );

  return data.materials || [];
};

//removes the record and its stored object (admin only)
export const deleteMaterial = async (id) => {
  await apiClient.delete(`/materials/${id}`);
};

//a short-lived url the browser can open directly, so the signed link is
//never persisted
export const getMaterialViewUrl = async (id) => {
  const { data } = await apiClient.get(
    `/materials/${id}/view`
  );

  return data;
};

//one lesson's metadata, so the lesson page can be deep-linked or refreshed
//without loading the whole subject library
export const getMaterialDetail = async (id) => {
  const { data } = await apiClient.get(
    `/materials/${id}`
  );

  return data.material;
};

//Read one lesson again for the AI assistant (admin only). Used when nothing
//was read at upload time -- "no AI text" in the library -- so the lesson
//does not have to be uploaded again to get its assistant back.
export const rereadMaterialText = async (id) => {
  const { data } = await apiClient.post(
    `/materials/${id}/read`
  );

  return data.material;
};

//The lesson AI assistant. Every call is scoped on the server to a lesson
//the student is allowed to see, and answers from that lesson's text, which
//stays on the server.
export const getMaterialSummary = async (id) => {
  const { data } = await apiClient.post(
    `/materials/${id}/summary`
  );

  return data.summary;
};

export const askMaterialQuestion = async (
  id,
  question
) => {
  const { data } = await apiClient.post(
    `/materials/${id}/ask`,
    { question }
  );

  return data.answer;
};

export const getMaterialFlashcards = async (id) => {
  const { data } = await apiClient.post(
    `/materials/${id}/flashcards`
  );

  return data.flashcards || [];
};
