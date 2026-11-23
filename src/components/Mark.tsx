/** The JobThread mark: a white "J" on a rounded blue tile. Built from assets/ by scripts/make-icons.mjs. */
export function Mark({ size = 32 }: { size?: number }) {
  return <img className="brand-mark" src="/icons/mark-96.png" width={size} height={size} alt="" />;
}
