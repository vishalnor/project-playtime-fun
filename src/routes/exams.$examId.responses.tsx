import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppBackground, Eyebrow, Panel, Pill } from "@/components/glass";
import { useAuth } from "@/hooks/useAuth";
import { listResponses } from "@/lib/admin.functions";

export const Route = createFileRoute("/exams/$examId/responses")({
  head: () => ({
    meta: [
      { title: "Responses · Lumen Exams" },
      { name: "description", content: "Review every submission, score and flagged activity for this exam." },
      { property: "og:title", content: "Responses · Lumen Exams" },
      {
        property: "og:description",
        content: "Review every submission, score and flagged activity for this exam.",
      },
    ],
  }),
  component: Responses,
});

function Responses() {
  const { examId } = Route.useParams();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const fetch = useServerFn(listResponses);
  const { data, isLoading } = useQuery({
    queryKey: ["responses", examId],
    queryFn: () => fetch({ data: { examId } }),
    enabled: !!session,
  });

  if (isLoading || !data) {
    return (
      <AppBackground>
        <p className="pt-10 text-sm text-slate-400">Loading responses…</p>
      </AppBackground>
    );
  }

  const { exam, responses, questions } = data;
  const scored = responses.filter((r) => r.total_marks > 0);
  const avg = scored.length
    ? Math.round((scored.reduce((s, r) => s + r.score / r.total_marks, 0) / scored.length) * 100)
    : 0;
  const flagged = responses.filter((r) => r.flagged).length;

  return (
    <AppBackground>
      <header className="flex items-center justify-between">
        <Link
          to="/exams/$examId"
          params={{ examId }}
          className="glass rounded-2xl px-3 py-2 text-[12px] font-semibold text-ink"
        >
          Back
        </Link>
        <Pill tone={exam.published ? "success" : "warning"}>
          {exam.published ? "Published" : "Draft"}
        </Pill>
      </header>

      <div className="mt-5">
        <Eyebrow>Responses</Eyebrow>
        <h1 className="mt-1 font-display text-[22px] font-bold text-ink">{exam.title}</h1>
      </div>

      <Panel className="mt-4" elevated>
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Submissions" value={responses.length} />
          <Stat label="Average" value={`${avg}%`} />
          <Stat label="Flagged" value={flagged} />
        </div>
      </Panel>

      <div className="mt-4 mb-8 flex flex-col gap-2.5">
        {responses.length === 0 && (
          <Panel>
            <p className="text-sm text-slate-500">
              No submissions yet. Share the exam link to start collecting responses.
            </p>
          </Panel>
        )}
        {responses.map((r) => {
          const percent = r.total_marks > 0 ? Math.round((r.score / r.total_marks) * 100) : 0;
          const answers = (r.answers ?? {}) as Record<string, number>;
          const open = openId === r.id;
          return (
            <Panel key={r.id}>
              <button
                className="flex w-full items-start justify-between gap-3 text-left"
                onClick={() => setOpenId(open ? null : r.id)}
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-ink">{r.student_name}</p>
                  <p className="truncate text-[12px] text-slate-400">{r.student_email}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {new Date(r.submitted_at).toLocaleString()} · {r.tab_switches} tab switch
                    {r.tab_switches === 1 ? "" : "es"}
                    {r.auto_submitted ? " · auto-submitted" : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-[20px] leading-none font-bold text-ink">
                    {percent}%
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {r.score}/{r.total_marks}
                  </p>
                  {r.flagged && (
                    <span className="mt-1 inline-block rounded-full bg-danger/12 px-2 py-0.5 text-[10px] font-semibold text-danger">
                      Flagged
                    </span>
                  )}
                </div>
              </button>

              {open && (
                <div className="mt-3 flex flex-col gap-2 border-t border-white/70 pt-3">
                  <p className="text-[12px] font-semibold text-slate-500">
                    {questions.filter((q) => answers[q.id] === q.correct_index).length} of{" "}
                    {questions.length} correct · {r.score}/{r.total_marks} marks
                    {r.flagged ? " · flagged for tab switching" : ""}
                  </p>
                  {questions.map((q, i) => {
                    const given = answers[q.id];
                    const correct = given === q.correct_index;
                    const options = (q.options as string[]) ?? [];
                    return (
                      <div key={q.id} className="rounded-2xl bg-white/70 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[13px] font-semibold text-ink">
                            {i + 1}. {q.text}
                          </p>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              correct
                                ? "bg-success/15 text-success"
                                : "bg-danger/12 text-danger"
                            }`}
                          >
                            {correct ? `+${q.marks}` : "0"}/{q.marks}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] text-slate-500">
                          Answered:{" "}
                          <span className={correct ? "text-success" : "text-danger"}>
                            {given === undefined
                              ? "No answer"
                              : `${String.fromCharCode(65 + given)}. ${options[given] ?? ""}`}
                          </span>
                        </p>
                        {!correct && (
                          <p className="text-[12px] text-slate-500">
                            Correct: {String.fromCharCode(65 + q.correct_index)}.{" "}
                            {options[q.correct_index] ?? ""}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </AppBackground>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-white/70">
      <p className="text-[10px] font-medium tracking-[0.12em] text-slate-400 uppercase">{label}</p>
      <p className="mt-1 font-display text-[24px] leading-none font-bold text-ink">{value}</p>
    </div>
  );
}
