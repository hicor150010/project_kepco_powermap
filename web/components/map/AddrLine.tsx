/**
 * 주소 조각 배열을 한 줄로 렌더링.
 * "-기타지역" 부분은 회색 작은 글씨로 표시해 가독성을 높인다.
 */
export default function AddrLine({ parts }: { parts: string[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && " "}
          {p.includes("기타지역") ? (
            <span className="text-[10px] text-gray-400 font-normal">{p}</span>
          ) : (
            p
          )}
        </span>
      ))}
    </>
  );
}
