export default function HomePage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Google OAuth Bridge</h1>
      <p>
        Use <code>/api/auth/google/start?user_id=...</code> to begin the OAuth
        flow.
      </p>
    </main>
  );
}
