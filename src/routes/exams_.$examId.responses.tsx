import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Download, Search } from "lucide-react";
import { AppBackground, Eyebrow, Panel, Pill } from "@/components/glass";
import { useAuth } from "@/hooks/useAuth";
import { listResponses } from "@/lib/admin.functions";

export const Route = createFileRoute("/exams_/$examId/responses")({
  head: () => ({
    meta: [
      { title: "Responses · Lumen Exams" },
      {
        name: "description",
        content: "Review every student's marks, answers and exam analytics.",
      },
      { property: "og:title", content: "Responses · Lumen Exams" },
      {
        property: "og:description",
        content: "Review every student's marks, answers and exam analytics.",
      },
    ],
  }),
  component: Responses,
});

type Data = Awaited<ReturnType<typeof listResponses>>;
type ResponseRow = Data["responses"][number];
type Question = Data["questions"][number];
type SortKey = "score-desc" | "score-asc" | "newest" | "name";

const letter = (i: number) => String.fromCharCode(65 + i);
const pct = (score: number, total: number) => (total > 0 ? Math.round((score / total) * 100) : 0);

function Responses() {
  const { examId } = Route.useParams();
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const fetchResponses = useServerFn(listResponses);
  const { data, isLoading } = useQuery({
    queryKey: ["responses", examId],
    queryFn: () => fetchResponses({ data: { examId } }),
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
        <p className="mt-1 text-[12px] text-slate-400">
          {responses.length} submission{responses.length === 1 ? "" : "s"} · {questions.length}{" "}
          question{questions.length === 1 ? "" : "s"}
        </p>
      </div>

      {responses.length === 0 ? (
        <Panel className="mt-4">
          <p className="text-sm text-slate-500">
            No submissions yet. Share the exam link to start collecting responses.
          </p>
        </Panel>
      ) : (
        <>
          <Students
            examTitle={exam.title}
            passingScore={exam.passing_score}
            responses={responses}
            questions={questions}
          />
          <Overview passingScore={exam.passing_score} responses={responses} questions={questions} />
        </>
      )}
    </AppBackground>
  );
}

/* ------------------------------------------------------------------ */
/* Students                                                            */
/* ------------------------------------------------------------------ */

function Students({
  examTitle,
  passingScore,
  responses,
  questions,
}: {
  examTitle: string;
  passingScore: number | null;
  responses: ResponseRow[];
  questions: Question[];
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("score-desc");
  const [openId, setOpenId] = useState<string | null>(null);

  // Rank by percentage (ties share a rank) and number repeat attempts per student.
  const { rankById, attemptById } = useMemo(() => {
    const byScore = [...responses].sort(
      (a, b) => pct(b.score, b.total_marks) - pct(a.score, a.total_marks),
    );
    const rankById = new Map<string, number>();
    byScore.forEach((r, i) => {
      const prev = byScore[i - 1];
      const same = prev && pct(prev.score, prev.total_marks) === pct(r.score, r.total_marks);
      rankById.set(r.id, same ? rankById.get(prev.id)! : i + 1);
    });

    const attemptById = new Map<string, { n: number; of: number }>();
    const byEmail = new Map<string, ResponseRow[]>();
    for (const r of responses) {
      const key = r.student_email.toLowerCase();
      byEmail.set(key, [...(byEmail.get(key) ?? []), r]);
    }
    for (const list of byEmail.values()) {
      list
        .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
        .forEach((r, i) => attemptById.set(r.id, { n: i + 1, of: list.length }));
    }
    return { rankById, attemptById };
  }, [responses]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? responses.filter(
          (r) =>
            r.student_name.toLowerCase().includes(q) || r.student_email.toLowerCase().includes(q),
        )
      : responses;
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.student_name.localeCompare(b.student_name);
      if (sort === "newest") return b.submitted_at.localeCompare(a.submitted_at);
      const diff = pct(a.score, a.total_marks) - pct(b.score, b.total_marks);
      return sort === "score-asc" ? diff : -diff;
    });
  }, [responses, query, sort]);

  const exportCsv = () => {
    const header = [
      "Rank",
      "Name",
      "Email",
      "Marks",
      "Total",
      "Percent",
      "Result",
      "Tab switches",
      "Flagged",
      "Submitted",
    ];
    const lines = rows.map((r) => {
      const p = pct(r.score, r.total_marks);
      return [
        rankById.get(r.id),
        r.student_name,
        r.student_email,
        r.score,
        r.total_marks,
        p,
        passingScore == null ? "" : p >= passingScore ? "Pass" : "Fail",
        r.tab_switches,
        r.flagged ? "Yes" : "No",
        new Date(r.submitted_at).toISOString(),
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",");
    });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${examTitle.replace(/[^\w-]+/g, "_")}_results.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="mt-5">
      <div className="flex items-center justify-between">
        <p className="font-display text-[15px] font-bold text-ink">Students</p>
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-brand"
        >
          <Download className="size-3.5" />
          Export CSV
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-2xl bg-white/70 px-3 py-2.5 ring-1 ring-white/70">
          <Search className="size-4 shrink-0 text-slate-400" />
          <input
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Search by name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          className="rounded-2xl bg-white/70 px-3 text-[12px] font-semibold text-ink ring-1 ring-white/70 outline-none"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort students"
        >
          <option value="score-desc">Highest marks</option>
          <option value="score-asc">Lowest marks</option>
          <option value="newest">Newest</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {rows.length === 0 && (
          <Panel>
            <p className="text-sm text-slate-500">No student matches “{query}”.</p>
          </Panel>
        )}
        {rows.map((r) => {
          const p = pct(r.score, r.total_marks);
          const passed = passingScore == null ? null : p >= passingScore;
          const attempt = attemptById.get(r.id);
          const open = openId === r.id;
          return (
            <Panel key={r.id} className="p-0!">
              <button
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                onClick={() => setOpenId(open ? null : r.id)}
                aria-expanded={open}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand/12 text-[12px] font-bold text-brand">
                  #{rankById.get(r.id)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-ink">
                    {r.student_name}
                    {attempt && attempt.of > 1 && (
                      <span className="ml-1.5 text-[11px] font-medium text-slate-400">
                        attempt {attempt.n}/{attempt.of}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[12px] text-slate-400">{r.student_email}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {passed !== null && (
                      <Pill tone={passed ? "success" : "danger"}>{passed ? "Pass" : "Fail"}</Pill>
                    )}
                    {r.flagged && <Pill tone="warning">⚠ Flagged</Pill>}
                    {r.auto_submitted && <Pill tone="muted">Auto-submitted</Pill>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[20px] leading-none font-bold text-ink">{p}%</p>
                  <p className="mt-1 text-[12px] font-semibold text-slate-500">
                    {r.score}/{r.total_marks} marks
                  </p>
                </div>
                <ChevronDown
                  className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
                />
              </button>
              {open && <StudentDetail response={r} questions={questions} />}
            </Panel>
          );
        })}
      </div>
    </section>
  );
}

