import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppBackground, Eyebrow, Panel } from "@/components/glass";
import { getPublicExam, submitExam } from "@/lib/public-exam.functions";

export const Route = createFileRoute("/e/$examId")({
  head: () => ({
    meta: [
      { title: "Take exam · Lumen Exams" },
      {
        name: "description",
        content: "Enter your details and take this timed multiple-choice exam.",
      },
      { property: "og:title", content: "Take exam · Lumen Exams" },
      {
        property: "og:description",
        content: "Enter your details and take this timed multiple-choice exam.",
      },
    ],
  }),
  component: TakeExam,
});

type Result = {
  showResult: boolean;
  score: number;
  total: number;
  percent: number;
  passed: boolean | null;
  flagged: boolean;
};

function TakeExam() {
  const { examId } = Route.useParams();
  const fetchExam = useServerFn(getPublicExam);
  const submit = useServerFn(submitExam);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["public-exam", examId],
    queryFn: () => fetchExam({ data: { examId } }),
    retry: 1,
  });

  const [stage, setStage] = useState<"entry" | "exam" | "done">("entry");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [current, setCurrent] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const submittedRef = useRef(false);

  const exam = data?.exam ?? null;
  const questions = useMemo(() => data?.questions ?? [], [data]);

  const submitMut = useMutation({
    mutationFn: (v: { auto: boolean; switches: number }) =>
      submit({
        data: {
          examId,
          studentName: name.trim(),
          studentEmail: email.trim(),
          answers,
          tabSwitches: v.switches,
          autoSubmitted: v.auto,
        },
      }),
    onSuccess: (res) => {
      setResult(res);
      setStage("done");
    },
    onError: (e: Error) => {
      submittedRef.current = false;
      toast.error(e.message);
    },
  });

  const finish = useCallback(
    (auto: boolean, switches: number) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      submitMut.mutate({ auto, switches });
    },
    [submitMut],
  );

  // Countdown
  useEffect(() => {
    if (stage !== "exam") return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          finish(true, tabSwitches);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [stage, finish, tabSwitches]);

  // Tab-switch detection + browser deterrents
  useEffect(() => {
    if (stage !== "exam" || !exam) return;

    function onVisibility() {
      if (document.visibilityState !== "hidden") return;
      setTabSwitches((prev) => {
        const next = prev + 1;
        toast.warning("Tab switching detected. This activity has been recorded.");
        if (exam!.auto_submit_on_violation && next > exam!.max_tab_switches) {
          finish(true, next);
        }
        return next;
      });
    }
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    function block(e: Event) {
      e.preventDefault();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("contextmenu", block);
    document.addEventListener("copy", block);
    document.addEventListener("paste", block);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("copy", block);
      document.removeEventListener("paste", block);
    };
  }, [stage, exam, finish]);

  if (isLoading) {
    return (
      <AppBackground>
        <p className="pt-10 text-sm text-slate-400">Loading exam…</p>
      </AppBackground>
    );
  }

  // A server error (e.g. missing Supabase config on the host) is not the same as
  // an unpublished exam — say which one it is instead of hiding the cause.
  if (error) {
    return (
      <AppBackground>
        <Panel className="mt-10" elevated>
          <h1 className="font-display text-[20px] font-bold text-ink">Could not load this exam</h1>
          <p className="mt-2 text-sm text-slate-500">
            The server could not be reached. Please try again in a moment.
          </p>
          <p className="mt-2 text-[12px] break-words text-slate-400">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="mt-4 rounded-2xl bg-linear-to-br from-brand to-violet px-4 py-2.5 text-[12px] font-semibold text-white"
          >
            Try again
          </button>
        </Panel>
      </AppBackground>
    );
  }

  if (!exam) {
    return (
      <AppBackground>
        <Panel className="mt-10" elevated>
          <h1 className="font-display text-[20px] font-bold text-ink">Exam unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">
            This exam link is not published, or it no longer exists.
          </p>
        </Panel>
      </AppBackground>
    );
  }

  if (stage === "done" && result) {
    return (
      <AppBackground>
        <Panel className="mt-10" elevated>
          <Eyebrow>Submitted</Eyebrow>
          <h1 className="mt-1 font-display text-[22px] font-bold text-ink">
            Thanks, {name.split(" ")[0] || "student"}
          </h1>
          {result.showResult ? (
            <>
              <p className="mt-4 font-display text-[44px] leading-none font-bold text-ink">
                {result.percent}%
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {result.score} of {result.total} marks
                {result.passed === null ? "" : result.passed ? " · Passed" : " · Not passed"}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Your response has been recorded. Results are not shown for this exam.
            </p>
          )}
          {result.flagged && (
            <p className="mt-3 rounded-2xl bg-danger/10 p-3 text-[12px] font-semibold text-danger">
              Tab-switching activity was recorded on this attempt.
            </p>
          )}
        </Panel>
      </AppBackground>
    );
  }

  if (stage === "entry") {
    return (
      <AppBackground>
        <Panel className="mt-8" elevated>
          <Eyebrow>Exam</Eyebrow>
          <h1 className="mt-1 font-display text-[22px] font-bold text-ink">{exam.title}</h1>
          <p className="mt-1 text-[12px] text-slate-400">
            {questions.length} questions · {exam.duration_minutes} minutes
          </p>

          {exam.description && (
            <p className="mt-4 text-sm whitespace-pre-line text-slate-500">{exam.description}</p>
          )}

          <ul className="mt-4 flex flex-col gap-1.5 text-[12px] text-slate-500">
            <li>• Do not switch tabs — switches are recorded.</li>
            <li>• The exam submits automatically when time expires.</li>
            <li>• You can only submit once.</li>
          </ul>

          <div className="mt-5 flex flex-col gap-2.5">
            <input
              className="rounded-2xl bg-white/70 px-4 py-3 text-sm ring-1 ring-white/70 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-brand"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="rounded-2xl bg-white/70 px-4 py-3 text-sm ring-1 ring-white/70 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-brand"
              placeholder="Email or student ID"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              disabled={!name.trim() || !email.trim() || questions.length === 0}
              onClick={() => {
                setSecondsLeft(exam.duration_minutes * 60);
                setStage("exam");
              }}
              className="rounded-2xl bg-linear-to-br from-brand to-violet py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {questions.length === 0 ? "No questions yet" : "Start exam"}
            </button>
          </div>
        </Panel>
      </AppBackground>
    );
  }

  const q = questions[current]!;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const low = secondsLeft <= 300;
  const options = (q.options as string[]) ?? [];

  return (
    <AppBackground>
      <Panel className="mt-4" elevated>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>Now answering</Eyebrow>
            <p className="truncate font-display text-[18px] font-bold text-ink">{exam.title}</p>
          </div>
          <div
            className={`shrink-0 rounded-2xl px-3 py-2 text-center ${
              low ? "bg-danger/12" : "bg-white/70"
            }`}
          >
            <p
              className={`font-display text-[16px] leading-none font-bold tabular-nums ${
                low ? "animate-pulse text-danger" : "text-ink"
              }`}
            >
              {mm}:{ss}
            </p>
            <p className="mt-1 text-[10px] font-medium text-slate-400">left</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {questions.map((item, i) => (
            <button
              key={item.id}
              onClick={() => setCurrent(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === current
                  ? "w-5 bg-violet"
                  : answers[item.id] !== undefined
                    ? "w-1.5 bg-brand"
                    : "w-1.5 bg-slate-300"
              }`}
              aria-label={`Question ${i + 1}`}
            />
          ))}
          <span className="ml-auto text-[11px] font-semibold text-slate-400">
            {current + 1} / {questions.length}
          </span>
        </div>

        <div className="mt-4">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-violet uppercase">
            Question {current + 1}
          </p>
          <h2 className="mt-1 font-display text-[18px] leading-snug font-semibold text-ink">
            {q.text}
          </h2>

          <div className="mt-4 flex flex-col gap-2.5">
            {options.map((opt, i) => {
              const selected = answers[q.id] === i;
              return (
                <button
                  key={i}
                  onClick={() => setAnswers({ ...answers, [q.id]: i })}
                  className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 ${
                    selected
                      ? "bg-linear-to-br from-brand to-violet text-white ring-brand"
                      : "bg-white/70 text-ink ring-white/70"
                  }`}
                >
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold ${
                      selected ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="text-sm font-medium">{opt}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex gap-2.5">
          <button
            disabled={current === 0}
            onClick={() => setCurrent((c) => Math.max(0, c - 1))}
            className="rounded-2xl bg-white/70 px-4 py-2.5 text-[12px] font-semibold text-ink ring-1 ring-white/70 disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={current >= questions.length - 1}
            onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
            className="flex-1 rounded-2xl bg-ink py-2.5 text-[12px] font-semibold text-white disabled:opacity-40"
          >
            Next question
          </button>
        </div>

        <button
          disabled={submitMut.isPending}
          onClick={() => {
            if (confirm("Submit your exam now? You cannot change answers afterwards.")) {
              finish(false, tabSwitches);
            }
          }}
          className="mt-2.5 w-full rounded-2xl bg-linear-to-br from-brand to-violet py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitMut.isPending ? "Submitting…" : "Submit exam"}
        </button>

        {tabSwitches > 0 && (
          <p className="mt-3 rounded-2xl bg-danger/10 p-3 text-[12px] font-semibold text-danger">
            {tabSwitches} tab switch{tabSwitches === 1 ? "" : "es"} recorded on this attempt.
          </p>
        )}
      </Panel>
      <div className="h-8" />
    </AppBackground>
  );
}
