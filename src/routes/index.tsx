import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppBackground, Eyebrow, Panel, Pill } from "@/components/glass";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { createExam, deleteExam, listExams, updateExam } from "@/lib/admin.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lumen Exams · Admin console" },
      {
        name: "description",
        content:
          "Create timed multiple-choice exams, generate questions with AI, share a link and review every response.",
      },
      { property: "og:title", content: "Lumen Exams · Admin console" },
      {
        property: "og:description",
        content:
          "Create timed multiple-choice exams, generate questions with AI, share a link and review every response.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { session, user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(30);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const fetchExams = useServerFn(listExams);
  const { data, isLoading } = useQuery({
    queryKey: ["exams"],
    queryFn: () => fetchExams(),
    enabled: !!session,
  });

  const create = useServerFn(createExam);
  const update = useServerFn(updateExam);
  const remove = useServerFn(deleteExam);

  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          title: title.trim(),
          description: "Answer all multiple-choice questions.",
          duration_minutes: duration,
          passing_score: null,
          show_result: true,
          max_attempts: 1,
          max_tab_switches: 1,
          auto_submit_on_violation: false,
        },
      }),
    onSuccess: (exam) => {
      setTitle("");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["exams"] });
      navigate({ to: "/exams/$examId", params: { examId: exam.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMut = useMutation({
    mutationFn: (v: { examId: string; published: boolean }) => update({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exams"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (examId: string) => remove({ data: { examId } }),
    onSuccess: () => {
      toast.success("Exam deleted");
      qc.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exams = data?.exams ?? [];
  const published = exams.filter((e) => e.published).length;

  function copyLink(examId: string) {
    navigator.clipboard.writeText(`${window.location.origin}/e/${examId}`);
    toast.success("Exam link copied");
  }

  return (
    <AppBackground>
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="glass grid size-10 place-items-center rounded-2xl">
            <span className="size-3.5 rounded-full bg-linear-to-br from-brand to-violet" />
          </div>
          <div>
            <p className="font-display text-[15px] leading-none font-bold text-ink">Lumen</p>
            <p className="mt-1 text-[10px] font-medium tracking-[0.14em] text-slate-400 uppercase">
              Exams
            </p>
          </div>
        </div>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth" });
          }}
          className="glass rounded-2xl px-3 py-2 text-[12px] font-semibold text-ink"
        >
          Sign out
        </button>
      </header>

      <div className="mt-5 flex items-center justify-between">
        <div>
          <Eyebrow>Signed in as</Eyebrow>
          <p className="mt-1 font-display text-[22px] font-bold text-ink">
            {user?.user_metadata?.["full_name"] ?? user?.email ?? "Admin"}
          </p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-full bg-linear-to-br from-brand to-violet px-4 py-2 text-[12px] font-semibold text-white"
        >
          {creating ? "Cancel" : "New exam"}
        </button>
      </div>

      {creating && (
        <Panel className="mt-4" elevated>
          <Eyebrow>Create exam</Eyebrow>
          <div className="mt-3 flex flex-col gap-2.5">
            <input
              className="rounded-2xl bg-white/70 px-4 py-3 text-sm ring-1 ring-white/70 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-brand"
              placeholder="Exam title, e.g. Web Technology Internal Test"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <label className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3 text-sm ring-1 ring-white/70">
              <span className="text-slate-500">Duration (minutes)</span>
              <input
                type="number"
                min={1}
                max={600}
                className="w-20 bg-transparent text-right font-semibold outline-none"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </label>
            <button
              disabled={!title.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
              className="rounded-2xl bg-linear-to-br from-brand to-violet py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Create and add questions
            </button>
          </div>
        </Panel>
      )}

      <Panel className="mt-4" elevated>
        <Eyebrow>Overview</Eyebrow>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Stat label="Total exams" value={exams.length} />
          <Stat label="Published" value={published} />
          <Stat label="Responses" value={data?.totals.responses ?? 0} />
          <Stat label="Average score" value={`${data?.totals.avg ?? 0}%`} />
        </div>
      </Panel>

      <div className="mt-5 flex items-center justify-between">
        <p className="font-display text-[15px] font-bold text-ink">Your exams</p>
        <span className="text-[12px] font-semibold text-slate-400">{exams.length} total</span>
      </div>

      <div className="mt-3 mb-8 flex flex-col gap-2.5">
        {isLoading && <p className="text-sm text-slate-400">Loading…</p>}
        {!isLoading && exams.length === 0 && (
          <Panel>
            <p className="text-sm text-slate-500">
              No exams yet. Create your first one and add questions manually or with AI.
            </p>
          </Panel>
        )}
        {exams.map((exam) => {
          const c = data?.counts[exam.id];
          return (
            <Panel key={exam.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to="/exams/$examId"
                    params={{ examId: exam.id }}
                    className="block truncate font-display text-[15px] font-bold text-ink"
                  >
                    {exam.title}
                  </Link>
                  <p className="mt-1 text-[12px] text-slate-400">
                    {c?.questions ?? 0} questions · {exam.duration_minutes} min ·{" "}
                    {c?.responses ?? 0} responses
                  </p>
                </div>
                <Pill tone={exam.published ? "success" : "warning"}>
                  {exam.published ? "Published" : "Draft"}
                </Pill>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                <Link
                  to="/exams/$examId"
                  params={{ examId: exam.id }}
                  className="rounded-2xl bg-white/70 py-2.5 text-center text-[12px] font-semibold text-ink ring-1 ring-white/70"
                >
                  Edit
                </Link>
                <Link
                  to="/exams/$examId/responses"
                  params={{ examId: exam.id }}
                  className="rounded-2xl bg-white/70 py-2.5 text-center text-[12px] font-semibold text-ink ring-1 ring-white/70"
                >
                  Responses
                </Link>
                <button
                  onClick={() => copyLink(exam.id)}
                  className="rounded-2xl bg-white/70 py-2.5 text-[12px] font-semibold text-ink ring-1 ring-white/70"
                >
                  Copy link
                </button>
                <button
                  onClick={() =>
                    publishMut.mutate({ examId: exam.id, published: !exam.published })
                  }
                  className="rounded-2xl bg-linear-to-br from-brand to-violet py-2.5 text-[12px] font-semibold text-white"
                >
                  {exam.published ? "Unpublish" : "Publish"}
                </button>
              </div>
              <button
                onClick={() => {
                  if (confirm(`Delete "${exam.title}" and all its responses?`))
                    deleteMut.mutate(exam.id);
                }}
                className="mt-2 w-full text-[11px] font-semibold text-danger"
              >
                Delete exam
              </button>
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
      <p className="text-[11px] font-medium tracking-[0.12em] text-slate-400 uppercase">{label}</p>
      <p className="mt-1 font-display text-[28px] leading-none font-bold text-ink">{value}</p>
    </div>
  );
}
