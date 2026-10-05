/** Marki brand mark: gradient tile with the M, plus the wordmark. */
export default function Logo({ size = 28, word = true }: { size?: number; word?: boolean }) {
  return (
    <span className="logo">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={size} height={size} />
      {word && <span className="logo-word">Marki</span>}
    </span>
  );
}
