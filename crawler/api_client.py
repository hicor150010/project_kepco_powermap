"""
KEPCO 배전선로 여유용량 API 클라이언트
"""
import json
import time
import requests

BASE_URL = "https://online.kepco.co.kr"
HEADERS = {
    "Content-Type": "application/json",
    "Referer": "https://online.kepco.co.kr/EWM092D00",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds
SKIP_VALUE = "-기타지역"

# 연속 에러 임계값
CONSECUTIVE_ERROR_PAUSE = 5    # 연속 에러 시 대기
CONSECUTIVE_ERROR_PAUSE_SEC = 60
CONSECUTIVE_ERROR_ABORT = 10   # 연속 에러 시 중단


class TooManyErrorsException(Exception):
    """연속 에러 한계 초과"""
    pass


class KepcoApiClient:
    def __init__(self, delay: float = 0.5):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self.delay = delay
        self._last_request_time = 0.0
        self._consecutive_errors = 0
        self._on_log = None  # 로그 콜백 (외부에서 설정)
        self._init_session()

    def _init_session(self):
        """세션 초기화 (쿠키 획득)"""
        try:
            self.session.get(f"{BASE_URL}/EWM092D00", timeout=30)
        except requests.exceptions.RequestException:
            pass

    def _wait(self):
        """요청 간 딜레이 적용"""
        elapsed = time.time() - self._last_request_time
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)

    def _log(self, msg: str):
        if self._on_log:
            self._on_log(msg)

    def _post(self, path: str, body: dict) -> dict:
        """공통 POST 요청 (재시도 + 연속 에러 감지)"""
        url = f"{BASE_URL}{path}"
        self._wait()
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = self.session.post(url, data=data, timeout=30)
                self._last_request_time = time.time()
                resp.raise_for_status()
                resp.encoding = "utf-8"
                result = resp.json()
                self._consecutive_errors = 0  # 성공 시 리셋
                return result
            except requests.exceptions.RequestException as e:
                if attempt == MAX_RETRIES:
                    self._consecutive_errors += 1
                    self._handle_consecutive_errors()
                    raise
                time.sleep(RETRY_DELAY * attempt)
        return {}

    def _handle_consecutive_errors(self):
        """연속 에러 임계값 처리"""
        if self._consecutive_errors >= CONSECUTIVE_ERROR_ABORT:
            self._log(f"[경고] 연속 {self._consecutive_errors}회 에러 — 크롤링을 자동 중지합니다.")
            raise TooManyErrorsException(
                f"연속 {self._consecutive_errors}회 에러 발생으로 자동 중지"
            )
        elif self._consecutive_errors >= CONSECUTIVE_ERROR_PAUSE:
            self._log(f"[경고] 연속 {self._consecutive_errors}회 에러 — "
                      f"{CONSECUTIVE_ERROR_PAUSE_SEC}초 대기 후 재시도합니다.")
            time.sleep(CONSECUTIVE_ERROR_PAUSE_SEC)

    # ── API 1: 시/도 목록 ──
    def get_sido_list(self) -> list[str]:
        """시/도 목록 반환"""
        data = self._post("/ew/cpct/retrieveAddrInit", {})
        return [item["ADDR_DO"] for item in data.get("dlt_sido", [])]

    # ── API 2: 주소 계층 조회 ──
    def get_addr_list(
        self,
        gbn: int,
        addr_do: str = "",
        addr_si: str = "",
        addr_gu: str = "",
        addr_lidong: str = "",
        addr_li: str = "",
    ) -> list[str]:
        """
        주소 계층 조회
        gbn: 0=시, 1=구/군, 2=동/면, 3=리, 4=번지
        """
        body = {
            "dma_addrGbn": {
                "gbn": str(gbn),
                "addr_do": addr_do,
                "addr_si": addr_si,
                "addr_gu": addr_gu,
                "addr_lidong": addr_lidong,
                "addr_li": addr_li,
                "addr_jibun": "",
            }
        }
        data = self._post("/ew/cpct/retrieveAddrGbn", body)

        key_map = {
            0: "ADDR_SI",
            1: "ADDR_GU",
            2: "ADDR_LIDONG",
            3: "ADDR_LI",
            4: "ADDR_JIBUN",
        }
        key = key_map.get(gbn, "")
        items = data.get("dlt_addrGbn", [])
        return [item[key] for item in items if key in item]

    # ── API 3: 배전선로 용량 검색 ──
    def search_capacity(
        self,
        addr_do: str,
        addr_si: str = "",
        addr_gu: str = "",
        addr_lidong: str = "",
        addr_li: str = "",
        addr_jibun: str = "",
    ) -> list[dict]:
        """배전선로 용량 검색 결과 반환"""
        body = {
            "dma_reqParam": {
                "searchCondition": "address",
                "do": addr_do,
                "si": addr_si,
                "gu": addr_gu,
                "lidong": addr_lidong,
                "li": addr_li,
                "jibun": addr_jibun,
            }
        }
        data = self._post("/ew/cpct/retrieveMeshNo", body)
        return data.get("dlt_resultList", [])

    # ── API 4: 상세 조회 ──
    def get_detail(self, subst_cd: str, dl_cd: str, count: int = 0) -> dict:
        """상세 용량 데이터 조회"""
        body = {
            "dma_reqDl": {
                "subst_cd": subst_cd,
                "dl_cd": dl_cd,
                "count": str(count),
            }
        }
        return self._post("/ew/cpct/retrieveDl", body)
