import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

const examInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).default(""),
  duration_minutes: z.number().int().min(1).max(600),
  passing_score: z.number().int().min(0).max(100).nullable().default(null),
  show_result: z.boolean().default(true),
  max_attempts: z.number().int().min(1).max(10).default(1),
  max_tab_switches: z.number().int().min(0).max(10).default(1),
  auto_submit_on_violation: z.boolean().default(false),
});

const questionInput = z.object({
  id: uuid.optional(),
  exam_id: uuid,
  text: z.string().min(1).max(2000),
  options: z.array(z.string().max(500)).length(4),
  correct_index: z.number().int().min(0).max(3),
  marks: z.number().int().min(1).max(100).default(1),
  explanation: z.string().max(2000).nullable().default(null),
  approved: z.boolean().default(true),
});

export const listExams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: exams, error } = await context.supabase
      .from("exams")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (exams ?? []).map((e) => e.id);
    const counts: Record<string, { questions: number; responses: number }> = {};
    for (const id of ids) counts[id] = { questions: 0, responses: 0 };

    if (ids.length) {
      const [{ data: qs }, { data: rs }] = await Promise.all([
        context.supabase.from("questions").select("exam_id, approved").in("exam_id", ids),
        context.supabase.from("responses").select("exam_id, score, total_marks").in("exam_id", ids),
      ]);
      for (const q of qs ?? []) if (q.approved) counts[q.exam_id]!.questions += 1;
      for (const r of rs ?? []) counts[r.exam_id]!.responses += 1;

      const scored = (rs ?? []).filter((r) => r.total_marks > 0);
      const avg = scored.length
        ? Math.round(
            (scored.reduce((sum, r) => sum + r.score / r.total_marks, 0) / scored.length) * 100,
          )
        : 0;
      return { exams: exams ?? [], counts, totals: { responses: (rs ?? []).length, avg } };
    }

    return { exams: exams ?? [], counts, totals: { responses: 0, avg: 0 } };
  });

export const getExam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ examId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: exam, error } = await context.supabase
      .from("exams")
      .select("*")
      .eq("id", data.examId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!exam) throw new Error("Exam not found");

    const { data: questions } = await context.supabase
      .from("questions")
      .select("*")
      .eq("exam_id", data.examId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    return { exam, questions: questions ?? [] };
  });

export const createExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => examInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: exam, error } = await context.supabase
      .from("exams")
      .insert({ ...data, owner_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return exam;
  });

export const updateExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => examInput.partial().extend({ examId: uuid, published: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { examId, ...raw } = data;
    const patch: import("@/integrations/supabase/types").Database["public"]["Tables"]["exams"]["Update"] =
      Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined));
    const { data: exam, error } = await context.supabase
      .from("exams")
      .update(patch)
      .eq("id", examId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return exam;
  });

export const deleteExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ examId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("exams").delete().eq("id", data.examId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => questionInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { id, ...patch } = data;
      const { data: q, error } = await context.supabase
        .from("questions")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return q;
    }
    const { count } = await context.supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", data.exam_id);
    const { id: _omit, ...rest } = data;
    const { data: q, error } = await context.supabase
      .from("questions")
      .insert({ ...rest, position: count ?? 0 })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return q;
  });

export const deleteQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ questionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("questions").delete().eq("id", data.questionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const approveQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ questionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("questions")
      .update({ approved: true })
      .eq("id", data.questionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listResponses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ examId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: exam } = await context.supabase
      .from("exams")
      .select("*")
      .eq("id", data.examId)
      .maybeSingle();
    if (!exam) throw new Error("Exam not found");

    const [{ data: responses }, { data: questions }] = await Promise.all([
      context.supabase
        .from("responses")
        .select("*")
        .eq("exam_id", data.examId)
        .order("submitted_at", { ascending: false }),
      context.supabase
        .from("questions")
        .select("*")
        .eq("exam_id", data.examId)
        .eq("approved", true)
        .order("position", { ascending: true }),
    ]);

    return { exam, responses: responses ?? [], questions: questions ?? [] };
  });

export const generateQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        examId: uuid,
        topic: z.string().min(2).max(200),
        count: z.number().int().min(1).max(15),
        difficulty: z.enum(["easy", "medium", "hard"]),
        marks: z.number().int().min(1).max(100).default(1),
        sourceText: z.string().max(6000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: exam } = await context.supabase
      .from("exams")
      .select("id")
      .eq("id", data.examId)
      .maybeSingle();
    if (!exam) throw new Error("Exam not found");

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          {
            role: "system",
            content:
              "You write clear multiple-choice exam questions. Always return valid JSON only.",
          },
          {
            role: "user",
            content: `Write ${data.count} ${data.difficulty} multiple-choice questions about "${data.topic}".${
              data.sourceText ? `\n\nBase them on this source material:\n${data.sourceText}` : ""
            }\n\nReturn JSON of the form {"questions":[{"text":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"..."}]}. Exactly 4 options each, one correct answer, no duplicates.`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please top up.");
    if (!res.ok) throw new Error(`AI request failed (${res.status})`);

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content ?? "{}";

    const parsed = z
      .object({
        questions: z.array(
          z.object({
            text: z.string().min(1),
            options: z.array(z.string()).length(4),
            correct_index: z.number().int().min(0).max(3),
            explanation: z.string().optional(),
          }),
        ),
      })
      .safeParse(JSON.parse(content));

    if (!parsed.success) throw new Error("AI returned an unexpected format. Try again.");

    const { count: existing } = await context.supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", data.examId);

    const rows = parsed.data.questions.map((q, i) => ({
      exam_id: data.examId,
      text: q.text,
      options: q.options,
      correct_index: q.correct_index,
      explanation: q.explanation ?? null,
      marks: data.marks,
      approved: false,
      source: "ai",
      position: (existing ?? 0) + i,
    }));

    const { data: inserted, error } = await context.supabase
      .from("questions")
      .insert(rows)
      .select();
    if (error) throw new Error(error.message);
    return inserted ?? [];
  });
