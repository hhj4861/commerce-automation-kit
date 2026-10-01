/* Icons from the approved Hanmadi 2.0 mockup. */
const paths: Record<string, string> = {
  book: "M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z M13 7a3 3 0 0 1 3-3h5v15h-4a4 4 0 0 0-4 2",
  dictionary: "M5 3h14v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2 M3 17h16 M8 7h7 M8 11h5",
  chat: "M20 11a8 8 0 0 1-8 8H5l-3 3v-11a9 9 0 0 1 18 0Z M7 10h8 M7 14h5",
  translate:
    "M3 5h12 M9 2v3 M5 5c1 5 4 8 8 10 M12 5c-1 5-4 8-9 11 M14 21l4-11 4 11 M16 17h4",
  heart: "M20 4c-3-2-6 0-8 3-2-3-5-5-8-3-5 4 0 11 8 16 8-5 13-12 8-16Z",
  arrow: "M9 5l7 7-7 7",
  back: "M15 5l-7 7 7 7",
  down: "M6 9l6 6 6-6",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M4 4l3 1 3-3h4l3 3 3-1 2 4-2 3 2 3-2 4-3-1-3 3h-4l-3-3-3 1-2-4 2-3-2-3z",
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8",
  sound: "M3 9h4l5-5v16l-5-5H3z M16 8a6 6 0 0 1 0 8 M19 5a10 10 0 0 1 0 14",
  swap: "M3 7h17l-4-4 M21 17H4l4 4",
  check: "M5 12l4 4L20 5",
  cup: "M4 8h13v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M17 9h2a3 3 0 0 1 0 6h-2 M7 2v3 M12 2v3",
  spark: "M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z",
  close: "M5 5l14 14 M19 5 5 19",
  trash: "M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
  expand: "M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5",
  stop: "M6 6h12v12H6z",
  pin: "M12 22s8-8 8-13a8 8 0 0 0-16 0c0 5 8 13 8 13z M12 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
  globe:
    "M3 12h18 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 3c-5 5-5 13 0 18 5-5 5-13 0-18",
  music:
    "M9 18V5l11-2v13 M9 8l11-2 M9 18c0 4-6 4-6 1 0-3 6-4 6-1 M20 16c0 4-6 4-6 1 0-3 6-4 6-1",
  meal: "M4 2v6a3 3 0 0 0 6 0V2 M7 2v20 M17 2v10h4V2 M21 12v10",
  bed: "M3 8v13 M3 17h18v4 M3 12h18v5 M7 12V6h10v6",
  bag: "M4 7h16l1 14H3z M8 7V5a4 4 0 0 1 8 0v2",
};
export function V2Icon({ name }: { name: string }) {
  return (
    <svg
      className="hm-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name] ?? paths.spark} />
    </svg>
  );
}
