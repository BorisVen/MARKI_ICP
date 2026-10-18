/** Marki brand mark: the MARKI logo on a white tile, plus the wordmark. */
export default function Logo({ size = 28, word = true }: { size?: number; word?: boolean }) {
  return (
    <span className="logo">
      <img className="logo-mark" src={`${import.meta.env.BASE_URL}marki-logo.png`} alt="" width={size} height={size} />
      {word && <span className="logo-word">Marki</span>}
    </span>
  );
}
