import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppBackground, Eyebrow, Panel, Pill } from "@/components/glass";
import { useAuth } from "@/hooks/useAuth";
import {
  approveQuestion,
  deleteQuestion,
  generateQuestions,
  getExam,
  saveQuestion,
  updateExam,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/exams/$examId")({
  head: () => ({
    meta: [
      { title: "Manage exam · Lumen Exams" },
      {
        name: "description",
        content: "Edit exam rules, add multiple-choice questions manually or generate them with AI.",
      },
      { property: "og:title", content: "Manage exam · Lumen Exams" },
      {
        property: "og:description",
        content: "Edit exam rules, add multiple-choice questions manually or generate them with AI.",
      },
    ],
  }),
  component: ManageExam,
});

type Draft = {
  id?: string;
  text: string;
  options: string[];
  correct_index: number;
  marks: number;
};

const emptyDraft: Draft = { text: "", options: ["", "", "", ""], correct_index: 0, marks: 1 };

function ManageExam() {
  const { examId } = Route.useParams();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const fetchExam = useServerFn(getExam);
  const { data, isLoading } = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => fetchExam({ data: { examId } }),
    enabled: !!session,
  });

  const update = useServerFn(updateExam);
  const save = useServerFn(saveQuestion);
  const remove = useServerFn(deleteQuestion);
  const approve = useServerFn(approveQuestion);
  const generate = useServerFn(generateQuestions);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [sourceText, setSourceText] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["exam", examId] });

  const settingsMut = useMutation({
    mutationFn: (patch: Record<string, unknown>) => update({ data: { examId, ...patch } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: (d: Draft) =>
      save({
        data: {
          ...(d.id ? { id: d.id } : {}),
          exam_id: examId,
          text: d.text.trim(),
          options: d.options,
          correct_index: d.correct_index,
          marks: d.marks,
          explanation: null,
          approved: true,
        },
      }),
    onSuccess: () => {
      setDraft(null);
      toast.success("Question saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (questionId: string) => remove({ data: { questionId } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const approveMut = useMutation({
    mutationFn: (questionId: string) => approve({ data: { questionId } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const generateMut = useMutation({
    mutationFn: () =>
      generate({
        data: {
          examId,
          topic: topic.trim(),
          count,
          difficulty,
          marks: 1,
          ...(sourceText.trim() ? { sourceText: sourceText.trim() } : {}),
        },
      }),
    onSuccess: (rows) => {
      toast.success(`${rows.length} draft questions ready for review`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return (
      <AppBackground>
        <p className="pt-10 text-sm text-slate-400">Loading exam…</p>
      </AppBackground>
    );
  }

  const exam = data.exam;
  const approved = data.questions.filter((q) => q.approved);
  const drafts = data.questions.filter((q) => !q.approved);

  return (
    <AppBackground>
      <header className="flex items-center justify-between">
        <Link to="/" className="glass rounded-2xl px-3 py-2 text-[12px] font-semibold text-ink">
          Back
        </Link>
        <div className="flex items-center gap-2">
          <Pill tone={exam.published ? "success" : "warning"}>
            {exam.published ? "Published" : "Draft"}
          </Pill>
          <button
            onClick={() => settingsMut.mutate({ published: !exam.published })}
            className="rounded-full bg-linear-to-br from-brand to-violet px-4 py-2 text-[12px] font-semibold text-white"
          >
            {exam.published ? "Unpublish" : "Publish"}
          </button>
        </div>
      </header>

      <div className="mt-5">
        <Eyebrow>Exam</Eyebrow>
        <h1 className="mt-1 font-display text-[22px] font-bold text-ink">{exam.title}</h1>
      </div>

      <Panel className="mt-4" elevated>
        <Eyebrow>Settings</Eyebrow>
        <div className="mt-3 flex flex-col gap-2.5">
          <Field label="Title">
            <input
              className="w-full bg-transparent text-right text-sm font-semibold outline-none"
              defaultValue={exam.title}
              onBlur={(e) => settingsMut.mutate({ title: e.target.value })}
            />
          </Field>
          <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-white/70">
            <p className="text-[11px] font-medium tracking-[0.12em] text-slate-400 uppercase">
              Instructions
            </p>
            <textarea
              className="mt-2 w-full resize-none bg-transparent text-sm outline-none"
              rows={3}
              defaultValue={exam.description}
              onBlur={(e) => settingsMut.mutate({ description: e.target.value })}
            />
          </div>
          <Field label="Duration (minutes)">
            <NumberInput
              value={exam.duration_minutes}
              onCommit={(v) => settingsMut.mutate({ duration_minutes: v })}
            />
          </Field>
          <Field label="Passing score (%)">
            <NumberInput
              value={exam.passing_score ?? 0}
              onCommit={(v) => settingsMut.mutate({ passing_score: v === 0 ? null : v })}
            />
          </Field>
          <Field label="Maximum attempts">
            <NumberInput
              value={exam.max_attempts}
              onCommit={(v) => settingsMut.mutate({ max_attempts: Math.max(1, v) })}
            />
          </Field>
          <Field label="Allowed tab switches">
            <NumberInput
              value={exam.max_tab_switches}
              onCommit={(v) => settingsMut.mutate({ max_tab_switches: v })}
            />
          </Field>
          <Toggle
            label="Show result after submission"
            value={exam.show_result}
            onChange={(v) => settingsMut.mutate({ show_result: v })}
          />
          <Toggle
            label="Auto-submit when tab-switch limit is exceeded"
            value={exam.auto_submit_on_violation}
            onChange={(v) => settingsMut.mutate({ auto_submit_on_violation: v })}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/e/${exam.id}`);
              toast.success("Exam link copied");
            }}
            className="rounded-2xl bg-white/70 py-2.5 text-[12px] font-semibold text-ink ring-1 ring-white/70"
          >
            Copy exam link
          </button>
          <Link
            to="/exams/$examId/responses"
            params={{ examId }}
            className="rounded-2xl bg-white/70 py-2.5 text-center text-[12px] font-semibold text-ink ring-1 ring-white/70"
          >
            View responses
          </Link>
        </div>
      </Panel>

      <div className="mt-5 flex items-center justify-between">
        <p className="font-display text-[15px] font-bold text-ink">Questions</p>
        <button
          onClick={() => setDraft({ ...emptyDraft, options: ["", "", "", ""] })}
          className="text-[12px] font-semibold text-brand"
        >
          Add question
        </button>
      </div>

      {draft && (
        <Panel className="mt-3" elevated>
          <Eyebrow>{draft.id ? "Edit question" : "New question"}</Eyebrow>
          <textarea
            className="mt-3 w-full resize-none rounded-2xl bg-white/70 px-4 py-3 text-sm ring-1 ring-white/70 outline-none placeholder:text-slate-400"
            rows={2}
            placeholder="Question text"
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          />
          <div className="mt-2.5 flex flex-col gap-2">
            {draft.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  onClick={() => setDraft({ ...draft, correct_index: i })}
                  className={`grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-bold ${
                    draft.correct_index === i
                      ? "bg-linear-to-br from-brand to-violet text-white"
                      : "bg-white/70 text-slate-500 ring-1 ring-white/70"
                  }`}
                  title="Mark as correct answer"
                >
                  {String.fromCharCode(65 + i)}
                </button>
                <input
                  className="flex-1 rounded-2xl bg-white/70 px-3 py-2.5 text-sm ring-1 ring-white/70 outline-none placeholder:text-slate-400"
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  value={opt}
                  onChange={(e) => {
                    const options = [...draft.options];
                    options[i] = e.target.value;
                    setDraft({ ...draft, options });
                  }}
                />
              </div>
            ))}
          </div>
          <Field label="Marks">
            <NumberInput value={draft.marks} onCommit={(v) => setDraft({ ...draft, marks: Math.max(1, v) })} />
          </Field>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => setDraft(null)}
              className="rounded-2xl bg-white/70 py-2.5 text-[12px] font-semibold text-ink ring-1 ring-white/70"
            >
              Cancel
            </button>
            <button
              disabled={!draft.text.trim() || draft.options.some((o) => !o.trim())}
              onClick={() => saveMut.mutate(draft)}
              className="rounded-2xl bg-linear-to-br from-brand to-violet py-2.5 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              Save question
            </button>
          </div>
        </Panel>
      )}

      <div className="mt-3 flex flex-col gap-2.5">
        {approved.length === 0 && !draft && (
          <Panel>
            <p className="text-sm text-slate-500">
              No questions yet. Add one manually or generate a batch with AI below.
            </p>
          </Panel>
        )}
        {approved.map((q, idx) => (
          <Panel key={q.id}>
            <div className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-xl bg-brand/12 text-[12px] font-bold text-brand">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-ink">{q.text}</p>
                <p className="mt-1 text-[12px] text-slate-400">
                  Correct: {String.fromCharCode(65 + q.correct_index)} · {q.marks} mark
                  {q.marks > 1 ? "s" : ""}
                  {q.source === "ai" ? " · AI" : ""}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() =>
                  setDraft({
                    id: q.id,
                    text: q.text,
                    options: (q.options as string[]) ?? ["", "", "", ""],
                    correct_index: q.correct_index,
                    marks: q.marks,
                  })
                }
                className="rounded-2xl bg-white/70 py-2.5 text-[12px] font-semibold text-ink ring-1 ring-white/70"
              >
                Edit
              </button>
              <button
                onClick={() => deleteMut.mutate(q.id)}
                className="rounded-2xl bg-white/70 py-2.5 text-[12px] font-semibold text-danger ring-1 ring-white/70"
              >
                Delete
              </button>
            </div>
          </Panel>
        ))}
      </div>

      <Panel className="mt-4 mb-8" elevated>
        <div className="flex items-center justify-between">
          <Eyebrow>Generate with AI</Eyebrow>
          {drafts.length > 0 && (
            <span className="text-[11px] font-semibold text-slate-400">
              {drafts.length} awaiting review
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-col gap-2.5">
          <input
            className="rounded-2xl bg-white/70 px-4 py-3 text-sm ring-1 ring-white/70 outline-none placeholder:text-slate-400"
            placeholder="Topic, e.g. Operating Systems"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Questions">
              <NumberInput value={count} onCommit={(v) => setCount(Math.min(15, Math.max(1, v)))} />
            </Field>
            <label className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3 text-sm ring-1 ring-white/70">
              <span className="text-slate-500">Level</span>
              <select
                className="bg-transparent text-right text-sm font-semibold outline-none"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
          </div>
          <textarea
            className="w-full resize-none rounded-2xl bg-white/70 px-4 py-3 text-sm ring-1 ring-white/70 outline-none placeholder:text-slate-400"
            rows={3}
            placeholder="Optional source text to base questions on"
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
          />
          <button
            disabled={!topic.trim() || generateMut.isPending}
            onClick={() => generateMut.mutate()}
            className="rounded-2xl bg-linear-to-br from-brand to-violet py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {generateMut.isPending ? "Generating…" : "Generate questions"}
          </button>
        </div>

        {drafts.length > 0 && (
          <div className="mt-4 flex flex-col gap-2.5">
            {drafts.map((q) => (
              <div key={q.id} className="rounded-2xl bg-white/70 p-3 ring-1 ring-white/70">
                <p className="text-[14px] font-semibold text-ink">{q.text}</p>
                <ol className="mt-2 flex flex-col gap-1">
                  {((q.options as string[]) ?? []).map((o, i) => (
                    <li
                      key={i}
                      className={`text-[12px] ${
                        i === q.correct_index ? "font-semibold text-brand" : "text-slate-500"
                      }`}
                    >
                      {String.fromCharCode(65 + i)}. {o}
                    </li>
                  ))}
                </ol>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button
                    onClick={() => approveMut.mutate(q.id)}
                    className="rounded-xl bg-linear-to-br from-brand to-violet py-2 text-[12px] font-semibold text-white"
                  >
                    Add to exam
                  </button>
                  <button
                    onClick={() =>
                      setDraft({
                        id: q.id,
                        text: q.text,
                        options: (q.options as string[]) ?? ["", "", "", ""],
                        correct_index: q.correct_index,
                        marks: q.marks,
                      })
                    }
                    className="rounded-xl bg-white/80 py-2 text-[12px] font-semibold text-ink ring-1 ring-white/70"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMut.mutate(q.id)}
                    className="rounded-xl bg-white/80 py-2 text-[12px] font-semibold text-danger ring-1 ring-white/70"
                  >
                    Discard
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </AppBackground>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3 text-sm ring-1 ring-white/70">
      <span className="shrink-0 text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => setLocal(String(value)), [value]);
  return (
    <input
      type="number"
      className="w-20 bg-transparent text-right text-sm font-semibold outline-none"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => onCommit(Number(local) || 0)}
    />
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3 text-left text-sm ring-1 ring-white/70"
    >
      <span className="text-slate-500">{label}</span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          value ? "bg-brand" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${
            value ? "left-5.5" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
