// ---- Money: the API speaks poysha (1 taka = 100 poysha), the screen speaks taka ----

export function formatTaka(poysha) {
  const taka = poysha / 100;
  return `Tk ${Number.isInteger(taka) ? taka : taka.toFixed(2)}`;
}
