import { ReproClient } from "./repro-client";

export default function Home() {
  return (
    <main>
      <div className="shell">
        <h1>Next.js Server Action runtime type repro</h1>
        <p>
          The server action is declared as <code>unsafeFunc(limit: number)</code>.
          The second button deliberately calls it with a string, as a compromised
          or hand-written client could do after TypeScript has been compiled away.
        </p>
        <ReproClient />
      </div>
    </main>
  );
}
