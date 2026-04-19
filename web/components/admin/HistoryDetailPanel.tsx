import {
  CrawlJob,
  formatDateTime,
  formatDuration,
  isActiveJob,
} from "@/lib/crawler";

interface Props {
  job: CrawlJob;
  allJobs: CrawlJob[];
  submitting: boolean;
  onResume: (job: CrawlJob) => void;
}

export function HistoryDetailPanel({ job, allJobs, submitting, onResume }: Props) {
  const opts = (job.options || {}) as Record<string, any>;
  const cp = (job.checkpoint || {}) as Record<string, any>;
  const cpPos = cp.position as Record<string, any> | undefined;
  const cpStats = cp.stats as Record<string, any> | undefined;

  const hProcessed = job.progress.processed || 0;
  const hFound = job.progress.found || 0;
  const hErrors = job.progress.errors || 0;
  const hNoData = Math.max(0, hProcessed - hFound - hErrors);

  const canResume = !!(
    (job.status === "stopped" || job.status === "failed" || job.status === "cancelled") &&
    job.checkpoint
  );
  const threadBusy =
    canResume &&
    allJobs.some((j) => (j.thread || 1) === (job.thread || 1) && isActiveJob(j));

  return (
    <div className="bg-gray-50 px-4 py-4 border-t border-gray-100">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 왼쪽: 수집 결과 + 수집 일시 */}
        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">수집 결과</h4>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              <div className="bg-green-50 rounded-lg px-3 py-2 text-center">
                <div className="text-lg font-bold text-green-700">{hFound.toLocaleString()}</div>
                <div className="text-[10px] text-green-600">수집</div>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                <div className="text-lg font-bold text-gray-500">{hNoData.toLocaleString()}</div>
                <div className="text-[10px] text-gray-400">정보없음</div>
              </div>
              <div className="bg-purple-50 rounded-lg px-3 py-2 text-center">
                <div className="text-lg font-bold text-purple-700">{(job.progress.geocoded ?? 0).toLocaleString()}</div>
                <div className="text-[10px] text-purple-600">좌표</div>
              </div>
              <div className={`rounded-lg px-3 py-2 text-center ${hErrors > 0 ? "bg-orange-50" : "bg-gray-100"}`}>
                <div className={`text-lg font-bold ${hErrors > 0 ? "text-orange-700" : "text-gray-400"}`}>{hErrors}</div>
                <div className={`text-[10px] ${hErrors > 0 ? "text-orange-600" : "text-gray-400"}`}>미수집</div>
              </div>
              <div className="bg-blue-50 rounded-lg px-3 py-2 text-center">
                <div className="text-lg font-bold text-blue-700">{hProcessed.toLocaleString()}</div>
                <div className="text-[10px] text-blue-600">총 조회</div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">수집 일시</h4>
            <table className="w-full text-xs">
              <tbody>
                <tr>
                  <td className="py-1 text-gray-500 w-20">생성</td>
                  <td className="py-1 text-gray-700 font-medium">{formatDateTime(job.created_at)}</td>
                </tr>
                {job.started_at && (
                  <tr>
                    <td className="py-1 text-gray-500">시작</td>
                    <td className="py-1 text-gray-700 font-medium">{formatDateTime(job.started_at)}</td>
                  </tr>
                )}
                {job.completed_at && (
                  <tr>
                    <td className="py-1 text-gray-500">완료</td>
                    <td className="py-1 text-gray-700 font-medium">{formatDateTime(job.completed_at)}</td>
                  </tr>
                )}
                {job.started_at && job.completed_at && (
                  <tr>
                    <td className="py-1 text-gray-500">소요</td>
                    <td className="py-1 text-gray-700 font-bold">{formatDuration(job.started_at, job.completed_at)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {job.error_message && (
            <div>
              <h4 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-1">오류 메시지</h4>
              <div className="text-xs text-red-700 bg-red-50 rounded px-3 py-2 border border-red-200 break-all">
                {job.error_message}
              </div>
            </div>
          )}

          {job.progress.recent_errors && job.progress.recent_errors.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-orange-500 uppercase tracking-wider mb-1">미수집 지번 ({job.progress.recent_errors.length}건)</h4>
              <div className="bg-orange-50 rounded px-3 py-2 border border-orange-200 space-y-1">
                {job.progress.recent_errors.map((err, i) => (
                  <div key={i} className="text-[11px] text-orange-700 flex gap-2">
                    <span className="text-orange-500 flex-shrink-0 font-medium">{err.addr}</span>
                    <span className="truncate text-gray-500">{err.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 오른쪽: 옵션 + 체크포인트 */}
        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">수집 옵션</h4>
            <table className="w-full text-xs">
              <tbody>
                <tr>
                  <td className="py-1 text-gray-500 w-28">API 호출 간격</td>
                  <td className="py-1 text-gray-700 font-medium">{opts.delay ?? 0.5}초</td>
                </tr>
                <tr>
                  <td className="py-1 text-gray-500">배치 크기</td>
                  <td className="py-1 text-gray-700 font-medium">{opts.flush_size ?? 100}건</td>
                </tr>
                <tr>
                  <td className="py-1 text-gray-500">갱신 주기</td>
                  <td className="py-1 text-gray-700 font-medium">{opts.progress_interval ?? 10}건마다</td>
                </tr>
                <tr>
                  <td className="py-1 text-gray-500">STEP 데이터</td>
                  <td className="py-1 text-gray-700 font-medium">{opts.fetch_step_data ? "사용" : "미사용"}</td>
                </tr>
                <tr>
                  <td className="py-1 text-gray-500">변화 감지</td>
                  <td className="py-1 text-gray-700 font-medium">자동 (DB 저장 시 이전 값과 달라진 건 이력 기록)</td>
                </tr>
              </tbody>
            </table>
          </div>

          {cpPos && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">체크포인트 (마지막 위치)</h4>
              <table className="w-full text-xs">
                <tbody>
                  {cpPos.do_name && (
                    <tr>
                      <td className="py-0.5 text-gray-500 w-28">도/시</td>
                      <td className="py-0.5 text-gray-700 font-medium">{cpPos.do_name} ({(cpPos.do_idx ?? 0) + 1}/{cpPos.do_total ?? "?"})</td>
                    </tr>
                  )}
                  {cpPos.si_name && (
                    <tr>
                      <td className="py-0.5 text-gray-500">시</td>
                      <td className="py-0.5 text-gray-700 font-medium">{cpPos.si_name} ({(cpPos.si_idx ?? 0) + 1}/{cpPos.si_total ?? "?"})</td>
                    </tr>
                  )}
                  {cpPos.gu_name && (
                    <tr>
                      <td className="py-0.5 text-gray-500">구/군</td>
                      <td className="py-0.5 text-gray-700 font-medium">{cpPos.gu_name} ({(cpPos.gu_idx ?? 0) + 1}/{cpPos.gu_total ?? "?"})</td>
                    </tr>
                  )}
                  {cpPos.dong_name && (
                    <tr>
                      <td className="py-0.5 text-gray-500">동/면</td>
                      <td className="py-0.5 text-gray-700 font-medium">{cpPos.dong_name} ({(cpPos.dong_idx ?? 0) + 1}/{cpPos.dong_total ?? "?"})</td>
                    </tr>
                  )}
                  {cpPos.li_name && (
                    <tr>
                      <td className="py-0.5 text-gray-500">리</td>
                      <td className="py-0.5 text-gray-700 font-medium">{cpPos.li_name} ({(cpPos.li_idx ?? 0) + 1}/{cpPos.li_total ?? "?"})</td>
                    </tr>
                  )}
                  {cpPos.jibun_name && (
                    <tr>
                      <td className="py-0.5 text-gray-500">지번</td>
                      <td className="py-0.5 text-gray-700 font-medium">{cpPos.jibun_name} ({(cpPos.jibun_idx ?? 0) + 1}/{cpPos.jibun_total ?? "?"})</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {cpStats && (
                <div className="mt-1.5 text-[10px] text-gray-400">
                  체크포인트 시점: 조회 {cpStats.processed?.toLocaleString() ?? 0} {"/"}  수집 {cpStats.found?.toLocaleString() ?? 0} {"/"} 미수집 {cpStats.errors ?? 0}
                </div>
              )}
            </div>
          )}

          {(job.progress.addr_parts || job.progress.current_address) && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">마지막 처리 주소</h4>
              {job.progress.addr_parts ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {[
                    { label: "시/도", value: job.progress.addr_parts.sido },
                    { label: "시/군", value: job.progress.addr_parts.si },
                    { label: "구", value: job.progress.addr_parts.gu },
                    { label: "동/읍/면", value: job.progress.addr_parts.dong },
                    { label: "리", value: job.progress.addr_parts.li },
                    { label: "번지", value: job.progress.addr_parts.jibun },
                  ].filter(item => item.value).map(item => (
                    <div key={item.label}>
                      <span className="text-gray-400">{item.label}</span>{" "}
                      <span className="font-medium text-gray-700">{item.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-gray-700">{job.progress.current_address}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {canResume && (
        <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={() => onResume(job)}
            disabled={submitting || threadBusy}
            className="text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2 rounded-md font-medium transition-colors"
          >
            {submitting ? "시작 중..." : "이어서 추출"}
          </button>
          {threadBusy && (
            <span className="ml-3 text-xs text-amber-600 self-center">
              수집기 {job.thread || 1}에서 실행 중인 작업이 완료된 후 이어서 추출할 수 있습니다.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
