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

const GITHUB_PAT = process.env.GITHUB_PAT || "";
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
    // 재개용: 이전 job의 checkpoint 복사
    checkpoint?: Record<string, unknown>;
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

  const supabase = createAdminClient();

  // 같은 지역에 이미 running/pending인 작업이 있는지 확인
  const { data: existing } = await supabase
    .from("crawl_jobs")
    .select("id, status")
    .eq("sido", body.sido)
    .in("status", ["pending", "running"])
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `'${body.sido}'에 이미 실행 중인 작업이 있습니다. (Job #${existing[0].id})`,
      },
      { status: 409 }
    );
  }

  // crawl_jobs 생성 (-기타지역도 그대로 저장, 크롤러가 처리)
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
            inputs: { job_id: String(job.id) },
          }),
        }
      );

      if (!ghResp.ok) {
        const errText = await ghResp.text();
        console.error(
          `[GitHub Actions] dispatch 실패 (${ghResp.status}):`,
          errText
        );
        // 작업은 이미 생성됨 — 삭제하지 않고 경고만
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
  const { error } = await supabase
    .from("crawl_jobs")
    .update({ status: "stop_requested" })
    .eq("id", body.id)
    .eq("status", "running");

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
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
