// ---- Money: the API speaks poysha (1 taka = 100 poysha), the screen speaks taka ----

export function formatTaka(poysha) {
  const taka = poysha / 100;
  return `Tk ${Number.isInteger(taka) ? taka : taka.toFixed(2)}`;
}

// ---- Times: always shown in Dhaka time, whatever the device clock says ----

const DHAKA_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

export function formatDhakaTime(value) {
  return DHAKA_TIME.format(new Date(value));
}
