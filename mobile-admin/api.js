import axios from "axios";
import { auth } from "./firebase";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:8000";

const api = axios.create({
  baseURL: API_URL,
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.error("Token fetch error:", error);
  }
  return config;
});

// ============================================================
// Students
// ============================================================
export const getStudents = async () => {
  return api.get("/api/students");
};

export const getStudent = async (id) => {
  return api.get(`/api/students/${id}`);
};

export const createStudent = async (data) => {
  return api.post("/api/students", data);
};

export const updateStudent = async (id, data) => {
  return api.put(`/api/students/${id}`, data);
};

export const deleteStudent = async (id) => {
  return api.delete(`/api/students/${id}`);
};

export const enrollStudentFace = async (id, imageData) => {
  const formData = new FormData();
  formData.append("file", imageData);
  return api.post(`/api/students/${id}/face`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

// ============================================================
// Doctors
// ============================================================
export const getDoctors = async () => {
  return api.get("/api/doctors");
};

export const getDoctor = async (id) => {
  return api.get(`/api/doctors/${id}`);
};

export const createDoctor = async (data) => {
  return api.post("/api/doctors", data);
};

export const updateDoctor = async (id, data) => {
  return api.put(`/api/doctors/${id}`, data);
};

export const deleteDoctor = async (id) => {
  return api.delete(`/api/doctors/${id}`);
};

export const enrollDoctorFace = async (id, imageData) => {
  const formData = new FormData();
  formData.append("file", imageData);
  return api.post(`/api/doctors/${id}/face`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

// ============================================================
// Admins
// ============================================================
export const getAdmins = async () => {
  return api.get("/api/admins");
};

export const getAdmin = async (id) => {
  return api.get(`/api/admins/${id}`);
};

export const createAdmin = async (data) => {
  return api.post("/api/admins", data);
};

export const updateAdmin = async (id, data) => {
  return api.put(`/api/admins/${id}`, data);
};

export const deleteAdmin = async (id) => {
  return api.delete(`/api/admins/${id}`);
};

// ============================================================
// Lectures
// ============================================================
export const getLectures = async () => {
  return api.get("/api/lectures");
};

export const getLecture = async (id) => {
  return api.get(`/api/lectures/${id}`);
};

export const createLecture = async (data) => {
  return api.post("/api/lectures", data);
};

export const updateLecture = async (id, data) => {
  return api.put(`/api/lectures/${id}`, data);
};

export const deleteLecture = async (id) => {
  return api.delete(`/api/lectures/${id}`);
};

// ============================================================
// Subjects
// ============================================================
export const getSubjects = async () => {
  return api.get("/api/subjects");
};

export const getSubject = async (id) => {
  return api.get(`/api/subjects/${id}`);
};

export const createSubject = async (data) => {
  return api.post("/api/subjects", data);
};
