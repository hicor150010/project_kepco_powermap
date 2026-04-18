"""
KEPCO 배전선로 여유용량 - 주소 순환 크롤러
시/도 → 시 → 구/군 → 동/면 → 리 → 상세번지 계층적 순환
"""
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, Optional

from api_client import KepcoApiClient, TooManyErrorsException

# "-기타지역"은 하위 주소가 없는 경우 사이트에서 자동 삽입하는 값
SKIP_VALUE = "-기타지역"


@dataclass
class CrawlProgress:
    """크롤링 진행 상태"""
    total_addresses: int = 0      # 총 번지 수 (현재 리 기준)
    processed: int = 0            # 처리 완료
    found: int = 0                # 검색 결과 있음
    errors: int = 0               # 오류 건수
    current_address: str = ""     # 현재 조회 중인 주소
    # 6단계 진행 상황
    phase: str = ""               # 현재 단계 요약
    do_current: int = 0
    do_total: int = 0
    si_current: int = 0
    si_total: int = 0
    gu_current: int = 0
    gu_total: int = 0
    dong_current: int = 0
    dong_total: int = 0
    li_current: int = 0
    li_total: int = 0
    jibun_current: int = 0
    jibun_total: int = 0
    # 현재 처리 중인 지역명
    do_name: str = ""
    si_name: str = ""
    gu_name: str = ""
    dong_name: str = ""
    li_name: str = ""
    jibun_name: str = ""
    # 에러 로그 (디버그용)
    recent_errors: list = None   # 최근 10건 (UI 표시용)
    all_errors: list = None      # 전체 에러 (분석용)

    def __post_init__(self):
        if self.recent_errors is None:
            self.recent_errors = []
        if self.all_errors is None:
            self.all_errors = []

    def add_error(self, address: str, error: str):
        """에러 기록 — 전체 + 최근 10건"""
        entry = {
            "addr": address[:150],
            "error": str(error)[:300],
        }
        self.all_errors.append(entry)
        self.recent_errors.append(entry)
        if len(self.recent_errors) > 10:
            self.recent_errors.pop(0)


@dataclass
class CrawlResult:
    """단일 검색 결과"""
    addr_do: str = ""
    addr_si: str = ""
    addr_gu: str = ""
    addr_lidong: str = ""
    addr_li: str = ""
    addr_jibun: str = ""
    subst_nm: str = ""        # 변전소명
    mtr_no: str = ""          # 주변압기
    dl_nm: str = ""           # 배전선로명
    subst_capa: str = ""      # 변전소 접속기준용량
    subst_pwr: str = ""       # 변전소 접수기준접속용량
    g_subst_capa: str = ""    # 변전소 접속계획반영접속용량
    mtr_capa: str = ""        # 주변압기 접속기준용량
    mtr_pwr: str = ""         # 주변압기 접수기준접속용량
    g_mtr_capa: str = ""      # 주변압기 접속계획반영접속용량
    dl_capa: str = ""         # 배전선로 접속기준용량
    dl_pwr: str = ""          # 배전선로 접수기준접속용량
    g_dl_capa: str = ""       # 배전선로 접속계획반영접속용량
    # 배전선로 접속예정 건수/용량 (retrieveDl)
    step1_cnt: str = ""       # STEP01 접수 건수
    step1_pwr: str = ""       # STEP01 접수 용량(kW)
    step2_cnt: str = ""       # STEP02 공용망보강 건수
    step2_pwr: str = ""       # STEP02 공용망보강 용량(kW)
    step3_cnt: str = ""       # STEP03 접속공사 건수
    step3_pwr: str = ""       # STEP03 접속공사 용량(kW)
    crawled_at: str = ""      # 실제 크롤링 시점 (UTC ISO 8601)


