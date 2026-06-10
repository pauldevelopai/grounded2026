// Honest empty state for sections/features that are not built yet.
// GOVERNING RULE: no fake data, ever. This component shows what a surface WILL
// do and says plainly that it's in development — never mock content or numbers.
//
// Props:
//   title — what the feature is called
//   what  — one or two sentences on what it will do (real description, not a demo)
//   note  — optional small print (e.g. what it depends on)

export default function InDevelopment({ title, what, note }) {
  return (
    <div className="in-dev">
      <span className="in-dev-badge">● In development</span>
      <h2>{title}</h2>
      {what && <p>{what}</p>}
      {note && <div className="in-dev-note">{note}</div>}
    </div>
  );
}
