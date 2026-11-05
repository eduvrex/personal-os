import "server-only";

import { db, USER_ID } from "@/lib/db";

/** Courses are stored in `entities` with kind='course'. */
const KIND = "course";

/** One weekly meeting pattern (seeded schedule metadata). */
export interface CourseMeeting {
  days: string;
  start: string;
  end: string;
  location?: string;
  label?: string;
}

/** Optional schedule metadata carried in entities.metadata. */
export interface CourseInfo {
  term?: string;
  credits?: number;
  status?: "enrolled" | "waitlisted";
  retake?: boolean;
  meetings?: CourseMeeting[];
  /** Syllabus-derived reference data (School tab only). */
  instructor?: string;
  email?: string;
  office_hours?: string;
  ta?: string;
  sections?: string[];
  recitation_section?: string;
  grading?: Record<string, string>;
  notes?: string;
}

export interface Course {
  id: string;
  name: string;
  info?: CourseInfo | null;
}

/** List all courses, alphabetically, with any schedule metadata. */
export async function listCourses(): Promise<Course[]> {
  const { data, error } = await db()
    .from("entities")
    .select("id,name,metadata")
    .eq("user_id", USER_ID)
    .eq("kind", KIND)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    info:
      c.metadata && typeof c.metadata === "object"
        ? (c.metadata as CourseInfo)
        : null,
  }));
}

/**
 * Return the id of the course with this name, creating it if it doesn't exist
 * yet. Matching is case-insensitive so "cs 201" and "CS 201" are one course.
 */
export async function ensureCourse(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Course name is required.");

  const existing = await db()
    .from("entities")
    .select("id")
    .eq("user_id", USER_ID)
    .eq("kind", KIND)
    .ilike("name", trimmed)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data.id;

  const { data, error } = await db()
    .from("entities")
    .insert({ user_id: USER_ID, name: trimmed, kind: KIND, metadata: {} })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}
