/** Page widths shared by headers, content and footers so they always line up. */
export const fieldContainer = {
  /** Forms and settings: stay at a comfortable reading width on large screens. */
  narrow: "mx-auto w-full max-w-3xl",
  /** Lists and ticket details: use the extra room on tablets and desktops. */
  wide: "mx-auto w-full max-w-3xl xl:max-w-5xl 2xl:max-w-7xl",
};

/** Card lists: one column on phones, more as the screen grows. */
export const fieldCardGrid = "grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 2xl:grid-cols-3";
