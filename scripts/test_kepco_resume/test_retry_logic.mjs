/**
 * _safe_get_addr_list 재시도 로직 단위 테스트 (Python → JS 포팅)
 *
 * 검증 항목:
 *  1. 1차에서 성공 → 재시도 없이 반환
 *  2. 2차에서 성공 → 1회 재시도 + 세션 재생성 1회
 *  3. 3차에서 성공 → 2회 재시도 + 세션 재생성 2회
 *  4. 3회 모두 실패 → raise last_err
 *  5. 대기 시간 순서 (5s, 15s, 30s) — 여기선 단축 (50ms, 150ms, 300ms)
 *  6. _reset_progress_below: do/si/gu/dong/li 각 레벨에서 하위만 리셋, 현재 레벨은 유지
 */

// ═══════════════ Python 로직 포팅 ═══════════════

async function _safe_get_addr_list(client, kwargs, options = {}) {
  const delays = options.delays || [5000, 15000, 30000];
  let last_err = null;
  for (let attempt = 1; attempt <= delays.length; attempt++) {
    const wait = delays[attempt - 1];
    try {
      return await client.get_addr_list(kwargs);
    } catch (e) {
      last_err = e;
      client._log?.(`[주소 목록 실패 ${attempt}/3] ${e.message} — ${wait}ms 후 세션 재생성 재시도`);
      await sleep(wait);
      try {
        client._init_session();
      } catch (_) {}
    }
  }
  if (last_err == null) throw new Error("assert last_err is not None");
  throw last_err;
}