class KepcoСrawler:
    def __init__(
        self,
        delay: float = 0.5,
        on_progress: Optional[Callable[[CrawlProgress], None]] = None,
        on_result: Optional[Callable[[CrawlResult], None]] = None,
        on_log: Optional[Callable[[str], None]] = None,
        fetch_step_data: bool = False,
        split_count: Optional[int] = None,
        on_split_save: Optional[Callable[[list['CrawlResult'], int], None]] = None,
    ):
        self.client = KepcoApiClient(delay=delay)
        self.client._on_log = on_log
        self.on_progress = on_progress
        self.on_result = on_result
        self.on_log = on_log
        self.fetch_step_data = fetch_step_data
        self.split_count = split_count
        self.on_split_save = on_split_save
        self._split_part = 0
        self._total_found = 0  # 분할 저장 포함 누적 결과 수
        self.progress = CrawlProgress()
        self.results: list[CrawlResult] = []
        self._stop_event = threading.Event()
        # 실패 주소 보관 — 리 단위 끝나면 일괄 재시도
        self._failed_addresses: list[tuple] = []  # (addr_do, si, gu, lidong, li, jibun, display_addr)
        # crawl 중 삼켜지지 않고 보존할 예외 (run_crawl.py 에서 stopped 판정에 사용)
        self._error: Optional[Exception] = None

    def stop(self):
        """크롤링 중지 요청"""
        self._stop_event.set()

    def is_stopped(self) -> bool:
        return self._stop_event.is_set()

    def _log(self, msg: str):
        if self.on_log:
            self.on_log(msg)

    def _update_progress(self):
        if self.on_progress:
            self.on_progress(self.progress)

    def _safe_get_addr_list(self, **kwargs):
        """주소 목록 조회 — 실패 시 세션 재생성 + 점진적 대기 후 재시도 (최대 3회).
        3회 모두 실패하면 예외 전파 → crawl 의 except 가 _error 에 기록 → stopped.
        """
        delays = [5, 15, 30]
        last_err: Optional[Exception] = None
        for attempt, wait in enumerate(delays, 1):
            try:
                return self.client.get_addr_list(**kwargs)
            except Exception as e:
                last_err = e
                self._log(f"      [주소 목록 실패 {attempt}/3] {e} — {wait}초 후 세션 재생성 재시도")
                time.sleep(wait)
                try:
                    self.client._init_session()
                except Exception:
                    pass
        assert last_err is not None
        raise last_err

    def _reset_progress_below(self, level: str):
        """해당 레벨 하위의 progress 인덱스/총계/이름 초기화 (체크포인트 일관성 보장)."""
        below = {
            "do": ["si", "gu", "dong", "li", "jibun"],
            "si": ["gu", "dong", "li", "jibun"],
            "gu": ["dong", "li", "jibun"],
            "dong": ["li", "jibun"],
            "li": ["jibun"],
        }
        for lv in below.get(level, []):
            setattr(self.progress, f"{lv}_current", 0)
            setattr(self.progress, f"{lv}_total", 0)
            setattr(self.progress, f"{lv}_name", "")

    def _add_result(self, result: CrawlResult):
        self.results.append(result)
        self._total_found += 1
        self.progress.found = self._total_found
        if self.on_result:
            self.on_result(result)
        # 분할 저장 체크
        if self.split_count and len(self.results) >= self.split_count:
            self._do_split_save()

    def _do_split_save(self):
        """분할 저장 실행: 현재 results를 콜백으로 전달 후 비움"""
        self._split_part += 1
        if self.on_split_save:
            self.on_split_save(list(self.results), self._split_part)
            self._log(f"  [분할 저장] part{self._split_part}: {len(self.results)}건 저장 완료")
        self.results.clear()

    def crawl(self, addr_do: Optional[str] = None,
              addr_si: Optional[str] = None,
              addr_gu: Optional[str] = None,
              addr_dong: Optional[str] = None,
              addr_li: Optional[str] = None,
              resume_from: Optional[dict] = None,
              resume_stats: Optional[dict] = None):
        """
        크롤링 시작
        addr_do: 시/도 (None이면 전체 시/도 순환)
        addr_si: 시 (None이면 해당 시/도의 모든 시 순환)
        addr_gu: 구/군 (None이면 해당 시의 모든 구/군 순환)
        addr_dong: 동/면 (None이면 해당 구/군의 모든 동/면 순환)
        addr_li: 리 (None이면 해당 동/면의 모든 리 순환)
        resume_from: 체크포인트의 position dict (None이면 처음부터)
        resume_stats: 체크포인트의 stats dict (재개 시 누적 카운트 복원)
        """
        self._stop_event.clear()
        self._error = None
        self.results.clear()
        self._fixed_gu = addr_gu
        self._fixed_dong = addr_dong
        self._fixed_li = addr_li

        # 재개 상태 초기화
        self._resume_pos = resume_from
        self._resume_reached = (resume_from is None)

        # 진행도/누적 카운트 — 재개 시 stats로 복원
        self.progress = CrawlProgress()
        if resume_from and resume_stats:
            self.progress.processed = resume_stats.get("processed", 0)
            self.progress.found = resume_stats.get("found", 0)
            self.progress.errors = resume_stats.get("errors", 0)
            self._total_found = resume_stats.get("found", 0)
        else:
            self._total_found = 0
        self._split_part = 0

        scope = f"{addr_do or '(전체 시/도)'} {addr_si or '(전체 시)'} {addr_gu or '(전체 구/군)'}"
        self._log(f"=== 크롤링 시작: {scope} ===")

        try:
            # 시/도 목록
            if addr_do:
                do_list = [addr_do]
            else:
                do_list = self.client.get_sido_list()
                self._log(f"시/도 목록 ({len(do_list)}개): {', '.join(do_list)}")

            self.progress.do_total = len(do_list)
            # 시/도 1개 선택 시에도 즉시 1/1 표시
            if len(do_list) == 1:
                self.progress.do_current = 1
            self._update_progress()

            for do_idx, current_do in enumerate(do_list):
                if self.is_stopped():
                    break
                # 재개 스킵 (시/도)
                if not self._resume_reached:
                    target = self._resume_pos.get("do_idx", 0)
                    if do_idx < target:
                        continue
                    if do_idx > target:
                        self._resume_reached = True
                self.progress.do_current = do_idx + 1
                self.progress.do_name = current_do
                self._reset_progress_below("do")
                self._update_progress()

                if len(do_list) > 1:
                    self._log(f"\n{'='*50}")
                    self._log(f"[시/도 {do_idx+1}/{len(do_list)}] {current_do}")
                    self._log(f"{'='*50}")

                # 시 목록
                if addr_si:
                    si_list = [addr_si]
                else:
                    si_list = self._safe_get_addr_list(gbn=0, addr_do=current_do)
                    self._log(f"시 목록 ({len(si_list)}개): {', '.join(si_list)}")

                self.progress.si_total = len(si_list)
                if len(si_list) == 1:
                    self.progress.si_current = 1
                self._update_progress()

                for si_idx, si in enumerate(si_list):
                    if self.is_stopped():
                        break
                    # 재개 스킵 (시)
                    if not self._resume_reached:
                        target = self._resume_pos.get("si_idx", 0)
                        if si_idx < target:
                            continue
                        if si_idx > target:
                            self._resume_reached = True
                    self.progress.si_current = si_idx + 1
                    self.progress.si_name = si
                    self._reset_progress_below("si")
                    self._crawl_si(current_do, si)

        except TooManyErrorsException as e:
            self._log(f"[중단] {e}")
            self._error = e
        except Exception as e:
            self._log(f"[오류] 크롤링 중 예외 발생: {e}")
            self._error = e

        self._log(f"=== 크롤링 완료: 처리 {self.progress.processed}건, "
                   f"결과 {self.progress.found}건, 오류 {self.progress.errors}건 ===")

    def _crawl_si(self, addr_do: str, addr_si: str):
        """시 단위 크롤링"""
        if self.is_stopped():
            return

        is_skip_si = (addr_si == SKIP_VALUE)
        si_display = addr_si if not is_skip_si else "(기타)"
        self._log(f"[{self.progress.si_current}/{self.progress.si_total}] 시: {si_display}")

        if self._fixed_gu:
            gu_list = [self._fixed_gu]
        else:
            gu_list = self._safe_get_addr_list(
                gbn=1, addr_do=addr_do, addr_si=addr_si
            )
            if not gu_list:
                gu_list = [SKIP_VALUE]

        self.progress.gu_total = len(gu_list)
        if len(gu_list) == 1:
            self.progress.gu_current = 1
        self._update_progress()

        for gu_idx, gu in enumerate(gu_list):
            if self.is_stopped():
                break
            # 재개 스킵 (구/군)
            if not self._resume_reached:
                target = self._resume_pos.get("gu_idx", 0)
                if gu_idx < target:
                    continue
                if gu_idx > target:
                    self._resume_reached = True
            self.progress.gu_current = gu_idx + 1
            self.progress.gu_name = gu
            self._reset_progress_below("gu")
            self._crawl_gu(addr_do, addr_si, gu)

    def _crawl_gu(self, addr_do: str, addr_si: str, addr_gu: str):
        """구/군 단위 크롤링"""
        if self.is_stopped():
            return

        is_skip_gu = (addr_gu == SKIP_VALUE)
        gu_display = addr_gu if not is_skip_gu else "(기타)"
        self._log(f"  [{self.progress.gu_current}/{self.progress.gu_total}] 구/군: {gu_display}")

        if self._fixed_dong:
            dong_list = [self._fixed_dong]
        else:
            dong_list = self._safe_get_addr_list(
                gbn=2, addr_do=addr_do, addr_si=addr_si, addr_gu=addr_gu
            )

            if not dong_list:
                dong_list = [SKIP_VALUE]

        self.progress.dong_total = len(dong_list)

        for dong_idx, dong in enumerate(dong_list):
            if self.is_stopped():
                break
            # 재개 스킵 (동/면)
            if not self._resume_reached:
                target = self._resume_pos.get("dong_idx", 0)
                if dong_idx < target:
                    continue
                if dong_idx > target:
                    self._resume_reached = True
            self.progress.dong_current = dong_idx + 1
            self.progress.dong_name = dong
            self._reset_progress_below("dong")
            self._crawl_dong(addr_do, addr_si, addr_gu, dong)

    def _crawl_dong(self, addr_do: str, addr_si: str, addr_gu: str, addr_lidong: str):
        """동/면 단위 크롤링"""
        if self.is_stopped():
            return

        si_display = addr_si if addr_si != SKIP_VALUE else ""
        gu_display = addr_gu if addr_gu != SKIP_VALUE else ""
        dong_display = addr_lidong if addr_lidong != SKIP_VALUE else "(기타)"

        phase_parts = [p for p in [si_display, gu_display, dong_display] if p]
        self.progress.phase = " > ".join(phase_parts)
        self._log(f"    [{self.progress.dong_current}/{self.progress.dong_total}] 동/면: {dong_display}")

        if self._fixed_li:
            li_list = [self._fixed_li]
        else:
            li_list = self._safe_get_addr_list(
                gbn=3, addr_do=addr_do, addr_si=addr_si,
                addr_gu=addr_gu, addr_lidong=addr_lidong,
            )

            if not li_list:
                li_list = [SKIP_VALUE]

        self.progress.li_total = len(li_list)
        if len(li_list) == 1:
            self.progress.li_current = 1

        for li_idx, li in enumerate(li_list):
            if self.is_stopped():
                break
            # 재개 스킵 (리)
            if not self._resume_reached:
                target = self._resume_pos.get("li_idx", 0)
                if li_idx < target:
                    continue
                if li_idx > target:
                    self._resume_reached = True
            self.progress.li_current = li_idx + 1
            self.progress.li_name = li
            self._reset_progress_below("li")
            self._crawl_li(addr_do, addr_si, addr_gu, addr_lidong, li)

    def _crawl_li(self, addr_do: str, addr_si: str, addr_gu: str,
                  addr_lidong: str, addr_li: str):
        """리 단위 크롤링"""
        if self.is_stopped():
            return

        is_skip_li = (addr_li == SKIP_VALUE)
        li_display = addr_li if not is_skip_li else "(기타)"

        jibun_list = self._safe_get_addr_list(
            gbn=4, addr_do=addr_do, addr_si=addr_si,
            addr_gu=addr_gu, addr_lidong=addr_lidong,
            addr_li=addr_li,
        )

        if not jibun_list:
            self._log(f"      [{self.progress.li_current}/{self.progress.li_total}] 리: {li_display} - 번지 없음, 건너뜀")
            return

        self.progress.jibun_total = len(jibun_list)
        self.progress.jibun_current = 0
        self._log(f"      [{self.progress.li_current}/{self.progress.li_total}] 리: {li_display} ({len(jibun_list)}개 번지)")

        for jibun_idx, jibun in enumerate(jibun_list):
            if self.is_stopped():
                break
            # 재개 스킵 (번지) — 마지막 처리된 번지 포함 모두 스킵
            if not self._resume_reached:
                target = self._resume_pos.get("jibun_idx", 0)
                if jibun_idx <= target:
                    continue
                self._resume_reached = True
            self.progress.jibun_current = jibun_idx + 1
            self.progress.jibun_name = jibun
            self._search_jibun(
                addr_do, addr_si, addr_gu, addr_lidong, addr_li, jibun
            )

        # 리 단위 완료 후 — 실패 주소 일괄 재시도
        self._retry_failed(li_display)

    def _retry_failed(self, li_display: str):
        """실패 목록 일괄 재시도 — 성공하면 제거, 최종 실패만 에러 카운트"""
        if not self._failed_addresses:
            return
        if self.is_stopped():
            # 중단 시 남은 실패도 최종 에러로 확정
            for item in self._failed_addresses:
                self.progress.errors += 1
                self.progress.add_error(item[6], "중단으로 재시도 불가")
            self._failed_addresses.clear()
            self._update_progress()
            return

        pending = list(self._failed_addresses)
        self._failed_addresses.clear()
        self._log(f"      [재시도] {li_display} — 실패 {len(pending)}건 재시도 시작")

        still_failed: list[tuple] = []
        for addr_do, addr_si, addr_gu, addr_lidong, addr_li, addr_jibun, display_addr in pending:
            if self.is_stopped():
                still_failed.append((addr_do, addr_si, addr_gu, addr_lidong, addr_li, addr_jibun, display_addr))
                continue
            try:
                # 재시도 시 _search_jibun_once 사용 (실패해도 _failed에 안 쌓임)
                self._search_jibun_once(addr_do, addr_si, addr_gu, addr_lidong, addr_li, addr_jibun)
                self._log(f"          [재시도 성공] {display_addr}")
            except Exception as e:
                still_failed.append((addr_do, addr_si, addr_gu, addr_lidong, addr_li, addr_jibun, display_addr))
                self._log(f"          [최종 실패] {display_addr}: {e}")

        # 최종 실패만 에러 카운트 + 로그
        for item in still_failed:
            self.progress.errors += 1
            self.progress.add_error(item[6], "재시도 후에도 실패")

        if still_failed:
            self._log(f"      [재시도 결과] 성공 {len(pending) - len(still_failed)}건, 최종 실패 {len(still_failed)}건")
        else:
            self._log(f"      [재시도 결과] 전체 {len(pending)}건 성공")
        self._update_progress()

    def _do_search(self, addr_do: str, addr_si: str, addr_gu: str,
                   addr_lidong: str, addr_li: str, addr_jibun: str):
        """개별 번지 검색 (핵심 로직) — 성공 시 결과 저장, 실패 시 예외 전파"""
        # 표시용 주소
        parts = [addr_do]
        for v in [addr_si, addr_gu, addr_lidong, addr_li, addr_jibun]:
            if v:
                parts.append(v)
        display_addr = " ".join(parts)
        self.progress.current_address = display_addr
        self._update_progress()

        # 엑셀 저장용
        excel_si = addr_si
        excel_gu = addr_gu
        excel_li = addr_li

        def _try_search(si, gu, lidong, li):
            return self.client.search_capacity(
                addr_do=addr_do, addr_si=si, addr_gu=gu,
                addr_lidong=lidong, addr_li=li, addr_jibun=addr_jibun,
            )

        # 1차: addr_li만 빈값
        results = _try_search(
            addr_si, addr_gu, addr_lidong,
            "" if addr_li == SKIP_VALUE else addr_li,
        )
        # 0건이면 2차: 모든 -기타지역을 빈값으로
        if not results:
            alt_si = "" if addr_si == SKIP_VALUE else addr_si
            alt_gu = "" if addr_gu == SKIP_VALUE else addr_gu
            alt_li = "" if addr_li == SKIP_VALUE else addr_li
            retry = _try_search(alt_si, alt_gu, addr_lidong, alt_li)
            if retry:
                results = retry

        if results:
            for item in results:
                result = CrawlResult(
                    addr_do=addr_do,
                    addr_si=excel_si,
                    addr_gu=excel_gu,
                    addr_lidong=addr_lidong,
                    addr_li=excel_li,
                    addr_jibun=addr_jibun,
                    subst_nm=item.get("SUBST_NM", ""),
                    mtr_no=str(item.get("MTR_NO", "")),
                    dl_nm=item.get("DL_NM", ""),
                    subst_capa=str(item.get("SUBST_CAPA", "")),
                    subst_pwr=str(item.get("SUBST_PWR", "")),
                    g_subst_capa=str(item.get("G_SUBST_CAPA", "")),
                    mtr_capa=str(item.get("MTR_CAPA", "")),
                    mtr_pwr=str(item.get("MTR_PWR", "")),
                    g_mtr_capa=str(item.get("G_MTR_CAPA", "")),
                    dl_capa=str(item.get("DL_CAPA", "")),
                    dl_pwr=str(item.get("DL_PWR", "")),
                    g_dl_capa=str(item.get("G_DL_CAPA", "")),
                    crawled_at=datetime.now(timezone.utc).isoformat(),
                )

                # STEP 01/02/03 접속예정 건수/용량
                if self.fetch_step_data:
                    subst_cd = str(item.get("SUBST_CD", ""))
                    dl_cd = str(item.get("DL_CD", ""))
                    if subst_cd and dl_cd:
                        try:
                            detail = self.client.get_detail(subst_cd, dl_cd)
                            for step in detail.get("dlt_resultDl", []):
                                state = step.get("STATE", "")
                                cnt = str(step.get("CNT", 0))
                                pwr = str(step.get("PWR", 0))
                                if state == "01":
                                    result.step1_cnt = cnt
                                    result.step1_pwr = pwr
                                elif state == "02":
                                    result.step2_cnt = cnt
                                    result.step2_pwr = pwr
                                elif state == "03":
                                    result.step3_cnt = cnt
                                    result.step3_pwr = pwr
                        except Exception as e:
                            self._log(f"          [오류] STEP 데이터 조회 실패: {e}")

                self._add_result(result)

    def _search_jibun(self, addr_do: str, addr_si: str, addr_gu: str,
                      addr_lidong: str, addr_li: str, addr_jibun: str):
        """개별 번지 검색 — 실패 시 _failed_addresses에 보관 (리 끝나면 재시도)"""
        if self.is_stopped():
            return
        try:
            self._do_search(addr_do, addr_si, addr_gu, addr_lidong, addr_li, addr_jibun)
            self.progress.processed += 1
            self._update_progress()
        except Exception as e:
            display_addr = " ".join(p for p in [addr_do, addr_si, addr_gu, addr_lidong, addr_li, addr_jibun] if p)
            self.progress.processed += 1
            self._failed_addresses.append(
                (addr_do, addr_si, addr_gu, addr_lidong, addr_li, addr_jibun, display_addr)
            )
            self._log(f"          [일시오류] {display_addr}: {e} → 리 완료 후 재시도 예정")
            self._update_progress()

    def _search_jibun_once(self, addr_do: str, addr_si: str, addr_gu: str,
                           addr_lidong: str, addr_li: str, addr_jibun: str):
        """재시도용 검색 — 실패 시 예외를 그대로 전파 (processed 중복 카운트 안 함)"""
        self._do_search(addr_do, addr_si, addr_gu, addr_lidong, addr_li, addr_jibun)
