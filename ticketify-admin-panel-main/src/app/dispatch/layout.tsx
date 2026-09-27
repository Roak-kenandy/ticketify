/** Big-screen dispatch: allow vertical scroll (root body is overflow-hidden for the map). */
export default function DispatchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-full w-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain">
      {children}
    </div>
  );
}