function _reset_progress_below(progress, level) {
  const below = {
    do: ["si", "gu", "dong", "li", "jibun"],
    si: ["gu", "dong", "li", "jibun"],
    gu: ["dong", "li", "jibun"],
    dong: ["li", "jibun"],
    li: ["jibun"],
  };
  for (const lv of below[level] || []) {
    progress[`${lv}_current`] = 0;
    progress[`${lv}_total`] = 0;
    progress[`${lv}_name`] = "";
  }
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// ═══════════════ Mock 클라이언트 ═══════════════

function makeClient(failUntil) {
  // failUntil 번째 호출까지는 실패, 그 이후 성공
  let callCount = 0;
  let sessionInitCount = 0;
  const logs = [];
  return {
    callCount: () => callCount,
    sessionInitCount: () => sessionInitCount,
    logs,
    _log: (msg) => logs.push(msg),
    _init_session: () => { sessionInitCount++; },
    get_addr_list: async (kwargs) => {
      callCount++;
      if (callCount <= failUntil) {
        throw new Error(`Mock fail #${callCount}`);
      }
      return ["나호리", "달산리", "두북리"];
    },
  };
}

// ═══════════════ 테스트 러너 ═══════════════

let passed = 0, failed = 0;

function assertEq(actual, expected, name) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✘ ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

async function assertThrows(fn, pattern, name) {
  try {
    await fn();
    console.log(`  ✘ ${name}: expected throw but succeeded`);
    failed++;
  } catch (e) {
    if (pattern.test(e.message)) {
      console.log(`  ✓ ${name} (threw: ${e.message})`);
      passed++;
    } else {
      console.log(`  ✘ ${name}: threw "${e.message}" but expected match ${pattern}`);
      failed++;
    }
  }
}

// ═══════════════ 테스트 케이스 ═══════════════

async function test_safe_get_addr_list() {
  console.log("\n══ _safe_get_addr_list 재시도 로직 ══");
  const delays = [50, 150, 300];  // 단축

  // 1. 1차 성공
  {
    const c = makeClient(0);
    const t0 = Date.now();
    const r = await _safe_get_addr_list(c, { gbn: 3 }, { delays });
    assertEq(r, ["나호리", "달산리", "두북리"], "1차 성공 → 결과 반환");
    assertEq(c.callCount(), 1, "1차 성공 → 호출 1회");
    assertEq(c.sessionInitCount(), 0, "1차 성공 → 세션 재생성 0회");
    const elapsed = Date.now() - t0;
    if (elapsed < 40) passed++, console.log(`  ✓ 1차 성공 → 대기 없음 (${elapsed}ms)`);
    else failed++, console.log(`  ✘ 1차 성공인데 ${elapsed}ms 대기`);
  }

  // 2. 2차 성공 (1회 실패)
  {
    const c = makeClient(1);
    const t0 = Date.now();
    const r = await _safe_get_addr_list(c, { gbn: 3 }, { delays });
    assertEq(r.length, 3, "2차 성공 → 결과 반환");
    assertEq(c.callCount(), 2, "2차 성공 → 호출 2회");
    assertEq(c.sessionInitCount(), 1, "2차 성공 → 세션 재생성 1회");
    const elapsed = Date.now() - t0;
    if (elapsed >= 50 && elapsed < 100) passed++, console.log(`  ✓ 2차 성공 → 50ms 대기 확인 (${elapsed}ms)`);
    else failed++, console.log(`  ✘ 예상 50ms인데 실제 ${elapsed}ms`);
  }

  // 3. 3차 성공 (2회 실패)
  {
    const c = makeClient(2);
    const t0 = Date.now();
    const r = await _safe_get_addr_list(c, { gbn: 3 }, { delays });
    assertEq(r.length, 3, "3차 성공 → 결과 반환");
    assertEq(c.callCount(), 3, "3차 성공 → 호출 3회");
    assertEq(c.sessionInitCount(), 2, "3차 성공 → 세션 재생성 2회");
    const elapsed = Date.now() - t0;
    if (elapsed >= 200 && elapsed < 260) passed++, console.log(`  ✓ 3차 성공 → 50+150ms 대기 확인 (${elapsed}ms)`);
    else failed++, console.log(`  ✘ 예상 200ms인데 실제 ${elapsed}ms`);
  }

  // 4. 전부 실패
  {
    const c = makeClient(99);
    await assertThrows(
      () => _safe_get_addr_list(c, { gbn: 3 }, { delays }),
      /Mock fail #3/,
      "3회 실패 → 마지막 에러 raise"
    );
    assertEq(c.callCount(), 3, "3회 실패 → 호출 3회");
    assertEq(c.sessionInitCount(), 3, "3회 실패 → 세션 재생성 3회 (매 실패마다)");
  }

  // 5. 세션 재생성이 예외를 던져도 삼켜짐
  {
    const c = makeClient(1);
    c._init_session = () => { throw new Error("init failure"); };
    const r = await _safe_get_addr_list(c, { gbn: 3 }, { delays });
    assertEq(r.length, 3, "세션 재생성 실패해도 원 로직 계속 진행 → 2차 성공");
  }

  // 6. 로그 메시지 확인
  {
    const c = makeClient(2);
    await _safe_get_addr_list(c, { gbn: 3 }, { delays });
    const hasAttempt1 = c.logs.some((l) => l.includes("1/3"));
    const hasAttempt2 = c.logs.some((l) => l.includes("2/3"));
    assertEq(hasAttempt1 && hasAttempt2, true, "로그에 시도 번호(1/3, 2/3) 기록");
  }
}

async function test_reset_progress_below() {
  console.log("\n══ _reset_progress_below 일관성 보장 ══");

  // Job #180 시나리오: 소보면 평호리 산86 완료 → 우보면 진입
  const progress = {
    do_current: 1, do_total: 1, do_name: "대구광역시",
    si_current: 1, si_total: 1, si_name: "-기타지역",
    gu_current: 1, gu_total: 9, gu_name: "군위군",
    dong_current: 5, dong_total: 8, dong_name: "소보면",
    li_current: 14, li_total: 14, li_name: "평호리",
    jibun_current: 159, jibun_total: 159, jibun_name: "산86",
  };

  // 우보면 진입 시 dong_current/name 먼저 설정
  progress.dong_current = 6;
  progress.dong_name = "우보면";
  _reset_progress_below(progress, "dong");

  assertEq(progress.dong_current, 6, "dong_current 유지 (=6)");
  assertEq(progress.dong_name, "우보면", "dong_name 유지");
  assertEq(progress.dong_total, 8, "dong_total 유지 (=8)");
  assertEq(progress.li_current, 0, "li_current 리셋 (=0)");
  assertEq(progress.li_total, 0, "li_total 리셋 (=0)");
  assertEq(progress.li_name, "", "li_name 리셋 (빈 문자열)");
  assertEq(progress.jibun_current, 0, "jibun_current 리셋");
  assertEq(progress.jibun_total, 0, "jibun_total 리셋");
  assertEq(progress.jibun_name, "", "jibun_name 리셋");
  // 상위 레벨은 그대로
  assertEq(progress.gu_current, 1, "gu_current 보존");
  assertEq(progress.gu_name, "군위군", "gu_name 보존");

  // do 레벨 리셋 — si 이하 전부 리셋
  const p2 = { ...progress };
  _reset_progress_below(p2, "do");
  assertEq(p2.do_current, 1, "do 리셋 → do 본인은 유지");
  assertEq(p2.si_current, 0, "do 리셋 → si_current=0");
  assertEq(p2.gu_current, 0, "do 리셋 → gu_current=0");
  assertEq(p2.dong_current, 0, "do 리셋 → dong_current=0");
  assertEq(p2.li_current, 0, "do 리셋 → li_current=0");
  assertEq(p2.jibun_current, 0, "do 리셋 → jibun_current=0");

  // li 레벨 리셋 — jibun 만 리셋
  const p3 = {
    li_current: 14, li_total: 14, li_name: "평호리",
    jibun_current: 159, jibun_total: 159, jibun_name: "산86",
  };
  _reset_progress_below(p3, "li");
  assertEq(p3.li_current, 14, "li 리셋 → li 본인 유지");
  assertEq(p3.jibun_current, 0, "li 리셋 → jibun_current=0");
  assertEq(p3.jibun_name, "", "li 리셋 → jibun_name 빈 문자열");
}

async function test_checkpoint_recovery_scenario() {
  console.log("\n══ 체크포인트 일관성 복구 시나리오 (Job #180) ══");

  // 시나리오: 수정 전 — 체크포인트 불일치
  {
    const p = {
      dong_current: 6, dong_name: "우보면",
      li_current: 14, li_name: "평호리", li_total: 14,
      jibun_current: 159, jibun_name: "산86", jibun_total: 159,
    };
    const buggy = {
      dong_idx: p.dong_current - 1, dong_name: p.dong_name,
      li_idx: p.li_current - 1, li_name: p.li_name,
      jibun_idx: p.jibun_current - 1, jibun_name: p.jibun_name,
    };
    console.log(`  [수정 전] 체크포인트: dong=${buggy.dong_name}(${buggy.dong_idx}) li=${buggy.li_name}(${buggy.li_idx})`);
    console.log(`           → 우보면의 리 목록에 '평호리' 없음 → 재개 시 우보면 전체 스킵`);
  }

  // 시나리오: 수정 후 — dong 진입 시 리셋
  {
    const p = {
      dong_current: 5, dong_name: "소보면",
      li_current: 14, li_name: "평호리", li_total: 14,
      jibun_current: 159, jibun_name: "산86", jibun_total: 159,
    };
    p.dong_current = 6;
    p.dong_name = "우보면";
    _reset_progress_below(p, "dong");
    const fixed = {
      dong_idx: p.dong_current - 1, dong_name: p.dong_name,
      li_idx: p.li_current - 1, li_name: p.li_name,
      jibun_idx: p.jibun_current - 1, jibun_name: p.jibun_name,
    };
    console.log(`  [수정 후] 체크포인트: dong=${fixed.dong_name}(${fixed.dong_idx}) li='${fixed.li_name}'(${fixed.li_idx})`);
    console.log(`           → li_idx=-1 → 재개 시 우보면 첫 리부터 정상 처리`);

    assertEq(fixed.dong_idx, 5, "재개 포인트: dong_idx=5 (우보면)");
    assertEq(fixed.dong_name, "우보면", "재개 포인트: dong_name 일치");
    assertEq(fixed.li_idx, -1, "재개 포인트: li_idx=-1 (처음부터)");
    assertEq(fixed.li_name, "", "재개 포인트: li_name 빈 문자열");
    assertEq(fixed.jibun_idx, -1, "재개 포인트: jibun_idx=-1 (처음부터)");
  }
}

async function main() {
  await test_safe_get_addr_list();
  await test_reset_progress_below();
  await test_checkpoint_recovery_scenario();

  console.log(`\n═══ 결과: ✓${passed} ✘${failed} ═══`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("치명적 오류:", e); process.exit(1); });
