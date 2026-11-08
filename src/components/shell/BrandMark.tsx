/** The Inroad mark from the prototype: a rising path on a green tile. */
export function BrandMark() {
  return (
    <span className="mark" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 16 16">
        <path d="M3 12 L8 4 L13 12" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
