/**
 * 관리자 전용 — 크롤링 작업 관리
 *
 * GET    /api/admin/crawl          → 작업 목록 (최신 50건)
 * POST   /api/admin/crawl          → 새 작업 생성 + GitHub Actions 트리거
 * PATCH  /api/admin/crawl          → 중단 요청 (status → stop_requested)
 * DELETE /api/admin/crawl?id=      → 작업 기록 삭제
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const GITHUB_PAT = process.env.GH_PAT || process.env.GITHUB_PAT || "";
const GITHUB_REPO = process.env.GITHUB_REPO || ""; // "owner/repo"

// ─────────────────────────────────────────────
// GET — 작업 목록
// ─────────────────────────────────────────────
export async function GET() {
  const me = await requireAdmin();
  if (!me) {
    return NextResponse.json(
      { ok: false, error: "관리자만 접근 가능합니다." },
      { status: 403 }
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("crawl_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, jobs: data });
}

// ─────────────────────────────────────────────
// POST — 새 작업 생성 + GitHub Actions 트리거
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const me = await requireAdmin();
  if (!me) {
    return NextResponse.json(
      { ok: false, error: "관리자만 접근 가능합니다." },
      { status: 403 }
    );
  }

  let body: {
    sido: string;
    si?: string;
    gu?: string;
    dong?: string;
    li?: string;
    options?: {
      fetch_step_data?: boolean;
      delay?: number;
      flush_size?: number;
    };
    checkpoint?: Record<string, unknown>;
    // 멀티스레드
    thread?: number;
    mode?: "single" | "recurring";
    max_cycles?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "잘못된 요청" },
      { status: 400 }
    );
  }

  if (!body.sido?.trim()) {
    return NextResponse.json(
      { ok: false, error: "시/도를 선택해주세요." },
      { status: 400 }
    );
  }

  const thread = body.thread || 1;
  if (![1, 2, 3, 4, 5].includes(thread)) {
    return NextResponse.json(
      { ok: false, error: "스레드 번호는 1~5 중 하나여야 합니다." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // 좀비 Job 정리: GitHub Actions 가 비정상 종료되면 status 가 살아있는 채로 남아
  // 다음 작업을 영구히 차단하므로, 30분 이상 갱신이 없으면 failed 로 전환한다.
  // (crawler/run_crawl.py 의 cleanup_zombie_jobs 와 동일 기준 — 새 작업이 시작 못 하면
  //  그쪽 정리 로직이 호출될 일이 없어 catch-22가 되므로 여기서도 한 번 돌린다)
  const zombieCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  await supabase
    .from("crawl_jobs")
    .update({
      status: "failed",
      error_message: "좀비 Job 자동 정리: 30분 이상 갱신 없음",
      completed_at: new Date().toISOString(),
    })
    .eq("thread", thread)
    .in("status", ["running", "stop_requested"])
    .or(`last_heartbeat.lt.${zombieCutoff},last_heartbeat.is.null`)
    .lt("created_at", zombieCutoff);

  // pending 인데 created_at 이 오래된 것도 좀비로 간주 (Actions 트리거 실패)
  await supabase
    .from("crawl_jobs")
    .update({
      status: "failed",
      error_message: "좀비 Job 자동 정리: pending 상태로 30분 이상 방치",
      completed_at: new Date().toISOString(),
    })
    .eq("thread", thread)
    .eq("status", "pending")
    .lt("created_at", zombieCutoff);

  // 같은 스레드 내에서 이미 실행/대기 중인 작업이 있는지 확인
  const { data: existing } = await supabase
    .from("crawl_jobs")
    .select("id, status, sido")
    .in("status", ["pending", "running", "stop_requested"])
    .eq("thread", thread)
    .limit(1);

  if (existing && existing.length > 0) {
    const ej = existing[0];
    const statusLabel =
      ej.status === "running"
        ? "실행 중"
        : ej.status === "pending"
          ? "대기 중"
          : "중단 대기";
    return NextResponse.json(
      {
        ok: false,
        error: `스레드 ${thread}에 이미 ${statusLabel}인 작업이 있습니다. (Job #${ej.id} — ${ej.sido})`,
      },
      { status: 409 }
    );
  }

  // crawl_jobs 생성
  const { data: job, error: insertErr } = await supabase
    .from("crawl_jobs")
    .insert({
      sido: body.sido.trim(),
      si: body.si?.trim() || null,
      gu: body.gu?.trim() || null,
      dong: body.dong?.trim() || null,
      li: body.li?.trim() || null,
      options: body.options || {},
      checkpoint: body.checkpoint || null,
      requested_by: me.id,
      thread,
      mode: body.mode || "single",
      cycle_count: 0,
      max_cycles: body.max_cycles || null,
    })
    .select()
    .single();

  if (insertErr || !job) {
    return NextResponse.json(
      { ok: false, error: insertErr?.message || "작업 생성 실패" },
      { status: 500 }
    );
  }

  // GitHub Actions workflow_dispatch 트리거
  if (GITHUB_PAT && GITHUB_REPO) {
    try {
      const ghResp = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/crawl.yml/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `token ${GITHUB_PAT}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ref: "main",
            inputs: {
              job_id: String(job.id),
              thread: String(thread),
            },
          }),
        }
      );

      if (!ghResp.ok) {
        const errText = await ghResp.text();
        console.error(
          `[GitHub Actions] dispatch 실패 (${ghResp.status}):`,
          errText
        );
        return NextResponse.json({
          ok: true,
          job,
          warning: "작업은 생성되었지만 GitHub Actions 트리거에 실패했습니다.",
        });
      }
    } catch (err) {
      console.error("[GitHub Actions] dispatch 네트워크 오류:", err);
      return NextResponse.json({
        ok: true,
        job,
        warning: "작업은 생성되었지만 GitHub Actions 트리거에 실패했습니다.",
      });
    }
  }

  return NextResponse.json({ ok: true, job });
}

// ─────────────────────────────────────────────
// PATCH — 중단 요청
// ─────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  const me = await requireAdmin();
  if (!me) {
    return NextResponse.json(
      { ok: false, error: "관리자만 접근 가능합니다." },
      { status: 403 }
    );
  }

  let body: { id: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "잘못된 요청" },
      { status: 400 }
    );
  }

  if (!body.id) {
    return NextResponse.json(
      { ok: false, error: "작업 ID가 필요합니다." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // 현재 상태 확인 — 상태에 따라 다른 전환을 수행한다.
  //   running          : 크롤러가 감지하도록 stop_requested 로 변경
  //   pending          : GitHub Actions 에 트리거된 적 없음 → 즉시 cancelled
  //   stop_requested   : 크롤러가 응답 못 하는 좀비 → 즉시 cancelled
  //   그 외 (completed/failed/cancelled) : 이미 종료된 Job, 변경 불필요
  const { data: job, error: readErr } = await supabase
    .from("crawl_jobs")
    .select("status")
    .eq("id", body.id)
    .single();

  if (readErr || !job) {
    return NextResponse.json(
      { ok: false, error: readErr?.message ?? "작업을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  let newStatus: string | null = null;
  if (job.status === "running") newStatus = "stop_requested";
  else if (job.status === "pending" || job.status === "stop_requested")
    newStatus = "cancelled";

  if (!newStatus) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      message: `Job 은 이미 종료 상태(${job.status})입니다.`,
    });
  }

  const { error } = await supabase
    .from("crawl_jobs")
    .update({
      status: newStatus,
      ...(newStatus === "cancelled"
        ? { completed_at: new Date().toISOString() }
        : {}),
    })
    .eq("id", body.id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, status: newStatus });
}

// ─────────────────────────────────────────────
// DELETE — 작업 기록 삭제
// ─────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const me = await requireAdmin();
  if (!me) {
    return NextResponse.json(
      { ok: false, error: "관리자만 접근 가능합니다." },
      { status: 403 }
    );
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "작업 ID가 필요합니다." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // running 상태인 작업은 삭제 불가
  const { data: job } = await supabase
    .from("crawl_jobs")
    .select("status")
    .eq("id", id)
    .single();

  if (job?.status === "running") {
    return NextResponse.json(
      { ok: false, error: "실행 중인 작업은 삭제할 수 없습니다. 먼저 중단해주세요." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("crawl_jobs")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
