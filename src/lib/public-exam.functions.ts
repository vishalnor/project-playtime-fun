import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const uuid = z.string().uuid();

export const getPublicExam = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ examId: uuid }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: exam } = await supabaseAdmin
      .from("exams")
      .select(
        "id, title, description, duration_minutes, published, show_result, max_tab_switches, auto_submit_on_violation, passing_score",
      )
      .eq("id", data.examId)
      .maybeSingle();

    if (!exam || !exam.published) return { exam: null, questions: [] };

    const { data: questions } = await supabaseAdmin
      .from("questions")
      .select("id, text, options, marks, position")
      .eq("exam_id", data.examId)
      .eq("approved", true)
      .order("position", { ascending: true });

    return { exam, questions: questions ?? [] };
  });

export const submitExam = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        examId: uuid,
        studentName: z.string().min(1).max(120),
        studentEmail: z.string().min(1).max(160),
        answers: z.record(z.string(), z.number().int().min(0).max(3)),
        tabSwitches: z.number().int().min(0).max(1000).default(0),
        autoSubmitted: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: exam } = await supabaseAdmin
      .from("exams")
      .select("id, published, show_result, max_attempts, max_tab_switches, passing_score")
      .eq("id", data.examId)
      .maybeSingle();
    if (!exam || !exam.published) throw new Error("This exam is not available.");

    const { count: attempts } = await supabaseAdmin
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", data.examId)
      .eq("student_email", data.studentEmail);

    if ((attempts ?? 0) >= exam.max_attempts) {
      throw new Error("You have already used all your attempts for this exam.");
    }

    const { data: questions } = await supabaseAdmin
      .from("questions")
      .select("id, correct_index, marks")
      .eq("exam_id", data.examId)
      .eq("approved", true);

    let score = 0;
    let total = 0;
    for (const q of questions ?? []) {
      total += q.marks;
      if (data.answers[q.id] === q.correct_index) score += q.marks;
    }

    const flagged = data.tabSwitches > exam.max_tab_switches;

    const { data: response, error } = await supabaseAdmin
      .from("responses")
      .insert({
        exam_id: data.examId,
        student_name: data.studentName,
        student_email: data.studentEmail,
        answers: data.answers,
        score,
        total_marks: total,
        tab_switches: data.tabSwitches,
        flagged,
        auto_submitted: data.autoSubmitted,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const percent = total > 0 ? Math.round((score / total) * 100) : 0;

    return {
      id: response.id,
      showResult: exam.show_result,
      score,
      total,
      percent,
      passed: exam.passing_score == null ? null : percent >= exam.passing_score,
      flagged,
    };
  });
