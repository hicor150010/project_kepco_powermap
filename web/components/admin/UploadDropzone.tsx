"use client";

import { useState, useRef, useEffect } from "react";
import {
  parseExcel,
  summarizeParseResult,
  ExcelFormatError,
  type ParseResult,
} from "@/lib/excel/parse";

/** 처리 단계 정의 (각 단계의 시작 % 와 끝 %) */
const STAGES = [
  { key: "read", label: "파일 읽는 중", icon: "📂", from: 0, to: 10 },
  { key: "format", label: "양식 확인 중", icon: "🔍", from: 10, to: 20 },
  { key: "validate", label: "데이터 검증 중", icon: "✓", from: 20, to: 35 },
  { key: "geocode", label: "위치 정보 확인 중", icon: "📍", from: 35, to: 70 },
  { key: "save", label: "데이터 저장 중", icon: "💾", from: 70, to: 90 },
  { key: "refresh", label: "지도 갱신 중", icon: "🗺", from: 90, to: 100 },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

interface FileResult {
  filename: string;
  status: "pending" | "processing" | "done" | "error";
  /** 현재 단계 */
  stage: StageKey | null;
  /** 0~100 진행률 (가짜) */
  progress: number;
  parseResult?: ParseResult;
  serverResult?: any;
  error?: string;
  /** 처리 시작/종료 시각 (소요시간 계산용) */
  startedAt?: number;
  finishedAt?: number;
}

export default function UploadDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<FileResult[]>([]);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const updateFile = (idx: number, patch: Partial<FileResult>) => {
    setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };

  /** 가짜 진행률 — 단계 시작 시 from에서 to-2까지 천천히 채움 */
  const animateStage = (
    idx: number,
    stageKey: StageKey,
    durationMs: number
  ): { stop: () => void } => {
    const stage = STAGES.find((s) => s.key === stageKey)!;
    const startTime = Date.now();
    const startPct = stage.from;
    const targetPct = stage.to - 2; // 완료 전엔 약간 남겨둠

    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const elapsed = Date.now() - startTime;
      const ratio = Math.min(1, elapsed / durationMs);
      // ease-out 곡선: 처음엔 빠르게, 끝으로 갈수록 느리게
      const eased = 1 - Math.pow(1 - ratio, 2);
      const pct = startPct + (targetPct - startPct) * eased;
      updateFile(idx, { progress: pct });
      if (ratio < 1) requestAnimationFrame(tick);
    };
    tick();

    return {
      stop: () => {
        stopped = true;
      },
    };
  };

  const handleFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (arr.length === 0) return;

    const valid = arr.filter((f) => /\.xlsx?$/i.test(f.name));
    const invalid = arr.length - valid.length;
    if (valid.length === 0) {
      alert("엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.");
      return;
    }
    if (invalid > 0) {
      alert(`${invalid}개의 파일은 엑셀이 아니어서 제외됩니다.`);
    }

    setBusy(true);
    const initial: FileResult[] = valid.map((f) => ({
      filename: f.name,
      status: "pending",
      stage: null,
      progress: 0,
    }));
    setFiles(initial);

    for (let i = 0; i < valid.length; i++) {
      const file = valid[i];
      const startedAt = Date.now();
      updateFile(i, { status: "processing", startedAt });

      try {
        // 1. 파일 읽기
        let anim = animateStage(i, "read", 300);
        updateFile(i, { stage: "read" });
        const buffer = await file.arrayBuffer();
        anim.stop();

        // 2. 양식 확인 + 3. 데이터 검증 (parseExcel 안에서 한꺼번에)
        anim = animateStage(i, "format", 200);
        updateFile(i, { stage: "format" });
        await sleep(200); // 시각적 단계 분리용 (사용자가 볼 수 있게)
        anim.stop();

        anim = animateStage(i, "validate", 400);
        updateFile(i, { stage: "validate" });

        let parsed: ParseResult;
        try {
          parsed = parseExcel(buffer);
        } catch (err) {
          anim.stop();
          if (err instanceof ExcelFormatError) {
            updateFile(i, {
              status: "error",
              error: err.userMessage,
              finishedAt: Date.now(),
            });
            continue;
          }
          throw err;
        }
        anim.stop();

        if (parsed.rows.length === 0) {
          updateFile(i, {
            status: "error",
            error: "처리할 유효한 행이 없습니다. 모든 행이 비어있거나 필수 정보가 없습니다.",
            parseResult: parsed,
            finishedAt: Date.now(),
          });
          continue;
        }

        // 4. 위치 정보 확인 (지오코딩 + 5. 저장 + 6. 갱신은 서버에서 한번에)
        anim = animateStage(i, "geocode", 1500);
        updateFile(i, { stage: "geocode", parseResult: parsed });

        const summary = summarizeParseResult(parsed);
        const fetchPromise = fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            rows: parsed.rows,
            hasStep: parsed.hasStep,
            parseSummary: summary,
          }),
        });

        // 단계를 시각적으로 진행시키기
        // 1.5초 후 자동으로 "저장 중"으로 전환
        const stage5Timer = setTimeout(() => {
          anim.stop();
          anim = animateStage(i, "save", 1000);
          updateFile(i, { stage: "save" });
        }, 1500);

        const stage6Timer = setTimeout(() => {
          anim.stop();
          anim = animateStage(i, "refresh", 800);
          updateFile(i, { stage: "refresh" });
        }, 2500);

        const res = await fetchPromise;
        clearTimeout(stage5Timer);
        clearTimeout(stage6Timer);
        anim.stop();

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          updateFile(i, {
            status: "error",
            error: data.error || `서버 오류 (${res.status})`,
            parseResult: parsed,
            finishedAt: Date.now(),
          });
          continue;
        }

        const serverResult = await res.json();
        updateFile(i, {
          status: "done",
          stage: "refresh",
          progress: 100,
          parseResult: parsed,
          serverResult,
          finishedAt: Date.now(),
        });
      } catch (err: any) {
        updateFile(i, {
          status: "error",
          error: String(err?.message || err),
          finishedAt: Date.now(),
        });
      }
    }
    setBusy(false);
  };

  return (
    <div>
      {/* 드롭존 */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-blue-500 bg-blue-50"
            : busy
              ? "border-gray-200 bg-gray-50 cursor-wait"
              : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            if (e.target) e.target.value = "";
          }}
        />
        <svg
          className="w-12 h-12 mx-auto text-gray-400 mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 0115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className="text-sm font-medium text-gray-700 mb-1">
          {busy ? "처리 중입니다..." : "엑셀 파일을 끌어다 놓거나 클릭해서 선택"}
        </p>
        <p className="text-[11px] text-gray-500">
          여러 파일 동시 업로드 가능 · .xlsx, .xls
        </p>
      </div>

      {/* 결과 리스트 */}
      {files.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-700">
              업로드 결과 ({files.length})
            </h3>
            {!busy && (
              <button
                onClick={reset}
                className="text-[11px] text-gray-500 hover:text-gray-700"
              >
                초기화
              </button>
            )}
          </div>
          {files.map((f, i) => (
            <FileCard key={i} file={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function FileCard({ file }: { file: FileResult }) {
  const [showDetail, setShowDetail] = useState(false);
  const isProcessing = file.status === "processing";
  const isDone = file.status === "done";
  const isError = file.status === "error";

  const elapsed =
    file.startedAt && file.finishedAt
      ? ((file.finishedAt - file.startedAt) / 1000).toFixed(1)
      : null;

  return (
    <div
      className={`border rounded-lg overflow-hidden ${
        isDone
          ? "border-green-200 bg-green-50/30"
          : isError
            ? "border-red-200 bg-red-50/30"
            : "border-blue-200 bg-blue-50/30"
      }`}
    >
      {/* 헤더 */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-lg">
          {isDone ? "✅" : isError ? "❌" : "📄"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">
            {file.filename}
          </div>
          {isProcessing && file.stage && (
            <div className="text-[11px] text-blue-700 mt-0.5 flex items-center gap-1.5">
              <Spinner />
              {STAGES.find((s) => s.key === file.stage)?.label}
            </div>
          )}
          {isDone && file.serverResult && (
            <div className="text-[11px] text-green-700 mt-0.5">
              {file.serverResult.parse.ok.toLocaleString()}건 등록 완료
              {elapsed && ` · ${elapsed}초`}
            </div>
          )}
          {isError && (
            <div className="text-[11px] text-red-700 mt-0.5">처리 실패</div>
          )}
        </div>
      </div>

      {/* 진행률 바 (처리 중일 때만) */}
      {isProcessing && (
        <div className="px-4 pb-3">
          <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-[width] duration-300 ease-out"
              style={{ width: `${file.progress}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-[10px] text-gray-500">
              {STAGES.findIndex((s) => s.key === file.stage) + 1} / {STAGES.length} 단계
            </span>
            <span className="text-[10px] text-blue-700 font-medium tabular-nums">
              {Math.round(file.progress)}%
            </span>
          </div>
        </div>
      )}

      {/* 완료 — 핵심 결과 */}
      {isDone && file.serverResult && (
        <div className="px-4 pb-4">
          {/* 100% 막대 */}
          <div className="h-2 bg-green-100 rounded-full overflow-hidden mb-3">
            <div className="h-full bg-green-500 w-full" />
          </div>

          {/* 핵심 3개 요약 */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <Highlight
              label="마을"
              value={file.serverResult.geocode.uniqueAddresses}
              suffix="곳"
              icon="📍"
            />
            <Highlight
              label="데이터"
              value={file.serverResult.parse.ok}
              suffix="건"
              icon="📊"
            />
            <Highlight
              label="소요"
              value={elapsed ?? "-"}
              suffix="초"
              icon="⏱"
              isText
            />
          </div>

          {/* 친절한 문장 */}
          <p className="text-[11px] text-gray-600 leading-relaxed">
            {file.serverResult.geocode.newGeocoded > 0 ? (
              <>
                <span className="font-medium text-blue-700">
                  새 마을 {file.serverResult.geocode.newGeocoded}곳
                </span>
                의 위치를 처음 확인했고,{" "}
                <span className="font-medium text-gray-900">
                  {file.serverResult.parse.ok.toLocaleString()}건
                </span>
                의 데이터를 지도에 반영했어요.
              </>
            ) : (
              <>
                모든 마을 위치가 이미 등록되어 있어{" "}
                <span className="font-medium text-gray-900">
                  {file.serverResult.parse.ok.toLocaleString()}건
                </span>
                의 데이터만 갱신했어요.
              </>
            )}
          </p>

          {/* 상세 보기 토글 */}
          <button
            onClick={() => setShowDetail(!showDetail)}
            className="mt-3 text-[11px] text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            상세 정보 {showDetail ? "▲" : "▼"}
          </button>

          {showDetail && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] bg-white rounded border border-gray-200 p-2.5">
              <DetailRow label="총 행 수" value={file.serverResult.parse.total} />
              <DetailRow
                label="처리 성공"
                value={file.serverResult.parse.ok}
                color="green"
              />
              <DetailRow
                label="건너뜀"
                value={file.serverResult.parse.skipped}
                color={file.serverResult.parse.skipped > 0 ? "amber" : "gray"}
              />
              <DetailRow
                label="파일내 중복"
                value={file.serverResult.parse.duplicates}
                color={file.serverResult.parse.duplicates > 0 ? "amber" : "gray"}
              />
              <DetailRow
                label="고유 마을"
                value={file.serverResult.geocode.uniqueAddresses}
              />
              <DetailRow
                label="새로 변환된 좌표"
                value={file.serverResult.geocode.newGeocoded}
                color="blue"
              />
              <DetailRow
                label="기존 캐시 사용"
                value={file.serverResult.geocode.cacheHit}
              />
              <DetailRow
                label="좌표 변환 실패"
                value={file.serverResult.geocode.failed}
                color={file.serverResult.geocode.failed > 0 ? "red" : "gray"}
              />
              <DetailRow
                label="DB 저장"
                value={file.serverResult.db.inserted}
                color="green"
              />
              <DetailRow
                label="좌표 없는 행"
                value={file.serverResult.db.rowsWithoutCoords}
                color={file.serverResult.db.rowsWithoutCoords > 0 ? "red" : "gray"}
              />
            </div>
          )}

          {/* 스킵 사유 상세 */}
          {file.parseResult && file.parseResult.errors.length > 0 && (
            <details className="mt-2">
              <summary className="text-[10px] text-amber-700 cursor-pointer hover:text-amber-900">
                건너뛴 행 보기 ({file.parseResult.errors.length}건)
              </summary>
              <div className="mt-1 max-h-32 overflow-y-auto text-[10px] text-gray-600 bg-white rounded border border-amber-200 px-2 py-1.5 space-y-0.5">
                {file.parseResult.errors.slice(0, 50).map((e, i) => (
                  <div key={i}>
                    {e.row}행: {e.reason}
                  </div>
                ))}
                {file.parseResult.errors.length > 50 && (
                  <div className="text-gray-400 mt-1">
                    ... 외 {file.parseResult.errors.length - 50}건
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      )}

      {/* 에러 */}
      {isError && (
        <div className="px-4 pb-4">
          <div className="bg-white border border-red-200 rounded-md p-3 text-xs">
            <div className="text-red-700 font-medium mb-1">사유</div>
            <div className="text-gray-700">{file.error}</div>
            {file.error?.includes("양식") && (
              <div className="mt-2 pt-2 border-t border-red-100 text-[11px] text-gray-600">
                💡 KEPCO 사이트에서 다운로드한 원본 양식을 그대로 사용해주세요.
                직접 만든 엑셀이나 컬럼이 추가/삭제된 파일은 거부됩니다.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Highlight({
  label,
  value,
  suffix,
  icon,
  isText,
}: {
  label: string;
  value: number | string;
  suffix: string;
  icon: string;
  isText?: boolean;
}) {
  return (
    <div className="bg-white rounded-md border border-gray-200 px-2 py-2 text-center">
      <div className="text-[10px] text-gray-500 mb-0.5">
        {icon} {label}
      </div>
      <div className="text-base font-bold text-gray-900 tabular-nums">
        {isText ? value : Number(value).toLocaleString()}
        <span className="text-[10px] font-normal text-gray-500 ml-0.5">
          {suffix}
        </span>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  color = "gray",
}: {
  label: string;
  value: number;
  color?: "gray" | "green" | "blue" | "amber" | "red";
}) {
  const colorMap = {
    gray: "text-gray-700",
    green: "text-green-700",
    blue: "text-blue-700",
    amber: "text-amber-700",
    red: "text-red-700",
  };
  return (
    <div className="flex items-center justify-between gap-2 px-1.5 py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium tabular-nums ${colorMap[color]}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="w-3 h-3 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M12 2a10 10 0 0110 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
