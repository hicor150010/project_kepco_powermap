/**
 * 거리 표시용 포맷 헬퍼.
 *
 * 실제 거리 계산은 카카오 SDK의 polyline.getLength() 를 사용하므로
 * 여기서는 사람이 읽기 좋은 단위로 변환만 담당한다.
 */

/** 미터(m) 단위 숫자를 사람이 읽기 좋은 문자열로 변환 (예: 850 m / 1.23 km) */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "0 m";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * 두 위/경도 사이 거리를 미터로 계산 (Haversine).
 * 카카오 SDK에 의존하지 않으며, 거리재기의 점별 누적 거리 산출에 사용.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // 지구 반지름(m)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