function StudentDetail({
  response: r,
  questions,
}: {
  response: ResponseRow;
  questions: Question[];
}) {
  const answers = (r.answers ?? {}) as Record<string, number>;
  const correct = questions.filter((q) => answers[q.id] === q.correct_index).length;
  const skipped = questions.filter((q) => answers[q.id] === undefined).length;

  return (
    <div className="flex flex-col gap-2 border-t border-white/70 px-4 pt-3 pb-4">
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Correct" value={correct} />
        <MiniStat label="Wrong" value={questions.length - correct - skipped} />
        <MiniStat label="Skipped" value={skipped} />
      </div>
      <p className="text-[11px] text-slate-400">
        Submitted {new Date(r.submitted_at).toLocaleString()} · {r.tab_switches} tab switch
        {r.tab_switches === 1 ? "" : "es"}
      </p>
      {questions.map((q, i) => {
        const given = answers[q.id];
        const ok = given === q.correct_index;
        const options = (q.options as string[]) ?? [];
        return (
          <div key={q.id} className="rounded-2xl bg-white/70 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] font-semibold text-ink">
                {i + 1}. {q.text}
              </p>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  ok ? "bg-success/15 text-success" : "bg-danger/12 text-danger"
                }`}
              >
                {ok ? "✓" : "✗"} {ok ? q.marks : 0}/{q.marks}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-slate-500">
              Answered:{" "}
              <span className={ok ? "text-success" : "text-danger"}>
                {given === undefined ? "No answer" : `${letter(given)}. ${options[given] ?? ""}`}
              </span>
            </p>
            {!ok && (
              <p className="text-[12px] text-slate-500">
                Correct: {letter(q.correct_index)}. {options[q.correct_index] ?? ""}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview & analytics                                                */
/* ------------------------------------------------------------------ */

type QuestionStat = {
  q: Question;
  index: number;
  correctRate: number;
  answered: number;
  optionCounts: number[];
  topWrong: number | null;
};

function Overview({
  passingScore,
  responses,
  questions,
}: {
  passingScore: number | null;
  responses: ResponseRow[];
  questions: Question[];
}) {
  const stats = useMemo(() => {
    const percents = responses.map((r) => pct(r.score, r.total_marks)).sort((a, b) => a - b);
    const n = percents.length;
    const avg = Math.round(percents.reduce((s, p) => s + p, 0) / n);
    const median =
      n % 2 ? percents[(n - 1) / 2]! : Math.round((percents[n / 2 - 1]! + percents[n / 2]!) / 2);
    const passRate =
      passingScore == null
        ? null
        : Math.round((percents.filter((p) => p >= passingScore).length / n) * 100);

    const bins = [0, 20, 40, 60, 80].map((lo) => ({
      label: lo === 80 ? "80–100%" : `${lo}–${lo + 19}%`,
      lo,
      count: percents.filter((p) => (lo === 80 ? p >= 80 : p >= lo && p < lo + 20)).length,
    }));

    const perQuestion: QuestionStat[] = questions.map((q, index) => {
      const optionCounts = [0, 0, 0, 0];
      let answered = 0;
      let correct = 0;
      for (const r of responses) {
        const given = ((r.answers ?? {}) as Record<string, number>)[q.id];
        if (given === undefined) continue;
        answered += 1;
        if (given >= 0 && given < 4) optionCounts[given]! += 1;
        if (given === q.correct_index) correct += 1;
      }
      let topWrong: number | null = null;
      optionCounts.forEach((c, i) => {
        if (i !== q.correct_index && c > 0 && (topWrong === null || c > optionCounts[topWrong]!))
          topWrong = i;
      });
      return {
        q,
        index,
        correctRate: Math.round((correct / n) * 100),
        answered,
        optionCounts,
        topWrong,
      };
    });

    return {
      n,
      avg,
      median,
      passRate,
      highest: percents[n - 1]!,
      lowest: percents[0]!,
      flagged: responses.filter((r) => r.flagged).length,
      bins,
      perQuestion,
    };
  }, [responses, questions, passingScore]);

  const hardestFirst = [...stats.perQuestion].sort((a, b) => a.correctRate - b.correctRate);
  const struggling = hardestFirst.filter((s) => s.correctRate < 50);

  return (
    <section className="mt-6 mb-8">
      <p className="font-display text-[15px] font-bold text-ink">Overview</p>

      <Panel className="mt-3" elevated>
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Average" value={`${stats.avg}%`} />
          <Stat label="Median" value={`${stats.median}%`} />
          {stats.passRate !== null ? (
            <Stat label={`Pass rate (≥${passingScore}%)`} value={`${stats.passRate}%`} />
          ) : (
            <Stat label="Submissions" value={stats.n} />
          )}
          <Stat label="Highest" value={`${stats.highest}%`} />
          <Stat label="Lowest" value={`${stats.lowest}%`} />
          <Stat label="Flagged" value={stats.flagged} />
        </div>
      </Panel>

      {struggling.length > 0 && (
        <Panel className="mt-3">
          <Eyebrow>Where students struggle</Eyebrow>
          <ul className="mt-2 flex flex-col gap-2">
            {struggling.slice(0, 3).map((s) => (
              <li key={s.q.id} className="text-[13px] text-ink">
                <span className="font-semibold">Q{s.index + 1}</span> — only{" "}
                <span className="font-semibold">{s.correctRate}%</span> got it right.
                {s.topWrong !== null && (
                  <span className="text-slate-500">
                    {" "}
                    Most common wrong answer: {letter(s.topWrong)} (
                    {Math.round((s.optionCounts[s.topWrong]! / stats.n) * 100)}% picked it).
                  </span>
                )}
                <p className="truncate text-[12px] text-slate-400">{s.q.text}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel className="mt-3">
        <Eyebrow>Score distribution</Eyebrow>
        <p className="mt-1 text-[12px] text-slate-400">Number of submissions in each score range</p>
        <ScoreHistogram bins={stats.bins} total={stats.n} passingScore={passingScore} />
      </Panel>

      <Panel className="mt-3">
        <Eyebrow>Question performance</Eyebrow>
        <p className="mt-1 text-[12px] text-slate-400">
          % of students who answered correctly, hardest first. Tap a question for the answer
          breakdown.
        </p>
        <QuestionBars items={hardestFirst} total={stats.n} />
      </Panel>
    </section>
  );
}

function ScoreHistogram({
  bins,
  total,
  passingScore,
}: {
  bins: { label: string; lo: number; count: number }[];
  total: number;
  passingScore: number | null;
}) {
  const max = Math.max(1, ...bins.map((b) => b.count));
  return (
    <div className="mt-4">
      <div className="flex h-40 items-end gap-2 border-b border-slate-200">
        {bins.map((b) => (
          <div key={b.label} className="group relative flex h-full flex-1 flex-col justify-end">
            <span className="mb-1 text-center text-[11px] font-semibold text-slate-500">
              {b.count}
            </span>
            <div
              className="rounded-t-[4px] bg-brand transition-opacity group-hover:opacity-80"
              style={{ height: `${(b.count / max) * 85}%`, minHeight: b.count ? 4 : 0 }}
            />
            <Tooltip>
              {b.label}: {b.count} student{b.count === 1 ? "" : "s"} (
              {Math.round((b.count / total) * 100)}%)
            </Tooltip>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">
        {bins.map((b) => (
          <span key={b.label} className="flex-1 text-center text-[10px] text-slate-400">
            {b.label}
          </span>
        ))}
      </div>
      {passingScore !== null && (
        <p className="mt-2 text-[11px] text-slate-400">Passing score: {passingScore}%</p>
      )}
    </div>
  );
}

function QuestionBars({ items, total }: { items: QuestionStat[]; total: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="mt-3 flex flex-col gap-1">
      {items.map((s) => {
        const open = openId === s.q.id;
        const options = (s.q.options as string[]) ?? [];
        return (
          <div key={s.q.id}>
            <button
              className="group relative flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left hover:bg-white/60"
              onClick={() => setOpenId(open ? null : s.q.id)}
              aria-expanded={open}
            >
              <span className="w-8 shrink-0 text-[12px] font-bold text-slate-500">
                Q{s.index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] text-ink">{s.q.text}</p>
                <div className="mt-1 h-2 rounded-full bg-slate-200/70">
                  <div
                    className="h-2 rounded-full bg-brand"
                    style={{ width: `${s.correctRate}%`, minWidth: s.correctRate ? 4 : 0 }}
                  />
                </div>
              </div>
              <span className="w-10 shrink-0 text-right text-[12px] font-semibold text-ink">
                {s.correctRate}%
              </span>
              <Tooltip>
                {s.correctRate}% correct · {s.answered}/{total} answered
              </Tooltip>
            </button>
            {open && (
              <div className="mb-2 ml-11 flex flex-col gap-1.5 rounded-xl bg-white/70 p-3">
                {options.map((o, i) => {
                  const c = s.optionCounts[i] ?? 0;
                  const share = Math.round((c / total) * 100);
                  const isCorrect = i === s.q.correct_index;
                  return (
                    <div key={i}>
                      <div className="flex justify-between gap-2 text-[12px]">
                        <span
                          className={`truncate ${isCorrect ? "font-semibold text-ink" : "text-slate-500"}`}
                        >
                          {letter(i)}. {o}
                          {isCorrect && <span className="ml-1 text-success">✓ correct</span>}
                        </span>
                        <span className="shrink-0 text-slate-500">
                          {c} ({share}%)
                        </span>
                      </div>
                      <div className="mt-0.5 h-1.5 rounded-full bg-slate-200/70">
                        <div
                          className={`h-1.5 rounded-full ${isCorrect ? "bg-brand" : "bg-slate-400"}`}
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {total - s.answered > 0 && (
                  <p className="text-[11px] text-slate-400">
                    {total - s.answered} skipped this question
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-[11px] whitespace-nowrap text-white shadow-lg group-hover:block">
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-white/70">
      <p className="text-[10px] font-medium tracking-[0.12em] text-slate-400 uppercase">{label}</p>
      <p className="mt-1 text-[24px] leading-none font-bold text-ink">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/70 px-3 py-2 text-center">
      <p className="text-[16px] leading-none font-bold text-ink">{value}</p>
      <p className="mt-1 text-[10px] tracking-[0.1em] text-slate-400 uppercase">{label}</p>
    </div>
  );
}
